import { eq, inArray, sql } from "drizzle-orm";
import {
  ALERT_EVENT_HEADER,
  ALERT_FETCH_TIMEOUT_MS,
  ALERT_SIGNATURE_HEADER,
  ALERT_THRESHOLD_DEFAULTS,
  ALERT_THRESHOLD_FIELDS,
  ALERT_USER_AGENT,
  alertChannels,
  alertRules,
  alertSignatureHeader,
  alertSlackPayload,
  alertWebhookBody,
  createDb,
  deliveryRecord,
  insertAlertEvent,
  latestAlertEvent,
  openAlertEvents,
  recordAlertDelivery,
  resolveAlertEvent,
  shouldTriggerAlert,
  withWorker,
  type AlertChannelRow,
  type AlertDelivery,
  type AlertEventDetail,
  type AlertEventRow,
  type AlertNotification,
  type AlertRuleKind,
  type AlertRuleRow,
  type AlertSeverity,
  type AlertThreshold,
  type Db,
  type Tx,
} from "@track-site/db";
import type { WorkerContext } from "../context.ts";
import { sendAlertMail } from "./alerts-mail.ts";
import { renderAlertText } from "./alerts-text.ts";

/**
 * Alerts & Incident Mode (redesign supplement §8 module 13, migration 0013). Every minute the job
 * evaluates the enabled `alert_rules` of every organization against measured data only:
 *
 *   - event_drop / conversion_anomaly: accepted events (or conversions) of the last complete hours from
 *     `event_aggregates` (non-test environments) against the average of the same window one to four
 *     weeks earlier — the 4-week baseline; weeks without data do not count.
 *   - consent_errors: events dropped by the policy gate for a consent reason (`consent_missing`,
 *     `consent_denied`, `purpose_not_granted`, `gpc_opt_out`) as a share of the events received.
 *   - vendor_outage / queue_lag: `integrations` + `destination_health_snapshots` (error rate over the
 *     24 h window, destination status, oldest queued message) written by the `destination-health` job.
 *   - credential_expiry: `credentials` with an expiry date and `oauth_connections` whose status is no
 *     longer connected.
 *
 * A condition produces one `alert_events` row per rule and subject (site or destination), stays open
 * while it persists, is resolved when it clears and is not repeated inside the rule's cooldown.
 * Notifications go out per channel (e-mail, signed webhook, Slack blocks) with 10 s timeouts; the
 * outcome per channel is recorded on the event. Idempotent and safe on several workers: a subject with
 * an open event never gets a second one. Pure helpers (`evaluateRule`, `normalizeThreshold`,
 * `baselineMean`) are unit-tested with fixtures.
 */
export const ALERTS_INTERVAL_MS = 60_000;
/** Baseline weeks compared for drops and anomalies. */
export const BASELINE_WEEKS = 4;
const CONVERSION_EVENTS = ["purchase", "generate_lead", "lead", "sign_up", "subscribe"] as const;
const CONSENT_DROP_CODES = [
  "consent_missing",
  "consent_denied",
  "purpose_not_granted",
  "gpc_opt_out",
] as const;

// ---------------------------------------------------------------------------------------------------
// Pure evaluation
// ---------------------------------------------------------------------------------------------------

export interface VolumeFacts {
  /** accepted events in the current window (last complete hours) */
  current: number;
  /** same window 1..4 weeks earlier; zero entries are weeks without data */
  baseline: number[];
}

export interface ConsentFacts {
  received: number;
  consentDropped: number;
}

export interface DestinationFacts {
  integrationId: string;
  name: string;
  connectorType: string;
  status: string;
  attemptsTotal: number;
  /** (failed + retry) / attempts inside the snapshot window; null without attempts or snapshot */
  errorRate: number | null;
  lastErrorClass: string | null;
  queueOldestAvailableAt: string | null;
  queueReady: number | null;
}

export interface CredentialFacts {
  integrationId: string;
  integrationName: string;
  /** credential kind or `oauth` */
  kind: string;
  expiresAt: string | null;
  status: string;
  source: "credential" | "oauth";
}

