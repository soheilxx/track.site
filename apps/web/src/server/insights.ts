import "server-only";
import { asc, eq, sql, type SQL } from "drizzle-orm";
import { activeVersion, integrations } from "@track-site/db";
import {
  AD_SERVER_REFERRER_PATTERN,
  PAID_MEDIUMS,
  buildDestinations,
  captureRate,
  configFromBundle,
  consentGapEstimate,
  fillDays,
  summarizeClickIds,
  windowFor,
  type AttributionHealth,
  type ClickIdRow,
  type DailyRow,
  type DestinationInput,
  type ForwardingRow,
  type RangeDays,
  type Totals,
  type TouchpointChannel,
} from "./insights-attribution";
import {
  AUDIENCE_EVENTS,
  audienceSegments,
  type AudienceEventRow,
  type AudienceSegments,
} from "./insights-audiences";
import { withOrg, type OrgContext } from "./session";

/**
 * Insights queries (Attribution & Click-ID Health). Every statement runs inside `withOrg` — the
 * RLS-scoped transaction of the signed-in organization — against the partitioned `events` table
 * (site + `server_ts` window, so partition pruning applies), `integrations` and
 * `attribution_touchpoints`. Only accepted events count (`processing_state` not rejected/blocked).
 * Click-id values never leave the database: the statements aggregate per parameter and per
 * destination and return counts, timestamps and durations only.
 */
export interface AttributionInput {
  siteId: string;
  /** Active environment of the workspace; `null` = every environment of the site. */
  environmentId: string | null;
  days: RangeDays;
  now?: Date;
}

type Rows<T> = { rows: T[] };

const num = (v: unknown): number =>
  typeof v === "number" ? v : typeof v === "string" ? Number(v) : 0;
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : num(v));
const date = (v: unknown): Date | null =>
  v instanceof Date ? v : typeof v === "string" && v ? new Date(v) : null;

/**
 * Processing states of events the pipeline dropped: rejected, blocked by policy, or a duplicate
 * conversion (`deduplicated` is only set for the second report of the same order — never routed,
 * never billed). Everything else counts as accepted.
 */
const DROPPED_STATES = ["rejected", "policy_blocked", "deduplicated"] as const;
const HAS_CLICK_IDS = sql`click_ids IS NOT NULL AND jsonb_typeof(click_ids) = 'object' AND click_ids <> '{}'::jsonb`;
const MARKETING = sql`((consent->'granted') ? 'marketing')`;

function scope(input: AttributionInput, from: Date, to: Date): SQL {
  const env = input.environmentId ? sql` AND environment_id = ${input.environmentId}` : sql``;
  return sql`site_id = ${input.siteId} AND server_ts >= ${from} AND server_ts < ${to} AND processing_state NOT IN ${[...DROPPED_STATES]}${env}`;
}

