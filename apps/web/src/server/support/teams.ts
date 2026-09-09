import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { supportTeamMembers, supportTeams, supportTickets, user, type SupportTeamRole, type Tx } from "@track-site/db";
import { TEAM_QUERY_PARAM, TEAM_SLUG_PATTERN, isTeamRole, slugifyTeamName } from "@/components/ops/support/teams/constants";

export * from "@/components/ops/support/teams/constants";

/**
 * Support teams / queues (docs/18 §"Agent-created tickets and teams", task N): the loaders of
 * `support_teams` / `support_team_members` (operator-only tables, migration 0017), the team filter model of
 * the ticket queue and the team-aware candidate pool of the round robin. Mutations live in
 * `server/ops/actions/support-teams.ts`; the ticket queue's additive hook (`tickets.ts` — the `team` column
 * and `teamFilterWhere`) and the auto-assignment (`auto-assign.ts` — `teamMemberIds`) import from here, so
 * this module imports neither of them — nor the platform access layer: every loader takes the caller's
 * transaction (`tracksite_ops` through `withPlatform(ctx, …)` in the pages, `tracksite_worker` in the
 * inbound store), which keeps the inbound handler's module graph free of Next request APIs.
 *
 * Rules:
 * - exactly one team is the default (`is_default`, partial unique index); it is the team of an agent-created
 *   ticket whose author belongs to no team, and it can be neither archived nor removed as default — only
 *   replaced by another team (`setDefaultTeamAction`);
 * - an archived team (`archived_at`) keeps its tickets, its members and its slug, is offered in no picker
 *   and no auto-assignment, and can be restored;
 * - a ticket without `team_id` belongs to no queue: the round robin then draws from every agent online, the
 *   queue's `team=none` filter lists it.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string): boolean => UUID.test(value);

const OPERATOR_ROLES = ["PLATFORM_SUPPORT", "PLATFORM_ADMIN"] as const;
const OPEN_STATUSES = ["new", "open", "pending", "on_hold"] as const;

// ---------------------------------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------------------------------

/** What a picker needs: id, slug, name, default flag. */
export interface TeamOption {
  id: string;
  slug: string;
  name: string;
  isDefault: boolean;
}

export interface TeamSummary extends TeamOption {
  description: string;
  archivedAt: string | null;
  memberCount: number;
  /** tickets in `new` / `open` / `pending` / `on_hold` sitting in the team right now (counted, never estimated) */
  openTickets: number;
  createdAt: string;
  updatedAt: string;
}

export interface TeamMemberView {
  userId: string;
  name: string;
  email: string;
  role: SupportTeamRole;
  platformRole: string;
  joinedAt: string;
}

export interface TeamDetail extends TeamSummary {
  members: TeamMemberView[];
}

/** A team an operator belongs to, for the badge on `/ops/users` and the "opened by" default of the new-ticket form. */
export interface TeamBadge {
  id: string;
  slug: string;
  name: string;
  role: SupportTeamRole;
  archived: boolean;
}

/** Operators (display name, e-mail, platform role) a team can be built from. */
export interface TeamOperatorOption {
  id: string;
  name: string;
  email: string;
  platformRole: string;
}

export type TeamRow = typeof supportTeams.$inferSelect;

const iso = (value: Date | string | null | undefined): string | null => (value == null ? null : (value instanceof Date ? value : new Date(value)).toISOString());

export function teamOption(row: Pick<TeamRow, "id" | "slug" | "name" | "isDefault">): TeamOption {
  return { id: row.id, slug: row.slug, name: row.name, isDefault: row.isDefault };
}

// ---------------------------------------------------------------------------------------------------
// Queue filter model (pure, unit-tested)
// ---------------------------------------------------------------------------------------------------

/** `any` = no filter, `none` = tickets without a team, otherwise a team id or slug. */
export type TeamFilter = "any" | "none" | string;

/** URL / form value → filter: absent or unknown → `any`; a team is named by id or slug. */
export function parseTeamFilter(raw: string | string[] | undefined | null): TeamFilter {
  const value = ((Array.isArray(raw) ? raw[0] : raw) ?? "").trim();
  if (!value || value === "any") return "any";
  if (value === "none") return "none";
  if (isUuid(value)) return value.toLowerCase();
  const slug = value.toLowerCase();
  return TEAM_SLUG_PATTERN.test(slug) ? slug : "any";
}

/** The value `ticketQueryString` writes for the filter (null = nothing to write). */
export function teamQueryValue(filter: TeamFilter | null | undefined): string | null {
  return !filter || filter === "any" ? null : filter;
}

export { TEAM_QUERY_PARAM };

/**
 * WHERE clause of the team filter on `support_tickets` (no join needed: a slug is resolved with a scalar
 * subquery). `any` → null (nothing to add).
 */
