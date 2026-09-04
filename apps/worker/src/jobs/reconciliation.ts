import type { PoolClient } from "pg";
import { redactDeep, redactPii } from "@track-site/core";
import type { ConfigBundle } from "@track-site/config";
import type { ReconciliationSources } from "@track-site/db";
import { DESTINATION_PURPOSE, type ConnectorType } from "@track-site/policy";
import type { WorkerContext } from "../context.ts";

/**
 * Signal Gap & Revenue Leak Detector and Data Quality scan (redesign supplement §8 modules 4 and 7).
 *
 * `runReconciliation` compares, per site and UTC day, the authoritative conversion records (verified shop
 * webhooks — Shopify, WooCommerce, Shopware — and verified server-API records in `conversion_records`) with the
 * events observed for the same order id and with the delivery attempts per destination. It writes one
 * `revenue_reconciliation_snapshots` row per site, kind, day and destination (`integration_id` NULL is the
 * site-level capture row) and never fills in anything it cannot observe: an order without a value stays
 * unvalued, a browser-side pixel delivery stays `unknown`, mixed currencies are never summed.
 *
 * `scanDataQuality` turns the last 24 hours of a site's production environments into inbox entries
 * (`data_quality_issues`): missing required purchase fields, invalid values, currency mismatches, duplicate
 * conversions, unplanned events, ingest drops, event drops against the trailing week, conversion spikes and the
 * revenue leaks derived from the snapshots. Every entry carries redacted evidence (counts, window, samples
 * without payloads) and an impact score; statuses set by people (acknowledged, muted) survive the upsert, resolved
 * issues that reappear are reopened, and `muted_until` snoozes expire.
 *
 * `runDataQualityJobs` runs both. Idempotent and safe to run on several workers. Not registered in
 * `jobs/index.ts` yet — the integration stage wires it with
 * `every(DATA_QUALITY_INTERVAL_MS, "data-quality", () => runDataQualityJobs(ctx))`. Until that line exists no
 * snapshot and no inbox entry is ever written: the inbox shows "scan has not run" and the leak page stays empty.
 */
export const DATA_QUALITY_INTERVAL_MS = 60 * 60_000;

export interface ReconciliationOptions {
  /** days recomputed when the site already has snapshots (late deliveries and retries land within hours) */
  lookbackDays?: number;
  /** days computed on the first run for a site */
  initialLookbackDays?: number;
  now?: Date;
}

export interface ReconciliationSummary {
  sites: number;
  snapshots: number;
  issues: number;
}

type Kind = "purchase" | "lead";
const KINDS: ReadonlyArray<{ kind: Kind; eventName: string }> = [
  { kind: "purchase", eventName: "purchase" },
  { kind: "lead", eventName: "generate_lead" },
];

const DAY_MS = 86_400_000;
const CONSENT_CODES = new Set(["consent_missing", "consent_denied", "purpose_not_granted", "gpc_opt_out"]);
const PURPOSE_RANK: Record<string, number> = { necessary: 0, analytics: 1, marketing: 2, personalization: 3 };

type GapReason = "no_consent" | "blocked" | "not_captured" | "delivery_failed" | "unknown";
type Outcome = "delivered" | GapReason;

interface SiteRow {
  id: string;
  organization_id: string;
  currency: string | null;
}

interface ConversionRow {
  order_id: string;
  value: string | null;
  currency: string | null;
  occurred_at: Date;
}

interface OrderEventRow {
  event_id: string;
  source: string;
  processing_state: string;
  order_id: string;
  consent: { granted?: string[]; source?: string; gpc?: boolean | null } | null;
  deliveries: Record<string, { status: string; at: string; attempts: number }> | null;
}

interface AttemptRow {
  event_id: string;
  integration_id: string;
  status: string;
  error_class: string;
  error_code: string | null;
  started_at: Date;
}

interface DestinationView {
  id: string;
  type: string;
  mode: "browser" | "server" | "hybrid";
  enabled: boolean;
  mapped: boolean;
  purpose: string;
}

interface Bucket {
  authoritative: number;
  valued: number;
  value: number;
  currencies: Set<string>;
  observedBrowser: number;
  delivered: number;
  gaps: Record<GapReason, number>;
  leakMin: number;
  leakMax: number;
  leakUnvalued: number;
}

const newBucket = (): Bucket => ({ authoritative: 0, valued: 0, value: 0, currencies: new Set(), observedBrowser: 0, delivered: 0, gaps: { no_consent: 0, blocked: 0, not_captured: 0, delivery_failed: 0, unknown: 0 }, leakMin: 0, leakMax: 0, leakUnvalued: 0 });

const utcDay = (d: Date): Date => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const num = (v: string | null): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const round2 = (n: number): number => Math.round(n * 100) / 100;