export async function attributionHealth(
  ctx: OrgContext,
  input: AttributionInput,
): Promise<AttributionHealth> {
  const window = windowFor(input.days, input.now);
  const { from, to } = window;
  const where = scope(input, from, to);

  return withOrg(ctx, async (tx) => {
    const totalsRes = (await tx.execute(sql`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE ${MARKETING})::int AS marketing,
             count(*) FILTER (WHERE ${HAS_CLICK_IDS})::int AS with_click_ids,
             count(*) FILTER (WHERE ${HAS_CLICK_IDS} AND NOT ${MARKETING})::int AS click_ids_without_consent,
             count(*) FILTER (WHERE ${MARKETING} AND NOT (${HAS_CLICK_IDS}) AND (
               lower(coalesce(utm->>'utm_medium', '')) IN ${[...PAID_MEDIUMS]}
               OR coalesce(referrer, '') ~* ${AD_SERVER_REFERRER_PATTERN}
             ))::int AS paid_without_click_id,
             min(server_ts) AS first_event_at,
             max(server_ts) AS last_event_at
      FROM events WHERE ${where}`)) as unknown as Rows<Record<string, unknown>>;
    const t = totalsRes.rows[0] ?? {};
    const totals: Totals = {
      total: num(t.total),
      marketing: num(t.marketing),
      withClickIds: num(t.with_click_ids),
      clickIdsWithoutConsent: num(t.click_ids_without_consent),
      firstEventAt: date(t.first_event_at),
      lastEventAt: date(t.last_event_at),
    };

    const clickIdRes = (await tx.execute(sql`
      WITH ev AS (
        SELECT event_id, source, server_ts, consent, click_ids
        FROM events WHERE ${where} AND ${HAS_CLICK_IDS}
      ), ids AS (
        SELECT e.event_id, e.source AS event_source, e.server_ts, ${MARKETING} AS marketing,
               c.key AS param, c.value->>'value' AS value, coalesce(c.value->>'source', '') AS id_source,
               (c.value->>'captured_at')::timestamptz AS captured_at, (c.value->>'expires_at')::timestamptz AS expires_at,
               row_number() OVER (PARTITION BY c.key, c.value->>'value' ORDER BY e.server_ts, e.event_id) AS rn
        FROM ev e CROSS JOIN LATERAL jsonb_each(e.click_ids) c
        WHERE jsonb_typeof(c.value) = 'object'
      ), spans AS (
        SELECT param, value, EXTRACT(EPOCH FROM (max(server_ts) - min(server_ts))) AS span_s FROM ids GROUP BY param, value
      ), span_agg AS (
        SELECT param, percentile_cont(0.5) WITHIN GROUP (ORDER BY span_s) AS median_span_s, max(span_s) AS max_span_s FROM spans GROUP BY param
      )
      SELECT i.param,
             count(*)::int AS event_count,
             count(DISTINCT i.value)::int AS distinct_values,
             count(*) FILTER (WHERE i.event_source = 'browser' AND i.rn = 1)::int AS origin_url,
             count(*) FILTER (WHERE i.event_source = 'browser' AND i.rn > 1)::int AS origin_storage,
             count(*) FILTER (WHERE i.event_source <> 'browser' AND i.id_source <> 'browser')::int AS origin_server,
             count(*) FILTER (WHERE i.event_source <> 'browser' AND i.id_source = 'browser')::int AS origin_inherited,
             count(*) FILTER (WHERE NOT i.marketing)::int AS without_consent,
             min(i.server_ts) AS first_seen,
             max(i.server_ts) AS last_seen,
             min(EXTRACT(EPOCH FROM (i.expires_at - i.captured_at)))::float8 AS ttl_min_s,
             max(EXTRACT(EPOCH FROM (i.expires_at - i.captured_at)))::float8 AS ttl_max_s,
             max(s.median_span_s)::float8 AS median_span_s,
             max(s.max_span_s)::float8 AS max_span_s
      FROM ids i LEFT JOIN span_agg s ON s.param = i.param
      GROUP BY i.param
      ORDER BY event_count DESC, i.param ASC`)) as unknown as Rows<Record<string, unknown>>;
    const clickIdRows: ClickIdRow[] = clickIdRes.rows.map((r) => ({
      param: String(r.param),
      events: num(r.event_count),
      values: num(r.distinct_values),
      originUrl: num(r.origin_url),
      originStorage: num(r.origin_storage),
      originServer: num(r.origin_server),
      originInherited: num(r.origin_inherited),
      withoutConsent: num(r.without_consent),
      firstSeen: date(r.first_seen),
      lastSeen: date(r.last_seen),
      ttlMinSeconds: numOrNull(r.ttl_min_s),
      ttlMaxSeconds: numOrNull(r.ttl_max_s),
      medianSpanSeconds: numOrNull(r.median_span_s),
      maxSpanSeconds: numOrNull(r.max_span_s),
    }));

    const destinationRows = await tx
      .select({
        id: integrations.id,
        name: integrations.name,
        connectorType: integrations.connectorType,
        status: integrations.status,
        testMode: integrations.testMode,
        pausedAt: integrations.pausedAt,
      })
      .from(integrations)
      .where(eq(integrations.siteId, input.siteId))
      .orderBy(asc(integrations.name));
    const destinations: DestinationInput[] = destinationRows.map((d) => ({
      id: d.id,
      name: d.name,
      connectorType: d.connectorType,
      status: d.status,
      testMode: d.testMode,
      pausedAt: d.pausedAt,
    }));
    const accepting = buildDestinations(destinations, []).filter((d) => d.accepts.length > 0);

    let forwardingRows: ForwardingRow[] = [];
    if (accepting.length > 0 && totals.withClickIds > 0) {
      const spec = JSON.stringify(accepting.map((d) => ({ id: d.id, params: d.accepts })));
      const fwdRes = (await tx.execute(sql`
        WITH ev AS (
          SELECT event_id, server_ts, click_ids, deliveries
          FROM events WHERE ${where} AND ${HAS_CLICK_IDS}
        ), ids AS (
          SELECT e.event_id, e.deliveries, c.key AS param, (c.value->>'expires_at')::timestamptz AS expires_at
          FROM ev e CROSS JOIN LATERAL jsonb_each(e.click_ids) c
          WHERE jsonb_typeof(c.value) = 'object'
        ), dest AS (
          SELECT * FROM jsonb_to_recordset(${spec}::jsonb) AS d(id text, params jsonb)
        )
        SELECT d.id AS integration_id, i.param,
               count(*)::int AS eligible,
               count(*) FILTER (WHERE i.deliveries->d.id->>'status' = 'delivered')::int AS delivered,
               count(*) FILTER (WHERE i.deliveries->d.id->>'status' = 'failed')::int AS failed,
               count(*) FILTER (WHERE i.deliveries->d.id->>'status' IN ('pending', 'skipped'))::int AS pending,
               count(*) FILTER (WHERE i.deliveries IS NULL OR i.deliveries->d.id IS NULL)::int AS not_routed,
               count(*) FILTER (WHERE i.deliveries->d.id->>'status' = 'delivered' AND i.expires_at IS NOT NULL AND (i.deliveries->d.id->>'at')::timestamptz > i.expires_at)::int AS expired_at_delivery,
               max((i.deliveries->d.id->>'at')::timestamptz) FILTER (WHERE i.deliveries->d.id->>'status' = 'delivered') AS last_delivered_at
        FROM ids i JOIN dest d ON d.params ? i.param
        GROUP BY d.id, i.param`)) as unknown as Rows<Record<string, unknown>>;
      forwardingRows = fwdRes.rows.map((r) => ({
        integrationId: String(r.integration_id),
        param: String(r.param),
        eligible: num(r.eligible),
        delivered: num(r.delivered),
        failed: num(r.failed),
        pending: num(r.pending),
        notRouted: num(r.not_routed),
        expiredAtDelivery: num(r.expired_at_delivery),
        lastDeliveredAt: date(r.last_delivered_at),
      }));
    }

    const dailyRes = (await tx.execute(sql`
      SELECT to_char(date_trunc('day', server_ts AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
             count(*)::int AS total,
             count(*) FILTER (WHERE ${MARKETING})::int AS marketing,
             count(*) FILTER (WHERE ${HAS_CLICK_IDS})::int AS with_click_ids
      FROM events WHERE ${where}
      GROUP BY 1 ORDER BY 1`)) as unknown as Rows<Record<string, unknown>>;
    const daily: DailyRow[] = dailyRes.rows.map((r) => ({
      day: String(r.day),
      total: num(r.total),
      marketing: num(r.marketing),
      withClickIds: num(r.with_click_ids),
    }));

    const touchRes = (await tx.execute(sql`
      SELECT channel, count(*)::int AS touchpoints, count(DISTINCT anonymous_id)::int AS visitors,
             count(*) FILTER (WHERE click_ids IS NOT NULL AND click_ids <> '{}'::jsonb)::int AS with_click_ids,
             max(occurred_at) AS last_at
      FROM attribution_touchpoints
      WHERE site_id = ${input.siteId} AND occurred_at >= ${from} AND occurred_at < ${to}
      GROUP BY channel ORDER BY touchpoints DESC, channel ASC LIMIT 20`)) as unknown as Rows<
      Record<string, unknown>
    >;
    const channels: TouchpointChannel[] = touchRes.rows.map((r) => ({
      channel: String(r.channel),
      touchpoints: num(r.touchpoints),
      visitors: num(r.visitors),
      withClickIds: num(r.with_click_ids),
      lastAt: date(r.last_at),
    }));

    const version = input.environmentId ? await activeVersion(tx, input.environmentId) : null;
    const config = input.environmentId
      ? configFromBundle(version?.bundle ?? null, version?.version ?? null)
      : null;

    const builtDestinations = buildDestinations(destinations, forwardingRows);
    return {
      window,
      scope: { siteId: input.siteId, environmentId: input.environmentId },
      config,
      observed: { ...totals, captureRate: captureRate(totals) },
      clickIds: summarizeClickIds(clickIdRows),
      destinations: builtDestinations,
      daily: fillDays(daily, from, to),
      touchpoints: { total: channels.reduce((a, c) => a + c.touchpoints, 0), channels },
      modelled: {
        paidWithoutClickId: totals.marketing > 0 ? num(t.paid_without_click_id) : null,
        consentGapEstimate: consentGapEstimate(totals),
      },
      unknown: {
        eventsWithoutMarketingConsent: totals.total - totals.marketing,
        destinationsWithoutObservation: builtDestinations.filter(
          (d) => d.verdict === "no_eligible" || d.verdict === "inactive",
        ).length,
      },
    };
  });
}

