import "server-only";
import { and, desc, eq, gte, isNull, or, sql, like } from "drizzle-orm";
import { getConnector } from "@track-site/connectors";
import { redactPii } from "@track-site/core";
import type { ConnectorType } from "@track-site/policy";
import {
  alertEvents,
  auditLog,
  deadLetterReferences,
  deliveryAttempts,
  destinationHealthSnapshots,
  integrations,
  organization,
  queueDeadLetters,
  queueMessages,
  stripeEvents,
  workerHeartbeats,
  type Tx,
} from "@track-site/db";
import { env } from "@/env";
import {
  aiStatus,
  billingStatus,
  databaseProbe,
  mailStatus,
  type AiStatus,
  type BillingStatus,
  type MailStatus,
} from "@/server/health-status";
import { withPlatform, type PlatformContext } from "@/server/ops/platform";

/**
 * Platform health (Track Operations → /ops/health, docs/17). Every number on the page is a measurement
 * across all tenants — counts, rates, timestamps, job and queue names, connector types, organisation
 * names on Stripe and alert rows — never an event payload, an end-user identifier or a secret. Sources:
 * the collector's own `/health` (fetched server-side with a short timeout), `worker_heartbeats`, the
 * durable queue tables (readable only as `tracksite_ops`), `delivery_attempts`,
 * `destination_health_snapshots`, `stripe_events`, the vendor checks shared with `/api/health`
 * (`server/health-status.ts`), PostgreSQL statistics views and the alert / audit history. Every source
 * reports its own state: an unreachable collector, a worker without heartbeats or a queue driver whose
 * backlog lives outside the database are shown as such, not as zero.
 */

export const COLLECTOR_TIMEOUT_MS = 4_000;
/** Same rule as the Destination Health Center: a snapshot older than this is stale (the job runs every minute). */
export const SNAPSHOT_STALE_AFTER_MS = 5 * 60_000;
/** Error-rate warning per connector: at least this share of at least MIN_ATTEMPTS attempts failed. */
export const ERROR_RATE_WARN = 0.2;
export const ERROR_RATE_MIN_ATTEMPTS = 5;
export const STRIPE_LEDGER_LIMIT = 50;
export const RECENT_ERRORS_LIMIT = 20;
export const DATABASE_TABLE_LIMIT = 15;
/** Client island: the page re-renders itself this often while visible. */
export const REFRESH_INTERVAL_MS = 60_000;

/**
 * Mirror of `JOB_SCHEDULE` in apps/worker/src/jobs/index.ts (apps never import each other): the interval
 * decides when a heartbeat is stale (docs/17 §6: older than twice the interval). A job the worker reports
 * but this list does not know is shown with an unknown interval — never hidden.
 */
export const WORKER_JOB_INTERVALS_MS: Readonly<Record<string, number>> = {
  outbox: 5_000,
  usage: 60_000,
  partitions: 6 * 60 * 60_000,
  retention: 24 * 60 * 60_000,
  "destination-health": 60_000,
  "data-quality": 60 * 60_000,
  "scheduled-publish": 30_000,
  alerts: 60_000,
  "support-sla": 60_000,
};

export type CollectorState = "ok" | "degraded" | "kill_switch" | "unreachable" | "timeout" | "invalid";

export interface CollectorStatus {
  /** host of HOST_INGEST (no path, no query) */
  host: string;
  state: CollectorState;
  httpStatus: number | null;
  latencyMs: number | null;
  db: "ok" | "error" | "none" | null;
  queue: { driver: string | null; ready: number | null; dlq: number | null } | null;
  killSwitch: boolean | null;
  /** the collector's own clock in its answer */
  reportedAt: string | null;
  checkedAt: string;
}

export type JobState = "ok" | "failing" | "stale" | "never";

export interface WorkerJobRow {
  job: string;
  /** null for a job the schedule mirror does not know */
  intervalMs: number | null;
  state: JobState;
  lastRunAt: string | null;
  lastOkAt: string | null;
  lastDurationMs: number | null;
  /** worker's error message, PII-redacted and truncated */
  lastError: string | null;
  host: string | null;
}

export interface WorkerView {
  jobs: WorkerJobRow[];
  /** worst state across the jobs; `never` when the table is empty */
  state: JobState;
  latestRunAt: string | null;
}

