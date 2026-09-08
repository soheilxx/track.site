import "server-only";
import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, max, or, sql, type SQL } from "drizzle-orm";
import { USAGE_PAUSE_GRACE_PERCENT, USAGE_WARNING_THRESHOLDS, isOveragePolicy, DEFAULT_OVERAGE_POLICY, type OveragePolicy, type UsageWarningThreshold } from "@track-site/catalog";
import { isOrgRole, usagePeriodKey, type OrgRole } from "@track-site/core";
import {
  alertChannels,
  alertEvents,
  alertRules,
  auditLog,
  breakGlassAccess,
  configPublications,
  configVersions,
  dataQualityIssues,
  destinationHealthSnapshots,
  domains,
  environments,
  eventAggregates,
  featureFlagOverrides,
  featureFlags,
  integrations,
  invitation,
  member,
  opsNotes,
  orgSettings,
  organization,
  plans,
  siteHealthSnapshots,
  sites,
  subscriptionStatusEnum,
  subscriptions,
  usagePeriods,
  user,
  type PlanLimits,
  type Tx,
} from "@track-site/db";
import { DETAIL_NOTES_LIMIT } from "@/components/ops/organisations/constants";
import { auditActorView, auditCategory, flattenDiff, type AuditActorView, type AuditDiffRow } from "@/server/team";
import { activeBreakGlass, auditPlatform, withPlatform, type PlatformContext } from "./platform";

/**
 * Track Operations → Organisations (task O1, docs/17). The directory and the tenant detail page read
 * metadata and aggregates only: names, roles, plan, counters from `event_aggregates` / `usage_periods`,
 * the worker's health snapshots, destination status without credentials or vendor messages, redacted
 * audit diffs. Nothing here reads the event store, consent snapshots or credentials, and the loaders
 * return the same data with or without a break-glass grant — a grant only adds the audited page-view
 * entry (`platform.organization.view`, `metadata.breakGlassId`). Every read runs as `tracksite_ops`
 * through `withPlatform` with a resolved platform context; the pure helpers below are unit-tested.
 */

const DAY_MS = 86_400_000;
export const ORG_PAGE_SIZE = 25;
/** accepted events of the directory column are summed over this many days */
export const DIRECTORY_EVENT_DAYS = 30;
/** "last activity" looks back this far into event aggregates and the audit log (bounded scan) */
export const ACTIVITY_WINDOW_DAYS = 90;
/** environment counters of the detail page */
export const ENVIRONMENT_EVENT_DAYS = 7;
/** a destination health snapshot older than this is stale (the worker job runs every minute) */
export const SNAPSHOT_STALE_AFTER_MS = 5 * 60_000;
export const EXPORT_MAX_ROWS = 5000;
export const DETAIL_AUDIT_LIMIT = 20;
export { DETAIL_NOTES_LIMIT };
export const DETAIL_ALERTS_LIMIT = 5;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string): boolean => UUID.test(value);

// ---------------------------------------------------------------------------------------------------
// Directory filters
// ---------------------------------------------------------------------------------------------------

export const ORG_SORTS = ["created", "name", "activity", "events", "health", "members", "sites"] as const;
export type OrgSort = (typeof ORG_SORTS)[number];
export const SUBSCRIPTION_STATUSES = subscriptionStatusEnum.enumValues;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];
export const SUSPENDED_FILTERS = ["all", "yes", "no"] as const;
export type SuspendedFilter = (typeof SUSPENDED_FILTERS)[number];

export interface OrganisationFilters {
  q: string | null;
  /** effective plan id (an organization without a subscription row is on `starter`) */
  plan: string | null;
  status: SubscriptionStatus | null;
  suspended: SuspendedFilter;
  sort: OrgSort;
  dir: "asc" | "desc";
  page: number;
}

const DEFAULT_SORT_DIR: Record<OrgSort, "asc" | "desc"> = { created: "desc", name: "asc", activity: "desc", events: "desc", health: "asc", members: "desc", sites: "desc" };
const PLAN_ID = /^[a-z][a-z0-9_-]{0,39}$/;

/** URL → filters; anything invalid falls back to the default (never an error page for a bad link). */
export function parseOrganisationFilters(q: Record<string, string | string[] | undefined>): OrganisationFilters {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const search = one(q.q).trim().slice(0, 64);
  const plan = one(q.plan).trim();
  const status = one(q.status).trim();
  const suspended = one(q.suspended);
  const sort = one(q.sort);
  const dir = one(q.dir);
  const page = Number.parseInt(one(q.page), 10);
  const sortKey: OrgSort = (ORG_SORTS as readonly string[]).includes(sort) ? (sort as OrgSort) : "created";
  return {
    q: search.length ? search : null,
    plan: PLAN_ID.test(plan) ? plan : null,
    status: (SUBSCRIPTION_STATUSES as readonly string[]).includes(status) ? (status as SubscriptionStatus) : null,
    suspended: (SUSPENDED_FILTERS as readonly string[]).includes(suspended) ? (suspended as SuspendedFilter) : "all",
    sort: sortKey,
    dir: dir === "asc" || dir === "desc" ? dir : DEFAULT_SORT_DIR[sortKey],
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, 10_000) : 1,
  };
}

/** Filters → query string (page links and the CSV export keep every other filter). */
export function organisationQueryString(filters: OrganisationFilters, page: number = filters.page): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.plan) params.set("plan", filters.plan);
  if (filters.status) params.set("status", filters.status);
  if (filters.suspended !== "all") params.set("suspended", filters.suspended);
  if (filters.sort !== "created") params.set("sort", filters.sort);
  if (filters.dir !== DEFAULT_SORT_DIR[filters.sort]) params.set("dir", filters.dir);
  if (page > 1) params.set("page", String(page));
  const s = params.toString();
  return s ? `?${s}` : "";
}

export function isFiltered(filters: OrganisationFilters): boolean {
  return Boolean(filters.q || filters.plan || filters.status || filters.suspended !== "all");
}

// ---------------------------------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------------------------------

