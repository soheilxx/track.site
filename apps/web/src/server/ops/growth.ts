import "server-only";
import { and, eq, gt, gte, sql } from "drizzle-orm";
import { findPlan, publicPlanOrder } from "@track-site/catalog";
import {
  configPublications,
  domains,
  eventAggregates,
  integrations,
  organization,
  sites,
  subscriptions,
  user,
  type DbOrTx,
} from "@track-site/db";

/**
 * Track Operations → Growth (docs/17, task O7). Read side of the module: sign-ups per day and week
 * (`user` and `organization` rows by `created_at`), the activation funnel of every organisation from
 * the tables that record each milestone, weekly retention cohorts by organisation activity, active
 * organisations, the plan mix and the connectors in use — counts and rates only, never event
 * payloads, members or end-user data.
 *
 * Honesty rules: every stage is measured from a real row (site created, `domains.verified_at`,
 * first hourly aggregate with accepted events, a currently connected destination, a config
 * publication, an active subscription); milestones are independent — an organisation counts at a
 * stage when it reached that milestone, whether or not it passed the earlier ones. Rates are ratios
 * of counts; the reducers never extrapolate, and the views carry the sample size so the page can
 * flag small numbers. Retention rests on the hourly aggregates: cohorts older than the oldest
 * aggregate cannot be measured, so the view reports the aggregate horizon.
 *
 * The loaders take a transaction so the page decides the role (`withPlatform`); the reducers are pure
 * and unit-tested. All calendar math is UTC (days start at 00:00 UTC, weeks on Monday).
 */

// ---------------------------------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------------------------------

export const DAY_MS = 86_400_000;
export const WEEK_MS = 7 * DAY_MS;
/** sign-ups per day cover the last 30 days */
export const DAILY_WINDOW_DAYS = 30;
/** sign-ups per week cover the last 12 ISO weeks including the current one */
export const WEEKLY_WINDOW_WEEKS = 12;
/** the funnel is shown all-time and for organisations created within this many days */
export const FUNNEL_RECENT_DAYS = 90;
/** number of weekly cohorts (newest = the current week) */
export const RETENTION_COHORT_WEEKS = 8;
/** weeks after sign-up per cohort (week 0 = the first seven days) */
export const RETENTION_WEEKS = 8;
export const ACTIVE_WINDOWS_DAYS: readonly number[] = [7, 30];
export const TOP_CONNECTORS_LIMIT = 10;
/** below this many organisations, rates are reported but flagged as not meaningful */
export const SMALL_SAMPLE_ORGANIZATIONS = 20;
/** cohorts with fewer members are flagged in the retention grid */
export const MIN_COHORT_SIZE = 5;

// ---------------------------------------------------------------------------------------------------
// Calendar helpers (UTC)
// ---------------------------------------------------------------------------------------------------

/** `YYYY-MM-DD` of the UTC calendar day. */
export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function startOfDayUtc(date: Date): Date {
  return new Date(Math.floor(date.getTime() / DAY_MS) * DAY_MS);
}