export interface SiteFacts {
  siteId: string;
  siteName: string;
  /** keyed by window minutes */
  events: Record<number, VolumeFacts>;
  conversions: Record<number, VolumeFacts>;
  consent: Record<number, ConsentFacts>;
  destinations: DestinationFacts[];
  credentials: CredentialFacts[];
}

export interface RuleInput {
  id: string;
  kind: AlertRuleKind;
  threshold: AlertThreshold;
}

export interface Finding {
  subjectKey: string;
  severity: AlertSeverity;
  title: string;
  detail: AlertEventDetail;
}

/** Fills missing fields with the defaults and clamps every value into the bounds of the field spec. */
export function normalizeThreshold(kind: AlertRuleKind, raw: unknown): AlertThreshold {
  const source =
    raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out: AlertThreshold = {};
  for (const field of ALERT_THRESHOLD_FIELDS[kind]) {
    const candidate = Number(source[field.key]);
    let value = Number.isFinite(candidate) ? candidate : ALERT_THRESHOLD_DEFAULTS[kind][field.key]!;
    value = Math.min(field.max, Math.max(field.min, value));
    out[field.key] = field.integer ? Math.round(value) : value;
  }
  return out;
}

/** Average of the weeks that had data; null when no week had any. */
export function baselineMean(values: number[]): number | null {
  const present = values.filter((v) => v > 0);
  if (!present.length) return null;
  return present.reduce((a, b) => a + b, 0) / present.length;
}

const pct = (value: number): number => Math.round(value * 100);
const DAY_MS = 86_400_000;

