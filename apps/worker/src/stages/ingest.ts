import type { PoolClient } from "pg";
import { isBillableEvent } from "@track-site/catalog";
import { newUlid, usagePeriodKey } from "@track-site/core";
import {
  normalizeBrowserEvent,
  normalizeServerEvent,
  type CanonicalEvent,
  type DeliveryMessage,
  type IngestMessage,
  type NormalizeContext,
} from "@track-site/events";
import { applyStrip, clickIdsForDestination, consentSnapshotHash, evaluateDispatch, evaluatePersistence, scanEventForPii, snapshotFromConsent, type ConnectorType } from "@track-site/policy";
import { QUEUES, type EnqueueInput } from "@track-site/queue";
import type { WorkerContext } from "../context.ts";

export interface IngestStats {
  received: number;
  accepted: number;
  /** accepted events written to the usage ledger (test-mode events, duplicates and retries excluded) */
  billable: number;
  duplicates: number;
  routed: number;
  dropped: Record<string, number>;
}

/**
 * Ingest stage: validate -> normalize -> PII scan -> policy (persistence) -> consent snapshot ->
 * dedup + event store -> conversion dedup -> usage ledger -> policy (dispatch) -> destination queues.
 * Events blocked by consent or PII are never persisted; they are only counted. Usage follows the
 * catalogue's billable-event rules: one ledger row per accepted event, none for test-mode
 * environments, duplicates (event id or order id) or retries of an already-ledgered event.
 */