export type HealthTone = "ok" | "warn" | "bad" | "neutral";

/** Site health score → tone, same thresholds as the Command Center status strip (≥ 80 ok, ≥ 50 warn). */
export function healthTone(score: number | null): HealthTone {
  if (score == null) return "neutral";
  return score >= 80 ? "ok" : score >= 50 ? "warn" : "bad";
}

export type SnapshotFreshness = "fresh" | "stale" | "missing";

export function snapshotFreshness(computedAt: Date | string | null, now: Date, staleAfterMs = SNAPSHOT_STALE_AFTER_MS): SnapshotFreshness {
  if (!computedAt) return "missing";
  const at = computedAt instanceof Date ? computedAt : new Date(computedAt);
  if (Number.isNaN(at.getTime())) return "missing";
  return now.getTime() - at.getTime() > staleAfterMs ? "stale" : "fresh";
}

export type SnippetState = "verified" | "pending" | "none";

/**
 * Snippet verification of one environment: `verified` once browser events were received (the snippet
 * ran on the customer's site), `pending` while a configuration is published but no browser event has
 * arrived, `none` without a published configuration.
 */
export function snippetState(input: { lastBrowserEventAt: Date | string | null; activeVersion: number | null }): SnippetState {
  if (input.lastBrowserEventAt) return "verified";
  return input.activeVersion != null ? "pending" : "none";
}

export interface UsageThresholdView {
  pct: UsageWarningThreshold;
  events: number;
  reached: boolean;
  warnedAt: string | null;
}

/** 70 / 90 / 100 % of the period limit against the billable count; null when the plan has no fixed cap. */
export function usageThresholds(limit: number | null, billable: number, warned: Record<UsageWarningThreshold, Date | null>): UsageThresholdView[] | null {
  if (limit == null || limit <= 0) return null;
  return USAGE_WARNING_THRESHOLDS.map((pct) => {
    const events = Math.ceil((limit * pct) / 100);
    return { pct, events, reached: billable >= events, warnedAt: warned[pct] ? warned[pct]!.toISOString() : null };
  });
}

/** Billable events from which the `pause` policy stops processing (limit × (1 + grace)); null without a cap or under `allow`. */
export function pauseAtEvents(limit: number | null, policy: OveragePolicy): number | null {
  if (limit == null || limit <= 0 || policy === "allow") return null;
  return Math.ceil(limit * (1 + USAGE_PAUSE_GRACE_PERCENT / 100));
}

export type OpsAuditActorKind = AuditActorView["kind"] | "platform";

export interface OpsAuditActorView {
  kind: OpsAuditActorKind;
  userId: string | null;
  name: string | null;
  role: string | null;
  detail: string | null;
}

/**
 * Actor label of an audit entry in the console: platform operators (actor kind `platform`) are named
 * from the user table by id — their e-mail in the stored actor is redacted — and every other kind
 * goes through the Team module's `auditActorView`.
 */
export function opsActorView(actor: Record<string, unknown> | null, names: Map<string, string>): OpsAuditActorView {
  if (actor?.kind === "platform") {
    const userId = typeof actor.userId === "string" ? actor.userId : null;
    return { kind: "platform", userId, name: userId ? (names.get(userId) ?? null) : null, role: typeof actor.platformRole === "string" ? actor.platformRole : null, detail: null };
  }
  return auditActorView(actor, names);
}

/** `flattenDiff({})` yields one `{}` row; an empty diff or metadata object is shown as "no details" instead. */
export function withoutEmptyObjectRow(rows: AuditDiffRow[]): AuditDiffRow[] {
  return rows.length === 1 && rows[0]!.path === "" && rows[0]!.value === "{}" ? [] : rows;
}

/** User ids referenced by audit actors (users, agents on behalf of a user, platform operators), for one name lookup. */
export function actorUserIds(actors: ReadonlyArray<Record<string, unknown> | null>): string[] {
  const ids = new Set<string>();
  for (const actor of actors) {
    for (const key of ["userId", "onBehalfOfUserId"]) {
      const value = actor?.[key];
      if (typeof value === "string" && UUID.test(value)) ids.add(value);
    }
  }
  return [...ids];
}

// ---------------------------------------------------------------------------------------------------
// CSV export (metadata only)
// ---------------------------------------------------------------------------------------------------

export const CSV_COLUMNS = ["id", "name", "slug", "created_at", "plan", "subscription_status", "suspended_at", "members", "sites", "accepted_events_30d", "last_activity_at", "health_score"] as const;

