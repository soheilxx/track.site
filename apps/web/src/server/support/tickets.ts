import "server-only";
import { and, arrayContains, asc, desc, eq, gt, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import {
  SUPPORT_TICKET_STATUSES,
  organization,
  plans,
  subscriptions,
  supportPresence,
  supportSettings,
  supportSlaPolicies,
  supportTeams,
  supportTickets,
  user,
  type SupportEventKind,
  type SupportPresenceMode,
  type SupportTicketChannel,
  type SupportTicketOpenedBy,
  type SupportTicketPriority,
  type SupportTicketStatus,
  type Tx,
} from "@track-site/db";
import {
  PRESENCE_TTL_MS,
  TICKET_BULK_MAX,
  TICKET_EXPORT_MAX_ROWS,
  TICKET_PAGE_SIZE,
  TICKET_TAG_MAX,
  type DefaultViewKey,
  type TicketSort,
} from "@/components/ops/support/list/constants";
import { withPlatform, type PlatformContext } from "@/server/ops/platform";
import { applyPolicyOnPriorityChange, statusTransition, withDeskBusinessHours, type SlaPolicyLike, type SlaPriorityChangeInput, type SlaTicketPatch, type SlaTransitionInput } from "./sla";
import { teamFilterWhere, type TeamFilter } from "./teams";
import {
  DEFAULT_VIEWS,
  isUuid,
  loadSavedViews,
  normalizeTags,
  type SavedView,
  type TicketFilters,
  type ViewFilters,
} from "./views";

/**
 * Track Operations → Support → ticket queue (docs/18 §"Ticket list"): data access and pure helpers for
 * `/ops/support`. Every loader runs as `tracksite_ops` through `withPlatform(ctx, …)` and returns ticket
 * metadata (number, subject, requester, organisation and plan, workflow state, assignee, SLA timestamps,
 * who is viewing) — never message bodies or attachment bytes. Mutations live in
 * `server/ops/actions/support-tickets.ts`; the pure helpers below (SLA state, workflow transitions, tag
 * arithmetic, search patterns, CSV) are unit-tested.
 *
 * The bulk actions keep **no SLA arithmetic of their own**: `ticketStatusChange` delegates to the SLA engine's
 * `statusTransition` (sla.ts, docs/18 §10) with the ticket's own policy, so a pause over a weekend moves due
 * times by business minutes and a reopening restarts the resolution clock at once (the worker only watches
 * tickets that have a due time); `ticketPriorityChange` delegates to `applyPolicyOnPriorityChange`, so the
 * running clocks move by the difference between the old and the new target. The queue adds `reopen_count`
 * and the timeline event kinds on top. The ticket page's `applyTicketChanges`
 * (`server/ops/actions/support-ticket.ts`) makes the same two engine calls with the same policy lookup, so a
 * transition books the same due times whether it is made in bulk or on the ticket page.
 *
 * Search: `ILIKE` over subject, requester name / e-mail and organisation name / slug plus an exact match on
 * the ticket number (`#1234` or `1234`). `pg_trgm` is available on Postgres 18 but not installed by a
 * migration yet; a trigram index is the follow-up once it is (docs/18 §9).
 *
 * SLA states are derived from the stored timestamps alone (`first_response_due_at`, `resolution_due_at`,
 * `first_responded_at`, `resolved_at`, `paused_at`, the worker's breach flags) — a ticket without due times
 * reads "no SLA policy", never a guessed figure.
 *
 * Teams (task N, docs/18 §"Agent-created tickets and teams") — an **additive hook** limited to the team filter
 * and the team column: `ticketWhere` accepts an optional `team` next to the view filters (`TeamFilter` of
 * `./teams`, `any` | `none` | id | slug — `teamFilterWhere` builds the predicate, no join needed) and the
 * base query joins `support_teams` for the row's `team` chip; rows also carry `openedBy` and
 * `slaPendingFirstCustomerReply` (an agent-created ticket whose clocks wait for the first customer reply).
 * The stored view model (`views.ts`) does not carry `team` yet; the page passes the URL's `team` through
 * once the integration stage adds the field there.
 */

export { PRESENCE_TTL_MS, TICKET_BULK_MAX, TICKET_EXPORT_MAX_ROWS, TICKET_PAGE_SIZE, TICKET_TAG_MAX };

// ---------------------------------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------------------------------

export type SlaStateKind = "none" | "paused" | "on_track" | "breached" | "met";
export type SlaPhase = "first_response" | "resolution";

export interface SlaView {
  state: SlaStateKind;
  /** the clock that is running (or was breached); null when nothing is due */
  phase: SlaPhase | null;
  /** ISO due time of that clock */
  dueAt: string | null;
}

export interface SlaSource {
  firstResponseDueAt: Date | string | null;
  resolutionDueAt: Date | string | null;
  firstRespondedAt: Date | string | null;
  resolvedAt: Date | string | null;
  pausedAt: Date | string | null;
  breachedFirstResponse: boolean;
  breachedResolution: boolean;
}

const ms = (value: Date | string | null | undefined): number | null => {
  if (value == null) return null;
  const at = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(at) ? null : at;
};

const iso = (value: Date | string | null | undefined): string | null => {
  const at = ms(value);
  return at == null ? null : new Date(at).toISOString();
};

/**
 * SLA state of a ticket at `nowMs`: the worker's breach flags win; otherwise the running clock (first response
 * until answered, then resolution until solved) is paused, overdue or on track; a ticket whose clocks are all
 * done reads `met`, one without due times `none`.
 */
export function slaState(row: SlaSource, nowMs: number): SlaView {
  const firstDue = ms(row.firstResponseDueAt);
  const resolutionDue = ms(row.resolutionDueAt);
  const responded = ms(row.firstRespondedAt) != null;
  const resolved = ms(row.resolvedAt) != null;
  if (row.breachedFirstResponse && !responded) return { state: "breached", phase: "first_response", dueAt: iso(row.firstResponseDueAt) };
  if (row.breachedResolution && !resolved) return { state: "breached", phase: "resolution", dueAt: iso(row.resolutionDueAt) };
  if (row.breachedFirstResponse || row.breachedResolution) {
    const phase: SlaPhase = row.breachedResolution ? "resolution" : "first_response";
    return { state: "breached", phase, dueAt: iso(phase === "resolution" ? row.resolutionDueAt : row.firstResponseDueAt) };
  }
  let phase: SlaPhase | null = null;
  let due: number | null = null;
  if (!responded && firstDue != null) {
    phase = "first_response";
    due = firstDue;
  } else if (!resolved && resolutionDue != null) {
    phase = "resolution";
    due = resolutionDue;
  }
  if (phase == null || due == null) {
    if (firstDue == null && resolutionDue == null) return { state: "none", phase: null, dueAt: null };
    return { state: "met", phase: null, dueAt: null };
  }
  const dueAt = new Date(due).toISOString();
  if (ms(row.pausedAt) != null) return { state: "paused", phase, dueAt };
  return { state: due < nowMs ? "breached" : "on_track", phase, dueAt };
}

/**
 * Allowed workflow transitions (docs/18 §"Ticket list") — the same matrix as the ticket page's
 * `TICKET_TRANSITIONS` in `ticket.ts`; reopening a solved or closed ticket and restoring a spam ticket go
 * through `open`.
 */
export const TICKET_TRANSITIONS: Record<SupportTicketStatus, readonly SupportTicketStatus[]> = {
  new: ["open", "pending", "on_hold", "solved", "spam"],
  open: ["pending", "on_hold", "solved", "spam"],
  pending: ["open", "on_hold", "solved", "spam"],
  on_hold: ["open", "pending", "solved", "spam"],
  solved: ["closed", "open"],
  closed: ["open"],
  spam: ["open"],
};

/** Target statuses of the bulk status action that hide tickets from the open queues and therefore need a confirmation. */
export const CONFIRMED_STATUSES: readonly SupportTicketStatus[] = ["solved", "closed", "spam"];

export function canTicketTransition(from: SupportTicketStatus, to: SupportTicketStatus): boolean {
  return TICKET_TRANSITIONS[from].includes(to);
}

export function isTicketStatus(value: unknown): value is SupportTicketStatus {
  return typeof value === "string" && (SUPPORT_TICKET_STATUSES as readonly string[]).includes(value);
}

/** The SLA policy columns a status change reads (`support_sla_policies.priorities` / `business_hours`). */
export type TicketSlaPolicy = Pick<SlaPolicyLike, "id" | "priorities" | "businessHours">;

/** What `ticketStatusChange` reads: the engine's transition input plus the queue-owned `reopen_count`. */
export type TicketStatusSource = SlaTransitionInput & { reopenCount: number };

export interface TicketStatusChange {
  /** column patch for `support_tickets`: the engine's SLA patch plus `reopen_count` on a reopening */
  set: SlaTicketPatch & { reopenCount?: number };
  /** timeline events to record next to the change (`status` first; empty when the status is unchanged) */
  events: SupportEventKind[];
  reopened: boolean;
  /** wall-clock milliseconds of the pause this change ended (0 when none ended) */
  pauseEndedMs: number;
}

/**
 * Status change of one ticket in a bulk action — the same transition the ticket page's `applyTicketChanges`
 * applies: the SLA engine's `statusTransition(policy, ticket, to, now)` (docs/18 §10) does the whole clock bookkeeping with
 * the ticket's policy (`pending` pauses; leaving it shifts the running due times by the **business minutes**
 * of the pause; `solved` / `closed` stop the resolution clock and flag a late resolution; reopening a solved
 * or closed ticket clears the stamps and recomputes the resolution due time — and the first-response one
 * while nobody answered — from `now` with `computeDueDates`; `spam` stops every clock). Without a policy the
 * engine leaves due times null and shifts a resume by the wall clock. This helper only adds `reopen_count`
 * and the event kinds; a change to the current status yields an empty patch.
 */
export function ticketStatusChange(policy: TicketSlaPolicy | null | undefined, row: TicketStatusSource, to: SupportTicketStatus, now: Date): TicketStatusChange {
  const transition = statusTransition(policy, row, to, now);
  if (to === row.status) return { set: {}, events: [], reopened: false, pauseEndedMs: 0 };
  const set: TicketStatusChange["set"] = { ...transition.patch };
  const events: SupportEventKind[] = ["status"];
  if (transition.reopened) {
    set.reopenCount = row.reopenCount + 1;
    events.push("reopened");
  }
  return { set, events, reopened: transition.reopened, pauseEndedMs: transition.pauseEndedMs };
}

/** What `ticketPriorityChange` reads: the engine's priority-change input (`createdAt` only for a clock without a due time so far). */
export type TicketPrioritySource = SlaPriorityChangeInput;

export interface TicketPriorityChange {
  /** column patch for `support_tickets`: the new priority plus the engine's clock patch (empty when unchanged) */
  set: SlaTicketPatch & { priority?: SupportTicketPriority };
  /** false when the ticket already has that priority (nothing to write, nothing to record) */
  changed: boolean;
}

/**
 * Priority change of one ticket in a bulk action — the same change the ticket page's `applyTicketChanges`
 * applies: with a policy the SLA engine's `applyPolicyOnPriorityChange(policy, ticket, priority, now)`
 * (docs/18 §10) moves every running clock by the difference between the old and the new target (absorbed
 * pauses stay absorbed; a clock without a due time so far starts from the creation) and sets the breach
 * flags against the new due times — a shorter target can be overdue at once. Without a policy a running
 * clock's due time can no longer be derived and is cleared (never a guessed figure); an answered or resolved
 * clock keeps its stamp. The current priority again yields an empty patch.
 */
export function ticketPriorityChange(policy: TicketSlaPolicy | null | undefined, row: TicketPrioritySource, priority: SupportTicketPriority, now: Date): TicketPriorityChange {
  if (priority === row.priority) return { set: {}, changed: false };
  const set: TicketPriorityChange["set"] = policy ? { ...applyPolicyOnPriorityChange(policy, row, priority, now) } : {};
  if (!policy) {
    if (row.firstRespondedAt === null && row.firstResponseDueAt !== null) set.firstResponseDueAt = null;
    if (row.resolvedAt === null && row.resolutionDueAt !== null) set.resolutionDueAt = null;
  }
  set.priority = priority;
  return { set, changed: true };
}

/** Tags after adding and removing (normalised, unique, capped at TICKET_TAG_MAX); `changed` says whether anything differs. */
export function applyTags(existing: readonly string[], add: readonly string[], remove: readonly string[]): { tags: string[]; added: string[]; removed: string[]; changed: boolean } {
  const removeSet = new Set(normalizeTags([...remove]));
  const base = normalizeTags([...existing]);
  const kept = base.filter((t) => !removeSet.has(t));
  const removed = base.filter((t) => removeSet.has(t));
  const added: string[] = [];
  for (const tag of normalizeTags([...add])) {
    if (kept.includes(tag) || removeSet.has(tag)) continue;
    if (kept.length >= TICKET_TAG_MAX) break;
    kept.push(tag);
    added.push(tag);
  }
  const changed = added.length > 0 || removed.length > 0 || kept.length !== existing.length || kept.some((t, i) => t !== existing[i]);
  return { tags: kept, added, removed, changed };
}

/** `ILIKE` pattern for a free-text search: wildcards of the input are escaped, the match is a substring. */
export function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
}