export function teamFilterWhere(filter: TeamFilter | null | undefined): SQL | null {
  if (!filter || filter === "any") return null;
  if (filter === "none") return isNull(supportTickets.teamId);
  if (isUuid(filter)) return eq(supportTickets.teamId, filter);
  return eq(supportTickets.teamId, sql`(SELECT ${supportTeams.id} FROM ${supportTeams} WHERE ${supportTeams.slug} = ${filter})`);
}

// ---------------------------------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------------------------------

const teamOrder = [desc(supportTeams.isDefault), asc(supportTeams.name), asc(supportTeams.createdAt)];

/** Teams for pickers: active ones (default first, then by name); `includeArchived` adds the archived ones at the end. */
export async function listTeamOptions(tx: Tx, options: { includeArchived?: boolean } = {}): Promise<TeamOption[]> {
  const rows = await tx
    .select({ id: supportTeams.id, slug: supportTeams.slug, name: supportTeams.name, isDefault: supportTeams.isDefault, archivedAt: supportTeams.archivedAt })
    .from(supportTeams)
    .where(options.includeArchived ? undefined : isNull(supportTeams.archivedAt))
    .orderBy(sql`${supportTeams.archivedAt} IS NOT NULL`, ...teamOrder);
  return rows.map(teamOption);
}

export async function getTeamRow(tx: Tx, teamId: string): Promise<TeamRow | null> {
  if (!isUuid(teamId)) return null;
  const [row] = await tx.select().from(supportTeams).where(eq(supportTeams.id, teamId)).limit(1);
  return row ?? null;
}

export async function getTeamBySlug(tx: Tx, slug: string): Promise<TeamRow | null> {
  const [row] = await tx.select().from(supportTeams).where(eq(supportTeams.slug, slug)).limit(1);
  return row ?? null;
}

/** The default team (null only when the seed row was removed). */
export async function getDefaultTeam(tx: Tx): Promise<TeamOption | null> {
  const [row] = await tx.select({ id: supportTeams.id, slug: supportTeams.slug, name: supportTeams.name, isDefault: supportTeams.isDefault }).from(supportTeams).where(eq(supportTeams.isDefault, true)).limit(1);
  return row ? teamOption(row) : null;
}

async function memberCounts(tx: Tx, teamIds: string[]): Promise<Map<string, number>> {
  if (!teamIds.length) return new Map();
  const rows = await tx.select({ teamId: supportTeamMembers.teamId, count: sql<number>`count(*)::int` }).from(supportTeamMembers).where(inArray(supportTeamMembers.teamId, teamIds)).groupBy(supportTeamMembers.teamId);
  return new Map(rows.map((r) => [r.teamId, Number(r.count)]));
}

async function openTicketCounts(tx: Tx, teamIds: string[]): Promise<Map<string, number>> {
  if (!teamIds.length) return new Map();
  const rows = await tx
    .select({ teamId: supportTickets.teamId, count: sql<number>`count(*)::int` })
    .from(supportTickets)
    .where(and(inArray(supportTickets.teamId, teamIds), inArray(supportTickets.status, [...OPEN_STATUSES]), isNull(supportTickets.mergedIntoId)))
    .groupBy(supportTickets.teamId);
  return new Map(rows.map((r) => [r.teamId ?? "", Number(r.count)]));
}