/** Findings of one rule for one site; every finding names its subject so cooldown and resolution work per subject. */
export function evaluateRule(rule: RuleInput, facts: SiteFacts, now: Date): Finding[] {
  const t = normalizeThreshold(rule.kind, rule.threshold);
  const findings: Finding[] = [];
  switch (rule.kind) {
    case "event_drop": {
      const v = facts.events[t.windowMinutes!];
      if (!v) break;
      const expected = baselineMean(v.baseline);
      if (expected == null || expected < t.minBaseline!) break;
      const drop = pct(1 - v.current / expected);
      if (drop < t.dropPercent!) break;
      const critical = v.current === 0 || drop >= Math.min(100, t.dropPercent! * 2);
      findings.push({
        subjectKey: `site:${facts.siteId}`,
        severity: critical ? "critical" : "warning",
        title: `Event volume dropped ${drop}% on ${facts.siteName} (${v.current} vs. ${Math.round(expected)} expected in ${t.windowMinutes} min)`,
        detail: {
          site_name: facts.siteName,
          window_minutes: t.windowMinutes!,
          observed: v.current,
          expected: Math.round(expected),
          drop_percent: drop,
          threshold_percent: t.dropPercent!,
          baseline_weeks: v.baseline.filter((b) => b > 0).length,
        },
      });
      break;
    }
    case "conversion_anomaly": {
      const v = facts.conversions[t.windowMinutes!];
      if (!v) break;
      const expected = baselineMean(v.baseline);
      if (expected == null || expected < t.minBaseline!) break;
      const deviation = pct((v.current - expected) / expected);
      if (Math.abs(deviation) < t.deviationPercent!) break;
      const direction = deviation < 0 ? "drop" : "spike";
      const critical =
        direction === "drop" &&
        (v.current === 0 || -deviation >= Math.min(100, t.deviationPercent! * 2));
      findings.push({
        subjectKey: `site:${facts.siteId}`,
        severity: critical ? "critical" : "warning",
        title: `Conversions ${direction === "drop" ? "dropped" : "rose"} ${Math.abs(deviation)}% on ${facts.siteName} (${v.current} vs. ${Math.round(expected)} expected in ${t.windowMinutes} min)`,
        detail: {
          site_name: facts.siteName,
          window_minutes: t.windowMinutes!,
          observed: v.current,
          expected: Math.round(expected),
          deviation_percent: Math.abs(deviation),
          direction,
          threshold_percent: t.deviationPercent!,
          baseline_weeks: v.baseline.filter((b) => b > 0).length,
        },
      });
      break;
    }
    case "consent_errors": {
      const c = facts.consent[t.windowMinutes!];
      if (!c || c.received < t.minEvents!) break;
      const rate = pct(c.consentDropped / c.received);
      if (rate < t.errorRatePercent!) break;
      findings.push({
        subjectKey: `site:${facts.siteId}`,
        severity: rate >= Math.min(100, t.errorRatePercent! * 2) ? "critical" : "warning",
        title: `${rate}% of events blocked by consent on ${facts.siteName} (${c.consentDropped} of ${c.received} in ${t.windowMinutes} min)`,
        detail: {
          site_name: facts.siteName,
          window_minutes: t.windowMinutes!,
          received: c.received,
          consent_dropped: c.consentDropped,
          rate_percent: rate,
          threshold_percent: t.errorRatePercent!,
        },
      });
      break;
    }
    case "vendor_outage": {
      for (const d of facts.destinations) {
        if (d.status === "draft" || d.status === "paused") continue;
        const rate = d.errorRate == null ? null : pct(d.errorRate);
        const failing =
          d.status === "error" ||
          (rate != null && d.attemptsTotal >= t.minAttempts! && rate >= t.errorRatePercent!);
        if (!failing) continue;
        findings.push({
          subjectKey: `integration:${d.integrationId}`,
          severity: d.status === "error" || (rate ?? 0) >= 90 ? "critical" : "warning",
          title: `Deliveries to ${d.name} are failing (${rate ?? "?"}% of ${d.attemptsTotal} attempts, status ${d.status})`,
          detail: {
            site_name: facts.siteName,
            integration_id: d.integrationId,
            integration_name: d.name,
            connector_type: d.connectorType,
            status: d.status,
            error_rate_percent: rate,
            attempts: d.attemptsTotal,
            threshold_percent: t.errorRatePercent!,
            last_error_class: d.lastErrorClass ?? "none",
          },
        });
      }
      break;
    }
    case "credential_expiry": {
      for (const c of facts.credentials) {
        let state: "expired" | "expiring" | "disconnected" | null = null;
        let daysLeft: number | null = null;
        if (c.source === "oauth") {
          if (c.status !== "connected") state = "disconnected";
        } else if (c.expiresAt) {
          const ms = new Date(c.expiresAt).getTime() - now.getTime();
          daysLeft = Math.floor(ms / DAY_MS);
          if (ms <= 0) state = "expired";
          else if (daysLeft <= t.daysBefore!) state = "expiring";
        }
        if (!state) continue;
        findings.push({
          subjectKey: `integration:${c.integrationId}:${c.kind}`,
          severity: state === "expiring" ? "warning" : "critical",
          title: `Credential ${c.kind} of ${c.integrationName} ${state === "expired" ? "has expired" : state === "expiring" ? `expires in ${daysLeft} days` : "is disconnected"}`,
          detail: {
            site_name: facts.siteName,
            integration_id: c.integrationId,
            integration_name: c.integrationName,
            credential_kind: c.kind,
            state,
            days_left: daysLeft,
            expires_at: c.expiresAt ? c.expiresAt.slice(0, 10) : null,
            threshold_days: t.daysBefore!,
          },
        });
      }
      break;
    }
    case "queue_lag": {
      for (const d of facts.destinations) {
        if (d.status === "draft" || d.status === "paused" || !d.queueOldestAvailableAt) continue;
        const lag = Math.floor(
          (now.getTime() - new Date(d.queueOldestAvailableAt).getTime()) / 1000,
        );
        if (lag < t.lagSeconds!) continue;
        findings.push({
          subjectKey: `integration:${d.integrationId}:queue`,
          severity: lag >= t.lagSeconds! * 4 ? "critical" : "warning",
          title: `Delivery queue of ${d.name} is ${Math.round(lag / 60)} minutes behind (${d.queueReady ?? 0} ready)`,
          detail: {
            site_name: facts.siteName,
            integration_id: d.integrationId,
            integration_name: d.name,
            lag_seconds: lag,
            threshold_seconds: t.lagSeconds!,
            queue_ready: d.queueReady ?? 0,
          },
        });
      }
      break;
    }
  }
  return findings;
}