/** RFC 4180 cell: quoted when needed; a leading formula character is neutralised so spreadsheets never execute it. */
export function csvCell(value: string | number | null | undefined): string {
  if (value == null) return "";
  let text = typeof value === "number" ? String(value) : value;
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function organisationsCsv(rows: readonly OrganisationRow[]): string {
  const lines = [CSV_COLUMNS.join(",")];
  for (const r of rows) {
    lines.push([r.id, r.name, r.slug, r.createdAt, r.planId, r.subscriptionStatus, r.suspendedAt, r.members, r.sites, r.events30d, r.lastActivityAt, r.healthScore].map(csvCell).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}

// ---------------------------------------------------------------------------------------------------
// Directory
// ---------------------------------------------------------------------------------------------------

export interface OrganisationRow {
  id: string;
  name: string;
  slug: string;
  /** ISO */
  createdAt: string;
  suspendedAt: string | null;
  planId: string;
  planName: string;
  subscriptionStatus: string;
  members: number;
  sites: number;
  /** accepted events of the last DIRECTORY_EVENT_DAYS days (hourly aggregates) */
  events30d: number;
  /** newest event aggregate bucket or audit entry inside ACTIVITY_WINDOW_DAYS; null = nothing in that window */
  lastActivityAt: string | null;
  /** rounded average of the latest site health snapshot per active site; null = no snapshot */
  healthScore: number | null;
  healthSites: number;
}

export interface PlanOption {
  id: string;
  name: string;
  isPublic: boolean;
}

export interface OrganisationDirectoryPage {
  rows: OrganisationRow[];
  total: number;
  suspended: number;
  page: number;
  pageCount: number;
  pageSize: number;
  plans: PlanOption[];
  generatedAt: string;
}

const iso = (value: Date | string | null | undefined): string | null => (value == null ? null : value instanceof Date ? value.toISOString() : new Date(value).toISOString());
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

function directoryWhere(filters: OrganisationFilters): SQL | undefined {
  const where: SQL[] = [];
  const effectivePlan = sql`coalesce(${subscriptions.planId}, 'starter')`;
  const effectiveStatus = sql`coalesce(${subscriptions.status}::text, 'none')`;
  if (filters.q) {
    const pattern = `%${escapeLike(filters.q)}%`;
    where.push(or(ilike(organization.name, pattern), ilike(organization.slug, pattern), sql`${organization.id}::text ilike ${pattern}`)!);
  }
  if (filters.plan) where.push(sql`${effectivePlan} = ${filters.plan}`);
  if (filters.status) where.push(sql`${effectiveStatus} = ${filters.status}`);
  if (filters.suspended === "yes") where.push(isNotNull(organization.suspendedAt));
  if (filters.suspended === "no") where.push(isNull(organization.suspendedAt));
  return where.length ? and(...where) : undefined;
}

async function directoryRows(tx: Tx, filters: OrganisationFilters, now: Date, window: { limit: number; offset: number }, planNames: Map<string, string>): Promise<OrganisationRow[]> {
  const eventsSince = new Date(now.getTime() - DIRECTORY_EVENT_DAYS * DAY_MS);
  const activitySince = new Date(now.getTime() - ACTIVITY_WINDOW_DAYS * DAY_MS);
  // CTE columns are referenced by their bare alias in the outer query, so every alias is unique across the CTEs
  const members = tx.$with("m").as(tx.select({ orgId: member.organizationId, n: count().as("members_n") }).from(member).groupBy(member.organizationId));
  const siteCounts = tx.$with("s").as(
    tx
      .select({ orgId: sites.organizationId, n: count().as("sites_n") })
      .from(sites)
      .where(isNull(sites.deletedAt))
      .groupBy(sites.organizationId),
  );
  const events = tx.$with("e").as(
    tx
      .select({
        orgId: eventAggregates.organizationId,
        accepted: sql<string>`sum(${eventAggregates.accepted}) filter (where ${eventAggregates.bucketStart} >= ${eventsSince})`.as("events_accepted"),
        lastAt: max(eventAggregates.bucketStart).as("events_last_at"),
      })
      .from(eventAggregates)
      .where(gte(eventAggregates.bucketStart, activitySince))
      .groupBy(eventAggregates.organizationId),
  );
  const audits = tx.$with("a").as(
    tx
      .select({ orgId: auditLog.organizationId, lastAt: max(auditLog.createdAt).as("audit_last_at") })
      .from(auditLog)
      .where(and(isNotNull(auditLog.organizationId), gte(auditLog.createdAt, activitySince)))
      .groupBy(auditLog.organizationId),
  );
  const latestHealth = tx.$with("h0").as(
    tx
      .selectDistinctOn([siteHealthSnapshots.siteId], { orgId: siteHealthSnapshots.organizationId, siteId: siteHealthSnapshots.siteId, score: siteHealthSnapshots.score })
      .from(siteHealthSnapshots)
      .innerJoin(sites, and(eq(sites.id, siteHealthSnapshots.siteId), isNull(sites.deletedAt)))
      .orderBy(siteHealthSnapshots.siteId, desc(siteHealthSnapshots.computedAt)),
  );
  const health = tx.$with("h").as(
    tx
      .select({ orgId: latestHealth.orgId, avg: sql<number>`round(avg(${latestHealth.score}))::int`.as("health_avg"), n: count().as("health_n") })
      .from(latestHealth)
      .groupBy(latestHealth.orgId),
  );
  const lastActivity = sql`greatest(${events.lastAt}, ${audits.lastAt})`;
  const sortExpr: Record<OrgSort, SQL> = {
    created: sql`${organization.createdAt}`,
    name: sql`lower(${organization.name})`,
    activity: lastActivity,
    events: sql`coalesce(${events.accepted}, 0)`,
    health: sql`${health.avg}`,
    members: sql`coalesce(${members.n}, 0)`,
    sites: sql`coalesce(${siteCounts.n}, 0)`,
  };
  const direction = filters.dir === "asc" ? sql`asc nulls last` : sql`desc nulls last`;
  const rows = await tx
    .with(members, siteCounts, events, audits, latestHealth, health)
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      createdAt: organization.createdAt,
      suspendedAt: organization.suspendedAt,
      planId: sql<string>`coalesce(${subscriptions.planId}, 'starter')`,
      subscriptionStatus: sql<string>`coalesce(${subscriptions.status}::text, 'none')`,
      members: sql<number>`coalesce(${members.n}, 0)::int`.mapWith(Number),
      sites: sql<number>`coalesce(${siteCounts.n}, 0)::int`.mapWith(Number),
      events30d: sql<number>`coalesce(${events.accepted}, 0)::bigint`.mapWith(Number),
      lastActivityAt: sql<Date | string | null>`${lastActivity}`,
      healthScore: sql<number | null>`${health.avg}`,
      healthSites: sql<number>`coalesce(${health.n}, 0)::int`.mapWith(Number),
    })
    .from(organization)
    .leftJoin(subscriptions, eq(subscriptions.organizationId, organization.id))
    .leftJoin(members, eq(members.orgId, organization.id))
    .leftJoin(siteCounts, eq(siteCounts.orgId, organization.id))
    .leftJoin(events, eq(events.orgId, organization.id))
    .leftJoin(audits, eq(audits.orgId, organization.id))
    .leftJoin(health, eq(health.orgId, organization.id))
    .where(directoryWhere(filters))
    .orderBy(sql`${sortExpr[filters.sort]} ${direction}`, asc(organization.name), asc(organization.id))
    .limit(window.limit)
    .offset(window.offset);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    createdAt: r.createdAt.toISOString(),
    suspendedAt: iso(r.suspendedAt),
    planId: r.planId,
    planName: planNames.get(r.planId) ?? r.planId,
    subscriptionStatus: r.subscriptionStatus,
    members: r.members,
    sites: r.sites,
    events30d: r.events30d,
    lastActivityAt: iso(r.lastActivityAt),
    healthScore: r.healthScore == null ? null : Number(r.healthScore),
    healthSites: r.healthSites,
  }));
}

