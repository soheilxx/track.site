import "server-only";
import { and, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { API_VERSIONS, OAUTH_PROVIDERS, credentialRequirementsFor, getConnector, refreshAccessToken, type ConnectorContext, type CredentialKind } from "@track-site/connectors";
import { redactPii } from "@track-site/core";
import { credentials, deadLetterReferences, deliveryAttempts, destinationHealthSnapshots, integrations, oauthConnections, recordAudit, setIntegrationStatus, sites, type IntegrationRow } from "@track-site/db";
import { env } from "@/env";
import { logger, vault } from "@/server/db";
import { providerConfig } from "@/server/oauth";
import { withOrg, type OrgContext } from "@/server/session";

/**
 * Destination Health Center (redesign supplement §8 module 6). Everything on the page is a measurement:
 * live counts from `delivery_attempts` (RLS-readable), credential and OAuth references, the connector's
 * pinned API version, and the worker's `destination_health_snapshots` row for the queue backlog the
 * dashboard role cannot read itself. A missing snapshot is "not measured", an old one is "stale"; unknown
 * values stay `null` and the UI says so. The pure helpers below are unit-tested; the loader and the
 * diagnosis run inside the tenant transaction of the current session.
 */

/** Trailing window of the live delivery counters (hours). */
export const DELIVERY_WINDOW_HOURS = 24;
/** A snapshot older than this is shown as stale (the worker job runs every minute). */
export const DESTINATION_HEALTH_STALE_AFTER_MS = 5 * 60_000;
/** Queue lag above this raises a warning. */
export const QUEUE_LAG_WARN_MS = 15 * 60_000;
/** Error-rate warning: at least this share of at least MIN_ATTEMPTS attempts failed. */
export const ERROR_RATE_WARN = 0.2;
export const ERROR_RATE_MIN_ATTEMPTS = 5;
/** Credentials expiring within this many days are flagged. */
export const CREDENTIAL_EXPIRING_DAYS = 7;
/** API versions sunsetting within this many days are flagged. */
export const API_SUNSET_WARN_DAYS = 60;
/** Recent failures kept per destination. */
export const RECENT_FAILURES_PER_DESTINATION = 5;
/** Failures read per destination (the last rate-limited attempt is looked up among them). */
const RECENT_FAILURES_LOOKUP_PER_DESTINATION = 40;
const DIAGNOSIS_TIMEOUT_MS = 25_000;

export type IntegrationStatus = IntegrationRow["status"];
export type HealthStatus = "healthy" | "degraded" | "unhealthy" | "not_connected" | "unknown";
export type CredentialExpiryState = "none" | "no_expiry" | "ok" | "expiring" | "expired" | "inactive";
export type FailureReason =
  | "credentials_rejected"
  | "credential_missing"
  | "credential_expired"
  | "rate_limited"
  | "invalid_payload"
  | "consent_missing"
  | "destination_paused"
  | "gpc_opt_out"
  | "policy_blocked"
  | "vendor_timeout"
  | "vendor_temporary"
  | "vendor_rejected"
  | "destination_missing"
  | "unknown";
export type AttentionLevel = "critical" | "warning" | "info" | "none";
export type IssueKey =
  | "credential_expired"
  | "auth_failures"
  | "status_error"
  | "health_unhealthy"
  | "credential_missing"
  | "credential_expiring"
  | "health_degraded"
  | "rate_limited"
  | "high_error_rate"
  | "queue_lag"
  | "dead_letters"
  | "api_sunset"
  | "not_connected"
  | "paused"
  | "draft"
  | "no_delivery_yet";
export type SnapshotFreshness = "fresh" | "stale" | "missing";

export interface CredentialView {
  id: string;
  kind: string;
  label: string;
  last4: string | null;
  status: string;
  expiresAt: string | null;
  lastValidatedAt: string | null;
  createdAt: string;
  expiry: { state: CredentialExpiryState; daysLeft: number | null };
}

export interface CredentialSummary {
  state: CredentialExpiryState;
  expiresAt: string | null;
  daysLeft: number | null;
  missingKinds: string[];
  lastValidatedAt: string | null;
}

export interface OAuthView {
  provider: string;
  accountId: string | null;
  accountName: string | null;
  /** scopes the platform requests for this provider (granted scopes are not reported by every vendor) */
  requestedScopes: string[];
  /** scopes the vendor reported at connect time; null when it reported none */
  grantedScopes: string[] | null;
  accessExpiresAt: string | null;
  status: string;
}

export interface DeliveryCounts {
  windowHours: number;
  total: number;
  success: number;
  failed: number;
  retry: number;
  skipped: number;
  rateLimited: number;
  authFailed: number;
  /** (failed + retry) / (success + failed + retry); null without attempts */
  errorRate: number | null;
}

export interface QueueView {
  freshness: SnapshotFreshness;
  computedAt: string | null;
  ready: number | null;
  scheduled: number | null;
  inFlight: number | null;
  oldestAvailableAt: string | null;
  lagMs: number | null;
  /** unreplayed dead letters as seen by the worker */
  dead: number | null;
}

export interface RecentFailure {
  id: string;
  eventName: string;
  status: string;
  errorClass: string;
  errorCode: string | null;
  httpStatus: number | null;
  /** vendor message, truncated by the worker and PII-redacted here (max 500 chars) */
  message: string | null;
  attempt: number;
  at: string;
  reason: FailureReason;
}

export interface DestinationHealthRow {
  id: string;
  name: string;
  connectorType: string;
  displayName: string;
  siteId: string;
  siteName: string;
  status: IntegrationStatus;
  testMode: boolean;
  pausedAt: string | null;
  health: { status: HealthStatus; checkedAt: string | null; detail: string | null; apiVersion: string | null };
  api: { version: string; verifiedAt: string; sunsetWatch: string | null; sunsetDays: number | null; docsUrl: string | null };
  credentials: CredentialView[];
  credentialSummary: CredentialSummary;
  oauth: OAuthView | null;
  deliveries: DeliveryCounts;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  rateLimit: { count: number; lastAt: string | null; lastWaitMs: number | null };
  queue: QueueView;
  /** unreplayed dead-letter references (durable, tenant-readable) */
  deadLetters: number;
  recentFailures: RecentFailure[];
  attention: { level: AttentionLevel; issues: IssueKey[] };
}

export interface DestinationHealthOverview {
  generatedAt: string;
  rows: DestinationHealthRow[];
  summary: { total: number; critical: number; warning: number; healthy: number; paused: number };
  snapshots: { measured: number; stale: number; missing: number; latestComputedAt: string | null };
}

/** Vendor texts (error messages, health details) are truncated by the worker, not redacted: redact before they reach the client. */
const redactText = (value: string | null | undefined): string | null => (value == null ? null : redactPii(value).text);
const toIso = (value: Date | string | null | undefined): string | null => (value == null ? null : value instanceof Date ? value.toISOString() : new Date(value).toISOString());
const toDate = (value: Date | string | null | undefined): Date | null => (value == null ? null : value instanceof Date ? value : new Date(value));

/** Expiry classification of one credential (7-day warning window). */
export function credentialExpiry(input: { status: string; expiresAt: Date | string | null }, now: Date): { state: CredentialExpiryState; daysLeft: number | null } {
  if (input.status !== "active") return { state: "inactive", daysLeft: null };
  const expiresAt = toDate(input.expiresAt);
  if (!expiresAt) return { state: "no_expiry", daysLeft: null };
  const ms = expiresAt.getTime() - now.getTime();
  const daysLeft = Math.floor(ms / 86_400_000);
  if (ms <= 0) return { state: "expired", daysLeft };
  if (ms <= CREDENTIAL_EXPIRING_DAYS * 86_400_000) return { state: "expiring", daysLeft };
  return { state: "ok", daysLeft };
}

/**
 * Worst case across the active credentials of a destination: an expired one wins, then the soonest
 * expiring one, then "ok"; without an expiry date the state is "no_expiry" (long-lived tokens), without
 * any active credential "none". `missingKinds` lists required kinds without an active credential.
 */
export function summarizeCredentials(refs: ReadonlyArray<{ kind: string; status: string; expiresAt: Date | string | null; lastValidatedAt?: Date | string | null }>, requiredKinds: readonly string[], now: Date): CredentialSummary {
  const active = refs.filter((r) => r.status === "active");
  const missingKinds = requiredKinds.filter((kind) => !active.some((r) => r.kind === kind));
  const lastValidatedAt = active.map((r) => toDate(r.lastValidatedAt ?? null)).filter((d): d is Date => d !== null).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  if (active.length === 0) return { state: "none", expiresAt: null, daysLeft: null, missingKinds, lastValidatedAt: null };
  const classified = active.map((r) => ({ ...credentialExpiry(r, now), expiresAt: toDate(r.expiresAt) }));
  const rank: Record<CredentialExpiryState, number> = { expired: 0, expiring: 1, ok: 2, no_expiry: 3, none: 4, inactive: 5 };
  const worst = [...classified].sort((a, b) => rank[a.state] - rank[b.state] || (a.expiresAt?.getTime() ?? Infinity) - (b.expiresAt?.getTime() ?? Infinity))[0]!;
  return { state: worst.state, expiresAt: toIso(worst.expiresAt), daysLeft: worst.daysLeft, missingKinds, lastValidatedAt: toIso(lastValidatedAt) };
}

/** Plain-language reason key for a failed or skipped delivery attempt. */
export function failureReason(errorClass: string, errorCode: string | null, httpStatus: number | null): FailureReason {
  if (errorCode === "destination_missing") return "destination_missing";
  if (errorClass === "policy_blocked") {
    if (errorCode === "consent_missing") return "consent_missing";
    if (errorCode === "destination_paused") return "destination_paused";
    if (errorCode === "gpc_opt_out") return "gpc_opt_out";
    return "policy_blocked";
  }
  if (errorClass === "credential_expired") return errorCode?.startsWith("missing_") ? "credential_missing" : "credential_expired";
  if (errorClass === "auth" || httpStatus === 401 || httpStatus === 403) return "credentials_rejected";
  if (errorClass === "rate_limited" || httpStatus === 429) return "rate_limited";
  if (errorClass === "invalid_payload") return "invalid_payload";
  if (errorClass === "timeout") return "vendor_timeout";
  if (errorClass === "temporary") return "vendor_temporary";
  if (errorClass === "permanent") return "vendor_rejected";
  return "unknown";
}

/** (failed + retry) / (success + failed + retry); null when nothing was attempted. */
export function errorRateOf(counts: { success: number; failed: number; retry: number }): number | null {
  const denominator = counts.success + counts.failed + counts.retry;
  if (denominator <= 0) return null;
  return (counts.failed + counts.retry) / denominator;
}

export function snapshotFreshness(computedAt: Date | string | null, now: Date, staleAfterMs = DESTINATION_HEALTH_STALE_AFTER_MS): SnapshotFreshness {
  const at = toDate(computedAt);
  if (!at) return "missing";
  return now.getTime() - at.getTime() > staleAfterMs ? "stale" : "fresh";
}

/** Age of the oldest queued message; null when nothing is queued or the queue was not measured. */
export function queueLagMs(oldestAvailableAt: Date | string | null, now: Date): number | null {
  const at = toDate(oldestAvailableAt);
  if (!at) return null;
  return Math.max(0, now.getTime() - at.getTime());
}

/** Days until an API version sunsets; null without a documented sunset. */
export function sunsetDays(sunsetWatch: string | null, now: Date): number | null {
  if (!sunsetWatch) return null;
  const at = new Date(sunsetWatch);
  if (Number.isNaN(at.getTime())) return null;
  return Math.ceil((at.getTime() - now.getTime()) / 86_400_000);
}

export interface AttentionInput {
  status: IntegrationStatus;
  healthStatus: HealthStatus;
  credentialState: CredentialExpiryState;
  missingKinds: readonly string[];
  deliveries: Pick<DeliveryCounts, "success" | "failed" | "retry" | "rateLimited" | "authFailed" | "errorRate">;
  queueLagMs: number | null;
  deadLetters: number;
  sunsetDays: number | null;
  lastSuccessAt: string | null;
}

const ISSUE_LEVEL: Record<IssueKey, AttentionLevel> = {
  credential_expired: "critical",
  auth_failures: "critical",
  status_error: "critical",
  health_unhealthy: "critical",
  credential_missing: "warning",
  credential_expiring: "warning",
  health_degraded: "warning",
  rate_limited: "warning",
  high_error_rate: "warning",
  queue_lag: "warning",
  dead_letters: "warning",
  api_sunset: "warning",
  not_connected: "warning",
  paused: "info",
  draft: "info",
  no_delivery_yet: "info",
};
const LEVEL_RANK: Record<AttentionLevel, number> = { critical: 0, warning: 1, info: 2, none: 3 };

/** Prioritised issues of one destination (critical first) and the resulting attention level. */
export function attentionFor(input: AttentionInput): { level: AttentionLevel; issues: IssueKey[] } {
  const issues: IssueKey[] = [];
  const attempted = input.deliveries.success + input.deliveries.failed + input.deliveries.retry;
  if (input.status === "draft") {
    issues.push("draft");
    return { level: "info", issues };
  }
  if (input.credentialState === "expired") issues.push("credential_expired");
  if (input.deliveries.authFailed > 0) issues.push("auth_failures");
  if (input.status === "error") issues.push("status_error");
  if (input.healthStatus === "unhealthy") issues.push("health_unhealthy");
  if (input.missingKinds.length > 0) issues.push("credential_missing");
  if (input.credentialState === "expiring") issues.push("credential_expiring");
  if (input.healthStatus === "degraded") issues.push("health_degraded");
  if (input.deliveries.rateLimited > 0) issues.push("rate_limited");
  if (input.deliveries.errorRate !== null && input.deliveries.errorRate >= ERROR_RATE_WARN && attempted >= ERROR_RATE_MIN_ATTEMPTS) issues.push("high_error_rate");
  if (input.queueLagMs !== null && input.queueLagMs >= QUEUE_LAG_WARN_MS) issues.push("queue_lag");
  if (input.deadLetters > 0) issues.push("dead_letters");
  if (input.sunsetDays !== null && input.sunsetDays <= API_SUNSET_WARN_DAYS) issues.push("api_sunset");
  if (input.status === "not_connected") issues.push("not_connected");
  if (input.status === "paused") issues.push("paused");
  if (input.status === "connected" && input.lastSuccessAt === null) issues.push("no_delivery_yet");
  const level = issues.reduce<AttentionLevel>((acc, issue) => (LEVEL_RANK[ISSUE_LEVEL[issue]] < LEVEL_RANK[acc] ? ISSUE_LEVEL[issue] : acc), "none");
  return { level, issues };
}

const HEALTH_STATUSES: readonly HealthStatus[] = ["healthy", "degraded", "unhealthy", "not_connected", "unknown"];
const healthStatusOf = (value: string): HealthStatus => (HEALTH_STATUSES.includes(value as HealthStatus) ? (value as HealthStatus) : "unknown");

/**
 * Loads the health of every destination of the organization, or of one site when `siteId` is given
 * (the workspace switcher). Everything is read inside one tenant transaction.
 */
export async function loadDestinationHealth(ctx: OrgContext, options: { siteId: string | null; now?: Date }): Promise<DestinationHealthOverview> {
  const now = options.now ?? new Date();
  const since = new Date(now.getTime() - DELIVERY_WINDOW_HOURS * 3_600_000);
  const successLookback = new Date(now.getTime() - 90 * 86_400_000);
  const failureLookback = new Date(now.getTime() - 7 * 86_400_000);

  const data = await withOrg(ctx, async (tx) => {
    const base = await tx
      .select({
        id: integrations.id,
        name: integrations.name,
        connectorType: integrations.connectorType,
        status: integrations.status,
        health: integrations.health,
        testMode: integrations.testMode,
        pausedAt: integrations.pausedAt,
        publicConfig: integrations.publicConfig,
        createdAt: integrations.createdAt,
        siteId: integrations.siteId,
        siteName: sites.name,
      })
      .from(integrations)
      .innerJoin(sites, eq(sites.id, integrations.siteId))
      .where(options.siteId ? and(eq(integrations.organizationId, ctx.organization.id), eq(integrations.siteId, options.siteId)) : eq(integrations.organizationId, ctx.organization.id))
      .orderBy(desc(integrations.createdAt));
    const ids = base.map((r) => r.id);
    if (ids.length === 0) return { base, refs: [], oauth: [], counts: [], lastSuccess: [], failures: [], dead: [], snapshots: [] };
    const rankedFailures = tx.$with("ranked_failures").as(
      tx
        .select({
          id: deliveryAttempts.id,
          integrationId: deliveryAttempts.integrationId,
          eventName: deliveryAttempts.eventName,
          status: deliveryAttempts.status,
          errorClass: deliveryAttempts.errorClass,
          errorCode: deliveryAttempts.errorCode,
          message: deliveryAttempts.errorMessage,
          httpStatus: deliveryAttempts.httpStatus,
          attempt: deliveryAttempts.attempt,
          at: deliveryAttempts.startedAt,
          nextRetryAt: deliveryAttempts.nextRetryAt,
          rn: sql<number>`row_number() over (partition by ${deliveryAttempts.integrationId} order by ${deliveryAttempts.startedAt} desc)`.as("rn"),
        })
        .from(deliveryAttempts)
        .where(and(inArray(deliveryAttempts.integrationId, ids), inArray(deliveryAttempts.status, ["failed", "dead", "retry"]), gte(deliveryAttempts.startedAt, failureLookback))),
    );
    // sequential on purpose: a transaction runs on one pg client, and concurrent queries on a single client are deprecated (pg 9 removes the implicit queue)
    const refs = await tx
      .select({ id: credentials.id, integrationId: credentials.integrationId, kind: credentials.kind, label: credentials.label, last4: credentials.last4, status: credentials.status, expiresAt: credentials.expiresAt, lastValidatedAt: credentials.lastValidatedAt, createdAt: credentials.createdAt })
      .from(credentials)
      .where(inArray(credentials.integrationId, ids))
      .orderBy(desc(credentials.createdAt));
    const oauth = await tx
      .select({ integrationId: oauthConnections.integrationId, provider: oauthConnections.provider, accountId: oauthConnections.externalAccountId, accountName: oauthConnections.externalAccountName, scopes: oauthConnections.scopes, accessExpiresAt: oauthConnections.accessExpiresAt, status: oauthConnections.status })
      .from(oauthConnections)
      .where(inArray(oauthConnections.integrationId, ids));
    const counts = await tx
      .select({ integrationId: deliveryAttempts.integrationId, status: deliveryAttempts.status, errorClass: deliveryAttempts.errorClass, n: sql<number>`count(*)::int` })
      .from(deliveryAttempts)
      .where(and(inArray(deliveryAttempts.integrationId, ids), gte(deliveryAttempts.startedAt, since)))
      .groupBy(deliveryAttempts.integrationId, deliveryAttempts.status, deliveryAttempts.errorClass);
    const lastSuccess = await tx
      .select({ integrationId: deliveryAttempts.integrationId, at: sql<Date | string | null>`max(${deliveryAttempts.startedAt})` })
      .from(deliveryAttempts)
      .where(and(inArray(deliveryAttempts.integrationId, ids), eq(deliveryAttempts.status, "success"), gte(deliveryAttempts.startedAt, successLookback)))
      .groupBy(deliveryAttempts.integrationId);
    // newest failures per destination (window per integration, so one noisy destination cannot hide the failures of the others)
    const failures = await tx
      .with(rankedFailures)
      .select()
      .from(rankedFailures)
      .where(lte(rankedFailures.rn, RECENT_FAILURES_LOOKUP_PER_DESTINATION))
      .orderBy(desc(rankedFailures.at));
    const dead = await tx
      .select({ integrationId: deadLetterReferences.integrationId, n: sql<number>`count(*)::int` })
      .from(deadLetterReferences)
      .where(and(inArray(deadLetterReferences.integrationId, ids), isNull(deadLetterReferences.replayedAt)))
      .groupBy(deadLetterReferences.integrationId);
    const snapshots = await tx.select().from(destinationHealthSnapshots).where(inArray(destinationHealthSnapshots.integrationId, ids));
    return { base, refs, oauth, counts, lastSuccess, failures, dead, snapshots };
  });

  const refsBy = groupBy(data.refs, (r) => r.integrationId ?? "");
  const oauthBy = new Map(data.oauth.map((o) => [o.integrationId, o]));
  const countsBy = groupBy(data.counts, (c) => c.integrationId);
  const lastSuccessBy = new Map(data.lastSuccess.map((s) => [s.integrationId, toIso(s.at)]));
  const failuresBy = groupBy(data.failures, (f) => f.integrationId);
  const deadBy = new Map(data.dead.map((d) => [d.integrationId ?? "", d.n]));
  const snapshotBy = new Map(data.snapshots.map((s) => [s.integrationId, s]));

  const rows: DestinationHealthRow[] = data.base.map((r) => {
    const connector = getConnector(r.connectorType);
    const pin = (API_VERSIONS as Record<string, { version: string; verifiedAt: string; sunsetWatch: string | null; docsUrl: string }>)[r.connectorType] ?? null;
    const refs = refsBy.get(r.id) ?? [];
    const required = credentialRequirementsFor(connector, r.publicConfig);
    const credentialSummary = summarizeCredentials(refs, required.filter((c) => !c.optional).map((c) => c.kind), now);
    const counts = countsBy.get(r.id) ?? [];
    const sum = (pred: (c: (typeof counts)[number]) => boolean) => counts.filter(pred).reduce((a, c) => a + c.n, 0);
    const deliveries: DeliveryCounts = {
      windowHours: DELIVERY_WINDOW_HOURS,
      total: sum(() => true),
      success: sum((c) => c.status === "success"),
      failed: sum((c) => c.status === "failed" || c.status === "dead"),
      retry: sum((c) => c.status === "retry"),
      skipped: sum((c) => c.status === "skipped"),
      rateLimited: sum((c) => c.errorClass === "rate_limited"),
      authFailed: sum((c) => c.errorClass === "auth" || c.errorClass === "credential_expired"),
      errorRate: null,
    };
    deliveries.errorRate = errorRateOf(deliveries);
    const failures = (failuresBy.get(r.id) ?? []).slice(0, RECENT_FAILURES_PER_DESTINATION);
    const lastRateLimited = (failuresBy.get(r.id) ?? []).find((f) => f.errorClass === "rate_limited") ?? null;
    const snapshot = snapshotBy.get(r.id) ?? null;
    const freshness = snapshotFreshness(snapshot?.computedAt ?? null, now);
    const lagMs = snapshot ? queueLagMs(snapshot.queueOldestAvailableAt, now) : null;
    const oauthRow = oauthBy.get(r.id) ?? null;
    const oauth: OAuthView | null = oauthRow
      ? {
          provider: oauthRow.provider,
          accountId: oauthRow.accountId,
          accountName: oauthRow.accountName,
          requestedScopes: OAUTH_PROVIDERS[oauthRow.provider]?.scopes ?? required.find((c) => c.oauth)?.oauth?.scopes ?? [],
          grantedScopes: oauthRow.scopes.length ? oauthRow.scopes : null,
          accessExpiresAt: toIso(oauthRow.accessExpiresAt),
          status: oauthRow.status,
        }
      : null;
    const health = { status: healthStatusOf(r.health.status), checkedAt: r.health.checkedAt, detail: redactText(r.health.detail), apiVersion: r.health.apiVersion };
    const days = sunsetDays(pin?.sunsetWatch ?? null, now);
    const lastSuccessAt = lastSuccessBy.get(r.id) ?? null;
    const deadLetters = deadBy.get(r.id) ?? 0;
    const attention = attentionFor({
      status: r.status,
      healthStatus: health.status,
      credentialState: credentialSummary.state,
      missingKinds: credentialSummary.missingKinds,
      deliveries,
      queueLagMs: freshness === "fresh" ? lagMs : null,
      deadLetters,
      sunsetDays: days,
      lastSuccessAt,
    });
    return {
      id: r.id,
      name: r.name,
      connectorType: r.connectorType,
      displayName: connector?.meta.displayName ?? r.connectorType,
      siteId: r.siteId,
      siteName: r.siteName,
      status: r.status,
      testMode: r.testMode,
      pausedAt: toIso(r.pausedAt),
      health,
      api: { version: connector?.meta.apiVersion ?? pin?.version ?? "–", verifiedAt: connector?.meta.verifiedAt ?? pin?.verifiedAt ?? "–", sunsetWatch: pin?.sunsetWatch ?? connector?.meta.sunsetWatch ?? null, sunsetDays: days, docsUrl: connector?.meta.docsUrl ?? pin?.docsUrl ?? null },
      credentials: refs.map((c) => ({ id: c.id, kind: c.kind, label: c.label, last4: c.last4, status: c.status, expiresAt: toIso(c.expiresAt), lastValidatedAt: toIso(c.lastValidatedAt), createdAt: toIso(c.createdAt)!, expiry: credentialExpiry(c, now) })),
      credentialSummary,
      oauth,
      deliveries,
      lastSuccessAt,
      lastFailureAt: failures[0] ? toIso(failures[0].at) : null,
      rateLimit: { count: deliveries.rateLimited, lastAt: lastRateLimited ? toIso(lastRateLimited.at) : null, lastWaitMs: lastRateLimited?.nextRetryAt ? Math.max(0, new Date(lastRateLimited.nextRetryAt).getTime() - new Date(lastRateLimited.at).getTime()) : null },
      queue: {
        freshness,
        computedAt: toIso(snapshot?.computedAt ?? null),
        ready: snapshot?.queueReady ?? null,
        scheduled: snapshot?.queueScheduled ?? null,
        inFlight: snapshot?.queueInFlight ?? null,
        oldestAvailableAt: toIso(snapshot?.queueOldestAvailableAt ?? null),
        lagMs,
        dead: snapshot?.queueDead ?? null,
      },
      deadLetters,
      recentFailures: failures.map((f) => ({ id: f.id, eventName: f.eventName, status: f.status, errorClass: f.errorClass, errorCode: f.errorCode, httpStatus: f.httpStatus, message: redactText(f.message), attempt: f.attempt, at: toIso(f.at)!, reason: failureReason(f.errorClass, f.errorCode, f.httpStatus) })),
      attention,
    };
  });

  const order: Record<AttentionLevel, number> = LEVEL_RANK;
  rows.sort((a, b) => order[a.attention.level] - order[b.attention.level] || a.name.localeCompare(b.name));
  const measured = rows.filter((r) => r.queue.freshness !== "missing");
  const latest = measured.map((r) => r.queue.computedAt!).sort().at(-1) ?? null;
  return {
    generatedAt: now.toISOString(),
    rows,
    summary: {
      total: rows.length,
      critical: rows.filter((r) => r.attention.level === "critical").length,
      warning: rows.filter((r) => r.attention.level === "warning").length,
      healthy: rows.filter((r) => r.status === "connected" && r.attention.level === "none").length,
      paused: rows.filter((r) => r.status === "paused").length,
    },
    snapshots: { measured: measured.length, stale: rows.filter((r) => r.queue.freshness === "stale").length, missing: rows.length - measured.length, latestComputedAt: latest },
  };
}

function groupBy<T, K>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

/** One destination of the active organization by id (RLS), or null. */
export async function getOrgIntegration(ctx: OrgContext, integrationId: string): Promise<IntegrationRow | null> {
  const rows = await withOrg(ctx, (tx) => tx.select().from(integrations).where(and(eq(integrations.organizationId, ctx.organization.id), eq(integrations.id, integrationId))).limit(1));
  return rows[0] ?? null;
}

export interface DiagnosisOutcome {
  ok: boolean;
  /** null when the check could not run at all (connector unavailable, timeout, vault missing) */
  validation: { ok: boolean; status: "valid" | "invalid" | "expired" | "not_connected" | "unknown"; detail: string; apiVersion: string; checkedAt: string } | null;
  health: { status: HealthStatus; detail: string; apiVersion: string; sunsetWatch: string | null; checkedAt: string } | null;
  error: "connector_unavailable" | "vault_missing" | "timeout" | "failed" | null;
}

/** The connector context for a diagnosis: credentials decrypted lazily under RLS, OAuth access tokens minted from the stored refresh token. */
function connectorContextFor(ctx: OrgContext, integration: IntegrationRow): ConnectorContext {
  const e = env();
  const v = vault();
  const getCredential = async (kind: CredentialKind): Promise<string | null> => {
    if (!v) return null;
    const rows = await withOrg(ctx, (tx) => tx.select({ ciphertext: credentials.ciphertext }).from(credentials).where(and(eq(credentials.integrationId, integration.id), eq(credentials.kind, kind), eq(credentials.status, "active"))).orderBy(desc(credentials.createdAt)).limit(1));
    const row = rows[0];
    return row ? v.decrypt(row.ciphertext, `integration:${integration.id}`) : null;
  };
  return {
    organizationId: ctx.organization.id,
    siteId: integration.siteId,
    integrationId: integration.id,
    publicConfig: integration.publicConfig,
    settings: integration.settings,
    testMode: integration.testMode,
    getCredential,
    fetch,
    baseUrlOverride: e.VENDOR_MOCK_BASE_URL ?? null,
    allowPrivateNetwork: e.VENDOR_ALLOW_PRIVATE,
    logger: logger.child({ module: "destination-health", integrationId: integration.id }),
    now: () => new Date(),
    platform: { google_ads_developer_token: e.GOOGLE_ADS_DEVELOPER_TOKEN ?? null, x_consumer_key: e.X_CONSUMER_KEY ?? null, x_consumer_secret: e.X_CONSUMER_SECRET ?? null, amazon_ads_client_id: e.AMAZON_ADS_CLIENT_ID ?? null },
    oauth: {
      accessToken: async (provider) => {
        const cfg = providerConfig(provider);
        if (!cfg) return null;
        const refresh = await getCredential("oauth_refresh_token");
        if (!refresh) return null;
        const res = await refreshAccessToken(cfg.provider, refresh, cfg.clientId, cfg.clientSecret, fetch, e.VENDOR_MOCK_BASE_URL ? `${e.VENDOR_MOCK_BASE_URL}/oauth/${provider}/token` : cfg.provider.tokenUrl);
        return res.accessToken;
      },
    },
  };
}

/** Runs the connector's credential validation and health check (cheapest vendor read); never returns secrets. */
export async function runDestinationDiagnosis(ctx: OrgContext, integration: IntegrationRow): Promise<DiagnosisOutcome> {
  const connector = getConnector(integration.connectorType);
  if (!connector) return { ok: false, validation: null, health: null, error: "connector_unavailable" };
  if (!vault()) {
    // stored secrets exist but cannot be decrypted here: say so instead of reporting "not connected"
    const stored = await withOrg(ctx, (tx) => tx.select({ id: credentials.id }).from(credentials).where(and(eq(credentials.integrationId, integration.id), eq(credentials.status, "active"))).limit(1));
    if (stored.length > 0) return { ok: false, validation: null, health: null, error: "vault_missing" };
  }
  const cctx = connectorContextFor(ctx, integration);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("diagnosis_timeout")), DIAGNOSIS_TIMEOUT_MS);
  });
  try {
    const [validation, health] = await Promise.race([Promise.all([connector.validateCredentials(cctx), connector.getHealth(cctx)]), timeout]);
    return {
      ok: validation.ok,
      validation: { ok: validation.ok, status: validation.status, detail: redactText(validation.detail) ?? "", apiVersion: validation.apiVersion, checkedAt: validation.checkedAt },
      health: { status: healthStatusOf(health.status), detail: redactText(health.detail) ?? "", apiVersion: health.apiVersion, sunsetWatch: health.sunsetWatch, checkedAt: health.checkedAt },
      error: null,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.warn({ integrationId: integration.id, err: message === "diagnosis_timeout" ? message : "diagnosis failed" }, "destination diagnosis failed");
    return { ok: false, validation: null, health: null, error: message === "diagnosis_timeout" ? "timeout" : "failed" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Status a destination gets after a diagnosis: paused stays paused unless the user resumes it. */
export function statusAfterDiagnosis(current: IntegrationStatus, outcome: DiagnosisOutcome, action: "diagnose" | "resume"): IntegrationStatus {
  if (action === "diagnose" && current === "paused") return "paused";
  if (!outcome.validation) return action === "resume" ? "not_connected" : current === "paused" ? "paused" : current === "draft" ? "draft" : current;
  if (outcome.validation.ok) return "connected";
  return outcome.validation.status === "not_connected" ? "not_connected" : "error";
}

/**
 * Persists a diagnosis: the destination's status and health, `last_validated_at` on its active
 * credentials and an audit entry (`destination.diagnose` / `destination.resume`). The worker learns
 * about the change through the outbox entry `setIntegrationStatus` writes.
 */
export async function recordDestinationDiagnosis(ctx: OrgContext, integration: IntegrationRow, outcome: DiagnosisOutcome, action: "diagnose" | "resume"): Promise<IntegrationStatus> {
  const next = statusAfterDiagnosis(integration.status, outcome, action);
  const checkedAt = new Date().toISOString();
  const health: IntegrationRow["health"] = outcome.health
    ? { status: outcome.health.status, checkedAt: outcome.health.checkedAt, detail: outcome.health.detail, apiVersion: outcome.health.apiVersion }
    : outcome.validation
      ? { status: outcome.validation.ok ? "healthy" : "unhealthy", checkedAt: outcome.validation.checkedAt, detail: outcome.validation.detail, apiVersion: outcome.validation.apiVersion }
      : { status: "unknown", checkedAt, detail: null, apiVersion: integration.health.apiVersion };
  await withOrg(ctx, async (tx) => {
    await setIntegrationStatus(tx, { siteId: integration.siteId, integrationId: integration.id, status: next, health, actor: ctx.tenant.actor });
    if (outcome.validation) await tx.update(credentials).set({ lastValidatedAt: new Date() }).where(and(eq(credentials.integrationId, integration.id), eq(credentials.status, "active")));
    await recordAudit(tx, {
      organizationId: ctx.organization.id,
      actor: ctx.tenant.actor,
      action: `destination.${action}`,
      targetType: "integration",
      targetId: integration.id,
      diff: { statusFrom: integration.status, statusTo: next, validation: outcome.validation ? { ok: outcome.validation.ok, status: outcome.validation.status } : null, health: outcome.health ? { status: outcome.health.status } : null, error: outcome.error },
      metadata: { source: "destination_health_center" },
      requestId: ctx.tenant.requestId,
    });
  });
  return next;
}

/** Pauses one destination: deliveries to it are skipped by the policy gate; ingestion and every other destination continue. */
export async function pauseDestination(ctx: OrgContext, integration: IntegrationRow): Promise<void> {
  await withOrg(ctx, async (tx) => {
    await setIntegrationStatus(tx, { siteId: integration.siteId, integrationId: integration.id, status: "paused", actor: ctx.tenant.actor });
    await recordAudit(tx, { organizationId: ctx.organization.id, actor: ctx.tenant.actor, action: "destination.pause", targetType: "integration", targetId: integration.id, diff: { statusFrom: integration.status, statusTo: "paused" }, metadata: { source: "destination_health_center" }, requestId: ctx.tenant.requestId });
  });
}