/** Windows (minutes) a set of rules needs, per fact family. */
export function windowsFor(rules: ReadonlyArray<RuleInput>): {
  events: number[];
  conversions: number[];
  consent: number[];
} {
  const events = new Set<number>();
  const conversions = new Set<number>();
  const consent = new Set<number>();
  for (const rule of rules) {
    const t = normalizeThreshold(rule.kind, rule.threshold);
    if (rule.kind === "event_drop") events.add(t.windowMinutes!);
    if (rule.kind === "conversion_anomaly") conversions.add(t.windowMinutes!);
    if (rule.kind === "consent_errors") consent.add(t.windowMinutes!);
  }
  return { events: [...events], conversions: [...conversions], consent: [...consent] };
}

// ---------------------------------------------------------------------------------------------------
// Facts from the database (worker role)
// ---------------------------------------------------------------------------------------------------

type SiteRow = { id: string; name: string; organization_id: string };

async function volumeFacts(
  tx: Tx,
  siteId: string,
  windowMinutes: number,
  eventNames: readonly string[] | null,
  now: Date,
): Promise<VolumeFacts> {
  const nameFilter = eventNames
    ? sql`AND ea.event_name IN (${sql.join(
        eventNames.map((name) => sql`${name}`),
        sql`, `,
      )})`
    : sql``;
  // the window ends at the last complete hour so the current bucket is never a partial hour compared with full ones a week earlier
  const rows = await tx.execute<{ k: number; accepted: number }>(sql`
    WITH bounds AS (SELECT date_trunc('hour', ${now.toISOString()}::timestamptz) AS win_end)
    SELECT k::int AS k, coalesce(sum(ea.accepted), 0)::int AS accepted
    FROM generate_series(0, ${BASELINE_WEEKS}::int) AS k
    CROSS JOIN bounds
    LEFT JOIN event_aggregates ea
      ON ea.site_id = ${siteId}::uuid
     AND ea.bucket_start >= bounds.win_end - (k * interval '7 days') - make_interval(mins => ${windowMinutes}::int)
     AND ea.bucket_start <  bounds.win_end - (k * interval '7 days')
     AND ea.environment_id IN (SELECT id FROM environments WHERE site_id = ${siteId}::uuid AND test_mode = false)
     ${nameFilter}
    GROUP BY k ORDER BY k`);
  const byWeek = new Map<number, number>();
  for (const r of rows.rows) byWeek.set(Number(r.k), Number(r.accepted));
  return {
    current: byWeek.get(0) ?? 0,
    baseline: Array.from({ length: BASELINE_WEEKS }, (_, i) => byWeek.get(i + 1) ?? 0),
  };
}

async function consentFacts(
  tx: Tx,
  siteId: string,
  windowMinutes: number,
  now: Date,
): Promise<ConsentFacts> {
  const dropped = sql.join(
    // the codes are compile-time constants of this module (never user input), inlined so `->>` binds to the text overload
    CONSENT_DROP_CODES.map((code) => sql`coalesce((ea.dropped->>${sql.raw(`'${code}'`)})::int, 0)`),
    sql` + `,
  );
  const rows = await tx.execute<{ received: number; consent_dropped: number }>(sql`
    WITH bounds AS (SELECT date_trunc('hour', ${now.toISOString()}::timestamptz) AS win_end)
    SELECT coalesce(sum(ea.received), 0)::int AS received, coalesce(sum(${dropped}), 0)::int AS consent_dropped
    FROM event_aggregates ea, bounds
    WHERE ea.site_id = ${siteId}::uuid
      AND ea.bucket_start >= bounds.win_end - make_interval(mins => ${windowMinutes}::int)
      AND ea.bucket_start <  bounds.win_end
      AND ea.environment_id IN (SELECT id FROM environments WHERE site_id = ${siteId}::uuid AND test_mode = false)`);
  const r = rows.rows[0];
  return { received: Number(r?.received ?? 0), consentDropped: Number(r?.consent_dropped ?? 0) };
}