export interface QueueRow {
  queue: string;
  ready: number;
  scheduled: number;
  inFlight: number;
  oldestReadyAt: string | null;
  /** age of the oldest ready message; null when nothing is ready */
  lagMs: number | null;
  /** unreplayed dead letters */
  dead: number;
  oldestDeadAt: string | null;
}

export interface QueuesView {
  driver: string;
  /** false when the configured driver keeps its backlog outside the database (the tables are not the source of truth) */
  measured: boolean;
  rows: QueueRow[];
  totals: { ready: number; scheduled: number; inFlight: number; dead: number; maxLagMs: number | null };
  /** unreplayed `dead_letter_references` (durable, tenant-readable) across all tenants */
  deadLetterReferences: number;
}

export interface DeliveryWindow {
  total: number;
  success: number;
  failed: number;
  retry: number;
  skipped: number;
  /** (failed + retry) / (success + failed + retry); null without attempts */
  errorRate: number | null;
}

export interface DeliveryConnectorRow {
  connectorType: string;
  displayName: string;
  /** distinct organisations with attempts in the 7-day window */
  organizations: number;
  last24h: DeliveryWindow;
  last7d: DeliveryWindow;
  /** 24 h error rate at or above the warning threshold with enough attempts */
  warn: boolean;
}

export interface DeliveriesView {
  rows: DeliveryConnectorRow[];
  totals: { last24h: DeliveryWindow; last7d: DeliveryWindow };
}

export interface DestinationsView {
  snapshots: number;
  fresh: number;
  stale: number;
  latestComputedAt: string | null;
  oldestComputedAt: string | null;
  organizations: number;
  attempts: { total: number; success: number; failed: number; retry: number; rateLimited: number; authFailed: number; errorRate: number | null };
  highErrorRate: number;
  withDeadLetters: number;
  queueReady: number;
  oldestQueuedAt: string | null;
  /** integrations by status (metadata) */
  byStatus: Record<string, number>;
  integrations: number;
}

export type StripeEventState = "processed" | "failed" | "pending";

export interface StripeEventRow {
  id: string;
  type: string;
  receivedAt: string;
  processedAt: string | null;
  state: StripeEventState;
  /** redacted, truncated */
  error: string | null;
  organization: { id: string; name: string } | null;
}

export interface StripeView {
  configured: boolean;
  webhookSecretConfigured: boolean;
  rows: StripeEventRow[];
  summary: { received24h: number; processed24h: number; failed24h: number; pendingTotal: number; lastReceivedAt: string | null };
}

export interface VendorsView {
  ai: AiStatus;
  mail: MailStatus;
  billing: BillingStatus;
  migrations: number | null;
  dbProbe: boolean;
}

export interface DatabaseTableRow {
  name: string;
  /** planner estimates from pg_stat_user_tables */
  liveRows: number;
  deadRows: number;
  totalBytes: number;
  lastAutovacuumAt: string | null;
}

export interface DatabaseView {
  state: "ok" | "unavailable";
  sizeBytes: number | null;
  version: string | null;
  connections: number | null;
  tableCount: number | null;
  tables: DatabaseTableRow[];
}

export interface RecentAlertRow {
  id: string;
  kind: string;
  severity: string;
  triggeredAt: string;
  resolvedAt: string | null;
  organization: { id: string; name: string } | null;
}

export interface RecentAuditRow {
  id: string;
  action: string;
  targetType: string;
  createdAt: string;
  organization: { id: string; name: string } | null;
}

export interface RecentErrorsView {
  alerts: RecentAlertRow[];
  openAlerts: { critical: number; warning: number; info: number };
  audit: RecentAuditRow[];
}

export type OverallState = "ok" | "warn" | "bad";

export interface PlatformHealthView {
  generatedAt: string;
  overall: { state: OverallState; reasons: string[] };
  collector: CollectorStatus;
  worker: WorkerView;
  queues: QueuesView;
  deliveries: DeliveriesView;
  destinations: DestinationsView;
  stripe: StripeView;
  vendors: VendorsView;
  database: DatabaseView;
  recent: RecentErrorsView;
}

const toIso = (value: Date | string | null | undefined): string | null =>
  value == null ? null : value instanceof Date ? value.toISOString() : new Date(value).toISOString();