async function planOptions(tx: Tx): Promise<PlanOption[]> {
  const rows = await tx.select({ id: plans.id, name: plans.name, isPublic: plans.isPublic }).from(plans).orderBy(plans.sortOrder, plans.id);
  return rows.map((p) => ({ id: p.id, name: p.name, isPublic: p.isPublic }));
}

async function directoryCount(tx: Tx, filters: OrganisationFilters): Promise<{ total: number; suspended: number }> {
  const [row] = await tx
    .select({ total: count(), suspended: sql<number>`count(*) filter (where ${organization.suspendedAt} is not null)`.mapWith(Number) })
    .from(organization)
    .leftJoin(subscriptions, eq(subscriptions.organizationId, organization.id))
    .where(directoryWhere(filters));
  return { total: Number(row?.total ?? 0), suspended: Number(row?.suspended ?? 0) };
}

/** One page of the directory; totals are counted, never estimated. */
export async function loadOrganisationDirectory(ctx: PlatformContext, filters: OrganisationFilters, now: Date = new Date()): Promise<OrganisationDirectoryPage> {
  return withPlatform(ctx, async (tx) => {
    // sequential on purpose: a transaction runs on one pg client
    const planList = await planOptions(tx);
    const planNames = new Map(planList.map((p) => [p.id, p.name]));
    const { total, suspended } = await directoryCount(tx, filters);
    const pageCount = Math.max(1, Math.ceil(total / ORG_PAGE_SIZE));
    const page = Math.min(filters.page, pageCount);
    const rows = total ? await directoryRows(tx, filters, now, { limit: ORG_PAGE_SIZE, offset: (page - 1) * ORG_PAGE_SIZE }, planNames) : [];
    return { rows, total, suspended, page, pageCount, pageSize: ORG_PAGE_SIZE, plans: planList, generatedAt: now.toISOString() };
  });
}

/** Rows of the CSV export (same filters, at most EXPORT_MAX_ROWS); the export itself is audited by the route. */
export async function loadOrganisationExport(ctx: PlatformContext, filters: OrganisationFilters, now: Date = new Date()): Promise<{ rows: OrganisationRow[]; total: number; truncated: boolean }> {
  return withPlatform(ctx, async (tx) => {
    const planList = await planOptions(tx);
    const planNames = new Map(planList.map((p) => [p.id, p.name]));
    const { total } = await directoryCount(tx, filters);
    const rows = total ? await directoryRows(tx, filters, now, { limit: EXPORT_MAX_ROWS, offset: 0 }, planNames) : [];
    return { rows, total, truncated: total > rows.length };
  });
}

// ---------------------------------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------------------------------

export interface OrganisationHeader {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  suspendedAt: string | null;
  suspendedReason: string | null;
  /** `organization_settings` (null when the row does not exist yet) */
  settings: { dataRegion: string; killSwitch: boolean; aiEnabled: boolean; maxSites: number | null } | null;
}

export interface MemberView {
  id: string;
  userId: string;
  name: string;
  /** operator-visible metadata (the customer's own team, not end users) */
  email: string;
  role: OrgRole | null;
  rawRole: string;
  twoFactor: boolean;
  platformRole: string;
  joinedAt: string;
}

export interface SubscriptionView {
  planId: string;
  planName: string;
  planLimits: PlanLimits | null;
  status: string;
  interval: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  trialEnd: string | null;
  cancelAt: string | null;
  canceledAt: string | null;
  graceUntil: string | null;
  /** a Stripe customer is linked (the id itself stays in the billing module) */
  stripeLinked: boolean;
  /** no `subscriptions` row: the organization runs on the Starter defaults */
  exists: boolean;
}

export interface UsagePeriodView {
  periodKey: string;
  accepted: number;
  billable: number;
  dropped: number;
  deduplicated: number;
  siteCount: number;
  destinationCount: number;
  limit: number | null;
  thresholds: UsageThresholdView[] | null;
  softLimitHitAt: string | null;
  hardLimitHitAt: string | null;
  updatedAt: string;
}

export interface UsageView {
  /** the calendar month containing `now` */
  currentPeriodKey: string;
  current: UsagePeriodView | null;
  /** older periods, newest first */
  history: UsagePeriodView[];
  policy: OveragePolicy;
  costLimitCents: number | null;
  /** billable events from which the effective policy pauses processing; null = never / no cap */
  pauseAtEvents: number | null;
  gracePercent: number;
  /** plan cap for the period (period stamp, else the plan) */
  limit: number | null;
}

export interface EnvironmentView {
  id: string;
  kind: string;
  name: string;
  isDefault: boolean;
  testMode: boolean;
  activeVersion: number | null;
  publishedAt: string | null;
  lastEventAt: string | null;
  lastBrowserEventAt: string | null;
  events7d: number;
  snippet: SnippetState;
}

export interface SiteView {
  id: string;
  trackingId: string;
  name: string;
  primaryDomain: string | null;
  platform: string;
  status: string;
  killSwitch: boolean;
  createdAt: string;
  domains: { total: number; verified: number };
  healthScore: number | null;
  healthComputedAt: string | null;
  environments: EnvironmentView[];
}

export interface DestinationView {
  id: string;
  name: string;
  connectorType: string;
  siteName: string;
  status: string;
  testMode: boolean;
  pausedAt: string | null;
  health: { status: string; checkedAt: string | null };
  snapshot: {
    freshness: SnapshotFreshness;
    computedAt: string | null;
    windowMinutes: number | null;
    attemptsTotal: number | null;
    attemptsSuccess: number | null;
    attemptsFailed: number | null;
    errorRate: number | null;
    queueReady: number | null;
    queueDead: number | null;
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
    lastErrorClass: string | null;
  };
}