async function destinationFacts(tx: Tx, siteId: string): Promise<DestinationFacts[]> {
  const rows = await tx.execute<{
    id: string;
    name: string;
    connector_type: string;
    status: string;
    attempts_total: number | null;
    error_rate: number | null;
    last_error_class: string | null;
    queue_oldest_available_at: Date | string | null;
    queue_ready: number | null;
  }>(sql`
    SELECT i.id, i.name, i.connector_type::text AS connector_type, i.status::text AS status, s.attempts_total, s.error_rate, s.last_error_class, s.queue_oldest_available_at, s.queue_ready
    FROM integrations i LEFT JOIN destination_health_snapshots s ON s.integration_id = i.id
    WHERE i.site_id = ${siteId}::uuid AND i.status <> 'draft'`);
  return rows.rows.map((r) => ({
    integrationId: r.id,
    name: r.name,
    connectorType: r.connector_type,
    status: r.status,
    attemptsTotal: Number(r.attempts_total ?? 0),
    errorRate: r.error_rate == null ? null : Number(r.error_rate),
    lastErrorClass: r.last_error_class,
    queueOldestAvailableAt: r.queue_oldest_available_at
      ? new Date(r.queue_oldest_available_at).toISOString()
      : null,
    queueReady: r.queue_ready == null ? null : Number(r.queue_ready),
  }));
}

async function credentialFacts(tx: Tx, siteId: string): Promise<CredentialFacts[]> {
  const rows = await tx.execute<{
    integration_id: string;
    integration_name: string;
    kind: string;
    expires_at: Date | string | null;
    status: string;
    source: "credential" | "oauth";
  }>(sql`
    SELECT c.integration_id, i.name AS integration_name, c.kind::text AS kind, c.expires_at, c.status::text AS status, 'credential' AS source
    FROM credentials c JOIN integrations i ON i.id = c.integration_id
    WHERE i.site_id = ${siteId}::uuid AND i.status <> 'draft' AND c.status = 'active' AND c.expires_at IS NOT NULL
    UNION ALL
    SELECT o.integration_id, i.name, 'oauth', NULL, o.status, 'oauth'
    FROM oauth_connections o JOIN integrations i ON i.id = o.integration_id
    WHERE i.site_id = ${siteId}::uuid AND i.status <> 'draft'`);
  return rows.rows.map((r) => ({
    integrationId: r.integration_id,
    integrationName: r.integration_name,
    kind: r.kind,
    expiresAt: r.expires_at ? new Date(r.expires_at).toISOString() : null,
    status: r.status,
    source: r.source,
  }));
}

async function loadSiteFacts(
  tx: Tx,
  site: SiteRow,
  windows: ReturnType<typeof windowsFor>,
  needs: { destinations: boolean; credentials: boolean },
  now: Date,
): Promise<SiteFacts> {
  const facts: SiteFacts = {
    siteId: site.id,
    siteName: site.name,
    events: {},
    conversions: {},
    consent: {},
    destinations: [],
    credentials: [],
  };
  for (const w of windows.events) facts.events[w] = await volumeFacts(tx, site.id, w, null, now);
  for (const w of windows.conversions)
    facts.conversions[w] = await volumeFacts(tx, site.id, w, CONVERSION_EVENTS, now);
  for (const w of windows.consent) facts.consent[w] = await consentFacts(tx, site.id, w, now);
  if (needs.destinations) facts.destinations = await destinationFacts(tx, site.id);
  if (needs.credentials) facts.credentials = await credentialFacts(tx, site.id);
  return facts;
}

// ---------------------------------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------------------------------

async function decryptChannel(
  ctx: WorkerContext,
  channel: AlertChannelRow,
): Promise<{ url: string | null; secret: string | null; error: string | null }> {
  if (!channel.targetCiphertext) return { url: null, secret: null, error: "target_missing" };
  if (!ctx.vault) return { url: null, secret: null, error: "vault_missing" };
  try {
    const aad = `alert_channel:${channel.id}`;
    const url = await ctx.vault.decrypt(channel.targetCiphertext, aad);
    const secret = channel.secretCiphertext
      ? await ctx.vault.decrypt(channel.secretCiphertext, aad)
      : null;
    return { url, secret, error: null };
  } catch {
    return { url: null, secret: null, error: "decrypt_failed" };
  }
}

async function postJson(
  fetchImpl: typeof fetch,
  url: string,
  body: string,
  headers: Record<string, string>,
): Promise<{ ok: boolean; status: number | null; error: string | null }> {
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": ALERT_USER_AGENT, ...headers },
      body,
      signal: AbortSignal.timeout(ALERT_FETCH_TIMEOUT_MS),
      redirect: "manual",
    });
    return { ok: res.ok, status: res.status, error: res.ok ? null : `responded ${res.status}` };
  } catch (e) {
    const message =
      e instanceof Error ? (e.name === "TimeoutError" ? "timeout" : e.message) : "request failed";
    return { ok: false, status: null, error: message.slice(0, 200) };
  }
}