export async function processIngestMessage(ctx: WorkerContext, msg: IngestMessage): Promise<IngestStats> {
  const stats: IngestStats = { received: msg.events.length, accepted: 0, billable: 0, duplicates: 0, routed: 0, dropped: {} };
  const drop = (reason: string) => (stats.dropped[reason] = (stats.dropped[reason] ?? 0) + 1);
  const runtime = await ctx.configs.get(msg.site.site_id, msg.site.environment_id);
  const serverTs = new Date(msg.received_at);
  const normCtx: NormalizeContext = {
    site: { organizationId: msg.site.organization_id, siteId: msg.site.site_id, trackingId: msg.site.tracking_id, environmentId: msg.site.environment_id },
    serverTs,
    ipTruncated: msg.ip_truncated,
    uaFamily: msg.ua_family,
    clickIdTtlDays: runtime.bundle?.consent.click_ids.ttl_days ?? 90,
  };
  const enabledEvents = runtime.bundle ? new Set(runtime.bundle.events.filter((e) => e.enabled).map((e) => e.name)) : null;
  const toStore: CanonicalEvent[] = [];

  for (const incoming of msg.events) {
    const r = msg.kind === "browser_batch" ? normalizeBrowserEvent(incoming as never, normCtx) : normalizeServerEvent(incoming as never, normCtx);
    if (!r.ok) {
      drop(r.reason);
      continue;
    }
    let event = r.event;
    if (msg.kind === "browser_batch" && msg.is_bot_hint) {
      drop("bot");
      continue;
    }
    if (enabledEvents && !enabledEvents.has(event.name) && event.is_standard === false) {
      // unknown custom event: accept but flag for the data-quality inbox (handled by aggregates)
      event.provenance.name = { ...event.provenance.name!, source: `${event.source}:unplanned` };
    }
    if (msg.kind === "server_batch" && (event.name === "purchase" || event.name === "refund") && event.commerce?.order_id && !event.consent.granted.some((p) => p !== "necessary")) {
      // server-side order without a consent record: inherit the consent and identity the browser recorded for the same order
      const browser = await ctx.eventStore.findConversionEvent(event.site_id, event.commerce.order_id, "purchase", "browser", new Date(serverTs.getTime() - 30 * 86_400_000));
      if (browser) event = adoptBrowserContext(event, browser, serverTs);
    }
    const pii = scanEventForPii(event);
    if (pii.blocked) {
      drop("pii_blocked");
      continue;
    }
    event = pii.event;
    const decision = evaluatePersistence(event, runtime.policy);
    if (!decision.allow) {
      drop(decision.reason);
      continue;
    }
    event = applyStrip(event, decision.strippedFields);
    if (runtime.bundle && !runtime.bundle.consent.click_ids.capture) event.click_ids = null;
    event.processing_state = "policy_passed";
    event.is_billable = isBillableEvent({ accepted: true, testMode: runtime.testMode });
    event.config_version = runtime.configVersion ?? event.config_version;
    toStore.push(event);
  }

  if (toStore.length === 0) {
    await recordAggregates(ctx, msg, stats);
    return stats;
  }

  const client = await ctx.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE tracksite_worker");
    for (const e of toStore) e.consent_snapshot_id = await upsertConsentSnapshot(client, e);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }

  const inserted = await ctx.eventStore.insert(toStore);
  stats.duplicates = inserted.duplicates;
  drop("duplicate");
  stats.dropped.duplicate = inserted.duplicates;
  if (inserted.duplicates === 0) delete stats.dropped.duplicate;
  const dupSet = new Set(inserted.duplicateEventIds);
  const stored = toStore.filter((e) => !dupSet.has(e.event_id));
  stats.accepted = stored.length;

  const deliveries: EnqueueInput<DeliveryMessage>[] = [];
  const client2 = await ctx.pool.connect();
  try {
    await client2.query("BEGIN");
    await client2.query("SET LOCAL ROLE tracksite_worker");
    for (const e of stored) {
      // conversions: the order id is the source of truth for purchase/refund dedup across browser + server paths
      if ((e.name === "purchase" || e.name === "refund") && e.commerce?.order_id) {
        const prior = (
          await client2.query<{ event_id: string; source: string; source_verified: boolean }>(`SELECT event_id, source, source_verified FROM conversion_records WHERE site_id = $1 AND kind = $2 AND order_id = $3 LIMIT 1`, [
            e.site_id,
            e.name,
            e.commerce.order_id,
          ])
        ).rows[0];
        if (!prior) {
          await client2.query(
            `INSERT INTO conversion_records (organization_id, site_id, event_id, kind, order_id, value, currency, source, source_verified, occurred_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (site_id, kind, order_id) WHERE order_id IS NOT NULL DO NOTHING`,
            [e.organization_id, e.site_id, e.event_id, e.name, e.commerce.order_id, e.commerce.value ?? null, e.commerce.currency ?? null, e.source, e.source_verified, e.server_ts],
          );
        } else if ((prior.source === "browser") === (e.source === "browser")) {
          // the same path reported the order again: duplicate, not accepted and never billed
          await ctx.eventStore.updateState(e.site_id, e.event_id, "deduplicated", "duplicate_conversion");
          stats.accepted--;
          stats.duplicates++;
          stats.dropped.duplicate_conversion = (stats.dropped.duplicate_conversion ?? 0) + 1;
          continue;
        } else if (e.source_verified && !prior.source_verified) {
          // a verified server/shop record supersedes the browser observation; both events are routed and
          // vendors deduplicate on the shared order-derived event id
          await client2.query(`UPDATE conversion_records SET event_id = $4, source = $5, source_verified = true, value = $6, currency = $7 WHERE site_id = $1 AND kind = $2 AND order_id = $3`, [
            e.site_id,
            e.name,
            e.commerce.order_id,
            e.event_id,
            e.source,
            e.commerce.value ?? null,
            e.commerce.currency ?? null,
          ]);
        }
      }
      if (e.is_billable) {
        // the unique (event_id, kind) index makes a retry of an already-ledgered event a no-op: counted exactly once
        const ledger = await client2.query(
          `INSERT INTO usage_ledger (id, organization_id, site_id, period_key, event_id, kind, quantity) VALUES ($1,$2,$3,$4,$5,'billable_event',1) ON CONFLICT DO NOTHING`,
          [newUlid(), e.organization_id, e.site_id, usagePeriodKey(new Date(e.server_ts)), e.event_id],
        );
        if ((ledger.rowCount ?? 0) > 0) stats.billable++;
      }
      // fan-out to destinations from the active bundle (server + hybrid mode)
      let routedTo = 0;
      for (const dest of runtime.bundle?.destinations ?? []) {
        if (!dest.enabled || dest.mode === "browser") continue;
        const mapping = dest.mappings.find((m) => m.enabled && m.event === e.name);
        if (!mapping) continue;
        const integration = runtime.integrations.get(dest.id);
        if (!integration) continue;
        const decision = evaluateDispatch(
          e,
          { connectorType: dest.type as ConnectorType, status: integration.status, requiredPurpose: dest.purpose },
          runtime.policy,
        );
        if (!decision.allow) {
          await client2.query(
            `INSERT INTO delivery_attempts (id, organization_id, site_id, event_id, event_name, integration_id, connector_type, attempt, status, error_class, error_code, finished_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,0,'skipped','policy_blocked',$8, now()) ON CONFLICT DO NOTHING`,
            [newUlid(), e.organization_id, e.site_id, e.event_id, e.name, dest.id, dest.type, decision.reason],
          );
          continue;
        }
        const clickIds = clickIdsForDestination(e, dest.type as ConnectorType, ctx.now());
        void clickIds; // computed per dispatch by the delivery stage as well; kept here for parity checks
        deliveries.push({
          body: {
            kind: "deliver",
            message_id: newUlid(),
            organization_id: e.organization_id,
            site_id: e.site_id,
            event_id: e.event_id,
            integration_id: dest.id,
            connector_type: dest.type,
            config_version: runtime.configVersion ?? 0,
            attempt: 0,
            enqueued_at: ctx.now().toISOString(),
          },
          partitionKey: msg.site.partition_key,
          dedupKey: `${e.event_id}:${dest.id}`,
        });
        routedTo++;
      }
      if (routedTo > 0) {
        await ctx.eventStore.updateState(e.site_id, e.event_id, "routed", null);
        stats.routed++;
      }
    }
    await client2.query("COMMIT");
  } catch (e) {
    await client2.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client2.release();
  }

  const byType = new Map<string, EnqueueInput<DeliveryMessage>[]>();
  for (const d of deliveries) {
    const list = byType.get(d.body.connector_type) ?? [];
    list.push(d);
    byType.set(d.body.connector_type, list);
  }
  for (const [type, list] of byType) await ctx.queue.enqueue(QUEUES.destination(type), list);

  await recordAggregates(ctx, msg, stats);
  return stats;
}