export interface SignalsView {
  issues: { open: number; critical: number; warning: number; info: number; muted: number };
  alerts: {
    open: number;
    critical: number;
    warning: number;
    info: number;
    rules: number;
    rulesEnabled: number;
    channels: number;
    recent: Array<{ id: string; kind: string; severity: string; siteName: string | null; triggeredAt: string; resolvedAt: string | null }>;
  };
}

export interface OpsNoteView {
  id: string;
  body: string;
  pinned: boolean;
  authorUserId: string;
  authorName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FlagView {
  key: string;
  description: string;
  defaultEnabled: boolean;
  override: { enabled: boolean; reason: string | null; actorUserId: string | null; actorName: string | null; updatedAt: string } | null;
  effective: boolean;
}

export interface OpsAuditEntryView {
  id: string;
  action: string;
  category: string;
  targetType: string;
  targetId: string | null;
  actor: OpsAuditActorView;
  diff: AuditDiffRow[];
  diffTruncated: boolean;
  metadata: AuditDiffRow[];
  requestId: string | null;
  createdAt: string;
}

export interface BreakGlassView {
  /** the caller's active grant (page views are audited with its id) */
  own: { id: string; endsAt: string; startsAt: string; reason: string; ticketRef: string | null } | null;
  /** active grants of other operators for this organization */
  othersActive: number;
  /** requests without approval whose window has not ended */
  pending: number;
}

export interface OrganisationDetail {
  generatedAt: string;
  organization: OrganisationHeader;
  members: MemberView[];
  pendingInvitations: number;
  subscription: SubscriptionView;
  usage: UsageView;
  sites: SiteView[];
  destinations: DestinationView[];
  signals: SignalsView;
  notes: OpsNoteView[];
  flags: FlagView[];
  audit: OpsAuditEntryView[];
  breakGlass: BreakGlassView;
}

function periodView(row: typeof usagePeriods.$inferSelect, planLimit: number | null): UsagePeriodView {
  const limit = row.limitEvents ?? planLimit;
  return {
    periodKey: row.periodKey,
    accepted: Number(row.acceptedEvents),
    billable: Number(row.billableEvents),
    dropped: Number(row.droppedEvents),
    deduplicated: Number(row.deduplicatedEvents),
    siteCount: row.siteCount,
    destinationCount: row.destinationCount,
    limit,
    thresholds: usageThresholds(limit, Number(row.billableEvents), { 70: row.warned70At, 90: row.warned90At, 100: row.warned100At }),
    softLimitHitAt: iso(row.softLimitHitAt),
    hardLimitHitAt: iso(row.hardLimitHitAt),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Everything the detail page shows for one organization, or null when it does not exist. Under an
 * active break-glass grant of the caller the view is audited (`platform.organization.view`) — the
 * data itself is the same metadata either way.
 */
export async function loadOrganisationDetail(ctx: PlatformContext, organizationId: string, now: Date = new Date()): Promise<OrganisationDetail | null> {
  if (!isUuid(organizationId)) return null;
  const detail = await withPlatform(ctx, async (tx): Promise<OrganisationDetail | null> => {
    const [head] = await tx
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        createdAt: organization.createdAt,
        suspendedAt: organization.suspendedAt,
        suspendedReason: organization.suspendedReason,
        dataRegion: orgSettings.dataRegion,
        killSwitch: orgSettings.killSwitch,
        aiEnabled: orgSettings.aiEnabled,
        maxSites: orgSettings.maxSites,
        overagePolicy: orgSettings.usageOveragePolicy,
        costLimitCents: orgSettings.usageCostLimitCents,
        settingsExist: sql<boolean>`${orgSettings.organizationId} is not null`,
        subId: subscriptions.id,
        planId: subscriptions.planId,
        subStatus: subscriptions.status,
        interval: subscriptions.interval,
        currentPeriodStart: subscriptions.currentPeriodStart,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
        trialEnd: subscriptions.trialEnd,
        cancelAt: subscriptions.cancelAt,
        canceledAt: subscriptions.canceledAt,
        graceUntil: subscriptions.graceUntil,
        stripeCustomerId: subscriptions.stripeCustomerId,
      })
      .from(organization)
      .leftJoin(orgSettings, eq(orgSettings.organizationId, organization.id))
      .leftJoin(subscriptions, eq(subscriptions.organizationId, organization.id))
      .where(eq(organization.id, organizationId))
      .limit(1);
    if (!head) return null;

    const effectivePlanId = head.planId ?? "starter";
    const [plan] = await tx.select({ id: plans.id, name: plans.name, limits: plans.limits }).from(plans).where(eq(plans.id, effectivePlanId)).limit(1);
    const planLimit = plan?.limits.eventsPerMonth ?? null;

    const memberRows = await tx
      .select({ id: member.id, userId: member.userId, role: member.role, joinedAt: member.createdAt, name: user.name, email: user.email, twoFactor: user.twoFactorEnabled, platformRole: user.platformRole })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(member.organizationId, organizationId))
      .orderBy(member.createdAt);
    const [invites] = await tx
      .select({ n: count() })
      .from(invitation)
      .where(and(eq(invitation.organizationId, organizationId), eq(invitation.status, "pending"), gte(invitation.expiresAt, now)));

    const periodRows = await tx
      .select()
      .from(usagePeriods)
      .where(eq(usagePeriods.organizationId, organizationId))
      .orderBy(desc(usagePeriods.periodKey))
      .limit(6);

    const siteRows = await tx
      .select({ id: sites.id, trackingId: sites.trackingId, name: sites.name, primaryDomain: sites.primaryDomain, platform: sites.platform, status: sites.status, killSwitch: sites.killSwitch, createdAt: sites.createdAt })
      .from(sites)
      .where(and(eq(sites.organizationId, organizationId), isNull(sites.deletedAt)))
      .orderBy(sites.createdAt);
    const siteIds = siteRows.map((s) => s.id);
    const domainRows = siteIds.length
      ? await tx
          .select({ siteId: domains.siteId, total: count(), verified: sql<number>`count(*) filter (where ${domains.verifiedAt} is not null)`.mapWith(Number) })
          .from(domains)
          .where(inArray(domains.siteId, siteIds))
          .groupBy(domains.siteId)
      : [];
    const healthRows = siteIds.length
      ? await tx
          .selectDistinctOn([siteHealthSnapshots.siteId], { siteId: siteHealthSnapshots.siteId, score: siteHealthSnapshots.score, computedAt: siteHealthSnapshots.computedAt })
          .from(siteHealthSnapshots)
          .where(inArray(siteHealthSnapshots.siteId, siteIds))
          .orderBy(siteHealthSnapshots.siteId, desc(siteHealthSnapshots.computedAt))
      : [];
    const envRows = siteIds.length
      ? await tx
          .select({ id: environments.id, siteId: environments.siteId, kind: environments.kind, name: environments.name, isDefault: environments.isDefault, testMode: environments.testMode })
          .from(environments)
          .where(inArray(environments.siteId, siteIds))
          .orderBy(environments.siteId, environments.kind)
      : [];
    const envIds = envRows.map((e) => e.id);
    const activeVersions = envIds.length
      ? await tx
          .select({ environmentId: configPublications.environmentId, version: configVersions.version, publishedAt: configPublications.publishedAt })
          .from(configPublications)
          .innerJoin(configVersions, eq(configVersions.id, configPublications.versionId))
          .where(and(inArray(configPublications.environmentId, envIds), eq(configPublications.isActive, true)))
      : [];
    const activitySince = new Date(now.getTime() - ACTIVITY_WINDOW_DAYS * DAY_MS);
    const eventsSince = new Date(now.getTime() - ENVIRONMENT_EVENT_DAYS * DAY_MS);
    const envStats = envIds.length
      ? await tx
          .select({
            environmentId: eventAggregates.environmentId,
            lastAt: max(eventAggregates.bucketStart),
            lastBrowserAt: sql<Date | string | null>`max(${eventAggregates.bucketStart}) filter (where ${eventAggregates.source} = 'browser')`,
            accepted7d: sql<number>`coalesce(sum(${eventAggregates.accepted}) filter (where ${eventAggregates.bucketStart} >= ${eventsSince}), 0)::bigint`.mapWith(Number),
          })
          .from(eventAggregates)
          .where(and(eq(eventAggregates.organizationId, organizationId), inArray(eventAggregates.environmentId, envIds), gte(eventAggregates.bucketStart, activitySince)))
          .groupBy(eventAggregates.environmentId)
      : [];

    const integrationRows = await tx
      .select({ id: integrations.id, name: integrations.name, connectorType: integrations.connectorType, status: integrations.status, testMode: integrations.testMode, pausedAt: integrations.pausedAt, health: integrations.health, siteName: sites.name, createdAt: integrations.createdAt })
      .from(integrations)
      .innerJoin(sites, eq(sites.id, integrations.siteId))
      .where(eq(integrations.organizationId, organizationId))
      .orderBy(sites.name, integrations.name);
    const integrationIds = integrationRows.map((i) => i.id);
    const snapshotRows = integrationIds.length ? await tx.select().from(destinationHealthSnapshots).where(inArray(destinationHealthSnapshots.integrationId, integrationIds)) : [];

    const issueRows = await tx
      .select({ severity: dataQualityIssues.severity, status: dataQualityIssues.status, n: count() })
      .from(dataQualityIssues)
      .where(eq(dataQualityIssues.organizationId, organizationId))
      .groupBy(dataQualityIssues.severity, dataQualityIssues.status);
    const openAlertRows = await tx
      .select({ severity: alertEvents.severity, n: count() })
      .from(alertEvents)
      .where(and(eq(alertEvents.organizationId, organizationId), isNull(alertEvents.resolvedAt)))
      .groupBy(alertEvents.severity);
    const recentAlerts = await tx
      .select({ id: alertEvents.id, kind: alertEvents.kind, severity: alertEvents.severity, siteName: sites.name, triggeredAt: alertEvents.triggeredAt, resolvedAt: alertEvents.resolvedAt })
      .from(alertEvents)
      .leftJoin(sites, eq(sites.id, alertEvents.siteId))
      .where(eq(alertEvents.organizationId, organizationId))
      .orderBy(desc(alertEvents.triggeredAt))
      .limit(DETAIL_ALERTS_LIMIT);
    const [ruleCounts] = await tx
      .select({ total: count(), enabled: sql<number>`count(*) filter (where ${alertRules.enabled})`.mapWith(Number) })
      .from(alertRules)
      .where(eq(alertRules.organizationId, organizationId));
    const [channelCounts] = await tx.select({ total: count() }).from(alertChannels).where(eq(alertChannels.organizationId, organizationId));

    const noteRows = await tx
      .select({ id: opsNotes.id, body: opsNotes.body, pinned: opsNotes.pinned, authorUserId: opsNotes.authorUserId, authorName: user.name, createdAt: opsNotes.createdAt, updatedAt: opsNotes.updatedAt })
      .from(opsNotes)
      .leftJoin(user, eq(user.id, opsNotes.authorUserId))
      .where(eq(opsNotes.organizationId, organizationId))
      .orderBy(desc(opsNotes.pinned), desc(opsNotes.createdAt))
      .limit(DETAIL_NOTES_LIMIT);

    const flagRows = await tx.select({ key: featureFlags.key, description: featureFlags.description, defaultEnabled: featureFlags.defaultEnabled }).from(featureFlags).orderBy(featureFlags.key);
    const overrideRows = await tx
      .select({ key: featureFlagOverrides.key, enabled: featureFlagOverrides.enabled, reason: featureFlagOverrides.reason, actorUserId: featureFlagOverrides.actorUserId, actorName: user.name, updatedAt: featureFlagOverrides.updatedAt })
      .from(featureFlagOverrides)
      .leftJoin(user, eq(user.id, featureFlagOverrides.actorUserId))
      .where(eq(featureFlagOverrides.organizationId, organizationId));

    const auditRows = await tx
      .select()
      .from(auditLog)
      .where(eq(auditLog.organizationId, organizationId))
      .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
      .limit(DETAIL_AUDIT_LIMIT);
    const names = new Map(memberRows.map((m) => [m.userId, m.name]));
    const missingIds = actorUserIds(auditRows.map((r) => r.actor ?? null)).filter((id) => !names.has(id));
    if (missingIds.length) {
      const extra = await tx.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, missingIds));
      for (const u of extra) names.set(u.id, u.name);
    }