/** Sends one alert through one channel; never throws, always returns a delivery record. */
export async function notifyChannel(
  ctx: WorkerContext,
  channel: AlertChannelRow,
  event: Pick<AlertEventRow, "id" | "kind" | "severity" | "detail" | "triggeredAt" | "siteId">,
  siteName: string | null,
  now: Date,
): Promise<AlertDelivery[string]> {
  if (!channel.enabled)
    return deliveryRecord(channel.kind, "skipped", { transport: "channel_disabled" }, now);
  const url = `${ctx.env.HOST_APP}/settings/alerts?event=${event.id}`;
  const text = renderAlertText(channel.locale, {
    type: "alert.triggered",
    kind: event.kind,
    severity: event.severity,
    detail: event.detail,
    siteName,
    triggeredAt: event.triggeredAt,
    url,
  });
  if (channel.kind === "email") {
    if (!channel.target) return deliveryRecord("email", "failed", { error: "target_missing" }, now);
    const res = await sendAlertMail(
      { to: channel.target, subject: text.subject, text: text.body },
      process.env,
      ctx.fetch,
    );
    return deliveryRecord(
      "email",
      res.ok ? "sent" : "failed",
      { transport: res.transport, error: res.error ?? null, httpStatus: res.httpStatus ?? null },
      now,
    );
  }
  const secretInfo = await decryptChannel(ctx, channel);
  if (!secretInfo.url)
    return deliveryRecord(channel.kind, "failed", { error: secretInfo.error }, now);
  const notification: AlertNotification = {
    id: event.id,
    type: "alert.triggered",
    kind: event.kind,
    severity: event.severity,
    title: text.title,
    summary: text.summary,
    organizationId: channel.organizationId,
    siteId: event.siteId,
    siteName,
    triggeredAt: event.triggeredAt.toISOString(),
    detail: event.detail,
    url,
  };
  if (channel.kind === "slack") {
    const res = await postJson(
      ctx.fetch,
      secretInfo.url,
      JSON.stringify(
        alertSlackPayload(notification, {
          severity: text.labels.severity,
          site: text.labels.site,
          open: text.labels.open,
        }),
      ),
      {},
    );
    return deliveryRecord(
      "slack",
      res.ok ? "sent" : "failed",
      { transport: "slack", error: res.error, httpStatus: res.status },
      now,
    );
  }
  const body = alertWebhookBody(notification);
  const headers: Record<string, string> = { [ALERT_EVENT_HEADER]: notification.type };
  if (secretInfo.secret)
    headers[ALERT_SIGNATURE_HEADER] = await alertSignatureHeader(body, secretInfo.secret, now);
  const res = await postJson(ctx.fetch, secretInfo.url, body, headers);
  return deliveryRecord(
    "webhook",
    res.ok ? "sent" : "failed",
    {
      transport: secretInfo.secret ? "webhook_signed" : "webhook",
      error: res.error,
      httpStatus: res.status,
    },
    now,
  );
}

// ---------------------------------------------------------------------------------------------------
// The job
// ---------------------------------------------------------------------------------------------------

export interface AlertsRunSummary {
  rules: number;
  triggered: number;
  resolved: number;
  notified: number;
}