async function asWorker<T>(ctx: WorkerContext, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await ctx.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE tracksite_worker");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

async function activeSites(client: PoolClient): Promise<SiteRow[]> {
  return (await client.query<SiteRow>(`SELECT id, organization_id, currency FROM sites WHERE status = 'active' AND deleted_at IS NULL ORDER BY created_at`)).rows;
}

async function defaultEnvironmentId(client: PoolClient, siteId: string): Promise<string | null> {
  const r = await client.query<{ id: string }>(`SELECT id FROM environments WHERE site_id = $1 ORDER BY is_default DESC, created_at LIMIT 1`, [siteId]);
  return r.rows[0]?.id ?? null;
}

/** Destinations of the active bundle with the facts the classification needs; integrations without a bundle entry count as unmapped. */
function destinationsOf(bundle: ConfigBundle | null, integrationIds: Array<{ id: string; connector_type: string }>, eventName: string): DestinationView[] {
  const out: DestinationView[] = [];
  for (const i of integrationIds) {
    const d = bundle?.destinations.find((x) => x.id === i.id);
    if (!d) {
      out.push({ id: i.id, type: i.connector_type, mode: "server", enabled: false, mapped: false, purpose: DESTINATION_PURPOSE[i.connector_type as ConnectorType] ?? "marketing" });
      continue;
    }
    const mapped = d.mappings.some((m) => m.enabled && m.event === eventName);
    const base = DESTINATION_PURPOSE[d.type as ConnectorType] ?? "marketing";
    const purpose = (PURPOSE_RANK[d.purpose] ?? 0) > (PURPOSE_RANK[base] ?? 0) ? d.purpose : base;
    out.push({ id: d.id, type: d.type, mode: d.mode, enabled: d.enabled, mapped, purpose });
  }
  return out;
}

function consentAllows(event: OrderEventRow, purpose: string): boolean {
  if (purpose === "necessary") return true;
  const c = event.consent;
  if (!c || !Array.isArray(c.granted) || c.source === "default" || !c.source) return false;
  const granted = c.gpc ? c.granted.filter((p) => p !== "marketing" && p !== "personalization") : c.granted;
  return granted.includes(purpose);
}

/**
 * Outcome of one order for one destination. Server/hybrid destinations are judged by their delivery attempts,
 * browser-only destinations by what Track can observe (a browser event with the purpose granted) — the pixel
 * delivery itself is not observable and stays `unknown`.
 */
export function classifyOrder(events: OrderEventRow[], attempts: AttemptRow[], destination: DestinationView): Outcome {
  const browserEvents = events.filter((e) => e.source === "browser");
  if (destination.mode === "browser") {
    if (!destination.enabled || !destination.mapped) return "blocked";
    if (browserEvents.length === 0) return "not_captured";
    return browserEvents.some((e) => consentAllows(e, destination.purpose)) ? "unknown" : "no_consent";
  }
  const mine = attempts.filter((a) => a.integration_id === destination.id);
  if (mine.some((a) => a.status === "success")) return "delivered";
  if (mine.length) {
    const latest = mine.reduce((a, b) => (a.started_at.getTime() >= b.started_at.getTime() ? a : b));
    if (latest.status === "skipped") {
      if (latest.error_class === "policy_blocked" && latest.error_code && CONSENT_CODES.has(latest.error_code)) return "no_consent";
      return "blocked";
    }
    if (latest.status === "failed" || latest.status === "dead") return "delivery_failed";
    return "unknown"; // retry / pending: still in flight
  }
  if (events.length === 0) return "not_captured";
  if (!destination.enabled || !destination.mapped) return "blocked";
  for (const e of events) {
    const mark = e.deliveries?.[destination.id];
    if (!mark) continue;
    if (mark.status === "delivered") return "delivered";
    if (mark.status === "failed") return "delivery_failed";
  }
  return "unknown";
}

function addOrder(bucket: Bucket, outcome: Outcome, value: number | null, currency: string | null, hasBrowserEvent: boolean): void {
  bucket.authoritative++;
  if (value != null && currency) {
    bucket.valued++;
    bucket.value += value;
    bucket.currencies.add(currency);
  }
  if (hasBrowserEvent) bucket.observedBrowser++;
  if (outcome === "delivered") {
    bucket.delivered++;
    return;
  }
  bucket.gaps[outcome]++;
  if (value == null || !currency) {
    bucket.leakUnvalued++;
    return;
  }
  if (outcome === "unknown") bucket.leakMax += value;
  else {
    bucket.leakMin += value;
    bucket.leakMax += value;
  }
}

async function upsertSnapshot(client: PoolClient, input: { organizationId: string; siteId: string; integrationId: string | null; kind: Kind; day: Date; bucket: Bucket; deduplicated: number; sources: ReconciliationSources }): Promise<void> {
  const b = input.bucket;
  const mixed = b.currencies.size > 1;
  const currency = b.currencies.size === 1 ? [...b.currencies][0]! : null;
  const valued = b.valued > 0 && !mixed;
  await client.query(
    `INSERT INTO revenue_reconciliation_snapshots (organization_id, site_id, integration_id, kind, granularity, period_start, period_end,
       authoritative_count, authoritative_valued_count, authoritative_value, currency, currency_mixed, observed_browser_count, deduplicated_count, delivered_count,
       gap_no_consent, gap_blocked, gap_not_captured, gap_delivery_failed, gap_unknown, leak_value_min, leak_value_max, leak_unvalued_count, sources, computed_at)
     VALUES ($1,$2,$3,$4,'day',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23::jsonb, now())
     ON CONFLICT (site_id, integration_id, kind, granularity, period_start) DO UPDATE SET
       period_end = EXCLUDED.period_end, authoritative_count = EXCLUDED.authoritative_count, authoritative_valued_count = EXCLUDED.authoritative_valued_count,
       authoritative_value = EXCLUDED.authoritative_value, currency = EXCLUDED.currency, currency_mixed = EXCLUDED.currency_mixed,
       observed_browser_count = EXCLUDED.observed_browser_count, deduplicated_count = EXCLUDED.deduplicated_count, delivered_count = EXCLUDED.delivered_count,
       gap_no_consent = EXCLUDED.gap_no_consent, gap_blocked = EXCLUDED.gap_blocked, gap_not_captured = EXCLUDED.gap_not_captured,
       gap_delivery_failed = EXCLUDED.gap_delivery_failed, gap_unknown = EXCLUDED.gap_unknown, leak_value_min = EXCLUDED.leak_value_min,
       leak_value_max = EXCLUDED.leak_value_max, leak_unvalued_count = EXCLUDED.leak_unvalued_count, sources = EXCLUDED.sources, computed_at = now()`,
    [
      input.organizationId,
      input.siteId,
      input.integrationId,
      input.kind,
      input.day,
      new Date(input.day.getTime() + DAY_MS),
      b.authoritative,
      b.valued,
      valued ? round2(b.value) : null,
      currency,
      mixed,
      b.observedBrowser,
      input.deduplicated,
      b.delivered,
      b.gaps.no_consent,
      b.gaps.blocked,
      b.gaps.not_captured,
      b.gaps.delivery_failed,
      b.gaps.unknown,
      valued ? round2(b.leakMin) : null,
      valued ? round2(b.leakMax) : null,
      b.leakUnvalued + (mixed ? b.valued : 0),
      JSON.stringify(input.sources),
    ],
  );
}

/** Recomputes the daily reconciliation snapshots of every active site. */
export async function runReconciliation(ctx: WorkerContext, options: ReconciliationOptions = {}): Promise<{ sites: number; snapshots: number }> {
  const now = options.now ?? ctx.now();
  const lookback = options.lookbackDays ?? 3;
  const initial = options.initialLookbackDays ?? 30;
  const sites = await asWorker(ctx, activeSites);
  let snapshots = 0;
  for (const site of sites) {
    try {
      snapshots += await reconcileSite(ctx, site, now, lookback, initial);
    } catch (e) {
      ctx.logger.error({ siteId: site.id, err: e instanceof Error ? e.message : String(e) }, "reconciliation failed for site");
    }
  }
  return { sites: sites.length, snapshots };
}

async function reconcileSite(ctx: WorkerContext, site: SiteRow, now: Date, lookback: number, initial: number): Promise<number> {
  const envId = await asWorker(ctx, (c) => defaultEnvironmentId(c, site.id));
  const runtime = envId ? await ctx.configs.get(site.id, envId) : null;
  const bundle = runtime?.bundle ?? null;
  return asWorker(ctx, async (client) => {
    const existing = await client.query<{ n: string }>(`SELECT count(*)::text AS n FROM revenue_reconciliation_snapshots WHERE site_id = $1`, [site.id]);
    const days = Number(existing.rows[0]?.n ?? 0) > 0 ? lookback : initial;
    const shops = (await client.query<{ platform: string; status: string; last_event_at: Date | null }>(`SELECT platform, status, last_event_at FROM shop_connections WHERE site_id = $1 ORDER BY created_at`, [site.id])).rows;
    const keys = await client.query<{ n: string }>(`SELECT count(*)::text AS n FROM source_keys WHERE site_id = $1 AND status = 'active'`, [site.id]);
    const integrations = (await client.query<{ id: string; connector_type: string }>(`SELECT id, connector_type FROM integrations WHERE site_id = $1 ORDER BY created_at`, [site.id])).rows;
    const baseSources = { shop_connections: shops.map((s) => ({ platform: s.platform, status: s.status, last_event_at: s.last_event_at ? s.last_event_at.toISOString() : null })), server_keys: Number(keys.rows[0]?.n ?? 0) };
    let written = 0;
    const today = utcDay(now);
    for (let i = days - 1; i >= 0; i--) {
      const day = new Date(today.getTime() - i * DAY_MS);
      const next = new Date(day.getTime() + DAY_MS);
      for (const { kind, eventName } of KINDS) {
        const destinations = destinationsOf(bundle, integrations, eventName);
        const conversions = (
          await client.query<ConversionRow>(
            `SELECT order_id, value::text AS value, currency, occurred_at FROM conversion_records
             WHERE site_id = $1 AND kind = $2 AND source_verified = true AND order_id IS NOT NULL AND occurred_at >= $3 AND occurred_at < $4 ORDER BY occurred_at LIMIT 20000`,
            [site.id, kind, day, next],
          )
        ).rows;
        const dedup = await client.query<{ n: string }>(`SELECT count(*)::text AS n FROM events WHERE site_id = $1 AND name = $2 AND drop_reason = 'duplicate_conversion' AND server_ts >= $3 AND server_ts < $4`, [site.id, eventName, day, next]);
        const deduplicated = Number(dedup.rows[0]?.n ?? 0);
        const siteBucket = newBucket();
        const destBuckets = new Map(destinations.map((d) => [d.id, newBucket()]));
        const attemptsByDestination = new Map<string, number>();
        if (conversions.length) {
          const orderIds = conversions.map((c) => c.order_id);
          const events = (
            await client.query<OrderEventRow>(
              `SELECT event_id, source, processing_state, commerce->>'order_id' AS order_id, consent, deliveries FROM events
               WHERE site_id = $1 AND name = $2 AND commerce ? 'order_id' AND commerce->>'order_id' = ANY($3::text[]) AND server_ts >= $4 AND server_ts < $5`,
              [site.id, eventName, orderIds, new Date(day.getTime() - 30 * DAY_MS), new Date(next.getTime() + DAY_MS)],
            )
          ).rows;
          const eventIds = events.map((e) => e.event_id);
          const attempts = eventIds.length
            ? (await client.query<AttemptRow>(`SELECT event_id, integration_id, status, error_class, error_code, started_at FROM delivery_attempts WHERE site_id = $1 AND event_id = ANY($2::text[])`, [site.id, eventIds])).rows
            : [];
          const eventsByOrder = new Map<string, OrderEventRow[]>();
          for (const e of events) {
            const list = eventsByOrder.get(e.order_id) ?? [];
            list.push(e);
            eventsByOrder.set(e.order_id, list);
          }
          const attemptsByEvent = new Map<string, AttemptRow[]>();
          for (const a of attempts) {
            const list = attemptsByEvent.get(a.event_id) ?? [];
            list.push(a);
            attemptsByEvent.set(a.event_id, list);
            attemptsByDestination.set(a.integration_id, (attemptsByDestination.get(a.integration_id) ?? 0) + 1);
          }
          for (const c of conversions) {
            const orderEvents = eventsByOrder.get(c.order_id) ?? [];
            const orderAttempts = orderEvents.flatMap((e) => attemptsByEvent.get(e.event_id) ?? []);
            const hasBrowser = orderEvents.some((e) => e.source === "browser");
            const value = num(c.value);
            let deliveredAnywhere = false;
            // with no destination at all there is nothing consent could have blocked
            let consentAnywhere = destinations.length === 0;
            for (const d of destinations) {
              const outcome = classifyOrder(orderEvents, orderAttempts, d);
              addOrder(destBuckets.get(d.id)!, outcome, value, c.currency, hasBrowser);
              if (outcome === "delivered") deliveredAnywhere = true;
              if (outcome !== "no_consent") consentAnywhere = true;
            }
            // site-level capture view: delivered anywhere, otherwise the browser capture gap, then the consent gap; the rest stays unknown
            const siteOutcome: Outcome = deliveredAnywhere ? "delivered" : !hasBrowser ? "not_captured" : !consentAnywhere ? "no_consent" : "unknown";
            addOrder(siteBucket, siteOutcome, value, c.currency, hasBrowser);
          }
        }
        await upsertSnapshot(client, { organizationId: site.organization_id, siteId: site.id, integrationId: null, kind, day, bucket: siteBucket, deduplicated, sources: { ...baseSources, delivery_attempts: [...attemptsByDestination.values()].reduce((a, b) => a + b, 0), destination_mode: null } });
        written++;
        for (const d of destinations) {
          await upsertSnapshot(client, { organizationId: site.organization_id, siteId: site.id, integrationId: d.id, kind, day, bucket: destBuckets.get(d.id)!, deduplicated, sources: { ...baseSources, delivery_attempts: attemptsByDestination.get(d.id) ?? 0, destination_mode: d.mode, mapped: d.mapped, enabled: d.enabled } });
          written++;
        }
      }
    }
    return written;
  });
}

// ------------------------------------------------------------------------------------------------ data quality scan

export interface IssueInput {
  organizationId: string;
  siteId: string;
  environmentId: string | null;
  kind: string;
  category: string;
  severity: "info" | "warning" | "critical";
  summary: string;
  fixTool?: string | null;
  details?: Record<string, unknown>;
  evidence: {
    window: { from: string; to: string } | null;
    affected: number | null;
    total: number | null;
    value: { amount: number; currency: string } | null;
    samples: Array<{ event_id: string; name: string; source: string; server_ts: string; detail: string | null }>;
    facts: Record<string, string | number | boolean | null>;
  };
  firstSeenAt: Date | null;
  lastSeenAt: Date;
}

/**
 * Impact score 0–100: severity (critical 60 / warning 35 / info 10) plus the share of affected volume (up to 25
 * points; a logarithmic count when no comparison base exists) plus the known value (up to 15 points). The web
 * inbox applies the same formula to rows without a score (`apps/web/src/server/data-quality.ts`).
 */
export function impactScoreOf(input: { severity: "info" | "warning" | "critical"; affected: number | null; total: number | null; valueAmount: number | null }): number {
  const base = input.severity === "critical" ? 60 : input.severity === "warning" ? 35 : 10;
  let volume = 0;
  if (input.affected != null && input.total != null && input.total > 0) volume = 25 * Math.min(1, input.affected / input.total);
  else if (input.affected != null && input.affected > 0) volume = Math.min(15, Math.log10(input.affected + 1) * 5);
  const value = input.valueAmount != null && input.valueAmount > 0 ? Math.min(15, Math.log10(input.valueAmount + 1) * 3) : 0;
  return Math.max(0, Math.min(100, Math.round(base + volume + value)));
}

/**
 * Row identity inside a site (unique on `site_id, fingerprint`). Findings of one environment are keyed per
 * environment (`<kind>@<environment_id>`) so a site with two non-test environments never has one scan overwrite
 * the other's evidence; site-wide findings (revenue leaks and signal gaps carry `environmentId` null) are keyed by
 * kind alone. Migration 0009 re-keys the rows an earlier scan wrote with the bare kind.
 */
export function issueFingerprint(issue: Pick<IssueInput, "kind" | "environmentId">): string {
  return issue.environmentId ? `${issue.kind}@${issue.environmentId}` : issue.kind;
}

async function upsertIssue(client: PoolClient, issue: IssueInput): Promise<void> {
  const evidence = redactDeep(issue.evidence);
  const score = impactScoreOf({ severity: issue.severity, affected: issue.evidence.affected, total: issue.evidence.total, valueAmount: issue.evidence.value?.amount ?? null });
  const fingerprint = issueFingerprint(issue);
  await client.query(
    `INSERT INTO data_quality_issues (organization_id, site_id, environment_id, kind, category, fingerprint, severity, summary, details, evidence, impact_score, fix_tool, occurrences, first_seen_at, last_seen_at, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,1,coalesce($13, now()),$14,'open')
     ON CONFLICT (site_id, fingerprint) DO UPDATE SET
       last_seen_at = GREATEST(data_quality_issues.last_seen_at, EXCLUDED.last_seen_at),
       occurrences = data_quality_issues.occurrences + 1,
       severity = EXCLUDED.severity, summary = EXCLUDED.summary, details = EXCLUDED.details, evidence = EXCLUDED.evidence,
       impact_score = EXCLUDED.impact_score, category = EXCLUDED.category, fix_tool = coalesce(EXCLUDED.fix_tool, data_quality_issues.fix_tool),
       environment_id = coalesce(EXCLUDED.environment_id, data_quality_issues.environment_id),
       status = CASE
         WHEN data_quality_issues.status = 'resolved' THEN 'open'::issue_status
         WHEN data_quality_issues.status = 'muted' AND data_quality_issues.muted_until IS NOT NULL AND data_quality_issues.muted_until < now() THEN 'open'::issue_status
         ELSE data_quality_issues.status END,
       resolved_at = CASE WHEN data_quality_issues.status = 'resolved' THEN NULL ELSE data_quality_issues.resolved_at END`,
    [issue.organizationId, issue.siteId, issue.environmentId, issue.kind, issue.category, fingerprint, issue.severity, issue.summary, JSON.stringify(issue.details ?? {}), JSON.stringify(evidence), score, issue.fixTool ?? null, issue.firstSeenAt, issue.lastSeenAt],
  );
}

interface EnvRow {
  id: string;
  kind: string;
}

interface PurchaseAgg {
  total: string;
  duplicates: string;
  no_currency: string;
  no_value: string;
  no_order: string;
  zero_value: string;
  mismatch: string;
  currencies: string[] | null;
  first_seen: Date | null;
  last_seen: Date | null;
}

interface SampleRow {
  event_id: string;
  name: string;
  source: string;
  server_ts: Date;
  no_currency: boolean;
  no_value: boolean;
  no_order: boolean;
  zero_value: boolean;
  mismatch: boolean;
  duplicate: boolean;
}

const sample = (r: { event_id: string; name: string; source: string; server_ts: Date }, detail: string | null) => ({ event_id: r.event_id, name: r.name, source: r.source, server_ts: r.server_ts.toISOString(), detail: detail ? redactPii(detail).text : null });

/** Scans every active site's non-test environments for the last 24 hours and upserts inbox entries. */
export async function scanDataQuality(ctx: WorkerContext, options: { now?: Date } = {}): Promise<{ sites: number; issues: number }> {
  const now = options.now ?? ctx.now();
  const to = now;
  const from = new Date(now.getTime() - DAY_MS);
  const baselineFrom = new Date(from.getTime() - 7 * DAY_MS);
  const window = { from: from.toISOString(), to: to.toISOString() };
  const sites = await asWorker(ctx, activeSites);
  let issues = 0;
  // snoozes expire independently of a new observation
  await asWorker(ctx, (c) => c.query(`UPDATE data_quality_issues SET status = 'open', muted_until = NULL, status_changed_at = now() WHERE status = 'muted' AND muted_until IS NOT NULL AND muted_until < now()`));
  for (const site of sites) {
    try {
      issues += await scanSite(ctx, site, { now, from, to, baselineFrom, window });
    } catch (e) {
      ctx.logger.error({ siteId: site.id, err: e instanceof Error ? e.message : String(e) }, "data quality scan failed for site");
    }
  }
  return { sites: sites.length, issues };
}

async function scanSite(ctx: WorkerContext, site: SiteRow, w: { now: Date; from: Date; to: Date; baselineFrom: Date; window: { from: string; to: string } }): Promise<number> {
  const envs = await asWorker(ctx, async (c) => (await c.query<EnvRow>(`SELECT id, kind FROM environments WHERE site_id = $1 AND test_mode = false ORDER BY is_default DESC`, [site.id])).rows);
  let count = 0;
  for (const env of envs) {
    const runtime = await ctx.configs.get(site.id, env.id);
    count += await asWorker(ctx, async (client) => {
      const found: IssueInput[] = [];
      const base = { organizationId: site.organization_id, siteId: site.id, environmentId: env.id };

      // purchases: required fields, invalid values, currency mismatch, duplicate conversions
      const agg = (
        await client.query<PurchaseAgg>(
          `SELECT count(*) FILTER (WHERE processing_state <> 'deduplicated')::text AS total,
                  count(*) FILTER (WHERE processing_state = 'deduplicated')::text AS duplicates,
                  count(*) FILTER (WHERE processing_state <> 'deduplicated' AND commerce->>'currency' IS NULL)::text AS no_currency,
                  count(*) FILTER (WHERE processing_state <> 'deduplicated' AND commerce->>'value' IS NULL)::text AS no_value,
                  count(*) FILTER (WHERE processing_state <> 'deduplicated' AND commerce->>'order_id' IS NULL)::text AS no_order,
                  count(*) FILTER (WHERE processing_state <> 'deduplicated' AND (commerce->>'value')::numeric <= 0)::text AS zero_value,
                  count(*) FILTER (WHERE processing_state <> 'deduplicated' AND $5::text IS NOT NULL AND commerce->>'currency' IS NOT NULL AND commerce->>'currency' <> $5::text)::text AS mismatch,
                  array_agg(DISTINCT commerce->>'currency') FILTER (WHERE commerce->>'currency' IS NOT NULL) AS currencies,
                  min(server_ts) AS first_seen, max(server_ts) AS last_seen
           FROM events WHERE site_id = $1 AND environment_id = $2 AND name = 'purchase' AND server_ts >= $3 AND server_ts < $4 AND is_bot = false`,
          [site.id, env.id, w.from, w.to, site.currency],
        )
      ).rows[0]!;
      const total = Number(agg.total);
      const dup = Number(agg.duplicates);
      const flagged = { no_currency: Number(agg.no_currency), no_value: Number(agg.no_value), no_order: Number(agg.no_order), zero_value: Number(agg.zero_value), mismatch: Number(agg.mismatch) };
      const samples =
        total + dup > 0 && (Object.values(flagged).some((n) => n > 0) || dup > 0)
          ? (
              await client.query<SampleRow>(
                `SELECT event_id, name, source, server_ts,
                        commerce->>'currency' IS NULL AS no_currency, commerce->>'value' IS NULL AS no_value, commerce->>'order_id' IS NULL AS no_order,
                        coalesce((commerce->>'value')::numeric <= 0, false) AS zero_value,
                        ($5::text IS NOT NULL AND commerce->>'currency' IS NOT NULL AND commerce->>'currency' <> $5::text) AS mismatch,
                        processing_state = 'deduplicated' AS duplicate
                 FROM events WHERE site_id = $1 AND environment_id = $2 AND name = 'purchase' AND server_ts >= $3 AND server_ts < $4 AND is_bot = false
                   AND (commerce->>'currency' IS NULL OR commerce->>'value' IS NULL OR commerce->>'order_id' IS NULL OR (commerce->>'value')::numeric <= 0 OR processing_state = 'deduplicated'
                        OR ($5::text IS NOT NULL AND commerce->>'currency' IS NOT NULL AND commerce->>'currency' <> $5::text))
                 ORDER BY server_ts DESC LIMIT 60`,
                [site.id, env.id, w.from, w.to, site.currency],
              )
            ).rows
          : [];
      const pick = (flag: keyof Omit<SampleRow, "event_id" | "name" | "source" | "server_ts">, detail: (r: SampleRow) => string) => samples.filter((r) => r[flag]).slice(0, 5).map((r) => sample(r, detail(r)));
      const fieldIssue = (field: "currency" | "value" | "order_id", affected: number, flag: keyof typeof flagged) => {
        if (affected <= 0) return;
        const share = affected / Math.max(1, total);
        found.push({
          ...base,
          kind: `missing_required_field:purchase:${field}`,
          category: "required_fields",
          severity: field === "order_id" || share >= 0.2 ? "critical" : "warning",
          summary: `${affected} of ${total} purchase events in the last 24 hours have no ${field}.`,
          fixTool: "inspect_event_schema",
          evidence: { window: w.window, affected, total, value: null, samples: pick(flag, () => `commerce.${field} = null`), facts: { event: "purchase", field, share: round2(share) } },
          firstSeenAt: agg.first_seen,
          lastSeenAt: agg.last_seen ?? w.to,
        });
      };
      fieldIssue("currency", flagged.no_currency, "no_currency");
      fieldIssue("value", flagged.no_value, "no_value");
      fieldIssue("order_id", flagged.no_order, "no_order");
      if (flagged.zero_value > 0) {
        found.push({
          ...base,
          kind: "invalid_value:purchase:value",
          category: "values",
          severity: flagged.zero_value / Math.max(1, total) >= 0.2 ? "critical" : "warning",
          summary: `${flagged.zero_value} of ${total} purchase events in the last 24 hours carry a value of 0 or less.`,
          fixTool: "inspect_event_schema",
          evidence: { window: w.window, affected: flagged.zero_value, total, value: null, samples: pick("zero_value", () => "commerce.value <= 0"), facts: { event: "purchase", field: "value", share: round2(flagged.zero_value / Math.max(1, total)) } },
          firstSeenAt: agg.first_seen,
          lastSeenAt: agg.last_seen ?? w.to,
        });
      }
      if (flagged.mismatch > 0 && site.currency) {
        found.push({
          ...base,
          kind: "currency_mismatch:purchase",
          category: "values",
          severity: "warning",
          summary: `${flagged.mismatch} of ${total} purchase events in the last 24 hours use a currency other than the site currency ${site.currency}.`,
          evidence: { window: w.window, affected: flagged.mismatch, total, value: null, samples: pick("mismatch", () => "commerce.currency differs from site currency"), facts: { event: "purchase", site_currency: site.currency, seen: (agg.currencies ?? []).join(", ") } },
          firstSeenAt: agg.first_seen,
          lastSeenAt: agg.last_seen ?? w.to,
        });
      }
      if (dup > 0) {
        const rate = dup / Math.max(1, total + dup);
        found.push({
          ...base,
          kind: "duplicate_conversion:purchase",
          category: "duplicates",
          severity: rate >= 0.2 ? "critical" : rate >= 0.05 ? "warning" : "info",
          summary: `${dup} purchase events in the last 24 hours reported an order id that the same path had already reported (${Math.round(rate * 100)} % duplicate rate).`,
          evidence: { window: w.window, affected: dup, total: total + dup, value: null, samples: pick("duplicate", () => "drop_reason = duplicate_conversion"), facts: { event: "purchase", rate: round2(rate) } },
          firstSeenAt: agg.first_seen,
          lastSeenAt: agg.last_seen ?? w.to,
        });
      }

      // unplanned custom events (accepted, but not part of the published event plan)
      const unplanned = (
        await client.query<{ name: string; n: string; first_seen: Date; last_seen: Date }>(
          `SELECT name, count(*)::text AS n, min(server_ts) AS first_seen, max(server_ts) AS last_seen FROM events
           WHERE site_id = $1 AND environment_id = $2 AND server_ts >= $3 AND server_ts < $4 AND provenance->'name'->>'source' LIKE '%:unplanned' GROUP BY name ORDER BY n DESC LIMIT 20`,
          [site.id, env.id, w.from, w.to],
        )
      ).rows;
      if (unplanned.length) {
        const rows = (
          await client.query<{ event_id: string; name: string; source: string; server_ts: Date }>(
            `SELECT event_id, name, source, server_ts FROM (
               SELECT event_id, name, source, server_ts, row_number() OVER (PARTITION BY name ORDER BY server_ts DESC) AS rn FROM events
               WHERE site_id = $1 AND environment_id = $2 AND server_ts >= $3 AND server_ts < $4 AND provenance->'name'->>'source' LIKE '%:unplanned') s WHERE rn <= 3`,
            [site.id, env.id, w.from, w.to],
          )
        ).rows;
        for (const u of unplanned) {
          found.push({
            ...base,
            kind: `unplanned_event:${u.name}`,
            category: "schema",
            severity: "warning",
            summary: `The event "${u.name}" was received ${u.n} times in the last 24 hours but is not part of the published event plan.`,
            fixTool: "add_event_to_plan",
            evidence: { window: w.window, affected: Number(u.n), total: null, value: null, samples: rows.filter((r) => r.name === u.name).map((r) => sample(r, "not in the published event plan")), facts: { event: u.name } },
            firstSeenAt: u.first_seen,
            lastSeenAt: u.last_seen,
          });
        }
      }

      // ingest drops by reason (event_aggregates)
      const received = Number((await client.query<{ n: string }>(`SELECT coalesce(sum(received), 0)::text AS n FROM event_aggregates WHERE site_id = $1 AND environment_id = $2 AND bucket_start >= $3 AND bucket_start < $4`, [site.id, env.id, w.from, w.to])).rows[0]?.n ?? 0);
      const drops = (
        await client.query<{ reason: string; n: string }>(
          `SELECT d.key AS reason, sum(d.value::int)::text AS n FROM event_aggregates ea, jsonb_each_text(ea.dropped) d
           WHERE ea.site_id = $1 AND ea.environment_id = $2 AND ea.bucket_start >= $3 AND ea.bucket_start < $4 GROUP BY d.key`,
          [site.id, env.id, w.from, w.to],
        )
      ).rows;
      for (const d of drops) {
        const n = Number(d.n);
        if (n <= 0) continue;
        if (!["pii_blocked", "invalid_event_name", "invalid_url", "timestamp_out_of_window", "consent_missing", "consent_denied"].includes(d.reason)) continue;
        const share = received > 0 ? n / received : null;
        const consentReason = d.reason.startsWith("consent");
        // consent drops are the policy working as designed; they only become an inbox entry when they dominate the traffic
        if (consentReason && (share == null || share < 0.5)) continue;
        found.push({
          ...base,
          kind: `ingest_drop:${d.reason}`,
          category: "drops",
          severity: consentReason ? "info" : (share ?? 0) >= 0.05 || n >= 50 ? "warning" : "info",
          summary: `${n} events were dropped at ingest in the last 24 hours (reason: ${d.reason}${share != null ? `, ${Math.round(share * 100)} % of received events` : ""}).`,
          evidence: { window: w.window, affected: n, total: received || null, value: null, samples: [], facts: { reason: d.reason, share: share == null ? null : round2(share) } },
          firstSeenAt: w.from,
          lastSeenAt: w.to,
        });
      }

      // event drops and conversion spikes against the trailing 7-day daily average
      const critical = new Set<string>(["purchase", "generate_lead"]);
      for (const e of runtime.bundle?.events ?? []) if (e.enabled && e.critical) critical.add(e.name);
      const volumes = (
        await client.query<{ event_name: string; today: string; baseline: string }>(
          `SELECT event_name,
                  coalesce(sum(accepted) FILTER (WHERE bucket_start >= $3), 0)::text AS today,
                  coalesce(sum(accepted) FILTER (WHERE bucket_start < $3), 0)::text AS baseline
           FROM event_aggregates WHERE site_id = $1 AND environment_id = $2 AND bucket_start >= $5 AND bucket_start < $4 AND event_name = ANY($6::text[]) GROUP BY event_name`,
          [site.id, env.id, w.from, w.to, w.baselineFrom, [...critical]],
        )
      ).rows;
      for (const v of volumes) {
        const today = Number(v.today);
        const avg = Number(v.baseline) / 7;
        if (avg >= 10 && today < avg * 0.2) {
          found.push({
            ...base,
            kind: `event_drop:${v.event_name}`,
            category: "drops",
            severity: today === 0 ? "critical" : "warning",
            summary: `Only ${today} "${v.event_name}" events were accepted in the last 24 hours against a daily average of ${Math.round(avg)} over the previous 7 days.`,
            fixTool: "show_delivery_errors",
            evidence: { window: w.window, affected: today, total: Math.round(avg), value: null, samples: [], facts: { event: v.event_name, today, baseline_daily_avg: round2(avg) } },
            firstSeenAt: w.from,
            lastSeenAt: w.to,
          });
        }
        if ((v.event_name === "purchase" || v.event_name === "generate_lead") && avg >= 5 && today > avg * 3) {
          found.push({
            ...base,
            kind: `conversion_spike:${v.event_name}`,
            category: "spikes",
            severity: "warning",
            summary: `${today} "${v.event_name}" events were accepted in the last 24 hours, more than three times the daily average of ${Math.round(avg)} over the previous 7 days.`,
            evidence: { window: w.window, affected: today, total: Math.round(avg), value: null, samples: [], facts: { event: v.event_name, today, baseline_daily_avg: round2(avg) } },
            firstSeenAt: w.from,
            lastSeenAt: w.to,
          });
        }
      }

      // revenue leaks from the reconciliation snapshots of the last 7 days (site level and per destination)
      const leaks = (
        await client.query<{ integration_id: string | null; kind: string; authoritative: string; gaps: string; no_consent: string; blocked: string; not_captured: string; failed: string; unknown: string; leak_min: string | null; currencies: string[] | null; mixed: boolean; mode: string | null; name: string | null }>(
          `SELECT s.integration_id, s.kind, sum(s.authoritative_count)::text AS authoritative,
                  sum(s.gap_no_consent + s.gap_blocked + s.gap_not_captured + s.gap_delivery_failed)::text AS gaps,
                  sum(s.gap_no_consent)::text AS no_consent, sum(s.gap_blocked)::text AS blocked, sum(s.gap_not_captured)::text AS not_captured,
                  sum(s.gap_delivery_failed)::text AS failed, sum(s.gap_unknown)::text AS unknown,
                  sum(s.leak_value_min)::text AS leak_min, array_agg(DISTINCT s.currency) FILTER (WHERE s.currency IS NOT NULL) AS currencies,
                  bool_or(s.currency_mixed) AS mixed, max(s.sources->>'destination_mode') AS mode, max(i.name) AS name
           FROM revenue_reconciliation_snapshots s LEFT JOIN integrations i ON i.id = s.integration_id
           WHERE s.site_id = $1 AND s.period_start >= $2 GROUP BY s.integration_id, s.kind`,
          [site.id, new Date(utcDay(w.now).getTime() - 7 * DAY_MS)],
        )
      ).rows;
      for (const l of leaks) {
        const authoritative = Number(l.authoritative);
        const gaps = Number(l.gaps);
        if (authoritative < 5 || gaps <= 0) continue;
        const share = gaps / authoritative;
        const currency = !l.mixed && l.currencies?.length === 1 ? l.currencies[0]! : null;
        const leakMin = num(l.leak_min);
        const value = currency && leakMin != null && leakMin > 0 ? { amount: round2(leakMin), currency } : null;
        const facts = { kind: l.kind, integration_id: l.integration_id, destination: l.name, destination_mode: l.mode, no_consent: Number(l.no_consent), blocked: Number(l.blocked), not_captured: Number(l.not_captured), delivery_failed: Number(l.failed), unknown: Number(l.unknown), share: round2(share), days: 7 };
        if (l.integration_id === null) {
          const notCaptured = Number(l.not_captured);
          if (notCaptured / authoritative < 0.2) continue;
          found.push({
            ...base,
            environmentId: null,
            kind: `signal_gap:browser_capture:${l.kind}`,
            category: "revenue",
            severity: notCaptured / authoritative >= 0.5 ? "critical" : "warning",
            summary: `${notCaptured} of ${authoritative} verified ${l.kind === "lead" ? "leads" : "orders"} in the last 7 days have no matching browser event (order id not captured on the site).`,
            evidence: { window: { from: new Date(utcDay(w.now).getTime() - 7 * DAY_MS).toISOString(), to: w.to.toISOString() }, affected: notCaptured, total: authoritative, value: null, samples: [], facts },
            firstSeenAt: null,
            lastSeenAt: w.to,
          });
          continue;
        }
        if (share < 0.1) continue;
        found.push({
          ...base,
          environmentId: null,
          kind: `revenue_leak:${l.integration_id}:${l.kind}`,
          category: "revenue",
          severity: share >= 0.3 ? "critical" : "warning",
          summary: `${gaps} of ${authoritative} verified ${l.kind === "lead" ? "leads" : "orders"} in the last 7 days did not reach ${l.name ?? "the destination"}${value ? ` (at least ${value.amount} ${value.currency})` : ""}.`,
          fixTool: "show_delivery_errors",
          evidence: { window: { from: new Date(utcDay(w.now).getTime() - 7 * DAY_MS).toISOString(), to: w.to.toISOString() }, affected: gaps, total: authoritative, value, samples: [], facts },
          firstSeenAt: null,
          lastSeenAt: w.to,
        });
      }

      for (const issue of found) await upsertIssue(client, issue);
      return found.length;
    });
  }
  return count;
}

/** Scheduler entry point: reconciliation snapshots first, then the inbox scan that reads them. */
export async function runDataQualityJobs(ctx: WorkerContext, options: ReconciliationOptions = {}): Promise<ReconciliationSummary> {
  const rec = await runReconciliation(ctx, options);
  const scan = await scanDataQuality(ctx, { now: options.now });
  ctx.logger.info({ sites: rec.sites, snapshots: rec.snapshots, issues: scan.issues }, "data quality jobs run");
  return { sites: rec.sites, snapshots: rec.snapshots, issues: scan.issues };
}