/** `#1234` / `1234` → 1234; anything else (including huge numbers) → null. */
export function ticketNumberOf(q: string): number | null {
  const m = /^#?(\d{1,12})$/.exec(q.trim());
  return m ? Number.parseInt(m[1]!, 10) : null;
}

/** Sort key of a priority for the client (urgent first). */
export const PRIORITY_RANK: Record<SupportTicketPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

// ---------------------------------------------------------------------------------------------------
// CSV export (metadata only)
// ---------------------------------------------------------------------------------------------------

export const TICKET_CSV_COLUMNS = [
  "number",
  "id",
  "subject",
  "status",
  "priority",
  "channel",
  "organization_id",
  "organization_slug",
  "plan",
  "assignee",
  "tags",
  "sla_state",
  "first_response_due_at",
  "resolution_due_at",
  "first_responded_at",
  "resolved_at",
  "closed_at",
  "merged_into_id",
  "created_at",
  "updated_at",
] as const;

/** RFC 4180 cell: quoted when needed; a leading formula character is neutralised so spreadsheets never execute it. */
export function csvCell(value: string | number | null | undefined): string {
  if (value == null) return "";
  let text = typeof value === "number" ? String(value) : value;
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * CSV of ticket metadata: numbers, subjects, workflow state, organisation and plan, assignee display name,
 * tags and the SLA timestamps. Deliberately without requester names or e-mail addresses (personal data of
 * a contact stays in the console, like the organisations export) and without any message text.
 */
export function ticketsCsv(rows: readonly TicketRow[]): string {
  const lines = [TICKET_CSV_COLUMNS.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.number,
        r.id,
        r.subject,
        r.status,
        r.priority,
        r.channel,
        r.organization?.id ?? null,
        r.organization?.slug ?? null,
        r.planId,
        r.assignee?.name ?? null,
        r.tags.join(";"),
        r.sla.state,
        r.firstResponseDueAt,
        r.resolutionDueAt,
        r.firstRespondedAt,
        r.resolvedAt,
        r.closedAt,
        r.mergedIntoId,
        r.createdAt,
        r.updatedAt,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}

// ---------------------------------------------------------------------------------------------------
// Views (row shapes)
// ---------------------------------------------------------------------------------------------------

export interface SupportOperator {
  id: string;
  name: string;
  email: string;
  platformRole: string;
}

export interface TicketViewer {
  id: string;
  name: string;
  mode: SupportPresenceMode;
}

export interface TicketRow {
  id: string;
  number: number;
  subject: string;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  channel: SupportTicketChannel;
  tags: string[];
  requester: { name: string | null; email: string };
  organization: { id: string; name: string; slug: string } | null;
  /** effective catalogue plan of the organisation (null without organisation) */
  planId: string | null;
  planName: string | null;
  assignee: { id: string; name: string } | null;
  /** the team (queue) the ticket sits in; null = no team (task N; optional so the row shape stays additive for older fixtures) */
  team?: { id: string; name: string; slug: string } | null;
  /** who opened the ticket — `agent` marks a ticket an operator opened on the customer's behalf (task N) */
  openedBy?: SupportTicketOpenedBy;
  /** agent-created ticket whose SLA clocks wait for the first customer reply (both due times null so far, task N) */
  slaPendingFirstCustomerReply?: boolean;
  sla: SlaView;
  firstResponseDueAt: string | null;
  resolutionDueAt: string | null;
  firstRespondedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  lastCustomerMessageAt: string | null;
  lastAgentMessageAt: string | null;
  mergedIntoId: string | null;
  createdAt: string;
  updatedAt: string;
  /** other operators looking at the ticket right now (presence younger than PRESENCE_TTL_MS) */
  viewers: TicketViewer[];
}

export interface PlanOption {
  id: string;
  name: string;
}

export interface TicketPage {
  rows: TicketRow[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  plans: PlanOption[];
  generatedAt: string;
}

export interface ViewCounts {
  defaults: Record<DefaultViewKey, number>;
  saved: Array<{ id: string; count: number }>;
}

// ---------------------------------------------------------------------------------------------------
// SQL
// ---------------------------------------------------------------------------------------------------

const effectivePlan = sql<string | null>`CASE WHEN ${organization.id} IS NULL THEN NULL ELSE coalesce(${subscriptions.planId}, 'starter') END`;

const dateColumn = (field: ViewFilters["dateField"]) => (field === "created" ? supportTickets.createdAt : field === "resolved" ? supportTickets.resolvedAt : supportTickets.updatedAt);

/** Live SLA predicates on the ticket columns (same semantics as `slaState`). */
function slaWhere(kind: Exclude<ViewFilters["sla"], "any">, now: Date): SQL {
  const t = supportTickets;
  const flagged = or(eq(t.breachedFirstResponse, true), eq(t.breachedResolution, true))!;
  const firstOverdue = and(isNull(t.firstRespondedAt), sql`${t.firstResponseDueAt} < ${now}`)!;
  const resolutionOverdue = and(isNull(t.resolvedAt), sql`${t.resolutionDueAt} < ${now}`)!;
  const liveBreach = and(isNull(t.pausedAt), or(firstOverdue, resolutionOverdue))!;
  const firstRunning = and(isNull(t.firstRespondedAt), sql`${t.firstResponseDueAt} >= ${now}`)!;
  const resolutionRunning = and(sql`(${t.firstRespondedAt} IS NOT NULL OR ${t.firstResponseDueAt} IS NULL)`, isNull(t.resolvedAt), sql`${t.resolutionDueAt} >= ${now}`)!;
  switch (kind) {
    case "breached":
      return or(flagged, liveBreach)!;
    case "paused":
      return sql`${t.pausedAt} IS NOT NULL`;
    case "none":
      return and(isNull(t.firstResponseDueAt), isNull(t.resolutionDueAt))!;
    case "on_track":
      return and(sql`NOT (${flagged})`, isNull(t.pausedAt), or(firstRunning, resolutionRunning))!;
  }
}

/** The additive team filter next to the view filters (task N); absent = no team filter. */
export interface TeamFilterAware {
  team?: TeamFilter | null;
}

/** WHERE clauses of a filter set; `q` and the page are applied by the loaders. */
export function ticketWhere(ctx: Pick<PlatformContext, "user">, filters: ViewFilters & { q?: string | null } & TeamFilterAware, now: Date): SQL[] {
  const t = supportTickets;
  const where: SQL[] = [];
  // team hook (task N): `any` adds nothing, `none` = no team, else the team by id or slug
  const team = teamFilterWhere(filters.team);
  if (team) where.push(team);
  if (filters.status.length) where.push(inArray(t.status, filters.status));
  if (filters.priority.length) where.push(inArray(t.priority, filters.priority));
  if (filters.channel.length) where.push(inArray(t.channel, filters.channel));
  if (filters.assignee === "unassigned") where.push(isNull(t.assigneeUserId));
  else if (filters.assignee === "me") where.push(eq(t.assigneeUserId, ctx.user.id));
  else if (filters.assignee !== "any") where.push(eq(t.assigneeUserId, filters.assignee));
  if (filters.organization) {
    if (isUuid(filters.organization)) where.push(eq(t.organizationId, filters.organization));
    else where.push(or(eq(organization.slug, filters.organization.toLowerCase()), ilike(organization.name, likePattern(filters.organization)))!);
  }
  if (filters.plan) where.push(eq(effectivePlan, filters.plan));
  if (filters.tags.length) where.push(arrayContains(t.tags, filters.tags));
  if (filters.sla !== "any") where.push(slaWhere(filters.sla, now));
  const column = dateColumn(filters.dateField);
  if (filters.lastDays) where.push(sql`${column} >= ${now}::timestamptz - make_interval(days => ${filters.lastDays}::int)`);
  else {
    if (filters.from) where.push(sql`${column} >= ${filters.from}::date`);
    if (filters.to) where.push(sql`${column} < (${filters.to}::date + interval '1 day')`);
  }
  if (filters.q) {
    const pattern = likePattern(filters.q);
    const number = ticketNumberOf(filters.q);
    const parts: SQL[] = [ilike(t.subject, pattern), ilike(t.requesterEmail, pattern), ilike(t.requesterName, pattern), ilike(organization.name, pattern), ilike(organization.slug, pattern)];
    if (number != null) parts.push(eq(t.number, number));
    where.push(or(...parts)!);
  }
  return where;
}

const priorityRank = sql`CASE ${supportTickets.priority} WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END`;
const runningDue = sql`CASE WHEN ${supportTickets.firstRespondedAt} IS NULL AND ${supportTickets.firstResponseDueAt} IS NOT NULL THEN ${supportTickets.firstResponseDueAt} ELSE ${supportTickets.resolutionDueAt} END`;

function ticketOrder(sort: TicketSort): SQL[] {
  const t = supportTickets;
  switch (sort) {
    case "updated_asc":
      return [asc(t.updatedAt), asc(t.number)];
    case "created_desc":
      return [desc(t.createdAt), desc(t.number)];
    case "created_asc":
      return [asc(t.createdAt), asc(t.number)];
    case "priority_desc":
      return [priorityRank, desc(t.updatedAt), desc(t.number)];
    case "sla_due_asc":
      return [sql`${runningDue} ASC NULLS LAST`, desc(t.updatedAt), desc(t.number)];
    case "number_desc":
      return [desc(t.number)];
    case "number_asc":
      return [asc(t.number)];
    default:
      return [desc(t.updatedAt), desc(t.number)];
  }
}

const ticketColumns = {
  id: supportTickets.id,
  number: supportTickets.number,
  subject: supportTickets.subject,
  status: supportTickets.status,
  priority: supportTickets.priority,
  channel: supportTickets.channel,
  tags: supportTickets.tags,
  requesterEmail: supportTickets.requesterEmail,
  requesterName: supportTickets.requesterName,
  organizationId: supportTickets.organizationId,
  organizationName: organization.name,
  organizationSlug: organization.slug,
  planId: effectivePlan,
  assigneeUserId: supportTickets.assigneeUserId,
  assigneeName: user.name,
  // team hook (task N)
  teamId: supportTickets.teamId,
  teamName: supportTeams.name,
  teamSlug: supportTeams.slug,
  openedBy: supportTickets.openedBy,
  slaPendingFirstCustomerReply: supportTickets.slaPendingFirstCustomerReply,
  firstResponseDueAt: supportTickets.firstResponseDueAt,
  resolutionDueAt: supportTickets.resolutionDueAt,
  firstRespondedAt: supportTickets.firstRespondedAt,
  resolvedAt: supportTickets.resolvedAt,
  closedAt: supportTickets.closedAt,
  pausedAt: supportTickets.pausedAt,
  breachedFirstResponse: supportTickets.breachedFirstResponse,
  breachedResolution: supportTickets.breachedResolution,
  lastCustomerMessageAt: supportTickets.lastCustomerMessageAt,
  lastAgentMessageAt: supportTickets.lastAgentMessageAt,
  mergedIntoId: supportTickets.mergedIntoId,
  createdAt: supportTickets.createdAt,
  updatedAt: supportTickets.updatedAt,
};

/** Base query of the queue and the export: the ticket, its organisation and effective plan, the assignee's name. */
const ticketQuery = (tx: Tx) =>
  tx
    .select(ticketColumns)
    .from(supportTickets)
    .leftJoin(organization, eq(organization.id, supportTickets.organizationId))
    .leftJoin(subscriptions, eq(subscriptions.organizationId, supportTickets.organizationId))
    .leftJoin(user, eq(user.id, supportTickets.assigneeUserId))
    // team hook (task N): the team chip of the row
    .leftJoin(supportTeams, eq(supportTeams.id, supportTickets.teamId));

type TicketQueryRow = Awaited<ReturnType<typeof ticketQuery>>[number];

function ticketRow(row: TicketQueryRow, now: Date, planNames: Map<string, string>, viewers: TicketViewer[]): TicketRow {
  const planId = row.organizationId ? (row.planId ?? "starter") : null;
  return {
    id: row.id,
    number: Number(row.number),
    subject: row.subject,
    status: row.status,
    priority: row.priority,
    channel: row.channel,
    tags: row.tags ?? [],
    requester: { name: row.requesterName ?? null, email: row.requesterEmail },
    organization: row.organizationId && row.organizationName != null && row.organizationSlug != null ? { id: row.organizationId, name: row.organizationName, slug: row.organizationSlug } : null,
    planId,
    planName: planId ? (planNames.get(planId) ?? planId) : null,
    assignee: row.assigneeUserId ? { id: row.assigneeUserId, name: row.assigneeName ?? "" } : null,
    team: row.teamId && row.teamName != null && row.teamSlug != null ? { id: row.teamId, name: row.teamName, slug: row.teamSlug } : null,
    openedBy: row.openedBy,
    slaPendingFirstCustomerReply: row.slaPendingFirstCustomerReply,
    sla: slaState(row, now.getTime()),
    firstResponseDueAt: iso(row.firstResponseDueAt),
    resolutionDueAt: iso(row.resolutionDueAt),
    firstRespondedAt: iso(row.firstRespondedAt),
    resolvedAt: iso(row.resolvedAt),
    closedAt: iso(row.closedAt),
    lastCustomerMessageAt: iso(row.lastCustomerMessageAt),
    lastAgentMessageAt: iso(row.lastAgentMessageAt),
    mergedIntoId: row.mergedIntoId ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    viewers,
  };
}

async function planOptions(tx: Tx): Promise<PlanOption[]> {
  const rows = await tx.select({ id: plans.id, name: plans.name }).from(plans).orderBy(asc(plans.sortOrder), asc(plans.id));
  return rows.map((p) => ({ id: p.id, name: p.name }));
}

async function countTickets(tx: Tx, where: SQL[]): Promise<number> {
  const [row] = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(supportTickets)
    .leftJoin(organization, eq(organization.id, supportTickets.organizationId))
    .leftJoin(subscriptions, eq(subscriptions.organizationId, supportTickets.organizationId))
    .where(where.length ? and(...where) : undefined);
  return Number(row?.total ?? 0);
}

/** Operators (other than `ctx`) with a fresh presence row on the given tickets. */
async function presenceFor(tx: Tx, ctx: Pick<PlatformContext, "user">, ticketIds: string[], now: Date): Promise<Map<string, TicketViewer[]>> {
  const out = new Map<string, TicketViewer[]>();
  if (ticketIds.length === 0) return out;
  const threshold = new Date(now.getTime() - PRESENCE_TTL_MS);
  const rows = await tx
    .select({ ticketId: supportPresence.ticketId, userId: supportPresence.userId, name: user.name, mode: supportPresence.mode })
    .from(supportPresence)
    .innerJoin(user, eq(user.id, supportPresence.userId))
    .where(and(inArray(supportPresence.ticketId, ticketIds), gt(supportPresence.lastSeenAt, threshold)))
    .orderBy(asc(user.name));
  for (const r of rows) {
    if (r.userId === ctx.user.id) continue;
    const list = out.get(r.ticketId) ?? [];
    list.push({ id: r.userId, name: r.name, mode: r.mode });
    out.set(r.ticketId, list);
  }
  return out;
}

async function ticketRows(tx: Tx, ctx: Pick<PlatformContext, "user">, where: SQL[], sort: TicketSort, window: { limit: number; offset: number }, now: Date, planNames: Map<string, string>, withPresence: boolean): Promise<TicketRow[]> {
  const rows = await ticketQuery(tx)
    .where(where.length ? and(...where) : undefined)
    .orderBy(...ticketOrder(sort))
    .limit(window.limit)
    .offset(window.offset);
  const presence = withPresence
    ? await presenceFor(
        tx,
        ctx,
        rows.map((r) => r.id),
        now,
      )
    : new Map<string, TicketViewer[]>();
  return rows.map((r) => ticketRow(r, now, planNames, presence.get(r.id) ?? []));
}

// ---------------------------------------------------------------------------------------------------
// Loaders (tracksite_ops)
// ---------------------------------------------------------------------------------------------------

/** One page of the queue; totals are counted, never estimated. */
export async function loadTickets(ctx: PlatformContext, filters: TicketFilters, now: Date = new Date()): Promise<TicketPage> {
  return withPlatform(ctx, async (tx) => {
    // sequential on purpose: a transaction runs on one pg client
    const planList = await planOptions(tx);
    const planNames = new Map(planList.map((p) => [p.id, p.name]));
    const where = ticketWhere(ctx, filters, now);
    const total = await countTickets(tx, where);
    const pageCount = Math.max(1, Math.ceil(total / TICKET_PAGE_SIZE));
    const page = Math.min(filters.page, pageCount);
    const rows = total ? await ticketRows(tx, ctx, where, filters.sort, { limit: TICKET_PAGE_SIZE, offset: (page - 1) * TICKET_PAGE_SIZE }, now, planNames, true) : [];
    return { rows, total, page, pageCount, pageSize: TICKET_PAGE_SIZE, plans: planList, generatedAt: now.toISOString() };
  });
}

/** Rows of the CSV export (same filters, at most TICKET_EXPORT_MAX_ROWS); the export itself is audited by the action. */
export async function loadTicketExport(ctx: PlatformContext, filters: TicketFilters, now: Date = new Date()): Promise<{ rows: TicketRow[]; total: number; truncated: boolean }> {
  return withPlatform(ctx, async (tx) => {
    const planList = await planOptions(tx);
    const planNames = new Map(planList.map((p) => [p.id, p.name]));
    const where = ticketWhere(ctx, filters, now);
    const total = await countTickets(tx, where);
    const rows = total ? await ticketRows(tx, ctx, where, filters.sort, { limit: TICKET_EXPORT_MAX_ROWS, offset: 0 }, now, planNames, false) : [];
    return { rows, total, truncated: total > rows.length };
  });
}

/**
 * Ticket counts of every default view and of the operator's saved views in one query (`count(*) FILTER`),
 * for the view tabs and the shell badge. Views are evaluated without search or paging.
 */
export async function loadViewCounts(ctx: PlatformContext, saved?: SavedView[], now: Date = new Date()): Promise<ViewCounts> {
  return withPlatform(ctx, async (tx) => {
    const savedViews = saved ?? (await loadSavedViews(ctx, tx));
    const entries: Array<{ key: string; where: SQL[] }> = [
      ...DEFAULT_VIEWS.map((v) => ({ key: v.key, where: ticketWhere(ctx, v.filters, now) })),
      ...savedViews.map((v) => ({ key: v.id, where: ticketWhere(ctx, v.filters, now) })),
    ];
    const selection: Record<string, SQL<number>> = {};
    entries.forEach((entry, i) => {
      selection[`c${i}`] = entry.where.length ? sql<number>`count(*) FILTER (WHERE ${and(...entry.where)})::int` : sql<number>`count(*)::int`;
    });
    const [row] = await tx
      .select(selection)
      .from(supportTickets)
      .leftJoin(organization, eq(organization.id, supportTickets.organizationId))
      .leftJoin(subscriptions, eq(subscriptions.organizationId, supportTickets.organizationId));
    const counts = entries.map((_, i) => Number((row as Record<string, unknown> | undefined)?.[`c${i}`] ?? 0));
    const defaults = Object.fromEntries(DEFAULT_VIEWS.map((v, i) => [v.key, counts[i] ?? 0])) as Record<DefaultViewKey, number>;
    const savedCounts = savedViews.map((v, i) => ({ id: v.id, count: counts[DEFAULT_VIEWS.length + i] ?? 0 }));
    return { defaults, saved: savedCounts };
  });
}

/**
 * Badge counts for the console shell (`OPS_NAV` "support" entry): open tickets nobody holds, the operator's
 * own open tickets and open tickets with a breached SLA. Counted live; the shell decides which one it shows.
 */
export async function loadSupportNavBadge(ctx: PlatformContext, now: Date = new Date()): Promise<{ unassigned: number; mine: number; breached: number }> {
  const counts = await loadViewCounts(ctx, [], now);
  return { unassigned: counts.defaults.unassigned, mine: counts.defaults.mine, breached: counts.defaults.breached };
}

const PLATFORM_ROLES = ["PLATFORM_SUPPORT", "PLATFORM_ADMIN"] as const;

/** Operators a ticket can be assigned to (display name, e-mail and role; never more). */
export async function loadSupportOperators(ctx: PlatformContext, tx?: Tx): Promise<SupportOperator[]> {
  const query = (t: Tx) =>
    t
      .select({ id: user.id, name: user.name, email: user.email, platformRole: user.platformRole })
      .from(user)
      .where(inArray(user.platformRole, [...PLATFORM_ROLES]))
      .orderBy(asc(user.name), asc(user.email));
  return tx ? query(tx) : withPlatform(ctx, query);
}

/** Catalogue plans for the plan filter. */
export async function loadPlanOptions(ctx: PlatformContext): Promise<PlanOption[]> {
  return withPlatform(ctx, planOptions);
}

/** The columns a bulk action needs of a ticket: identity, workflow state and everything the SLA engine reads. */
const lockedColumns = {
  id: supportTickets.id,
  number: supportTickets.number,
  organizationId: supportTickets.organizationId,
  status: supportTickets.status,
  priority: supportTickets.priority,
  tags: supportTickets.tags,
  assigneeUserId: supportTickets.assigneeUserId,
  slaPolicyId: supportTickets.slaPolicyId,
  pausedAt: supportTickets.pausedAt,
  pauseTotalMs: supportTickets.pauseTotalMs,
  firstResponseDueAt: supportTickets.firstResponseDueAt,
  resolutionDueAt: supportTickets.resolutionDueAt,
  firstRespondedAt: supportTickets.firstRespondedAt,
  resolvedAt: supportTickets.resolvedAt,
  closedAt: supportTickets.closedAt,
  breachedFirstResponse: supportTickets.breachedFirstResponse,
  breachedResolution: supportTickets.breachedResolution,
  reopenCount: supportTickets.reopenCount,
  mergedIntoId: supportTickets.mergedIntoId,
  createdAt: supportTickets.createdAt,
  // the persisted clock start (0018): a priority change on a clock without a due date measures from here
  slaClockStartedAt: supportTickets.slaClockStartedAt,
  // an agent-created ticket still waiting for the first customer reply (0017): the engine books no clocks for it
  slaPendingFirstCustomerReply: supportTickets.slaPendingFirstCustomerReply,
};

/** Locked ticket rows for a bulk action (`FOR UPDATE`, at most TICKET_BULK_MAX ids, missing ids are skipped). */
export async function lockTickets(tx: Tx, ids: string[]) {
  const unique = Array.from(new Set(ids.filter(isUuid))).slice(0, TICKET_BULK_MAX);
  if (unique.length === 0) return [];
  return tx.select(lockedColumns).from(supportTickets).where(inArray(supportTickets.id, unique)).orderBy(asc(supportTickets.number)).for("update");
}

export type LockedTicket = Awaited<ReturnType<typeof lockTickets>>[number];

/** A ticket by its human-facing number (merge target lookup). */
export async function getTicketByNumber(tx: Tx, number: number): Promise<LockedTicket | null> {
  const [row] = await tx.select(lockedColumns).from(supportTickets).where(eq(supportTickets.number, number)).limit(1).for("update");
  return row ?? null;
}

/**
 * The SLA policies of the locked tickets by id (targets and business hours only), one query per bulk action,
 * so every status and priority change runs the engine with the policy the ticket page would use. A ticket
 * without `sla_policy_id` has no SLA (the worker does not watch it either) and gets `null`.
 */
export async function loadTicketPolicies(tx: Tx, rows: ReadonlyArray<Pick<LockedTicket, "slaPolicyId">>): Promise<Map<string, TicketSlaPolicy>> {
  const out = new Map<string, TicketSlaPolicy>();
  const ids = Array.from(new Set(rows.map((r) => r.slaPolicyId).filter((id): id is string => typeof id === "string" && id.length > 0)));
  if (ids.length === 0) return out;
  const policies = await tx.select({ id: supportSlaPolicies.id, priorities: supportSlaPolicies.priorities, businessHours: supportSlaPolicies.businessHours }).from(supportSlaPolicies).where(inArray(supportSlaPolicies.id, ids));
  // a policy without windows runs on the desk's hours (docs/18 §11), like on the ticket page and in the worker
  const [desk] = await tx.select({ businessHours: supportSettings.businessHours }).from(supportSettings).where(eq(supportSettings.id, 1)).limit(1);
  for (const p of policies) out.set(p.id, withDeskBusinessHours(p, desk?.businessHours ?? null));
  return out;
}

/** The policy of one locked ticket from the map (`null` without a policy id or when the policy is gone). */
export function ticketPolicyOf(policies: ReadonlyMap<string, TicketSlaPolicy>, row: Pick<LockedTicket, "slaPolicyId">): TicketSlaPolicy | null {
  return row.slaPolicyId ? (policies.get(row.slaPolicyId) ?? null) : null;
}