/** Evaluates every enabled rule, writes new events, resolves cleared ones and delivers notifications. */
export async function runAlerts(
  ctx: WorkerContext,
  now: Date = ctx.now(),
): Promise<AlertsRunSummary> {
  const db: Db = createDb(ctx.pool);
  const summary: AlertsRunSummary = { rules: 0, triggered: 0, resolved: 0, notified: 0 };

  const rules = await withWorker(db, (tx) =>
    tx.select().from(alertRules).where(eq(alertRules.enabled, true)),
  );
  if (!rules.length) return summary;
  summary.rules = rules.length;

  const orgIds = [...new Set(rules.map((r) => r.organizationId))];
  const sites = await withWorker(db, (tx) =>
    tx.execute<SiteRow>(
      sql`SELECT id, name, organization_id FROM sites WHERE status = 'active' AND deleted_at IS NULL AND organization_id IN (${sql.join(
        orgIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`,
    ),
  );
  const sitesByOrg = new Map<string, SiteRow[]>();
  for (const s of sites.rows)
    sitesByOrg.set(s.organization_id, [...(sitesByOrg.get(s.organization_id) ?? []), s]);
  const channels = await withWorker(db, (tx) =>
    tx.select().from(alertChannels).where(inArray(alertChannels.organizationId, orgIds)),
  );
  const channelById = new Map(channels.map((c) => [c.id, c]));

  for (const orgId of orgIds) {
    const orgRules = rules.filter((r) => r.organizationId === orgId);
    const orgSites = sitesByOrg.get(orgId) ?? [];
    const windows = windowsFor(orgRules);
    const needs = {
      destinations: orgRules.some((r) => r.kind === "vendor_outage" || r.kind === "queue_lag"),
      credentials: orgRules.some((r) => r.kind === "credential_expiry"),
    };
    const factsBySite = new Map<string, SiteFacts>();
    try {
      await withWorker(db, async (tx) => {
        for (const site of orgSites) {
          if (!orgRules.some((r) => r.siteId === null || r.siteId === site.id)) continue;
          factsBySite.set(site.id, await loadSiteFacts(tx, site, windows, needs, now));
        }
      });
    } catch (e) {
      ctx.logger.error(
        { organizationId: orgId, err: e instanceof Error ? e.message : String(e) },
        "alert facts could not be loaded",
      );
      continue;
    }

    for (const rule of orgRules) {
      const targets = orgSites.filter((s) => rule.siteId === null || rule.siteId === s.id);
      const findings: Array<Finding & { siteId: string; siteName: string }> = [];
      for (const site of targets) {
        const facts = factsBySite.get(site.id);
        if (!facts) continue;
        for (const f of evaluateRule(rule, facts, now))
          findings.push({ ...f, siteId: site.id, siteName: site.name });
      }
      const seen = new Set(findings.map((f) => f.subjectKey));
      const created: Array<{ event: AlertEventRow; siteName: string }> = [];
      try {
        await withWorker(db, async (tx) => {
          for (const open of await openAlertEvents(tx, rule.id)) {
            if (seen.has(open.subjectKey)) continue;
            await resolveAlertEvent(tx, open.id, null, now);
            summary.resolved += 1;
          }
          for (const f of findings) {
            const latest = await latestAlertEvent(tx, rule.id, f.subjectKey);
            if (!shouldTriggerAlert(latest, rule.cooldownMinutes, now)) continue;
            const event = await insertAlertEvent(tx, {
              organizationId: orgId,
              ruleId: rule.id,
              siteId: f.siteId,
              kind: rule.kind,
              subjectKey: f.subjectKey,
              severity: f.severity,
              title: f.title,
              detail: f.detail,
              triggeredAt: now,
            });
            created.push({ event, siteName: f.siteName });
            summary.triggered += 1;
          }
          await tx
            .update(alertRules)
            .set({ lastEvaluatedAt: now })
            .where(eq(alertRules.id, rule.id));
        });
      } catch (e) {
        ctx.logger.error(
          { ruleId: rule.id, err: e instanceof Error ? e.message : String(e) },
          "alert rule evaluation failed",
        );
        continue;
      }
      for (const { event, siteName } of created) {
        const delivery: AlertDelivery = {};
        for (const channelId of rule.channelIds) {
          const channel = channelById.get(channelId);
          delivery[channelId] =
            channel && channel.organizationId === orgId
              ? await notifyChannel(ctx, channel, event, siteName, now)
              : deliveryRecord("email", "skipped", { transport: "channel_missing" }, now);
        }
        const sent = Object.values(delivery).some((d) => d.status === "sent");
        if (sent) summary.notified += 1;
        await withWorker(db, (tx) =>
          recordAlertDelivery(tx, event.id, delivery, sent ? now : null),
        );
      }
    }
  }
  ctx.logger.debug(summary, "alerts evaluated");
  return summary;
}

/** Exposed for tests and the CLI: the rule rows the job would evaluate. */
export type { AlertRuleRow };
