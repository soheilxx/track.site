import "server-only";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  sql,
  type AnyColumn,
  type SQL,
} from "drizzle-orm";
import {
  SUPPORT_TICKET_CHANNELS,
  SUPPORT_TICKET_PRIORITIES,
  SUPPORT_TICKET_STATUSES,
  organization,
  supportEvents,
  supportMessages,
  supportSettings,
  supportTickets,
  user,
  type SupportSatisfaction,
  type SupportTicketChannel,
  type SupportTicketPriority,
  type SupportTicketStatus,
  type Tx,
} from "@track-site/db";
import {
  CSAT_SCORES,
  MIN_P90_SAMPLE,
  OPEN_TICKET_STATUSES,
  REPORT_BUCKETS,
  REPORT_DEFAULT_DAYS,
  REPORT_EXPORT_KINDS,
  REPORT_MAX_TICKETS,
  REPORT_PRESET_DAYS,
  REPORT_RANGE_MAX_DAYS,
  REPORT_TOP_LIMIT,
  REPORT_WEEKLY_FROM_DAYS,
  SMALL_SAMPLE_TICKETS,
  type CsatScore,
  type ReportBucket,
  type ReportExportKind,
} from "@/components/ops/support/reports/constants";

export {
  CSAT_SCORES,
  MIN_P90_SAMPLE,
  OPEN_TICKET_STATUSES,
  REPORT_BUCKETS,
  REPORT_DEFAULT_DAYS,
  REPORT_EXPORT_KINDS,
  REPORT_MAX_TICKETS,
  REPORT_PRESET_DAYS,
  REPORT_RANGE_MAX_DAYS,
  REPORT_TOP_LIMIT,
  REPORT_WEEKLY_FROM_DAYS,
  SMALL_SAMPLE_TICKETS,
};
export type { CsatScore, ReportBucket, ReportExportKind };

/**
 * Track Operations → Support → Reports (docs/18 §"Reports", task T7). Read side of the module: ticket volume
 * per day or ISO week and channel, the backlog by status, first-response and resolution times (median and
 * 90th percentile), SLA attainment, per-agent workload, satisfaction, top categories and tags and the
 * busiest organisations — counts, durations and rates over the support tables, never subjects, message
 * bodies or requester details.
 *
 * Honesty rules (docs/18 §1 "No invented metrics"): every duration is the difference of two stored
 * timestamps (`created_at` → `first_responded_at` / `resolved_at`, wall clock as the customer experienced
 * it); SLA outcomes compare those instants with the stored due times; a percentile needs a minimum sample
 * (`MIN_P90_SAMPLE`) or is withheld; rates are ratios of counts and the view carries the sample size so the
 * page flags small numbers; nothing is extrapolated. The cohort of a range is "tickets created inside it"
 * (spam and tickets merged into another excluded); the backlog and the agents' open tickets are the state
 * now; agent replies and solves are the messages and status changes that happened inside the range.
 *
 * The loader takes a transaction so the page decides the role (`withPlatform`); the reducers are pure and
 * unit-tested. Calendar math is UTC (days start at 00:00 UTC, weeks on Monday).
 */

// ---------------------------------------------------------------------------------------------------
// Calendar helpers (UTC)
// ---------------------------------------------------------------------------------------------------

export const DAY_MS = 86_400_000;
export const WEEK_MS = 7 * DAY_MS;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

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