function summaryOf(row: TeamRow, members: number, open: number): TeamSummary {
  return {
    ...teamOption(row),
    description: row.description,
    archivedAt: iso(row.archivedAt),
    memberCount: members,
    openTickets: open,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Every team (archived ones last) with member and open-ticket counts, for the settings page. */
export async function listTeams(tx: Tx): Promise<TeamSummary[]> {
  const rows = await tx
    .select()
    .from(supportTeams)
    .orderBy(sql`${supportTeams.archivedAt} IS NOT NULL`, ...teamOrder);
  const ids = rows.map((r) => r.id);
  const members = await memberCounts(tx, ids);
  const open = await openTicketCounts(tx, ids);
  return rows.map((r) => summaryOf(r, members.get(r.id) ?? 0, open.get(r.id) ?? 0));
}

/** Members of a team (leads first, then by name) — display name, e-mail and platform role only. */
export async function listTeamMembers(tx: Tx, teamId: string): Promise<TeamMemberView[]> {
  const rows = await tx
    .select({ userId: supportTeamMembers.userId, role: supportTeamMembers.role, joinedAt: supportTeamMembers.createdAt, name: user.name, email: user.email, platformRole: user.platformRole })
    .from(supportTeamMembers)
    .innerJoin(user, eq(user.id, supportTeamMembers.userId))
    .where(eq(supportTeamMembers.teamId, teamId))
    .orderBy(sql`CASE ${supportTeamMembers.role} WHEN 'lead' THEN 0 ELSE 1 END`, asc(user.name), asc(user.email));
  return rows.map((r) => ({ userId: r.userId, name: r.name, email: r.email, role: isTeamRole(r.role) ? r.role : "member", platformRole: r.platformRole, joinedAt: r.joinedAt.toISOString() }));
}

/** One team with its members; null for an unknown id. */
export async function loadTeam(tx: Tx, teamId: string): Promise<TeamDetail | null> {
  if (!isUuid(teamId)) return null;
  const row = await getTeamRow(tx, teamId);
  if (!row) return null;
  const members = await listTeamMembers(tx, row.id);
  const open = await openTicketCounts(tx, [row.id]);
  return { ...summaryOf(row, members.length, open.get(row.id) ?? 0), members };
}

/** Operators a team can be built from (both platform roles), by name. */
export async function listTeamOperatorOptions(tx: Tx): Promise<TeamOperatorOption[]> {
  return tx
    .select({ id: user.id, name: user.name, email: user.email, platformRole: user.platformRole })
    .from(user)
    .where(inArray(user.platformRole, [...OPERATOR_ROLES]))
    .orderBy(asc(user.name), asc(user.email));
}

/** Ids of the operators in a team (empty set for an unknown team). */
export async function teamMemberIds(tx: Tx, teamId: string): Promise<Set<string>> {
  if (!isUuid(teamId)) return new Set();
  const rows = await tx.select({ userId: supportTeamMembers.userId }).from(supportTeamMembers).where(eq(supportTeamMembers.teamId, teamId));
  return new Set(rows.map((r) => r.userId));
}

/** Teams of several operators at once (for the badges on `/ops/users`), leads first then by team name. */
export async function loadUserTeams(tx: Tx, userIds: readonly string[]): Promise<Map<string, TeamBadge[]>> {
  const out = new Map<string, TeamBadge[]>();
  const ids = Array.from(new Set(userIds.filter(isUuid)));
  if (!ids.length) return out;
  const rows = await tx
    .select({ userId: supportTeamMembers.userId, role: supportTeamMembers.role, id: supportTeams.id, slug: supportTeams.slug, name: supportTeams.name, archivedAt: supportTeams.archivedAt })
    .from(supportTeamMembers)
    .innerJoin(supportTeams, eq(supportTeams.id, supportTeamMembers.teamId))
    .where(inArray(supportTeamMembers.userId, ids))
    .orderBy(sql`CASE ${supportTeamMembers.role} WHEN 'lead' THEN 0 ELSE 1 END`, asc(supportTeams.name));
  for (const r of rows) {
    const list = out.get(r.userId) ?? [];
    list.push({ id: r.id, slug: r.slug, name: r.name, role: isTeamRole(r.role) ? r.role : "member", archived: r.archivedAt != null });
    out.set(r.userId, list);
  }
  return out;
}

/** Teams of one operator. */
export async function loadTeamsOfUser(tx: Tx, userId: string): Promise<TeamBadge[]> {
  return (await loadUserTeams(tx, [userId])).get(userId) ?? [];
}

/**
 * The team a ticket an operator opens defaults to: the operator's own (active) team — a lead role first,
 * then the earliest joined — else the desk's default team; null when no team exists at all.
 */
export async function defaultTeamForAgent(tx: Tx, userId: string): Promise<TeamOption | null> {
  const own = (await loadTeamsOfUser(tx, userId)).filter((t) => !t.archived);
  if (own.length) {
    const first = own[0]!;
    return { id: first.id, slug: first.slug, name: first.name, isDefault: false };
  }
  return getDefaultTeam(tx);
}

// ---------------------------------------------------------------------------------------------------
// Pure helpers of the settings actions (unit-tested)
// ---------------------------------------------------------------------------------------------------

export interface TeamAuditFields {
  slug: string;
  name: string;
  description: string;
  isDefault: boolean;
  archivedAt: string | null;
}

/** Field changes between two states (ids and field values only). */
export function teamAuditDiff(before: TeamAuditFields | null, after: TeamAuditFields): Record<string, unknown> {
  const diff: Record<string, unknown> = {};
  for (const key of Object.keys(after) as Array<keyof TeamAuditFields>) {
    const prev = before ? before[key] : null;
    if (before && prev === after[key]) continue;
    diff[key] = before ? { before: prev, after: after[key] } : after[key];
  }
  return diff;
}

export function auditFieldsOf(row: Pick<TeamRow, "slug" | "name" | "description" | "isDefault" | "archivedAt">): TeamAuditFields {
  return { slug: row.slug, name: row.name, description: row.description, isDefault: row.isDefault, archivedAt: iso(row.archivedAt) };
}

/** The slug a new team gets: the given one when valid, else derived from the name; null when neither works. */
export function resolveTeamSlug(name: string, slug: string | null | undefined): string | null {
  const explicit = (slug ?? "").trim().toLowerCase();
  if (explicit) return TEAM_SLUG_PATTERN.test(explicit) ? explicit : null;
  return slugifyTeamName(name);
}