/** Monday 00:00 UTC of the ISO week containing `date`. */
export function weekStartUtc(date: Date): Date {
  const day = startOfDayUtc(date);
  const weekday = (day.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(day.getTime() - weekday * DAY_MS);
}

/** Earliest `created_at` the sign-up loader needs: the oldest weekly bucket or the previous 30-day window, whichever is older. */
export function signupSince(now: Date): Date {
  const weekly = weekStartUtc(now).getTime() - (WEEKLY_WINDOW_WEEKS - 1) * WEEK_MS;
  const daily = startOfDayUtc(now).getTime() - (2 * DAILY_WINDOW_DAYS - 1) * DAY_MS;
  return new Date(Math.min(weekly, daily));
}

/** Monday of the oldest retention cohort. */
export function cohortSince(now: Date): Date {
  return new Date(weekStartUtc(now).getTime() - (RETENTION_COHORT_WEEKS - 1) * WEEK_MS);
}

// ---------------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------------

/** Sign-ups of one UTC day (sparse in the snapshot, gap-filled in the view). */
export interface SignupDay {
  day: string;
  users: number;
  organizations: number;
}

export interface SignupWeek {
  /** Monday, `YYYY-MM-DD` */
  weekStart: string;
  users: number;
  organizations: number;
  /** the current week has not ended yet */
  partial: boolean;
}

export interface SignupWindow {
  days: number;
  users: number;
  organizations: number;
}

export interface SignupsView {
  daily: SignupDay[];
  weekly: SignupWeek[];
  last7: SignupWindow;
  last30: SignupWindow;
  /** the 30 days before `last30` (for the change hint) */
  previous30: SignupWindow;
  /** any sign-up in the daily or weekly window */
  any: boolean;
}

export const FUNNEL_STAGES = ["created", "site", "verified", "event", "destination", "published", "paying"] as const;
export type FunnelStageKey = (typeof FUNNEL_STAGES)[number];

/** Milestone timestamps of one organisation (null = not reached). Only ids and instants — no names. */
export interface OrgMilestones {
  organizationId: string;
  createdAt: Date;
  firstSiteAt: Date | null;
  verifiedAt: Date | null;
  firstEventAt: Date | null;
  firstDestinationAt: Date | null;
  firstPublishedAt: Date | null;
  payingAt: Date | null;
}

export interface FunnelStageCount {
  count: number;
  /** share of the previous stage (null when the previous stage is empty) */
  stepRate: number | null;
  /** share of the first stage */
  totalRate: number | null;
}

export interface FunnelStage extends FunnelStageCount {
  key: FunnelStageKey;
  /** median days from organisation creation to the milestone (null when nobody reached it) */
  medianDays: number | null;
  /** organisations created within `FunnelView.recentDays` */
  recent: FunnelStageCount;
}

export interface FunnelView {
  stages: FunnelStage[];
  organizations: number;
  recentOrganizations: number;
  recentDays: number;
}

export type RetentionCellState = "complete" | "partial" | "pending";

export interface RetentionCell {
  /** weeks after sign-up (0 = the first seven days) */
  week: number;
  active: number;
  /** active / cohort size; null for an empty cohort or a pending cell */
  rate: number | null;
  /** complete: every member's week has elapsed; partial: some members are still inside it; pending: not started */
  state: RetentionCellState;
}

export interface RetentionCohort {
  weekStart: string;
  size: number;
  cells: RetentionCell[];
  /** fewer than `MIN_COHORT_SIZE` members */
  small: boolean;
}

export interface RetentionView {
  cohorts: RetentionCohort[];
  weeks: number;
  /** at least one organisation in the cohort window */
  measured: boolean;
  /** oldest hourly aggregate on record (null = no aggregates at all) */
  aggregatesSince: string | null;
}

export interface ActiveWindow {
  days: number;
  organizations: number;
  /** share of all organisations (null without organisations) */
  share: number | null;
}

export interface ActiveView {
  windows: ActiveWindow[];
  organizations: number;
}

export interface PlanMixRow {
  /** catalogue plan id; null = no subscription row (never checked out) */
  planId: string | null;
  /** catalogue name; null for unknown ids and for the "no subscription" row */
  name: string | null;
  known: boolean;
  organizations: number;
  active: number;
  trialing: number;
  pastDue: number;
  canceled: number;
  other: number;
  /** share of all organisations */
  share: number | null;
}

export interface PlanMixView {
  rows: PlanMixRow[];
  organizations: number;
  /** organisations with an active subscription */
  paying: number;
}

export interface ConnectorRow {
  connectorType: string;
  /** distinct organisations with at least one connected integration of this type */
  organizations: number;
  connected: number;
  paused: number;
  error: number;
  /** draft + not_connected */
  notConnected: number;
  total: number;
}

export interface ConnectorsView {
  rows: ConnectorRow[];
  /** connector types beyond the limit */
  more: number;
  /** distinct organisations with at least one connected integration of any type */
  organizationsWithConnected: number;
  connected: number;
}

export interface GrowthTotals {
  users: number;
  organizations: number;
  sites: number;
}

/** Raw rows the loader collected; everything is derived from them by `growthView`. */
export interface GrowthSnapshot {
  now: Date;
  totals: GrowthTotals;
  signupDays: SignupDay[];
  milestones: OrgMilestones[];
  cohortOrganizations: Array<{ organizationId: string; createdAt: Date }>;
  activity: Array<{ organizationId: string; week: number }>;
  aggregatesSince: Date | null;
  activeOrganizations: Array<{ days: number; organizations: number }>;
  planRows: Array<{ planId: string | null; status: string | null; count: number }>;
  connectorRows: Array<{ connectorType: string; status: string; integrations: number; organizations: number }>;
  organizationsWithConnected: number;
}

export interface GrowthView {
  generatedAt: string;
  totals: GrowthTotals;
  signups: SignupsView;
  funnel: FunnelView;
  retention: RetentionView;
  active: ActiveView;
  planMix: PlanMixView;
  connectors: ConnectorsView;
  /** fewer organisations than `SMALL_SAMPLE_ORGANIZATIONS` — rates are shown but flagged */
  smallSample: boolean;
}

/** The overview's key numbers: a light subset of the growth view. */
export interface GrowthHeadline {
  generatedAt: string;
  organizations: number;
  users: number;
  newOrganizations7d: number;
  newOrganizations30d: number;
  newOrganizationsPrevious30d: number;
  active7d: number;
  active30d: number;
  paying: number;
  smallSample: boolean;
}

// ---------------------------------------------------------------------------------------------------
// Reducers (pure)
// ---------------------------------------------------------------------------------------------------

const ratio = (part: number, whole: number): number | null => (whole > 0 ? part / whole : null);

/** Median of a non-empty list (average of the two middle values for even lengths). */
export function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Daily series (gap-filled), weekly series (Monday buckets, current week partial) and the 7/30-day windows. */
export function signupsView(rows: readonly SignupDay[], now: Date): SignupsView {
  const byDay = new Map<string, SignupDay>();
  for (const row of rows) {
    const existing = byDay.get(row.day);
    if (existing) {
      existing.users += row.users;
      existing.organizations += row.organizations;
    } else byDay.set(row.day, { day: row.day, users: row.users, organizations: row.organizations });
  }
  const at = (day: string): SignupDay => byDay.get(day) ?? { day, users: 0, organizations: 0 };
  const today = startOfDayUtc(now).getTime();

  const daily: SignupDay[] = [];
  for (let i = DAILY_WINDOW_DAYS - 1; i >= 0; i--) daily.push({ ...at(dayKey(new Date(today - i * DAY_MS))) });

  const sum = (fromDayOffset: number, days: number): SignupWindow => {
    let users = 0;
    let organizations = 0;
    for (let i = 0; i < days; i++) {
      const row = at(dayKey(new Date(today - (fromDayOffset + i) * DAY_MS)));
      users += row.users;
      organizations += row.organizations;
    }
    return { days, users, organizations };
  };

  const currentWeek = weekStartUtc(now).getTime();
  const weekly: SignupWeek[] = [];
  for (let w = WEEKLY_WINDOW_WEEKS - 1; w >= 0; w--) {
    const start = currentWeek - w * WEEK_MS;
    let users = 0;
    let organizations = 0;
    for (let d = 0; d < 7; d++) {
      const row = at(dayKey(new Date(start + d * DAY_MS)));
      users += row.users;
      organizations += row.organizations;
    }
    weekly.push({ weekStart: dayKey(new Date(start)), users, organizations, partial: w === 0 });
  }

  const any = daily.some((d) => d.users > 0 || d.organizations > 0) || weekly.some((w) => w.users > 0 || w.organizations > 0);
  return { daily, weekly, last7: sum(0, 7), last30: sum(0, 30), previous30: sum(30, 30), any };
}

/** Instant an organisation reached a stage (`created` = its creation). */
export function stageAt(row: OrgMilestones, key: FunnelStageKey): Date | null {
  switch (key) {
    case "created":
      return row.createdAt;
    case "site":
      return row.firstSiteAt;
    case "verified":
      return row.verifiedAt;
    case "event":
      return row.firstEventAt;
    case "destination":
      return row.firstDestinationAt;
    case "published":
      return row.firstPublishedAt;
    case "paying":
      return row.payingAt;
  }
}

function stageCounts(rows: readonly OrgMilestones[]): Array<{ key: FunnelStageKey; count: number; days: number[] }> {
  return FUNNEL_STAGES.map((key) => {
    const reached = rows.map((row) => ({ row, at: stageAt(row, key) })).filter((x): x is { row: OrgMilestones; at: Date } => x.at !== null);
    return {
      key,
      count: reached.length,
      days: reached.map(({ row, at }) => Math.max(0, (at.getTime() - row.createdAt.getTime()) / DAY_MS)),
    };
  });
}

function withRates(counts: readonly { count: number }[]): FunnelStageCount[] {
  const first = counts[0]?.count ?? 0;
  return counts.map((c, i) => ({
    count: c.count,
    stepRate: i === 0 ? null : ratio(c.count, counts[i - 1]!.count),
    totalRate: i === 0 ? null : ratio(c.count, first),
  }));
}

/** Milestone counts, step and total conversion, median time to each milestone — all-time and for recent sign-ups. */
export function funnelView(rows: readonly OrgMilestones[], now: Date, recentDays = FUNNEL_RECENT_DAYS): FunnelView {
  const recentSince = now.getTime() - recentDays * DAY_MS;
  const recentRows = rows.filter((row) => row.createdAt.getTime() >= recentSince);
  const all = stageCounts(rows);
  const allRates = withRates(all);
  const recentRates = withRates(stageCounts(recentRows));
  return {
    stages: all.map((stage, i) => ({
      key: stage.key,
      ...allRates[i]!,
      medianDays: stage.key === "created" ? null : median(stage.days),
      recent: recentRates[i]!,
    })),
    organizations: rows.length,
    recentOrganizations: recentRows.length,
    recentDays,
  };
}

/**
 * Weekly cohorts by sign-up week (Monday, UTC); a member is active in week n when an hourly aggregate with
 * accepted events falls into [created_at + 7n days, created_at + 7(n+1) days). A cell is complete once the
 * week has elapsed for every member (the cohort's Monday + 7 + 7(n+1) days ≤ now), partial while it is
 * still running for some, pending before it starts.
 */
export function retentionView(
  organizations: ReadonlyArray<{ organizationId: string; createdAt: Date }>,
  activity: ReadonlyArray<{ organizationId: string; week: number }>,
  now: Date,
  aggregatesSince: Date | null,
): RetentionView {
  const activeByOrg = new Map<string, Set<number>>();
  for (const row of activity) {
    const set = activeByOrg.get(row.organizationId) ?? new Set<number>();
    set.add(row.week);
    activeByOrg.set(row.organizationId, set);
  }
  const currentWeek = weekStartUtc(now).getTime();
  const cohorts: RetentionCohort[] = [];
  for (let w = RETENTION_COHORT_WEEKS - 1; w >= 0; w--) {
    const start = currentWeek - w * WEEK_MS;
    const members = organizations.filter((o) => weekStartUtc(o.createdAt).getTime() === start);
    const cells: RetentionCell[] = [];
    for (let week = 0; week < RETENTION_WEEKS; week++) {
      const cellStart = start + week * WEEK_MS;
      const cellCompleteAt = start + WEEK_MS + (week + 1) * WEEK_MS;
      const state: RetentionCellState = cellStart > now.getTime() ? "pending" : cellCompleteAt <= now.getTime() ? "complete" : "partial";
      const active = state === "pending" ? 0 : members.filter((m) => activeByOrg.get(m.organizationId)?.has(week)).length;
      cells.push({ week, active, rate: state === "pending" ? null : ratio(active, members.length), state });
    }
    cohorts.push({ weekStart: dayKey(new Date(start)), size: members.length, cells, small: members.length < MIN_COHORT_SIZE });
  }
  return {
    cohorts,
    weeks: RETENTION_WEEKS,
    measured: organizations.length > 0,
    aggregatesSince: aggregatesSince ? aggregatesSince.toISOString() : null,
  };
}

export function activeView(windows: ReadonlyArray<{ days: number; organizations: number }>, organizations: number): ActiveView {
  return {
    windows: windows.map((w) => ({ days: w.days, organizations: w.organizations, share: ratio(w.organizations, organizations) })),
    organizations,
  };
}

const PAST_DUE_STATUSES = new Set(["past_due", "unpaid"]);
const CANCELED_STATUSES = new Set(["canceled", "incomplete_expired"]);

/** Organisations per catalogue plan and subscription state; organisations without a ledger row form their own row. */
export function planMixView(rows: ReadonlyArray<{ planId: string | null; status: string | null; count: number }>, organizations: number): PlanMixView {
  const byPlan = new Map<string | null, PlanMixRow>();
  for (const row of rows) {
    const key = row.planId;
    const plan = key === null ? null : findPlan(key);
    const entry =
      byPlan.get(key) ??
      ({ planId: key, name: plan?.name ?? null, known: key === null || plan !== null, organizations: 0, active: 0, trialing: 0, pastDue: 0, canceled: 0, other: 0, share: null } satisfies PlanMixRow);
    entry.organizations += row.count;
    if (key === null) entry.other += row.count;
    else if (row.status === "active") entry.active += row.count;
    else if (row.status === "trialing") entry.trialing += row.count;
    else if (row.status && PAST_DUE_STATUSES.has(row.status)) entry.pastDue += row.count;
    else if (row.status && CANCELED_STATUSES.has(row.status)) entry.canceled += row.count;
    else entry.other += row.count;
    byPlan.set(key, entry);
  }
  const order = new Map(publicPlanOrder().map((p, i) => [p.id as string, i]));
  const rank = (row: PlanMixRow): number => (row.planId === null ? 1_000 : (order.get(row.planId) ?? 500));
  const result = [...byPlan.values()]
    .map((row) => ({ ...row, share: ratio(row.organizations, organizations) }))
    .sort((a, b) => rank(a) - rank(b) || b.organizations - a.organizations || (a.planId ?? "").localeCompare(b.planId ?? ""));
  return { rows: result, organizations, paying: result.reduce((sum, r) => sum + r.active, 0) };
}

/** Connector types ranked by the organisations that have one connected; the tail beyond the limit is counted, not listed. */
export function connectorsView(
  rows: ReadonlyArray<{ connectorType: string; status: string; integrations: number; organizations: number }>,
  organizationsWithConnected: number,
  limit = TOP_CONNECTORS_LIMIT,
): ConnectorsView {
  const byType = new Map<string, ConnectorRow>();
  for (const row of rows) {
    const entry = byType.get(row.connectorType) ?? { connectorType: row.connectorType, organizations: 0, connected: 0, paused: 0, error: 0, notConnected: 0, total: 0 };
    entry.total += row.integrations;
    if (row.status === "connected") {
      entry.connected += row.integrations;
      entry.organizations += row.organizations;
    } else if (row.status === "paused") entry.paused += row.integrations;
    else if (row.status === "error") entry.error += row.integrations;
    else entry.notConnected += row.integrations;
    byType.set(row.connectorType, entry);
  }
  const ranked = [...byType.values()].sort((a, b) => b.organizations - a.organizations || b.connected - a.connected || b.total - a.total || a.connectorType.localeCompare(b.connectorType));
  return {
    rows: ranked.slice(0, limit),
    more: Math.max(0, ranked.length - limit),
    organizationsWithConnected,
    connected: ranked.reduce((sum, r) => sum + r.connected, 0),
  };
}

export function growthView(snapshot: GrowthSnapshot): GrowthView {
  const organizations = snapshot.totals.organizations;
  return {
    generatedAt: snapshot.now.toISOString(),
    totals: snapshot.totals,
    signups: signupsView(snapshot.signupDays, snapshot.now),
    funnel: funnelView(snapshot.milestones, snapshot.now),
    retention: retentionView(snapshot.cohortOrganizations, snapshot.activity, snapshot.now, snapshot.aggregatesSince),
    active: activeView(snapshot.activeOrganizations, organizations),
    planMix: planMixView(snapshot.planRows, organizations),
    connectors: connectorsView(snapshot.connectorRows, snapshot.organizationsWithConnected),
    smallSample: organizations < SMALL_SAMPLE_ORGANIZATIONS,
  };
}

// ---------------------------------------------------------------------------------------------------
// Loaders (run inside `withPlatform`; sequential queries — one transaction runs on one client)
// ---------------------------------------------------------------------------------------------------

const asDate = (v: unknown): Date | null => (v instanceof Date ? v : typeof v === "string" ? new Date(v) : null);
const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** `YYYY-MM-DD` of a timestamptz column in UTC. */
const utcDay = (column: unknown) => sql<string>`to_char((${column} at time zone 'UTC')::date, 'YYYY-MM-DD')`;

async function loadSignupDays(tx: DbOrTx, since: Date): Promise<SignupDay[]> {
  const users = await tx
    .select({ day: utcDay(user.createdAt), n: sql<number>`count(*)::int` })
    .from(user)
    .where(gte(user.createdAt, since))
    .groupBy(sql`1`);
  const orgs = await tx
    .select({ day: utcDay(organization.createdAt), n: sql<number>`count(*)::int` })
    .from(organization)
    .where(gte(organization.createdAt, since))
    .groupBy(sql`1`);
  const byDay = new Map<string, SignupDay>();
  for (const row of users) byDay.set(row.day, { day: row.day, users: num(row.n), organizations: 0 });
  for (const row of orgs) {
    const entry = byDay.get(row.day) ?? { day: row.day, users: 0, organizations: 0 };
    entry.organizations = num(row.n);
    byDay.set(row.day, entry);
  }
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}

/** First-milestone instant per organisation from each source table, merged by organisation id. */
async function loadMilestones(tx: DbOrTx): Promise<OrgMilestones[]> {
  const orgs = await tx.select({ id: organization.id, createdAt: organization.createdAt }).from(organization);
  const firstSites = await tx
    .select({ organizationId: sites.organizationId, at: sql<Date | null>`min(${sites.createdAt})` })
    .from(sites)
    .groupBy(sites.organizationId);
  const verified = await tx
    .select({ organizationId: domains.organizationId, at: sql<Date | null>`min(${domains.verifiedAt})` })
    .from(domains)
    .where(sql`${domains.verifiedAt} is not null`)
    .groupBy(domains.organizationId);
  const firstEvents = await tx
    .select({ organizationId: eventAggregates.organizationId, at: sql<Date | null>`min(${eventAggregates.bucketStart})` })
    .from(eventAggregates)
    .where(gt(eventAggregates.accepted, 0))
    .groupBy(eventAggregates.organizationId);
  const destinations = await tx
    .select({ organizationId: integrations.organizationId, at: sql<Date | null>`min(${integrations.createdAt})` })
    .from(integrations)
    .where(eq(integrations.status, "connected"))
    .groupBy(integrations.organizationId);
  const published = await tx
    .select({ organizationId: configPublications.organizationId, at: sql<Date | null>`min(${configPublications.publishedAt})` })
    .from(configPublications)
    .where(eq(configPublications.kind, "publish"))
    .groupBy(configPublications.organizationId);
  const paying = await tx
    .select({ organizationId: subscriptions.organizationId, at: sql<Date | null>`min(${subscriptions.createdAt})` })
    .from(subscriptions)
    .where(eq(subscriptions.status, "active"))
    .groupBy(subscriptions.organizationId);

  const index = (rows: ReadonlyArray<{ organizationId: string; at: unknown }>): Map<string, Date> => {
    const map = new Map<string, Date>();
    for (const row of rows) {
      const at = asDate(row.at);
      if (at) map.set(row.organizationId, at);
    }
    return map;
  };
  const siteAt = index(firstSites);
  const verifiedAt = index(verified);
  const eventAt = index(firstEvents);
  const destinationAt = index(destinations);
  const publishedAt = index(published);
  const payingAt = index(paying);
  return orgs.map((org) => ({
    organizationId: org.id,
    createdAt: org.createdAt,
    firstSiteAt: siteAt.get(org.id) ?? null,
    verifiedAt: verifiedAt.get(org.id) ?? null,
    firstEventAt: eventAt.get(org.id) ?? null,
    firstDestinationAt: destinationAt.get(org.id) ?? null,
    firstPublishedAt: publishedAt.get(org.id) ?? null,
    payingAt: payingAt.get(org.id) ?? null,
  }));
}

async function loadActiveWindows(tx: DbOrTx, now: Date): Promise<Array<{ days: number; organizations: number }>> {
  const result: Array<{ days: number; organizations: number }> = [];
  for (const days of ACTIVE_WINDOWS_DAYS) {
    const since = new Date(now.getTime() - days * DAY_MS);
    const [row] = await tx
      .select({ organizations: sql<number>`count(distinct ${eventAggregates.organizationId})::int` })
      .from(eventAggregates)
      .where(and(gt(eventAggregates.accepted, 0), gte(eventAggregates.bucketStart, since)));
    result.push({ days, organizations: num(row?.organizations) });
  }
  return result;
}

const countAll = sql<number>`count(*)::int`;

async function loadTotals(tx: DbOrTx): Promise<GrowthTotals> {
  const [users] = await tx.select({ n: countAll }).from(user);
  const [organizations] = await tx.select({ n: countAll }).from(organization);
  const [liveSites] = await tx.select({ n: countAll }).from(sites).where(sql`${sites.deletedAt} is null`);
  return { users: num(users?.n), organizations: num(organizations?.n), sites: num(liveSites?.n) };
}

export async function loadGrowthSnapshot(tx: DbOrTx, now = new Date()): Promise<GrowthSnapshot> {
  const totals = await loadTotals(tx);
  const signupDays = await loadSignupDays(tx, signupSince(now));
  const milestones = await loadMilestones(tx);

  const since = cohortSince(now);
  const cohortOrganizations = await tx
    .select({ organizationId: organization.id, createdAt: organization.createdAt })
    .from(organization)
    .where(gte(organization.createdAt, since));
  const activity = await tx
    .select({
      organizationId: eventAggregates.organizationId,
      week: sql<number>`floor(extract(epoch from (${eventAggregates.bucketStart} - ${organization.createdAt})) / 604800)::int`,
    })
    .from(eventAggregates)
    .innerJoin(organization, eq(organization.id, eventAggregates.organizationId))
    .where(and(gte(organization.createdAt, since), gt(eventAggregates.accepted, 0), gte(eventAggregates.bucketStart, organization.createdAt)))
    .groupBy(sql`1`, sql`2`);
  const [horizon] = await tx.select({ since: sql<Date | null>`min(${eventAggregates.bucketStart})` }).from(eventAggregates);

  const activeOrganizations = await loadActiveWindows(tx, now);

  const planRows = await tx
    .select({ planId: subscriptions.planId, status: subscriptions.status, count: sql<number>`count(*)::int` })
    .from(organization)
    .leftJoin(subscriptions, eq(subscriptions.organizationId, organization.id))
    .groupBy(subscriptions.planId, subscriptions.status);

  const connectorRows = await tx
    .select({
      connectorType: integrations.connectorType,
      status: integrations.status,
      integrations: sql<number>`count(*)::int`,
      organizations: sql<number>`count(distinct ${integrations.organizationId})::int`,
    })
    .from(integrations)
    .groupBy(integrations.connectorType, integrations.status);
  const [connectedRow] = await tx
    .select({ organizations: sql<number>`count(distinct ${integrations.organizationId})::int` })
    .from(integrations)
    .where(eq(integrations.status, "connected"));

  return {
    now,
    totals,
    signupDays,
    milestones,
    cohortOrganizations: cohortOrganizations.map((row) => ({ organizationId: row.organizationId, createdAt: row.createdAt })),
    activity: activity.map((row) => ({ organizationId: row.organizationId, week: num(row.week) })),
    aggregatesSince: asDate(horizon?.since),
    activeOrganizations,
    planRows: planRows.map((row) => ({ planId: row.planId ?? null, status: row.status ?? null, count: num(row.count) })),
    connectorRows: connectorRows.map((row) => ({ connectorType: row.connectorType, status: row.status, integrations: num(row.integrations), organizations: num(row.organizations) })),
    organizationsWithConnected: num(connectedRow?.organizations),
  };
}

/** Key numbers for the overview: five cheap aggregate queries, no per-organisation rows. */
export async function loadGrowthHeadline(tx: DbOrTx, now = new Date()): Promise<GrowthHeadline> {
  const today = startOfDayUtc(now).getTime();
  const d7 = new Date(today - 6 * DAY_MS);
  const d30 = new Date(today - 29 * DAY_MS);
  const d60 = new Date(today - 59 * DAY_MS);
  const totals = await loadTotals(tx);
  const [orgWindows] = await tx
    .select({
      new7d: sql<number>`count(*) filter (where ${organization.createdAt} >= ${d7})::int`,
      new30d: sql<number>`count(*) filter (where ${organization.createdAt} >= ${d30})::int`,
      previous30d: sql<number>`count(*) filter (where ${organization.createdAt} >= ${d60} and ${organization.createdAt} < ${d30})::int`,
    })
    .from(organization);
  const [paying] = await tx.select({ n: countAll }).from(subscriptions).where(eq(subscriptions.status, "active"));
  const active = await loadActiveWindows(tx, now);
  return {
    generatedAt: now.toISOString(),
    organizations: totals.organizations,
    users: totals.users,
    newOrganizations7d: num(orgWindows?.new7d),
    newOrganizations30d: num(orgWindows?.new30d),
    newOrganizationsPrevious30d: num(orgWindows?.previous30d),
    active7d: active.find((w) => w.days === 7)?.organizations ?? 0,
    active30d: active.find((w) => w.days === 30)?.organizations ?? 0,
    paying: num(paying?.n),
    smallSample: totals.organizations < SMALL_SAMPLE_ORGANIZATIONS,
  };
}