export const AUDIENCE_SAMPLE_LIMIT = 5000;

export interface AudienceInsights extends AudienceSegments {
  window: { from: Date; to: Date; days: number };
  /** True when the sample limit was hit: the segments then rest on the newest events only. */
  truncated: boolean;
}

/** Segment inputs for the audiences page: the newest accepted audience events of the window (sampled). */
export async function audienceInsights(
  ctx: OrgContext,
  input: { siteId: string; environmentId: string | null; days?: number; now?: Date },
): Promise<AudienceInsights> {
  const days = input.days ?? 30;
  const to = new Date((input.now ?? new Date()).getTime());
  const from = new Date(to.getTime() - days * 86_400_000);
  const env = input.environmentId ? sql` AND environment_id = ${input.environmentId}` : sql``;
  const rows = await withOrg(ctx, async (tx) => {
    const res = (await tx.execute(sql`
      SELECT name, coalesce(user_id, anonymous_id) AS subject, ${MARKETING} AS marketing,
             CASE WHEN jsonb_typeof(commerce->'value') = 'number' THEN (commerce->>'value')::float8 ELSE NULL END AS value
      FROM events
      WHERE site_id = ${input.siteId} AND server_ts >= ${from} AND server_ts < ${to} AND processing_state NOT IN ${[...DROPPED_STATES]}${env}
        AND name IN ${[...AUDIENCE_EVENTS]}
      ORDER BY server_ts DESC
      LIMIT ${AUDIENCE_SAMPLE_LIMIT}`)) as unknown as Rows<Record<string, unknown>>;
    return res.rows.map<AudienceEventRow>((r) => ({
      name: String(r.name),
      subject: r.subject ? String(r.subject) : null,
      marketing: r.marketing === true,
      value: numOrNull(r.value),
    }));
  });
  return {
    ...audienceSegments(rows),
    window: { from, to, days },
    truncated: rows.length >= AUDIENCE_SAMPLE_LIMIT,
  };
}