    const own = await activeBreakGlass(ctx, organizationId, tx);
    const [grants] = await tx
      .select({
        othersActive: sql<number>`count(*) filter (where ${breakGlassAccess.approvedAt} is not null and ${breakGlassAccess.revokedAt} is null and ${breakGlassAccess.startsAt} <= now() and ${breakGlassAccess.endsAt} > now() and ${breakGlassAccess.platformUserId} <> ${ctx.user.id})`.mapWith(Number),
        pending: sql<number>`count(*) filter (where ${breakGlassAccess.approvedAt} is null and ${breakGlassAccess.revokedAt} is null and ${breakGlassAccess.endsAt} > now())`.mapWith(Number),
      })
      .from(breakGlassAccess)
      .where(eq(breakGlassAccess.organizationId, organizationId));

    // -- assemble ---------------------------------------------------------------------------------
    const domainBy = new Map(domainRows.map((d) => [d.siteId, d]));
    const healthBy = new Map(healthRows.map((h) => [h.siteId, h]));
    const versionBy = new Map(activeVersions.map((v) => [v.environmentId, v]));
    const statsBy = new Map(envStats.map((s) => [s.environmentId, s]));
    const envsBySite = new Map<string, EnvironmentView[]>();
    for (const e of envRows) {
      const version = versionBy.get(e.id) ?? null;
      const stats = statsBy.get(e.id) ?? null;
      const view: EnvironmentView = {
        id: e.id,
        kind: e.kind,
        name: e.name,
        isDefault: e.isDefault,
        testMode: e.testMode,
        activeVersion: version?.version ?? null,
        publishedAt: iso(version?.publishedAt ?? null),
        lastEventAt: iso(stats?.lastAt ?? null),
        lastBrowserEventAt: iso(stats?.lastBrowserAt ?? null),
        events7d: stats?.accepted7d ?? 0,
        snippet: snippetState({ lastBrowserEventAt: stats?.lastBrowserAt ?? null, activeVersion: version?.version ?? null }),
      };
      const list = envsBySite.get(e.siteId);
      if (list) list.push(view);
      else envsBySite.set(e.siteId, [view]);
    }
    const siteViews: SiteView[] = siteRows.map((s) => {
      const d = domainBy.get(s.id);
      const h = healthBy.get(s.id);
      return {
        id: s.id,
        trackingId: s.trackingId,
        name: s.name,
        primaryDomain: s.primaryDomain,
        platform: s.platform,
        status: s.status,
        killSwitch: s.killSwitch,
        createdAt: s.createdAt.toISOString(),
        domains: { total: Number(d?.total ?? 0), verified: Number(d?.verified ?? 0) },
        healthScore: h?.score ?? null,
        healthComputedAt: iso(h?.computedAt ?? null),
        environments: envsBySite.get(s.id) ?? [],
      };
    });