const toMs = (value: Date | string | null | undefined): number | null => {
  if (value == null) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
};
const num = (value: unknown): number => {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Vendor / worker texts may echo tenant data: redact and truncate before they reach the console. */
export function redactError(value: string | null | undefined, max = 300): string | null {
  if (!value) return null;
  const text = redactPii(value).text.trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Interprets the collector's `/health` answer; `null` json means the body was not JSON. */
export function parseCollectorHealth(
  httpStatus: number,
  json: unknown,
  checkedAt: Date,
  latencyMs: number | null,
  host: string,
): CollectorStatus {
  const base = { host, httpStatus, latencyMs, checkedAt: checkedAt.toISOString() };
  if (!json || typeof json !== "object") return { ...base, state: "invalid", db: null, queue: null, killSwitch: null, reportedAt: null };
  const j = json as Record<string, unknown>;
  const db = j.db === "ok" || j.db === "error" || j.db === "none" ? j.db : null;
  const q = j.queue && typeof j.queue === "object" ? (j.queue as Record<string, unknown>) : null;
  const queue = q
    ? {
        driver: typeof q.driver === "string" ? q.driver : null,
        ready: typeof q.ready === "number" ? q.ready : null,
        dlq: typeof q.dlq === "number" ? q.dlq : null,
      }
    : null;
  const killSwitch = typeof j.killSwitch === "boolean" ? j.killSwitch : null;
  const reportedAt = typeof j.ts === "string" ? j.ts : null;
  const state: CollectorState = killSwitch ? "kill_switch" : j.ok === true && httpStatus < 400 ? "ok" : "degraded";
  return { ...base, state, db, queue, killSwitch, reportedAt };
}

/** Fetches the collector's own health endpoint with a hard timeout; never throws. */
export async function checkCollector(ingestUrl: string, now: Date, fetchImpl: typeof fetch = fetch): Promise<CollectorStatus> {
  const host = hostOf(ingestUrl);
  const started = Date.now();
  const failed = (state: "unreachable" | "timeout"): CollectorStatus => ({
    host,
    state,
    httpStatus: null,
    latencyMs: null,
    db: null,
    queue: null,
    killSwitch: null,
    reportedAt: null,
    checkedAt: now.toISOString(),
  });
  try {
    const res = await fetchImpl(`${ingestUrl.replace(/\/+$/, "")}/health`, {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(COLLECTOR_TIMEOUT_MS),
    });
    const latencyMs = Date.now() - started;
    const json: unknown = await res.json().catch(() => null);
    return parseCollectorHealth(res.status, json, now, latencyMs, host);
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    return failed(name === "TimeoutError" || name === "AbortError" ? "timeout" : "unreachable");
  }
}

/** docs/17 §6: stale when the last run is older than twice the interval, failing when the last run did not succeed. */
export function jobState(
  row: { lastRunAt: Date | string | null; lastOkAt: Date | string | null } | null,
  intervalMs: number | null,
  now: Date,
): JobState {
  if (!row) return "never";
  const lastRun = toMs(row.lastRunAt);
  if (lastRun === null) return "never";
  if (intervalMs !== null && now.getTime() - lastRun > 2 * intervalMs) return "stale";
  const lastOk = toMs(row.lastOkAt);
  if (lastOk === null || lastRun > lastOk) return "failing";
  return "ok";
}

const JOB_RANK: Record<JobState, number> = { stale: 0, failing: 1, never: 2, ok: 3 };

/** The worst state wins: a stale job means the worker is not running, a failing one that a job errors. */
export function worstJobState(states: readonly JobState[]): JobState {
  if (states.length === 0) return "never";
  return states.reduce<JobState>((acc, s) => (JOB_RANK[s] < JOB_RANK[acc] ? s : acc), "ok");
}

/** (failed + retry) / (success + failed + retry); null when nothing was attempted. */
export function errorRateOf(counts: { success: number; failed: number; retry: number }): number | null {
  const denominator = counts.success + counts.failed + counts.retry;
  if (denominator <= 0) return null;
  return (counts.failed + counts.retry) / denominator;
}

export function deliveryWindow(counts: { total: number; success: number; failed: number; retry: number; skipped: number }): DeliveryWindow {
  return { ...counts, errorRate: errorRateOf(counts) };
}

export function deliveryWarn(window: DeliveryWindow): boolean {
  const attempted = window.success + window.failed + window.retry;
  return window.errorRate !== null && window.errorRate >= ERROR_RATE_WARN && attempted >= ERROR_RATE_MIN_ATTEMPTS;
}

export function stripeEventState(row: { processedAt: Date | string | null; error: string | null }): StripeEventState {
  if (row.error) return "failed";
  return row.processedAt ? "processed" : "pending";
}

/** Headline of the page: `bad` when ingestion or the worker is down, `warn` for anything that needs a look. */
export function overallState(view: Omit<PlatformHealthView, "overall" | "generatedAt">): { state: OverallState; reasons: string[] } {
  const bad: string[] = [];
  const warn: string[] = [];
  if (view.collector.state === "kill_switch") bad.push("collector_kill_switch");
  else if (view.collector.state !== "ok") bad.push("collector");
  if (view.worker.state === "stale") bad.push("worker_stale");
  else if (view.worker.state === "failing") warn.push("worker_failing");
  else if (view.worker.state === "never") warn.push("worker_never");
  if (view.database.state !== "ok" || !view.vendors.dbProbe) bad.push("database");
  if (view.queues.measured && view.queues.totals.dead > 0) warn.push("dead_letters");
  if (view.queues.measured && view.queues.totals.maxLagMs !== null && view.queues.totals.maxLagMs >= 15 * 60_000) warn.push("queue_lag");
  if (view.deliveries.rows.some((r) => r.warn)) warn.push("delivery_errors");
  if (view.stripe.configured && view.stripe.summary.failed24h > 0) warn.push("stripe_failures");
  if (view.stripe.configured && !view.stripe.webhookSecretConfigured) warn.push("stripe_webhook_secret");
  if (view.vendors.ai.ai !== "ok" && view.vendors.ai.ai !== "not_configured") warn.push("ai");
  if (view.vendors.billing.billing !== "ok" && view.vendors.billing.billing !== "not_configured") warn.push("billing_prices");
  if (view.vendors.mail.mail === "resend" && view.vendors.mail.mailDomain && view.vendors.mail.mailDomain.status !== "verified" && view.vendors.mail.mailDomain.status !== "sending_only_key")
    warn.push("mail_domain");
  if (view.destinations.stale > 0 && view.destinations.fresh === 0 && view.destinations.snapshots > 0) warn.push("snapshots_stale");
  if (view.recent.openAlerts.critical > 0) warn.push("critical_alerts");
  if (bad.length) return { state: "bad", reasons: [...bad, ...warn] };
  if (warn.length) return { state: "warn", reasons: warn };
  return { state: "ok", reasons: [] };
}

async function loadWorker(tx: Tx, now: Date): Promise<WorkerView> {
  const rows = await tx.select().from(workerHeartbeats).orderBy(workerHeartbeats.job);
  const byJob = new Map(rows.map((r) => [r.job, r]));
  const names = Array.from(new Set([...Object.keys(WORKER_JOB_INTERVALS_MS), ...rows.map((r) => r.job)])).sort();
  const jobs: WorkerJobRow[] = names.map((job) => {
    const row = byJob.get(job) ?? null;
    const intervalMs = WORKER_JOB_INTERVALS_MS[job] ?? null;
    return {
      job,
      intervalMs,
      state: jobState(row, intervalMs, now),
      lastRunAt: toIso(row?.lastRunAt),
      lastOkAt: toIso(row?.lastOkAt),
      lastDurationMs: row?.lastDurationMs ?? null,
      lastError: redactError(row?.lastError),
      host: row?.host ?? null,
    };
  });
  const latest = rows.map((r) => toMs(r.lastRunAt)).filter((v): v is number => v !== null).sort((a, b) => b - a)[0];
  return { jobs, state: worstJobState(jobs.filter((j) => j.intervalMs !== null).map((j) => j.state)), latestRunAt: latest === undefined ? null : new Date(latest).toISOString() };
}

async function loadQueues(tx: Tx, now: Date, driver: string): Promise<QueuesView> {
  const at = sql`${now.toISOString()}::timestamptz`;
  const readyCond = sql`${queueMessages.availableAt} <= ${at} and (${queueMessages.lockedUntil} is null or ${queueMessages.lockedUntil} < ${at})`;
  const messages = await tx
    .select({
      queue: queueMessages.queue,
      ready: sql<number>`count(*) filter (where ${readyCond})::int`,
      scheduled: sql<number>`count(*) filter (where ${queueMessages.availableAt} > ${at})::int`,
      inFlight: sql<number>`count(*) filter (where ${queueMessages.lockedUntil} >= ${at})::int`,
      oldestReadyAt: sql<Date | string | null>`min(${queueMessages.availableAt}) filter (where ${readyCond})`,
    })
    .from(queueMessages)
    .groupBy(queueMessages.queue);
  const dead = await tx
    .select({ queue: queueDeadLetters.queue, n: sql<number>`count(*)::int`, oldest: sql<Date | string | null>`min(${queueDeadLetters.deadAt})` })
    .from(queueDeadLetters)
    .where(isNull(queueDeadLetters.replayedAt))
    .groupBy(queueDeadLetters.queue);
  const refs = await tx.select({ n: sql<number>`count(*)::int` }).from(deadLetterReferences).where(isNull(deadLetterReferences.replayedAt));
  const deadBy = new Map(dead.map((d) => [d.queue, d]));
  const names = Array.from(new Set([...messages.map((m) => m.queue), ...dead.map((d) => d.queue)])).sort();
  const rows: QueueRow[] = names.map((queue) => {
    const m = messages.find((x) => x.queue === queue);
    const d = deadBy.get(queue);
    const oldestReady = toMs(m?.oldestReadyAt);
    return {
      queue,
      ready: num(m?.ready),
      scheduled: num(m?.scheduled),
      inFlight: num(m?.inFlight),
      oldestReadyAt: toIso(m?.oldestReadyAt),
      lagMs: oldestReady === null ? null : Math.max(0, now.getTime() - oldestReady),
      dead: num(d?.n),
      oldestDeadAt: toIso(d?.oldest),
    };
  });
  const lags = rows.map((r) => r.lagMs).filter((v): v is number => v !== null);
  return {
    driver,
    measured: driver === "pg",
    rows,
    totals: {
      ready: rows.reduce((a, r) => a + r.ready, 0),
      scheduled: rows.reduce((a, r) => a + r.scheduled, 0),
      inFlight: rows.reduce((a, r) => a + r.inFlight, 0),
      dead: rows.reduce((a, r) => a + r.dead, 0),
      maxLagMs: lags.length ? Math.max(...lags) : null,
    },
    deadLetterReferences: num(refs[0]?.n),
  };
}

async function loadDeliveries(tx: Tx, now: Date): Promise<DeliveriesView> {
  const since24h = sql`${new Date(now.getTime() - 24 * 3_600_000).toISOString()}::timestamptz`;
  const since7d = new Date(now.getTime() - 7 * 86_400_000);
  const recent = sql`${deliveryAttempts.startedAt} >= ${since24h}`;
  const st = deliveryAttempts.status;
  const rows = await tx
    .select({
      connectorType: deliveryAttempts.connectorType,
      organizations: sql<number>`count(distinct ${deliveryAttempts.organizationId})::int`,
      total24h: sql<number>`count(*) filter (where ${recent})::int`,
      success24h: sql<number>`count(*) filter (where ${recent} and ${st} = 'success')::int`,
      failed24h: sql<number>`count(*) filter (where ${recent} and ${st} in ('failed', 'dead'))::int`,
      retry24h: sql<number>`count(*) filter (where ${recent} and ${st} = 'retry')::int`,
      skipped24h: sql<number>`count(*) filter (where ${recent} and ${st} = 'skipped')::int`,
      total7d: sql<number>`count(*)::int`,
      success7d: sql<number>`count(*) filter (where ${st} = 'success')::int`,
      failed7d: sql<number>`count(*) filter (where ${st} in ('failed', 'dead'))::int`,
      retry7d: sql<number>`count(*) filter (where ${st} = 'retry')::int`,
      skipped7d: sql<number>`count(*) filter (where ${st} = 'skipped')::int`,
    })
    .from(deliveryAttempts)
    .where(gte(deliveryAttempts.startedAt, since7d))
    .groupBy(deliveryAttempts.connectorType);
  const out: DeliveryConnectorRow[] = rows.map((r) => {
    const last24h = deliveryWindow({ total: num(r.total24h), success: num(r.success24h), failed: num(r.failed24h), retry: num(r.retry24h), skipped: num(r.skipped24h) });
    const last7d = deliveryWindow({ total: num(r.total7d), success: num(r.success7d), failed: num(r.failed7d), retry: num(r.retry7d), skipped: num(r.skipped7d) });
    return { connectorType: r.connectorType, displayName: getConnector(r.connectorType as ConnectorType)?.meta.displayName ?? r.connectorType, organizations: num(r.organizations), last24h, last7d, warn: deliveryWarn(last24h) };
  });
  out.sort((a, b) => Number(b.warn) - Number(a.warn) || b.last24h.total - a.last24h.total || a.displayName.localeCompare(b.displayName));
  const sum = (pick: (r: DeliveryConnectorRow) => DeliveryWindow) =>
    deliveryWindow(out.reduce((acc, r) => ({ total: acc.total + pick(r).total, success: acc.success + pick(r).success, failed: acc.failed + pick(r).failed, retry: acc.retry + pick(r).retry, skipped: acc.skipped + pick(r).skipped }), { total: 0, success: 0, failed: 0, retry: 0, skipped: 0 }));
  return { rows: out, totals: { last24h: sum((r) => r.last24h), last7d: sum((r) => r.last7d) } };
}

async function loadDestinations(tx: Tx, now: Date): Promise<DestinationsView> {
  const s = destinationHealthSnapshots;
  const freshSince = sql`${new Date(now.getTime() - SNAPSHOT_STALE_AFTER_MS).toISOString()}::timestamptz`;
  const attempted = sql`(${s.attemptsSuccess} + ${s.attemptsFailed} + ${s.attemptsRetry})`;
  const agg = await tx
    .select({
      snapshots: sql<number>`count(*)::int`,
      fresh: sql<number>`count(*) filter (where ${s.computedAt} >= ${freshSince})::int`,
      latest: sql<Date | string | null>`max(${s.computedAt})`,
      oldest: sql<Date | string | null>`min(${s.computedAt})`,
      organizations: sql<number>`count(distinct ${s.organizationId})::int`,
      total: sql<number>`coalesce(sum(${s.attemptsTotal}), 0)::int`,
      success: sql<number>`coalesce(sum(${s.attemptsSuccess}), 0)::int`,
      failed: sql<number>`coalesce(sum(${s.attemptsFailed}), 0)::int`,
      retry: sql<number>`coalesce(sum(${s.attemptsRetry}), 0)::int`,
      rateLimited: sql<number>`coalesce(sum(${s.attemptsRateLimited}), 0)::int`,
      authFailed: sql<number>`coalesce(sum(${s.attemptsAuthFailed}), 0)::int`,
      highErrorRate: sql<number>`count(*) filter (where ${s.errorRate} >= ${ERROR_RATE_WARN} and ${attempted} >= ${ERROR_RATE_MIN_ATTEMPTS})::int`,
      withDeadLetters: sql<number>`count(*) filter (where ${s.queueDead} > 0)::int`,
      queueReady: sql<number>`coalesce(sum(${s.queueReady}), 0)::int`,
      oldestQueuedAt: sql<Date | string | null>`min(${s.queueOldestAvailableAt})`,
    })
    .from(s);
  const byStatusRows = await tx.select({ status: integrations.status, n: sql<number>`count(*)::int` }).from(integrations).groupBy(integrations.status);
  const a = agg[0];
  const byStatus: Record<string, number> = {};
  for (const r of byStatusRows) byStatus[r.status] = num(r.n);
  const attempts = { total: num(a?.total), success: num(a?.success), failed: num(a?.failed), retry: num(a?.retry), rateLimited: num(a?.rateLimited), authFailed: num(a?.authFailed) };
  const snapshots = num(a?.snapshots);
  const fresh = num(a?.fresh);
  return {
    snapshots,
    fresh,
    stale: snapshots - fresh,
    latestComputedAt: toIso(a?.latest),
    oldestComputedAt: toIso(a?.oldest),
    organizations: num(a?.organizations),
    attempts: { ...attempts, errorRate: errorRateOf(attempts) },
    highErrorRate: num(a?.highErrorRate),
    withDeadLetters: num(a?.withDeadLetters),
    queueReady: num(a?.queueReady),
    oldestQueuedAt: toIso(a?.oldestQueuedAt),
    byStatus,
    integrations: Object.values(byStatus).reduce((x, y) => x + y, 0),
  };
}

async function loadStripe(tx: Tx, now: Date, configured: boolean, webhookSecretConfigured: boolean): Promise<StripeView> {
  const since24h = new Date(now.getTime() - 24 * 3_600_000);
  const rows = await tx
    .select({
      id: stripeEvents.id,
      type: stripeEvents.type,
      receivedAt: stripeEvents.receivedAt,
      processedAt: stripeEvents.processedAt,
      error: stripeEvents.error,
      organizationId: stripeEvents.organizationId,
      organizationName: organization.name,
    })
    .from(stripeEvents)
    .leftJoin(organization, eq(organization.id, stripeEvents.organizationId))
    .orderBy(desc(stripeEvents.receivedAt))
    .limit(STRIPE_LEDGER_LIMIT);
  const summary = await tx
    .select({
      received24h: sql<number>`count(*) filter (where ${stripeEvents.receivedAt} >= ${since24h.toISOString()}::timestamptz)::int`,
      processed24h: sql<number>`count(*) filter (where ${stripeEvents.receivedAt} >= ${since24h.toISOString()}::timestamptz and ${stripeEvents.processedAt} is not null and ${stripeEvents.error} is null)::int`,
      failed24h: sql<number>`count(*) filter (where ${stripeEvents.receivedAt} >= ${since24h.toISOString()}::timestamptz and ${stripeEvents.error} is not null)::int`,
      pendingTotal: sql<number>`count(*) filter (where ${stripeEvents.processedAt} is null and ${stripeEvents.error} is null)::int`,
      lastReceivedAt: sql<Date | string | null>`max(${stripeEvents.receivedAt})`,
    })
    .from(stripeEvents);
  const su = summary[0];
  return {
    configured,
    webhookSecretConfigured,
    rows: rows.map((r) => ({
      id: r.id,
      type: r.type,
      receivedAt: toIso(r.receivedAt)!,
      processedAt: toIso(r.processedAt),
      state: stripeEventState(r),
      error: redactError(r.error, 200),
      organization: r.organizationId ? { id: r.organizationId, name: r.organizationName ?? r.organizationId } : null,
    })),
    summary: { received24h: num(su?.received24h), processed24h: num(su?.processed24h), failed24h: num(su?.failed24h), pendingTotal: num(su?.pendingTotal), lastReceivedAt: toIso(su?.lastReceivedAt) },
  };
}

async function loadRecent(tx: Tx, now: Date): Promise<RecentErrorsView> {
  const alerts = await tx
    .select({ id: alertEvents.id, kind: alertEvents.kind, severity: alertEvents.severity, triggeredAt: alertEvents.triggeredAt, resolvedAt: alertEvents.resolvedAt, organizationId: alertEvents.organizationId, organizationName: organization.name })
    .from(alertEvents)
    .leftJoin(organization, eq(organization.id, alertEvents.organizationId))
    .orderBy(desc(alertEvents.triggeredAt))
    .limit(RECENT_ERRORS_LIMIT);
  const open = await tx
    .select({ severity: alertEvents.severity, n: sql<number>`count(*)::int` })
    .from(alertEvents)
    .where(isNull(alertEvents.resolvedAt))
    .groupBy(alertEvents.severity);
  const since7d = new Date(now.getTime() - 7 * 86_400_000);
  const audit = await tx
    .select({ id: auditLog.id, action: auditLog.action, targetType: auditLog.targetType, createdAt: auditLog.createdAt, organizationId: auditLog.organizationId, organizationName: organization.name })
    .from(auditLog)
    .leftJoin(organization, eq(organization.id, auditLog.organizationId))
    .where(and(gte(auditLog.createdAt, since7d), or(like(auditLog.action, "%fail%"), like(auditLog.action, "%error%"))))
    .orderBy(desc(auditLog.createdAt))
    .limit(RECENT_ERRORS_LIMIT);
  const openAlerts = { critical: 0, warning: 0, info: 0 };
  for (const r of open) if (r.severity in openAlerts) openAlerts[r.severity as keyof typeof openAlerts] = num(r.n);
  const org = (id: string | null, name: string | null) => (id ? { id, name: name ?? id } : null);
  return {
    alerts: alerts.map((r) => ({ id: r.id, kind: r.kind, severity: r.severity, triggeredAt: toIso(r.triggeredAt)!, resolvedAt: toIso(r.resolvedAt), organization: org(r.organizationId, r.organizationName) })),
    openAlerts,
    audit: audit.map((r) => ({ id: r.id, action: r.action, targetType: r.targetType, createdAt: toIso(r.createdAt)!, organization: org(r.organizationId, r.organizationName) })),
  };
}

/** PostgreSQL statistics (own transaction: a permission error here must not abort the other reads). */
async function loadDatabase(ctx: PlatformContext): Promise<DatabaseView> {
  try {
    return await withPlatform(ctx, async (tx) => {
      const meta = await tx.execute<{ size: string; version: string; connections: string | null }>(
        sql`select pg_database_size(current_database())::text as size, version() as version, (select numbackends from pg_stat_database where datname = current_database())::text as connections`,
      );
      const count = await tx.execute<{ n: string }>(sql`select count(*)::text as n from pg_stat_user_tables`);
      const tables = await tx.execute<{ name: string; live: string; dead: string; bytes: string; vacuum: Date | string | null }>(
        sql`select relname as name, n_live_tup::text as live, n_dead_tup::text as dead, pg_total_relation_size(relid)::text as bytes, last_autovacuum as vacuum from pg_stat_user_tables order by pg_total_relation_size(relid) desc, relname limit ${DATABASE_TABLE_LIMIT}`,
      );
      const m = meta.rows[0];
      const versionMatch = m?.version.match(/^PostgreSQL \S+/);
      return {
        state: "ok" as const,
        sizeBytes: m ? num(m.size) : null,
        version: versionMatch ? versionMatch[0] : (m?.version.slice(0, 40) ?? null),
        connections: m?.connections == null ? null : num(m.connections),
        tableCount: count.rows[0] ? num(count.rows[0].n) : null,
        tables: tables.rows.map((r) => ({ name: r.name, liveRows: num(r.live), deadRows: num(r.dead), totalBytes: num(r.bytes), lastAutovacuumAt: toIso(r.vacuum) })),
      };
    });
  } catch {
    return { state: "unavailable", sizeBytes: null, version: null, connections: null, tableCount: null, tables: [] };
  }
}

/** Loads the whole page; network checks run in parallel with the database reads (one `tracksite_ops` transaction, sequential queries). */
export async function loadPlatformHealth(ctx: PlatformContext, options: { now?: Date } = {}): Promise<PlatformHealthView> {
  const now = options.now ?? new Date();
  const e = env();
  const stripeConfigured = Boolean(e.STRIPE_SECRET_KEY && e.STRIPE_PUBLISHABLE_KEY);
  const [collector, vendors, core, database] = await Promise.all([
    checkCollector(e.HOST_INGEST, now),
    (async (): Promise<VendorsView> => {
      const [ai, mail, billing, probe] = await Promise.all([aiStatus(), mailStatus(), billingStatus(), databaseProbe()]);
      return { ai, mail, billing, migrations: probe.migrations, dbProbe: probe.db };
    })(),
    withPlatform(ctx, async (tx) => {
      // sequential on purpose: one transaction runs on one pg client
      const worker = await loadWorker(tx, now);
      const queues = await loadQueues(tx, now, e.QUEUE_DRIVER);
      const deliveries = await loadDeliveries(tx, now);
      const destinations = await loadDestinations(tx, now);
      const stripe = await loadStripe(tx, now, stripeConfigured, Boolean(e.STRIPE_WEBHOOK_SECRET));
      const recent = await loadRecent(tx, now);
      return { worker, queues, deliveries, destinations, stripe, recent };
    }),
    loadDatabase(ctx),
  ]);
  const partial = { collector, vendors, database, ...core };
  return { generatedAt: now.toISOString(), overall: overallState(partial), ...partial };
}