async function upsertConsentSnapshot(client: PoolClient, e: CanonicalEvent): Promise<string> {
  const input = snapshotFromConsent(e.site_id, e.consent);
  const hash = consentSnapshotHash(input);
  const res = await client.query<{ id: string }>(
    `INSERT INTO consent_snapshots (organization_id, site_id, hash, policy_version, granted, vendors, source, region, gpc, event_count)
     VALUES ($1,$2,$3,$4,$5::jsonb,'[]'::jsonb,$6,$7,$8,1)
     ON CONFLICT (site_id, hash) DO UPDATE SET last_seen_at = now(), event_count = consent_snapshots.event_count + 1
     RETURNING id`,
    [e.organization_id, e.site_id, hash, input.policyVersion, JSON.stringify(input.granted), input.source, input.region, input.gpc],
  );
  return res.rows[0]!.id;
}

async function recordAggregates(ctx: WorkerContext, msg: IngestMessage, stats: IngestStats): Promise<void> {
  const bucket = new Date(msg.received_at);
  bucket.setUTCMinutes(0, 0, 0);
  const source = msg.kind === "browser_batch" ? "browser" : "server";
  const names = new Map<string, number>();
  for (const e of msg.events) names.set(e.name, (names.get(e.name) ?? 0) + 1);
  const client = await ctx.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE tracksite_worker");
    for (const [name, received] of names) {
      const share = received / Math.max(1, stats.received);
      const accepted = Math.round(stats.accepted * share);
      const billable = Math.round(stats.billable * share);
      const dedup = Math.round(stats.duplicates * share);
      const dropped: Record<string, number> = {};
      for (const [k, v] of Object.entries(stats.dropped)) dropped[k] = Math.round(v * share);
      await client.query(
        `INSERT INTO event_aggregates (organization_id, site_id, environment_id, bucket_start, event_name, source, received, accepted, dropped, deduplicated, billable)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)
         ON CONFLICT (site_id, environment_id, bucket_start, event_name, source) DO UPDATE SET
           received = event_aggregates.received + EXCLUDED.received,
           accepted = event_aggregates.accepted + EXCLUDED.accepted,
           deduplicated = event_aggregates.deduplicated + EXCLUDED.deduplicated,
           billable = event_aggregates.billable + EXCLUDED.billable,
           dropped = (SELECT coalesce(jsonb_object_agg(k, coalesce((event_aggregates.dropped->>k)::int, 0) + coalesce((EXCLUDED.dropped->>k)::int, 0)), '{}'::jsonb)
                      FROM (SELECT jsonb_object_keys(event_aggregates.dropped || EXCLUDED.dropped) AS k) keys)`,
        [msg.site.organization_id, msg.site.site_id, msg.site.environment_id, bucket, name, source, received, accepted, JSON.stringify(dropped), dedup, billable],
      );
    }
    if (stats.accepted > 0 || stats.billable > 0) {
      // billable_events is what plan limits are measured against: only ledgered events (no test mode, no duplicates, no retries)
      await client.query(
        `INSERT INTO usage_periods (organization_id, period_key, accepted_events, billable_events, dropped_events, deduplicated_events)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (organization_id, period_key) DO UPDATE SET
           accepted_events = usage_periods.accepted_events + EXCLUDED.accepted_events,
           billable_events = usage_periods.billable_events + EXCLUDED.billable_events,
           dropped_events = usage_periods.dropped_events + EXCLUDED.dropped_events,
           deduplicated_events = usage_periods.deduplicated_events + EXCLUDED.deduplicated_events,
           updated_at = now()`,
        [msg.site.organization_id, usagePeriodKey(bucket), stats.accepted, stats.billable, Object.values(stats.dropped).reduce((a, b) => a + b, 0), stats.duplicates],
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    ctx.logger.warn({ err: e instanceof Error ? e.message : String(e) }, "aggregate update failed");
  } finally {
    client.release();
  }
}

/** A server-side order inherits the consent record and identifiers the browser captured for the same order id. */
export function adoptBrowserContext(event: CanonicalEvent, browser: CanonicalEvent, at: Date): CanonicalEvent {
  const provenance = {
    ...event.provenance,
    consent: { data_class: "DERIVED" as const, source: "browser:order_join", at: at.toISOString(), algorithm: "order_id_join", algorithm_version: "1", inputs: ["commerce.order_id"], model: null, confidence: null, expires_at: null, human_confirmed_at: null },
  };
  return {
    ...event,
    consent: { ...browser.consent },
    anonymous_id: event.anonymous_id ?? browser.anonymous_id,
    session_id: event.session_id ?? browser.session_id,
    user_id: event.user_id ?? browser.user_id,
    click_ids: event.click_ids ?? browser.click_ids,
    vendor_ids: event.vendor_ids ?? browser.vendor_ids,
    user_data: event.user_data ?? browser.user_data,
    provenance,
  };
}