/** Strict `YYYY-MM-DD` → 00:00 UTC of that day; null for anything else (including impossible dates). */
export function parseIsoDay(value: string): Date | null {
  if (!ISO_DAY.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || dayKey(date) !== value ? null : date;
}

export function isReportBucket(value: unknown): value is ReportBucket {
  return typeof value === "string" && (REPORT_BUCKETS as readonly string[]).includes(value);
}

export function isReportExportKind(value: unknown): value is ReportExportKind {
  return typeof value === "string" && (REPORT_EXPORT_KINDS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------------------------------
// Date range (URL ↔ range)
// ---------------------------------------------------------------------------------------------------

export interface ReportRange {
  /** first UTC day of the range, inclusive, `YYYY-MM-DD` */
  from: string;
  /** last UTC day of the range, inclusive, `YYYY-MM-DD` */
  to: string;
  /** 00:00 UTC of `from` */
  start: Date;
  /** 00:00 UTC of the day after `to` (exclusive) */
  end: Date;
  /** calendar days in the range */
  days: number;
  bucket: ReportBucket;
  /** the URL named the bucket; otherwise it follows the length of the range */
  bucketExplicit: boolean;
  /** the quick range the window matches (ends today, one of `REPORT_PRESET_DAYS`); null for a custom window */
  preset: number | null;
  /** the URL asked for an invalid window (bad dates, reversed, in the future, too long); the default was used */
  fallback: boolean;
}

type Query = Record<string, string | string[] | undefined>;

const one = (value: string | string[] | undefined): string =>
  (Array.isArray(value) ? (value[0] ?? "") : (value ?? "")).trim();

/**
 * The range from the URL: `days=N` (N calendar days ending today, 1–`REPORT_RANGE_MAX_DAYS`) or `from` /
 * `to` (`YYYY-MM-DD`, `to` defaults to today, at most `REPORT_RANGE_MAX_DAYS` days, never in the future);
 * `bucket=day|week` overrides the automatic choice. Anything invalid falls back to the last
 * `REPORT_DEFAULT_DAYS` days and says so (`fallback`).
 */
export function parseReportRange(q: Query, now: Date): ReportRange {
  const today = startOfDayUtc(now);
  const bucketRaw = one(q.bucket);
  const bucketExplicit = isReportBucket(bucketRaw);
  const daysRaw = one(q.days);
  const fromRaw = one(q.from);
  const toRaw = one(q.to);

  let start: Date | null = null;
  let last: Date | null = null;
  let fallback = false;
  if (daysRaw) {
    const n = Number.parseInt(daysRaw, 10);
    if (/^\d{1,3}$/.test(daysRaw) && n >= 1 && n <= REPORT_RANGE_MAX_DAYS) {
      last = today;
      start = new Date(today.getTime() - (n - 1) * DAY_MS);
    } else fallback = true;
  } else if (fromRaw || toRaw) {
    const from = fromRaw ? parseIsoDay(fromRaw) : null;
    const to = toRaw ? parseIsoDay(toRaw) : today;
    const valid =
      from &&
      to &&
      from.getTime() <= to.getTime() &&
      to.getTime() <= today.getTime() &&
      (to.getTime() - from.getTime()) / DAY_MS + 1 <= REPORT_RANGE_MAX_DAYS;
    if (valid) {
      start = from;
      last = to;
    } else fallback = true;
  }
  if (!start || !last) {
    last = today;
    start = new Date(today.getTime() - (REPORT_DEFAULT_DAYS - 1) * DAY_MS);
  }
  const days = Math.round((last.getTime() - start.getTime()) / DAY_MS) + 1;
  const preset =
    last.getTime() === today.getTime() && (REPORT_PRESET_DAYS as readonly number[]).includes(days)
      ? days
      : null;
  const bucket: ReportBucket = bucketExplicit
    ? (bucketRaw as ReportBucket)
    : days > REPORT_WEEKLY_FROM_DAYS
      ? "week"
      : "day";
  return {
    from: dayKey(start),
    to: dayKey(last),
    start,
    end: new Date(last.getTime() + DAY_MS),
    days,
    bucket,
    bucketExplicit,
    preset,
    fallback,
  };
}

/** Query string (`?days=30` or `?from=…&to=…`, plus `bucket` when chosen) of a range, with optional overrides. */
export function reportQuery(
  range: ReportRange,
  overrides: { days?: number; from?: string; to?: string; bucket?: ReportBucket | null } = {},
): string {
  const params = new URLSearchParams();
  if (overrides.days != null) params.set("days", String(overrides.days));
  else if (overrides.from || overrides.to) {
    params.set("from", overrides.from ?? range.from);
    params.set("to", overrides.to ?? range.to);
  } else if (range.preset != null) params.set("days", String(range.preset));
  else {
    params.set("from", range.from);
    params.set("to", range.to);
  }
  const bucket =
    overrides.bucket === undefined
      ? range.bucketExplicit
        ? range.bucket
        : null
      : overrides.bucket;
  if (bucket) params.set("bucket", bucket);
  const s = params.toString();
  return s ? `?${s}` : "";
}

export interface BucketSlot {
  /** `YYYY-MM-DD` of the day or of the week's Monday */
  key: string;
  /** the bucket's window is not fully covered by the range up to now (first / last week, today) */
  partial: boolean;
}

export function bucketKey(date: Date, bucket: ReportBucket): string {
  return bucket === "week" ? dayKey(weekStartUtc(date)) : dayKey(startOfDayUtc(date));
}

/** Every bucket of the range in order (gap-filled), with the partial flag. */
export function bucketsOf(range: ReportRange, now: Date): BucketSlot[] {
  const slots: BucketSlot[] = [];
  const step = range.bucket === "week" ? WEEK_MS : DAY_MS;
  const first =
    range.bucket === "week" ? weekStartUtc(range.start).getTime() : range.start.getTime();
  const covered = Math.min(range.end.getTime(), now.getTime());
  for (let t = first; t < range.end.getTime(); t += step) {
    slots.push({
      key: dayKey(new Date(t)),
      partial: t < range.start.getTime() || t + step > covered,
    });
  }
  return slots;
}

// ---------------------------------------------------------------------------------------------------
// Snapshot (what the loader collects)
// ---------------------------------------------------------------------------------------------------

/** One ticket of the range's cohort — ids, workflow fields and instants only (no subject, no requester). */
export interface ReportTicket {
  id: string;
  organizationId: string | null;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  channel: SupportTicketChannel;
  category: string | null;
  tags: string[];
  assigneeUserId: string | null;
  createdAt: Date;
  firstResponseDueAt: Date | null;
  resolutionDueAt: Date | null;
  firstRespondedAt: Date | null;
  resolvedAt: Date | null;
  pausedAt: Date | null;
  breachedFirstResponse: boolean;
  breachedResolution: boolean;
  satisfactionScore: number | null;
}

export interface VolumeRow {
  bucket: string;
  channel: SupportTicketChannel;
  count: number;
}

export interface SolvedRow {
  bucket: string;
  count: number;
}

export interface BacklogRow {
  status: SupportTicketStatus;
  count: number;
}

export interface AgentRef {
  id: string;
  name: string;
}

export interface AgentCount {
  userId: string;
  count: number;
}

/** First outbound agent message of a cohort ticket (who answered first, and when). */
export interface FirstResponder {
  ticketId: string;
  authorUserId: string | null;
  ticketCreatedAt: Date;
  respondedAt: Date;
}

export interface OrganisationRow {
  /** null = tickets of senders without an organisation */
  organizationId: string | null;
  name: string | null;
  slug: string | null;
  tickets: number;
  /** still open now */
  open: number;
  /** resolved (currently) */
  resolved: number;
}

export interface SupportReportSnapshot {
  now: Date;
  range: ReportRange;
  created: VolumeRow[];
  solved: SolvedRow[];
  backlog: BacklogRow[];
  unassignedOpen: number;
  oldestOpenCreatedAt: Date | null;
  /** cohort tickets, at most `REPORT_MAX_TICKETS` (oldest first) */
  cohort: ReportTicket[];
  /** all cohort tickets, whether loaded or not */
  cohortTotal: number;
  firstResponders: FirstResponder[];
  agents: AgentRef[];
  agentOpen: AgentCount[];
  agentReplies: AgentCount[];
  agentSolved: AgentCount[];
  organisations: OrganisationRow[];
  /** distinct organisations with a cohort ticket */
  organisationsDistinct: number;
  /** cohort tickets without an organisation */
  withoutOrganisation: number;
  csatEnabled: boolean;
}

// ---------------------------------------------------------------------------------------------------
// View (what the page renders)
// ---------------------------------------------------------------------------------------------------

export interface VolumeBucket extends BucketSlot {
  total: number;
  byChannel: Record<SupportTicketChannel, number>;
  solved: number;
}

export interface ChannelShare {
  channel: SupportTicketChannel;
  count: number;
  share: number | null;
}

export interface VolumeView {
  buckets: VolumeBucket[];
  total: number;
  solved: number;
  byChannel: ChannelShare[];
  /** tickets per calendar day of the range */
  perDay: number | null;
  any: boolean;
}

export interface BacklogStatusRow {
  status: SupportTicketStatus;
  count: number;
  share: number | null;
}

export interface BacklogView {
  rows: BacklogStatusRow[];
  /** new + open + pending + on hold */
  open: number;
  total: number;
  unassignedOpen: number;
  oldestOpenAt: string | null;
  /** age of the oldest open ticket in milliseconds */
  oldestOpenAgeMs: number | null;
}

export interface DurationStats {
  /** tickets with the instant (answered / resolved) */
  measured: number;
  /** cohort tickets without it */
  pending: number;
  medianMs: number | null;
  p90Ms: number | null;
  /** fewer than `MIN_P90_SAMPLE` measured tickets — the p90 is withheld */
  p90Withheld: boolean;
}

export interface TimesView {
  firstResponse: DurationStats;
  resolution: DurationStats;
}

export type SlaOutcome = "met" | "breached" | "running" | "no_policy";
export type SlaClock = "first_response" | "resolution";

export interface SlaClockStats {
  met: number;
  breached: number;
  running: number;
  noPolicy: number;
  /** met / (met + breached); null while nothing has concluded */
  rate: number | null;
}

export interface SlaPriorityRow {
  priority: SupportTicketPriority;
  tickets: number;
  firstResponse: SlaClockStats;
  resolution: SlaClockStats;
}

export interface SlaView {
  firstResponse: SlaClockStats;
  resolution: SlaClockStats;
  byPriority: SlaPriorityRow[];
  /** cohort tickets with at least one due time */
  withPolicy: number;
}

export interface AgentRow {
  /** platform user id; `"former"` for authors that no longer hold a platform role */
  id: string;
  /** display name; null for the folded "former operators" row */
  name: string | null;
  open: number;
  replies: number;
  firstResponses: number;
  medianFirstResponseMs: number | null;
  solved: number;
}

export interface AgentsView {
  rows: AgentRow[];
  unassignedOpen: number;
  any: boolean;
}

export interface CsatBucket {
  score: CsatScore;
  count: number;
  share: number | null;
}

export interface CsatView {
  enabled: boolean;
  responses: number;
  average: number | null;
  distribution: CsatBucket[];
  /** cohort tickets that are solved or closed (the ones that could be rated) */
  solvedTickets: number;
  responseRate: number | null;
}

export interface TopRow {
  key: string;
  count: number;
  share: number | null;
}

export interface TopView {
  rows: TopRow[];
  /** tickets without a category / without tags */
  none: number;
  /** distinct values beyond the listed ones */
  more: number;
  total: number;
}

export interface OrganisationView extends OrganisationRow {
  share: number | null;
}

export interface OrganisationsView {
  rows: OrganisationView[];
  distinct: number;
  withoutOrganisation: number;
  total: number;
}

export interface CohortInfo {
  tickets: number;
  loaded: number;
  /** more cohort tickets exist than were loaded — per-ticket figures rest on the first `REPORT_MAX_TICKETS` */
  truncated: boolean;
  /** fewer than `SMALL_SAMPLE_TICKETS` tickets — rates and medians are flagged */
  smallSample: boolean;
}

export interface SupportReportView {
  generatedAt: string;
  range: ReportRange;
  cohort: CohortInfo;
  volume: VolumeView;
  backlog: BacklogView;
  times: TimesView;
  sla: SlaView;
  agents: AgentsView;
  csat: CsatView;
  categories: TopView;
  tags: TopView;
  organisations: OrganisationsView;
}

// ---------------------------------------------------------------------------------------------------
// Reducers (pure)
// ---------------------------------------------------------------------------------------------------

const ratio = (part: number, whole: number): number | null => (whole > 0 ? part / whole : null);

/** Linear-interpolated percentile (`percentile_cont` semantics); null for an empty list. */
export function percentile(values: readonly number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (sorted.length - 1) * Math.min(1, Math.max(0, p));
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  const low = sorted[lo]!;
  if (lo === hi) return low;
  return low + (sorted[hi]! - low) * (rank - lo);
}

export const median = (values: readonly number[]): number | null => percentile(values, 0.5);

/** Median / p90 of a list of durations; the p90 is withheld below `MIN_P90_SAMPLE` samples. */
export function durationStats(durationsMs: readonly number[], pending: number): DurationStats {
  const measured = durationsMs.length;
  const withheld = measured < MIN_P90_SAMPLE;
  return {
    measured,
    pending,
    medianMs: median(durationsMs),
    p90Ms: withheld ? null : percentile(durationsMs, 0.9),
    p90Withheld: withheld && measured > 0,
  };
}

const at = (value: Date | null): number | null => (value ? value.getTime() : null);

/**
 * Outcome of one SLA clock from stored instants only: no due time → `no_policy`; a stopped clock (answered /
 * resolved) is `met` or `breached` by the stop instant against the due time (the worker's flag wins when set);
 * a running clock is `breached` once flagged or overdue, otherwise `running` — a paused clock (`pending`)
 * never counts as breached by the wall clock, because its due time shifts when the pause ends.
 */
export function slaOutcome(
  ticket: Pick<
    ReportTicket,
    | "firstResponseDueAt"
    | "resolutionDueAt"
    | "firstRespondedAt"
    | "resolvedAt"
    | "pausedAt"
    | "breachedFirstResponse"
    | "breachedResolution"
  >,
  clock: SlaClock,
  nowMs: number,
): SlaOutcome {
  const due = at(clock === "first_response" ? ticket.firstResponseDueAt : ticket.resolutionDueAt);
  if (due == null) return "no_policy";
  const stopped = at(clock === "first_response" ? ticket.firstRespondedAt : ticket.resolvedAt);
  const flagged =
    clock === "first_response" ? ticket.breachedFirstResponse : ticket.breachedResolution;
  if (stopped != null) return flagged || stopped > due ? "breached" : "met";
  if (flagged) return "breached";
  if (ticket.pausedAt) return "running";
  return due < nowMs ? "breached" : "running";
}

function slaClockStats(
  tickets: readonly ReportTicket[],
  clock: SlaClock,
  nowMs: number,
): SlaClockStats {
  const stats: SlaClockStats = { met: 0, breached: 0, running: 0, noPolicy: 0, rate: null };
  for (const ticket of tickets) {
    const outcome = slaOutcome(ticket, clock, nowMs);
    if (outcome === "met") stats.met += 1;
    else if (outcome === "breached") stats.breached += 1;
    else if (outcome === "running") stats.running += 1;
    else stats.noPolicy += 1;
  }
  stats.rate = ratio(stats.met, stats.met + stats.breached);
  return stats;
}

const CHANNELS: readonly SupportTicketChannel[] = SUPPORT_TICKET_CHANNELS;

/** Gap-filled buckets of created tickets by channel plus the solved series, with the channel mix of the range. */
export function volumeView(
  snapshot: Pick<SupportReportSnapshot, "created" | "solved" | "range" | "now">,
): VolumeView {
  const byBucket = new Map<string, VolumeBucket>();
  const emptyChannels = (): Record<SupportTicketChannel, number> => ({
    email: 0,
    form: 0,
    dashboard: 0,
    api: 0,
    agent: 0,
  });
  const buckets = bucketsOf(snapshot.range, snapshot.now).map((slot) => {
    const bucket: VolumeBucket = { ...slot, total: 0, byChannel: emptyChannels(), solved: 0 };
    byBucket.set(slot.key, bucket);
    return bucket;
  });
  const channelTotals = emptyChannels();
  let total = 0;
  for (const row of snapshot.created) {
    const bucket = byBucket.get(row.bucket);
    if (!bucket || !CHANNELS.includes(row.channel)) continue;
    bucket.byChannel[row.channel] += row.count;
    bucket.total += row.count;
    channelTotals[row.channel] += row.count;
    total += row.count;
  }
  let solved = 0;
  for (const row of snapshot.solved) {
    const bucket = byBucket.get(row.bucket);
    if (!bucket) continue;
    bucket.solved += row.count;
    solved += row.count;
  }
  return {
    buckets,
    total,
    solved,
    byChannel: CHANNELS.map((channel) => ({
      channel,
      count: channelTotals[channel],
      share: ratio(channelTotals[channel], total),
    })),
    perDay: snapshot.range.days > 0 ? total / snapshot.range.days : null,
    any: total > 0 || solved > 0,
  };
}

/** Every workflow status in order (zero-filled), the open backlog and the oldest open ticket. */
export function backlogView(
  snapshot: Pick<
    SupportReportSnapshot,
    "backlog" | "unassignedOpen" | "oldestOpenCreatedAt" | "now"
  >,
): BacklogView {
  const counts = new Map<string, number>();
  for (const row of snapshot.backlog)
    counts.set(row.status, (counts.get(row.status) ?? 0) + row.count);
  const total = SUPPORT_TICKET_STATUSES.reduce((sum, status) => sum + (counts.get(status) ?? 0), 0);
  const rows = SUPPORT_TICKET_STATUSES.map((status) => ({
    status,
    count: counts.get(status) ?? 0,
    share: ratio(counts.get(status) ?? 0, total),
  }));
  const open = OPEN_TICKET_STATUSES.reduce((sum, status) => sum + (counts.get(status) ?? 0), 0);
  const oldest = snapshot.oldestOpenCreatedAt;
  return {
    rows,
    open,
    total,
    unassignedOpen: snapshot.unassignedOpen,
    oldestOpenAt: oldest ? oldest.toISOString() : null,
    oldestOpenAgeMs: oldest ? Math.max(0, snapshot.now.getTime() - oldest.getTime()) : null,
  };
}

/** First-response and resolution durations of the cohort (wall clock from creation). */
export function timesView(cohort: readonly ReportTicket[]): TimesView {
  const firstResponse: number[] = [];
  const resolution: number[] = [];
  for (const ticket of cohort) {
    if (ticket.firstRespondedAt)
      firstResponse.push(
        Math.max(0, ticket.firstRespondedAt.getTime() - ticket.createdAt.getTime()),
      );
    if (ticket.resolvedAt)
      resolution.push(Math.max(0, ticket.resolvedAt.getTime() - ticket.createdAt.getTime()));
  }
  return {
    firstResponse: durationStats(firstResponse, cohort.length - firstResponse.length),
    resolution: durationStats(resolution, cohort.length - resolution.length),
  };
}

/** SLA outcomes of the cohort per clock, overall and by priority. */
export function slaView(cohort: readonly ReportTicket[], now: Date): SlaView {
  const nowMs = now.getTime();
  const byPriority = SUPPORT_TICKET_PRIORITIES.map((priority) => {
    const tickets = cohort.filter((t) => t.priority === priority);
    return {
      priority,
      tickets: tickets.length,
      firstResponse: slaClockStats(tickets, "first_response", nowMs),
      resolution: slaClockStats(tickets, "resolution", nowMs),
    };
  });
  return {
    firstResponse: slaClockStats(cohort, "first_response", nowMs),
    resolution: slaClockStats(cohort, "resolution", nowMs),
    byPriority,
    withPolicy: cohort.filter((t) => t.firstResponseDueAt || t.resolutionDueAt).length,
  };
}

export const FORMER_AGENTS_ID = "former";

/**
 * One row per platform user (open tickets now, replies and solves inside the range, first responses of the
 * cohort with their median time); authors without a platform role any more are folded into one row.
 */
export function agentsView(
  snapshot: Pick<
    SupportReportSnapshot,
    "agents" | "agentOpen" | "agentReplies" | "agentSolved" | "firstResponders" | "unassignedOpen"
  >,
): AgentsView {
  const known = new Set(snapshot.agents.map((a) => a.id));
  const rows = new Map<string, AgentRow & { durations: number[] }>();
  const rowFor = (userId: string) => {
    const id = known.has(userId) ? userId : FORMER_AGENTS_ID;
    let row = rows.get(id);
    if (!row) {
      row = {
        id,
        name: null,
        open: 0,
        replies: 0,
        firstResponses: 0,
        medianFirstResponseMs: null,
        solved: 0,
        durations: [],
      };
      rows.set(id, row);
    }
    return row;
  };
  for (const agent of snapshot.agents) rowFor(agent.id).name = agent.name;
  for (const row of snapshot.agentOpen) rowFor(row.userId).open += row.count;
  for (const row of snapshot.agentReplies) rowFor(row.userId).replies += row.count;
  for (const row of snapshot.agentSolved) rowFor(row.userId).solved += row.count;
  for (const response of snapshot.firstResponders) {
    if (!response.authorUserId) continue;
    const row = rowFor(response.authorUserId);
    row.firstResponses += 1;
    row.durations.push(
      Math.max(0, response.respondedAt.getTime() - response.ticketCreatedAt.getTime()),
    );
  }
  const ordered = [...rows.values()]
    .map(({ durations, ...row }) => ({ ...row, medianFirstResponseMs: median(durations) }))
    .sort((a, b) =>
      a.id === FORMER_AGENTS_ID
        ? 1
        : b.id === FORMER_AGENTS_ID
          ? -1
          : (a.name ?? "").localeCompare(b.name ?? ""),
    );
  const any = ordered.some((r) => r.open || r.replies || r.firstResponses || r.solved);
  return { rows: ordered, unassignedOpen: snapshot.unassignedOpen, any };
}

/** Satisfaction answers of the cohort: average, distribution 1–5 and the share of solved tickets that answered. */
export function csatView(cohort: readonly ReportTicket[], enabled: boolean): CsatView {
  const counts = new Map<number, number>();
  let sum = 0;
  let responses = 0;
  for (const ticket of cohort) {
    const score = ticket.satisfactionScore;
    if (score == null || !(CSAT_SCORES as readonly number[]).includes(score)) continue;
    counts.set(score, (counts.get(score) ?? 0) + 1);
    sum += score;
    responses += 1;
  }
  const solvedTickets = cohort.filter((t) => t.status === "solved" || t.status === "closed").length;
  return {
    enabled,
    responses,
    average: responses ? sum / responses : null,
    distribution: CSAT_SCORES.map((score) => ({
      score,
      count: counts.get(score) ?? 0,
      share: ratio(counts.get(score) ?? 0, responses),
    })),
    solvedTickets,
    responseRate: ratio(responses, solvedTickets),
  };
}

function topView(values: ReadonlyMap<string, number>, none: number, total: number): TopView {
  const rows = [...values.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, count]) => ({ key, count, share: ratio(count, total) }));
  return {
    rows: rows.slice(0, REPORT_TOP_LIMIT),
    none,
    more: Math.max(0, rows.length - REPORT_TOP_LIMIT),
    total,
  };
}

/** Top categories of the cohort (trimmed; empty = uncategorised). */
export function categoriesView(cohort: readonly ReportTicket[]): TopView {
  const counts = new Map<string, number>();
  let none = 0;
  for (const ticket of cohort) {
    const key = ticket.category?.trim() ?? "";
    if (!key) none += 1;
    else counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return topView(counts, none, cohort.length);
}

/** Top tags of the cohort (a ticket counts once per distinct tag). */
export function tagsView(cohort: readonly ReportTicket[]): TopView {
  const counts = new Map<string, number>();
  let none = 0;
  for (const ticket of cohort) {
    const tags = new Set(ticket.tags.map((t) => t.trim()).filter(Boolean));
    if (tags.size === 0) none += 1;
    for (const tag of tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return topView(counts, none, cohort.length);
}

/** The busiest organisations of the range with their share of all cohort tickets. */
export function organisationsView(
  snapshot: Pick<
    SupportReportSnapshot,
    "organisations" | "organisationsDistinct" | "withoutOrganisation" | "cohortTotal"
  >,
): OrganisationsView {
  const total = snapshot.cohortTotal;
  return {
    rows: snapshot.organisations.map((row) => ({ ...row, share: ratio(row.tickets, total) })),
    distinct: snapshot.organisationsDistinct,
    withoutOrganisation: snapshot.withoutOrganisation,
    total,
  };
}

export function supportReportView(snapshot: SupportReportSnapshot): SupportReportView {
  const cohort = snapshot.cohort;
  return {
    generatedAt: snapshot.now.toISOString(),
    range: snapshot.range,
    cohort: {
      tickets: snapshot.cohortTotal,
      loaded: cohort.length,
      truncated: snapshot.cohortTotal > cohort.length,
      smallSample: snapshot.cohortTotal < SMALL_SAMPLE_TICKETS,
    },
    volume: volumeView(snapshot),
    backlog: backlogView(snapshot),
    times: timesView(cohort),
    sla: slaView(cohort, snapshot.now),
    agents: agentsView(snapshot),
    csat: csatView(cohort, snapshot.csatEnabled),
    categories: categoriesView(cohort),
    tags: tagsView(cohort),
    organisations: organisationsView(snapshot),
  };
}

// ---------------------------------------------------------------------------------------------------
// CSV export (counts, durations and rates only)
// ---------------------------------------------------------------------------------------------------

/** RFC 4180 cell (same rule as the ticket export): quoted when needed, a leading formula character neutralised. */
export function csvCell(value: string | number | boolean | null | undefined): string {
  if (value == null) return "";
  let text = typeof value === "string" ? value : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csv(
  header: readonly string[],
  rows: readonly (readonly (string | number | boolean | null | undefined)[])[],
): string {
  return `${[header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

const minutes = (ms: number | null): number | null =>
  ms == null ? null : Math.round(ms / 6_000) / 10;
const rate = (value: number | null): number | null =>
  value == null ? null : Math.round(value * 10_000) / 10_000;

/** Key / value rows of the headline figures. */
export function summaryRows(
  view: SupportReportView,
): Array<[string, string | number | boolean | null]> {
  return [
    ["range_from", view.range.from],
    ["range_to", view.range.to],
    ["bucket", view.range.bucket],
    ["generated_at", view.generatedAt],
    ["tickets_created", view.volume.total],
    [
      "tickets_created_per_day",
      view.volume.perDay == null ? null : Math.round(view.volume.perDay * 100) / 100,
    ],
    ["tickets_solved_in_range", view.volume.solved],
    ["cohort_loaded", view.cohort.loaded],
    ["cohort_truncated", view.cohort.truncated],
    ["backlog_open", view.backlog.open],
    ["backlog_unassigned", view.backlog.unassignedOpen],
    ["backlog_oldest_open_at", view.backlog.oldestOpenAt],
    ["first_response_measured", view.times.firstResponse.measured],
    ["first_response_median_minutes", minutes(view.times.firstResponse.medianMs)],
    ["first_response_p90_minutes", minutes(view.times.firstResponse.p90Ms)],
    ["resolution_measured", view.times.resolution.measured],
    ["resolution_median_minutes", minutes(view.times.resolution.medianMs)],
    ["resolution_p90_minutes", minutes(view.times.resolution.p90Ms)],
    ["sla_first_response_met", view.sla.firstResponse.met],
    ["sla_first_response_breached", view.sla.firstResponse.breached],
    ["sla_first_response_rate", rate(view.sla.firstResponse.rate)],
    ["sla_resolution_met", view.sla.resolution.met],
    ["sla_resolution_breached", view.sla.resolution.breached],
    ["sla_resolution_rate", rate(view.sla.resolution.rate)],
    ["csat_responses", view.csat.responses],
    ["csat_average", view.csat.average == null ? null : Math.round(view.csat.average * 100) / 100],
    ["csat_response_rate", rate(view.csat.responseRate)],
    ["organisations_distinct", view.organisations.distinct],
  ];
}

/** CSV of one report section. Every column is a count, a duration in minutes, a rate or an id / label. */
export function supportReportCsv(
  view: SupportReportView,
  kind: ReportExportKind,
): { body: string; rows: number } {
  const wrap = (
    header: readonly string[],
    rows: readonly (readonly (string | number | boolean | null | undefined)[])[],
  ) => ({ body: csv(header, rows), rows: rows.length });
  switch (kind) {
    case "summary":
      return wrap(["metric", "value"], summaryRows(view));
    case "volume":
      return wrap(
        ["bucket", "partial", ...CHANNELS, "total", "solved"],
        view.volume.buckets.map((b) => [
          b.key,
          b.partial,
          ...CHANNELS.map((c) => b.byChannel[c]),
          b.total,
          b.solved,
        ]),
      );
    case "backlog":
      return wrap(
        ["status", "count", "share"],
        view.backlog.rows.map((r) => [r.status, r.count, rate(r.share)]),
      );
    case "times":
      return wrap(
        ["metric", "measured", "pending", "median_minutes", "p90_minutes", "p90_withheld"],
        [
          [
            "first_response",
            view.times.firstResponse.measured,
            view.times.firstResponse.pending,
            minutes(view.times.firstResponse.medianMs),
            minutes(view.times.firstResponse.p90Ms),
            view.times.firstResponse.p90Withheld,
          ],
          [
            "resolution",
            view.times.resolution.measured,
            view.times.resolution.pending,
            minutes(view.times.resolution.medianMs),
            minutes(view.times.resolution.p90Ms),
            view.times.resolution.p90Withheld,
          ],
        ],
      );
    case "sla": {
      const line = (priority: string, clock: SlaClock, s: SlaClockStats) => [
        priority,
        clock,
        s.met,
        s.breached,
        s.running,
        s.noPolicy,
        rate(s.rate),
      ];
      return wrap(
        ["priority", "clock", "met", "breached", "running", "no_policy", "rate"],
        [
          line("all", "first_response", view.sla.firstResponse),
          line("all", "resolution", view.sla.resolution),
          ...view.sla.byPriority.flatMap((p) => [
            line(p.priority, "first_response", p.firstResponse),
            line(p.priority, "resolution", p.resolution),
          ]),
        ],
      );
    }
    case "agents":
      return wrap(
        [
          "agent_id",
          "agent",
          "open_now",
          "replies",
          "first_responses",
          "median_first_response_minutes",
          "solved",
        ],
        view.agents.rows.map((r) => [
          r.id,
          r.name,
          r.open,
          r.replies,
          r.firstResponses,
          minutes(r.medianFirstResponseMs),
          r.solved,
        ]),
      );
    case "csat":
      return wrap(
        ["score", "count", "share"],
        view.csat.distribution.map((d) => [d.score, d.count, rate(d.share)]),
      );
    case "categories":
      return wrap(
        ["category", "count", "share"],
        view.categories.rows.map((r) => [r.key, r.count, rate(r.share)]),
      );
    case "tags":
      return wrap(
        ["tag", "count", "share"],
        view.tags.rows.map((r) => [r.key, r.count, rate(r.share)]),
      );
    case "organisations":
      return wrap(
        ["organization_id", "slug", "name", "tickets", "open", "resolved", "share"],
        view.organisations.rows.map((r) => [
          r.organizationId,
          r.slug,
          r.name,
          r.tickets,
          r.open,
          r.resolved,
          rate(r.share),
        ]),
      );
  }
}

// ---------------------------------------------------------------------------------------------------
// Loader (runs inside `withPlatform`)
// ---------------------------------------------------------------------------------------------------

const countInt = sql<number>`count(*)::int`;
const PLATFORM_ROLES = ["PLATFORM_SUPPORT", "PLATFORM_ADMIN"] as const;
const OPEN: readonly SupportTicketStatus[] = OPEN_TICKET_STATUSES;

/** `YYYY-MM-DD` of the UTC day or ISO week (Monday) a timestamp falls into. */
const bucketExpr = (column: AnyColumn, bucket: ReportBucket) =>
  sql<string>`to_char(date_trunc(${sql.raw(bucket === "week" ? "'week'" : "'day'")}, (${column} at time zone 'UTC')), 'YYYY-MM-DD')`;

/** Tickets created inside the range, without spam and without tickets merged into another. */
function cohortWhere(range: ReportRange): SQL {
  return and(
    gte(supportTickets.createdAt, range.start),
    lt(supportTickets.createdAt, range.end),
    ne(supportTickets.status, "spam"),
    isNull(supportTickets.mergedIntoId),
  )!;
}

/**
 * Collects the raw rows of the report as `tracksite_ops`: aggregates in SQL where the range can be large
 * (volume, backlog, per-agent counts, organisations) and at most `maxTickets` (`REPORT_MAX_TICKETS`) cohort
 * rows — the oldest first — for the per-ticket figures; the first responders are taken from exactly that
 * sample. No subject, body, requester or e-mail address is selected. `maxTickets` exists for the tests.
 */
export async function loadSupportReportSnapshot(
  tx: Tx,
  range: ReportRange,
  now: Date = new Date(),
  maxTickets: number = REPORT_MAX_TICKETS,
): Promise<SupportReportSnapshot> {
  const where = cohortWhere(range);
  const cohortOrder = [asc(supportTickets.createdAt), asc(supportTickets.id)];

  const created = await tx
    .select({
      bucket: bucketExpr(supportTickets.createdAt, range.bucket),
      channel: supportTickets.channel,
      count: countInt,
    })
    .from(supportTickets)
    .where(where)
    .groupBy(sql`1`, sql`2`);

  const solved = await tx
    .select({ bucket: bucketExpr(supportTickets.resolvedAt, range.bucket), count: countInt })
    .from(supportTickets)
    .where(
      and(
        gte(supportTickets.resolvedAt, range.start),
        lt(supportTickets.resolvedAt, range.end),
        ne(supportTickets.status, "spam"),
        isNull(supportTickets.mergedIntoId),
      ),
    )
    .groupBy(sql`1`);

  const backlog = await tx
    .select({ status: supportTickets.status, count: countInt })
    .from(supportTickets)
    .where(isNull(supportTickets.mergedIntoId))
    .groupBy(supportTickets.status);

  const [openStats] = await tx
    .select({
      unassigned: sql<number>`count(*) filter (where ${supportTickets.assigneeUserId} is null)::int`,
      // a raw aggregate comes back as the driver's string, not through the column's Date mapping
      oldest: sql<Date | string | null>`min(${supportTickets.createdAt})`,
    })
    .from(supportTickets)
    .where(and(inArray(supportTickets.status, [...OPEN]), isNull(supportTickets.mergedIntoId)));

  const [cohortCount] = await tx.select({ n: countInt }).from(supportTickets).where(where);

  const cohortRows = await tx
    .select({
      id: supportTickets.id,
      organizationId: supportTickets.organizationId,
      status: supportTickets.status,
      priority: supportTickets.priority,
      channel: supportTickets.channel,
      category: supportTickets.category,
      tags: supportTickets.tags,
      assigneeUserId: supportTickets.assigneeUserId,
      createdAt: supportTickets.createdAt,
      firstResponseDueAt: supportTickets.firstResponseDueAt,
      resolutionDueAt: supportTickets.resolutionDueAt,
      firstRespondedAt: supportTickets.firstRespondedAt,
      resolvedAt: supportTickets.resolvedAt,
      pausedAt: supportTickets.pausedAt,
      breachedFirstResponse: supportTickets.breachedFirstResponse,
      breachedResolution: supportTickets.breachedResolution,
      satisfaction: supportTickets.satisfaction,
    })
    .from(supportTickets)
    .where(where)
    .orderBy(...cohortOrder)
    .limit(maxTickets);
  const cohort: ReportTicket[] = cohortRows.map(({ satisfaction, ...row }) => ({
    ...row,
    tags: row.tags ?? [],
    satisfactionScore: satisfactionScoreOf(satisfaction),
  }));

  // The first agent message of every loaded cohort ticket: the messages are joined to the same sample the
  // cohort rows come from (same filter, order and cap, as a subquery), so a capped range keeps the agents'
  // first-response figures on exactly the loaded tickets — DISTINCT ON has to order by ticket id, which is
  // not the cohort's creation order, so a cap on this query itself would pick a different sample.
  const cohortSample = tx
    .select({ id: supportTickets.id, createdAt: supportTickets.createdAt })
    .from(supportTickets)
    .where(where)
    .orderBy(...cohortOrder)
    .limit(maxTickets)
    .as("cohort_sample");
  const firstResponderRows = await tx
    .selectDistinctOn([supportMessages.ticketId], {
      ticketId: supportMessages.ticketId,
      authorUserId: supportMessages.authorUserId,
      ticketCreatedAt: cohortSample.createdAt,
      respondedAt: supportMessages.createdAt,
    })
    .from(supportMessages)
    .innerJoin(cohortSample, eq(cohortSample.id, supportMessages.ticketId))
    .where(
      and(eq(supportMessages.direction, "outbound"), eq(supportMessages.authorKind, "agent")),
    )
    .orderBy(asc(supportMessages.ticketId), asc(supportMessages.createdAt));
  // guard against a ticket slipping into the sample between the two statements (each sees its own snapshot)
  const cohortIds = new Set(cohort.map((ticket) => ticket.id));
  const firstResponders = firstResponderRows.filter((row) => cohortIds.has(row.ticketId));

  const agents = await tx
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(inArray(user.platformRole, [...PLATFORM_ROLES]))
    .orderBy(asc(user.name), asc(user.email));

  const agentOpen = await tx
    .select({ userId: sql<string>`${supportTickets.assigneeUserId}`, count: countInt })
    .from(supportTickets)
    .where(
      and(
        inArray(supportTickets.status, [...OPEN]),
        isNotNull(supportTickets.assigneeUserId),
        isNull(supportTickets.mergedIntoId),
      ),
    )
    .groupBy(supportTickets.assigneeUserId);

  const agentReplies = await tx
    .select({ userId: sql<string>`${supportMessages.authorUserId}`, count: countInt })
    .from(supportMessages)
    .where(
      and(
        eq(supportMessages.direction, "outbound"),
        eq(supportMessages.authorKind, "agent"),
        isNotNull(supportMessages.authorUserId),
        gte(supportMessages.createdAt, range.start),
        lt(supportMessages.createdAt, range.end),
      ),
    )
    .groupBy(supportMessages.authorUserId);

  const agentSolved = await tx
    .select({ userId: sql<string>`${supportEvents.actorUserId}`, count: countInt })
    .from(supportEvents)
    .where(
      and(
        eq(supportEvents.kind, "status"),
        eq(supportEvents.actorKind, "agent"),
        isNotNull(supportEvents.actorUserId),
        sql`${supportEvents.payload}->>'to' = 'solved'`,
        gte(supportEvents.createdAt, range.start),
        lt(supportEvents.createdAt, range.end),
      ),
    )
    .groupBy(supportEvents.actorUserId);

  const organisations = await tx
    .select({
      organizationId: supportTickets.organizationId,
      name: organization.name,
      slug: organization.slug,
      tickets: countInt,
      open: sql<number>`count(*) filter (where ${inArray(supportTickets.status, [...OPEN])})::int`,
      resolved: sql<number>`count(*) filter (where ${supportTickets.resolvedAt} is not null)::int`,
    })
    .from(supportTickets)
    .leftJoin(organization, eq(organization.id, supportTickets.organizationId))
    .where(where)
    .groupBy(supportTickets.organizationId, organization.name, organization.slug)
    .orderBy(desc(sql`count(*)`), asc(organization.name))
    .limit(REPORT_TOP_LIMIT);

  const [orgStats] = await tx
    .select({
      distinct: sql<number>`count(distinct ${supportTickets.organizationId})::int`,
      without: sql<number>`count(*) filter (where ${supportTickets.organizationId} is null)::int`,
    })
    .from(supportTickets)
    .where(where);

  const [settings] = await tx
    .select({ csatEnabled: supportSettings.csatEnabled })
    .from(supportSettings)
    .where(eq(supportSettings.id, 1))
    .limit(1);

  return {
    now,
    range,
    created,
    solved,
    backlog,
    unassignedOpen: openStats?.unassigned ?? 0,
    oldestOpenCreatedAt: toDate(openStats?.oldest),
    cohort,
    cohortTotal: cohortCount?.n ?? cohort.length,
    firstResponders,
    agents,
    agentOpen,
    agentReplies,
    agentSolved,
    organisations,
    organisationsDistinct: orgStats?.distinct ?? 0,
    withoutOrganisation: orgStats?.without ?? 0,
    csatEnabled: settings?.csatEnabled ?? true,
  };
}

/** Date of a mapped column or of a raw aggregate (string from the driver); null stays null, garbage becomes null. */
function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** The stored satisfaction score (1–5) or null — a malformed value is ignored, never guessed. */
export function satisfactionScoreOf(value: SupportSatisfaction | null | undefined): number | null {
  const score = value?.score;
  return typeof score === "number" && Number.isInteger(score) && score >= 1 && score <= 5
    ? score
    : null;
}