    const snapshotBy = new Map(snapshotRows.map((s) => [s.integrationId, s]));
    const destinationViews: DestinationView[] = integrationRows.map((i) => {
      const snap = snapshotBy.get(i.id) ?? null;
      return {
        id: i.id,
        name: i.name,
        connectorType: i.connectorType,
        siteName: i.siteName,
        status: i.status,
        testMode: i.testMode,
        pausedAt: iso(i.pausedAt),
        health: { status: typeof i.health?.status === "string" ? i.health.status : "unknown", checkedAt: i.health?.checkedAt ?? null },
        snapshot: {
          freshness: snapshotFreshness(snap?.computedAt ?? null, now),
          computedAt: iso(snap?.computedAt ?? null),
          windowMinutes: snap?.windowMinutes ?? null,
          attemptsTotal: snap?.attemptsTotal ?? null,
          attemptsSuccess: snap?.attemptsSuccess ?? null,
          attemptsFailed: snap?.attemptsFailed ?? null,
          errorRate: snap?.errorRate ?? null,
          queueReady: snap?.queueReady ?? null,
          queueDead: snap?.queueDead ?? null,
          lastSuccessAt: iso(snap?.lastSuccessAt ?? null),
          lastFailureAt: iso(snap?.lastFailureAt ?? null),
          lastErrorClass: snap?.lastErrorClass ?? null,
        },
      };
    });

    const issueCount = (pred: (r: (typeof issueRows)[number]) => boolean) => issueRows.filter(pred).reduce((a, r) => a + Number(r.n), 0);
    const isOpen = (status: string) => status === "open" || status === "acknowledged";
    const alertCount = (severity: string) => openAlertRows.filter((r) => r.severity === severity).reduce((a, r) => a + Number(r.n), 0);
    const signals: SignalsView = {
      issues: {
        open: issueCount((r) => isOpen(r.status)),
        critical: issueCount((r) => isOpen(r.status) && r.severity === "critical"),
        warning: issueCount((r) => isOpen(r.status) && r.severity === "warning"),
        info: issueCount((r) => isOpen(r.status) && r.severity === "info"),
        muted: issueCount((r) => r.status === "muted" || r.status === "ignored"),
      },
      alerts: {
        open: openAlertRows.reduce((a, r) => a + Number(r.n), 0),
        critical: alertCount("critical"),
        warning: alertCount("warning"),
        info: alertCount("info"),
        rules: Number(ruleCounts?.total ?? 0),
        rulesEnabled: Number(ruleCounts?.enabled ?? 0),
        channels: Number(channelCounts?.total ?? 0),
        recent: recentAlerts.map((a) => ({ id: a.id, kind: a.kind, severity: a.severity, siteName: a.siteName ?? null, triggeredAt: a.triggeredAt.toISOString(), resolvedAt: iso(a.resolvedAt) })),
      },
    };

    const overrideBy = new Map(overrideRows.map((o) => [o.key, o]));
    const flags: FlagView[] = flagRows.map((f) => {
      const o = overrideBy.get(f.key) ?? null;
      return {
        key: f.key,
        description: f.description,
        defaultEnabled: f.defaultEnabled,
        override: o ? { enabled: o.enabled, reason: o.reason, actorUserId: o.actorUserId, actorName: o.actorName ?? null, updatedAt: o.updatedAt.toISOString() } : null,
        effective: o ? o.enabled : f.defaultEnabled,
      };
    });

    const policy: OveragePolicy = isOveragePolicy(head.overagePolicy) ? head.overagePolicy : DEFAULT_OVERAGE_POLICY;
    const currentPeriodKey = usagePeriodKey(now);
    const periods = periodRows.map((r) => periodView(r, planLimit));
    const current = periods.find((p) => p.periodKey === currentPeriodKey) ?? null;
    const usage: UsageView = {
      currentPeriodKey,
      current,
      history: periods.filter((p) => p.periodKey !== currentPeriodKey),
      policy,
      costLimitCents: head.costLimitCents ?? null,
      pauseAtEvents: pauseAtEvents(current?.limit ?? planLimit, policy),
      gracePercent: USAGE_PAUSE_GRACE_PERCENT,
      limit: current?.limit ?? planLimit,
    };

    return {
      generatedAt: now.toISOString(),
      organization: {
        id: head.id,
        name: head.name,
        slug: head.slug,
        createdAt: head.createdAt.toISOString(),
        suspendedAt: iso(head.suspendedAt),
        suspendedReason: head.suspendedReason ?? null,
        settings: head.settingsExist ? { dataRegion: head.dataRegion ?? "eu", killSwitch: Boolean(head.killSwitch), aiEnabled: Boolean(head.aiEnabled), maxSites: head.maxSites ?? null } : null,
      },
      members: memberRows.map((m) => ({
        id: m.id,
        userId: m.userId,
        name: m.name,
        email: m.email,
        role: isOrgRole(m.role) ? m.role : null,
        rawRole: m.role,
        twoFactor: Boolean(m.twoFactor),
        platformRole: m.platformRole,
        joinedAt: m.joinedAt.toISOString(),
      })),
      pendingInvitations: Number(invites?.n ?? 0),
      subscription: {
        planId: effectivePlanId,
        planName: plan?.name ?? effectivePlanId,
        planLimits: plan?.limits ?? null,
        status: head.subStatus ?? "none",
        interval: head.interval ?? null,
        currentPeriodStart: iso(head.currentPeriodStart),
        currentPeriodEnd: iso(head.currentPeriodEnd),
        trialEnd: iso(head.trialEnd),
        cancelAt: iso(head.cancelAt),
        canceledAt: iso(head.canceledAt),
        graceUntil: iso(head.graceUntil),
        stripeLinked: Boolean(head.stripeCustomerId),
        exists: Boolean(head.subId),
      },
      usage,
      sites: siteViews,
      destinations: destinationViews,
      signals,
      notes: noteRows.map((n) => ({ id: n.id, body: n.body, pinned: n.pinned, authorUserId: n.authorUserId, authorName: n.authorName ?? null, createdAt: n.createdAt.toISOString(), updatedAt: n.updatedAt.toISOString() })),
      flags,
      audit: auditRows.map((r): OpsAuditEntryView => {
        const diff = flattenDiff(r.diff);
        const metadata = flattenDiff(r.metadata);
        return {
          id: r.id,
          action: r.action,
          category: auditCategory(r.action),
          targetType: r.targetType,
          targetId: r.targetId ?? null,
          actor: opsActorView(r.actor ?? null, names),
          diff: withoutEmptyObjectRow(diff.rows),
          diffTruncated: diff.truncated,
          metadata: withoutEmptyObjectRow(metadata.rows),
          requestId: r.requestId ?? null,
          createdAt: r.createdAt.toISOString(),
        };
      }),
      breakGlass: {
        own: own ? { id: own.id, startsAt: own.startsAt.toISOString(), endsAt: own.endsAt.toISOString(), reason: own.reason, ticketRef: own.ticketRef } : null,
        othersActive: Number(grants?.othersActive ?? 0),
        pending: Number(grants?.pending ?? 0),
      },
    };
  });
  if (detail?.breakGlass.own) await recordBreakGlassView(ctx, organizationId, detail.breakGlass.own.id);
  return detail;
}

/** Audited tenant-detail page view under an active grant (docs/17 §4: every view carries the grant id). */
export async function recordBreakGlassView(ctx: PlatformContext, organizationId: string, breakGlassId: string): Promise<void> {
  await auditPlatform(ctx, { action: "platform.organization.view", organizationId, targetType: "organization", targetId: organizationId, metadata: { breakGlassId, module: "organisations" } });
}

/** Name + suspension state of one organization for the actions (null when unknown). */
export async function getOrganisationState(ctx: PlatformContext, organizationId: string, tx?: Tx): Promise<{ id: string; name: string; slug: string; suspendedAt: Date | null; suspendedReason: string | null } | null> {
  if (!isUuid(organizationId)) return null;
  const query = (t: Tx) =>
    t
      .select({ id: organization.id, name: organization.name, slug: organization.slug, suspendedAt: organization.suspendedAt, suspendedReason: organization.suspendedReason })
      .from(organization)
      .where(eq(organization.id, organizationId))
      .limit(1);
  const rows = tx ? await query(tx) : await withPlatform(ctx, query);
  return rows[0] ?? null;
}
