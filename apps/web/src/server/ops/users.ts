import "server-only";
import { and, asc, count, desc, eq, gte, ilike, inArray, max, ne, or, sql, type SQL } from "drizzle-orm";
import { PLATFORM_ROLES, isOrgRole, isUlid, isUuid, type OrgRole, type PlatformRole } from "@track-site/core";
import { auditLog, member, organization, passkey, session, twoFactor, user, type DbOrTx, type Tx } from "@track-site/db";
import { eligibleAdminIds } from "./break-glass";
import { opsRequiresTwoFactor, withPlatform, type PlatformContext } from "./platform";

/**
 * Track Operations → Platform users (task O9, docs/17 §3 "Roles"). Admin-only module.
 *
 * - Operators: every account with a platform role, its two-factor state, last sign-in and active sessions
 *   (counts and timestamps from better-auth's `session` rows — never tokens, IP addresses or user agents).
 * - Role changes follow the four-eyes rule: a change filed by one admin is applied by a *different* admin
 *   whenever another eligible admin (verified e-mail, two-factor while the step-up applies) exists who is
 *   neither the proposer nor the affected account. Single-admin fallback — reserved for the case that no
 *   other eligible admin exists at all: the change is applied at once, recorded as self-approved, ticket
 *   reference and reason mandatory. When another eligible admin exists but is the affected account (two
 *   admins, one changes the other), the change is refused (`needsThirdAdmin`) instead of falling back —
 *   otherwise one admin could demote the other and then grant roles alone in two audited steps. An admin
 *   never changes their own role, the last `PLATFORM_ADMIN` is never demoted, and the first admin comes
 *   from the `ops:grant` CLI.
 * - Pending requests live in the append-only audit log itself (`platform.role.propose` rows without a
 *   resolving `platform.role.set` / `decline` / `withdraw` row that names them in `metadata.requestId`):
 *   no extra table, one source of truth, and every step is an audit entry by construction.
 * - Every role change revokes the affected account's sessions (forced sign-out): the stored session rows
 *   are deleted in the same transaction; better-auth's cookie cache can keep a stale copy alive for up to
 *   `SESSION_CACHE_MINUTES` — the UI says so instead of promising an instant effect.
 * - The customer directory is read-only metadata (name, e-mail, memberships and roles, two-factor,
 *   created, last sign-in) with search; the loaders never read tenant data beyond `member`/`organization`.
 *   Its one support tool is the two-factor reset (`resetTwoFactorAction`, `server/security/two-factor-reset.ts`):
 *   reason and ticket reference mandatory for customer accounts, audited with the ticket's organisation.
 *
 * The pure helpers (`roleChangeVerdict`, `approvalVerdict`, `requestState`, filter parsing) carry the rules
 * and are unit-tested; the queries are thin and run as `tracksite_ops` through `withPlatform`.
 */

export const USERS_PATH = "/ops/users";
export const DIRECTORY_PATH = "/ops/users/directory";
export const DIRECTORY_PAGE_SIZE = 25;
export const DETAIL_SESSIONS_LIMIT = 50;
export const DETAIL_AUDIT_LIMIT = 20;
export const HISTORY_LIMIT = 20;
/** a role request nobody decided within a week expires (same window as the team module's approval requests) */
export const ROLE_REQUEST_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** better-auth `session.cookieCache.maxAge` in `server/auth.ts`: a revoked session may pass the cache this long */
export const SESSION_CACHE_MINUTES = 5;
export { ROLE_REASON_MAX, ROLE_REASON_MIN, ROLE_TICKET_MAX } from "@/components/ops/users/constants";
/** ticket references are short identifiers (`SUP-1234`, `#4711`, `INC 2026-09-08/3`), as in the break-glass module */
export const ROLE_TICKET_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _#:./-]{0,99}$/;

export const ROLE_ACTIONS = {
  propose: "platform.role.propose",
  /** the applied change — the same action name the `ops:grant` CLI writes, so the Audit module shows both alike */
  set: "platform.role.set",
  decline: "platform.role.decline",
  withdraw: "platform.role.withdraw",
  sessionsRevoke: "platform.sessions.revoke",
} as const;
const RESOLVING_ACTIONS = [ROLE_ACTIONS.set, ROLE_ACTIONS.decline, ROLE_ACTIONS.withdraw];
const USER_TARGET = "user";

export { isUuid };
export const isPlatformRole = (value: unknown): value is PlatformRole => typeof value === "string" && (PLATFORM_ROLES as readonly string[]).includes(value);

// ---------------------------------------------------------------------------------------------------
// Pure rules (unit-tested)
// ---------------------------------------------------------------------------------------------------

/** Eligible admins who may decide a request: every eligible admin except the proposer and the affected account. */
export function approverCandidates(eligible: readonly string[], proposerId: string, targetId: string): string[] {
  return eligible.filter((id) => id !== proposerId && id !== targetId);
}

/** Whether removing admin rights from `targetId` would leave the platform without any `PLATFORM_ADMIN`. */
export function wouldRemoveLastAdmin(target: { id: string; platformRole: PlatformRole }, nextRole: PlatformRole, adminIds: readonly string[]): boolean {
  if (target.platformRole !== "PLATFORM_ADMIN" || nextRole === "PLATFORM_ADMIN") return false;
  return !adminIds.some((id) => id !== target.id);
}

export type RoleChangeMode = "proposal" | "self";
export type RoleChangeRefusal = "self" | "unchanged" | "lastAdmin" | "emailNotVerified" | "ticketRequired" | "needsThirdAdmin";
export type RoleChangeVerdict = { ok: true; mode: RoleChangeMode } | { ok: false; reason: RoleChangeRefusal };

/** Whether an eligible admin other than the actor exists at all — the single-admin fallback applies only when none does. */
export function otherEligibleAdminExists(eligible: readonly string[], actorId: string): boolean {
  return eligible.some((id) => id !== actorId);
}

/**
 * What filing a role change means for the actor: a request for a second admin (`proposal`) when another
 * eligible admin who is neither the actor nor the affected account exists; the single-admin fallback
 * (`self`: applied at once, self-approved, ticket reference mandatory) only when no other eligible admin
 * exists at all. When another eligible admin exists but cannot approve because they are the affected
 * account (exactly two eligible admins, one changes the other), the change is refused (`needsThirdAdmin`):
 * a third admin has to be granted first, or the `ops:grant` CLI used — the fallback never lets one admin
 * remove the only other admin without a second pair of eyes. Also refused when the actor targets their own
 * account, nothing would change, the last admin would be demoted, or the account has not verified its
 * e-mail (a platform role on an unverified account is never granted — as in the CLI).
 */
export function roleChangeVerdict(input: {
  actorId: string;
  target: { id: string; platformRole: PlatformRole; emailVerified: boolean };
  nextRole: PlatformRole;
  /** every PLATFORM_ADMIN, eligibility aside (the last-admin rule counts all of them) */
  adminIds: readonly string[];
  /** admins who could decide (verified e-mail, two-factor while the step-up applies) */
  eligibleAdminIds: readonly string[];
  ticketRef: string | null;
}): RoleChangeVerdict {
  if (input.actorId === input.target.id) return { ok: false, reason: "self" };
  if (input.nextRole === input.target.platformRole) return { ok: false, reason: "unchanged" };
  if (input.nextRole !== "NONE" && !input.target.emailVerified) return { ok: false, reason: "emailNotVerified" };
  if (wouldRemoveLastAdmin(input.target, input.nextRole, input.adminIds)) return { ok: false, reason: "lastAdmin" };
  if (approverCandidates(input.eligibleAdminIds, input.actorId, input.target.id).length > 0) return { ok: true, mode: "proposal" };
  if (otherEligibleAdminExists(input.eligibleAdminIds, input.actorId)) return { ok: false, reason: "needsThirdAdmin" };
  if (!input.ticketRef?.trim()) return { ok: false, reason: "ticketRequired" };
  return { ok: true, mode: "self" };
}

export type RoleRequestState = "pending" | "stale" | "expired";

/**
 * State of a request at `now`: `expired` after the TTL, `stale` when the account's role no longer matches the
 * role the request started from (changed meanwhile by the CLI or another request), `pending` otherwise.
 */
export function requestState(request: { createdAt: Date; fromRole: PlatformRole }, currentRole: PlatformRole, now: Date): RoleRequestState {
  if (now.getTime() - request.createdAt.getTime() >= ROLE_REQUEST_TTL_MS) return "expired";
  if (currentRole !== request.fromRole) return "stale";
  return "pending";
}

export type ApprovalRefusal = "fourEyes" | "self" | "stale" | "expired" | "lastAdmin" | "emailNotVerified";
export type ApprovalVerdict = { ok: true } | { ok: false; reason: ApprovalRefusal };

/**
 * Whether `approverId` may apply a pending request: a different admin than the proposer (four eyes), never
 * the affected account itself, the request still pending, and the change still lawful (last admin, verified
 * e-mail) at approval time — the rules are re-checked when the change is applied, not only when it was filed.
 */
export function approvalVerdict(input: {
  approverId: string;
  request: { proposedBy: string; targetId: string; fromRole: PlatformRole; toRole: PlatformRole; createdAt: Date };
  target: { platformRole: PlatformRole; emailVerified: boolean };
  adminIds: readonly string[];
  now: Date;
}): ApprovalVerdict {
  const state = requestState(input.request, input.target.platformRole, input.now);
  if (state !== "pending") return { ok: false, reason: state };
  if (input.approverId === input.request.targetId) return { ok: false, reason: "self" };
  if (input.approverId === input.request.proposedBy) return { ok: false, reason: "fourEyes" };
  if (input.request.toRole !== "NONE" && !input.target.emailVerified) return { ok: false, reason: "emailNotVerified" };
  if (wouldRemoveLastAdmin({ id: input.request.targetId, platformRole: input.target.platformRole }, input.request.toRole, input.adminIds)) return { ok: false, reason: "lastAdmin" };
  return { ok: true };
}

export type SessionState = "active" | "expired";

export function sessionState(expiresAt: Date | string, now: Date): SessionState {
  const at = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  return at.getTime() > now.getTime() ? "active" : "expired";
}

// ---------------------------------------------------------------------------------------------------
// Directory filters
// ---------------------------------------------------------------------------------------------------

export const USER_KINDS = ["all", "operators", "customers"] as const;
export type UserKindFilter = (typeof USER_KINDS)[number];
export const TWO_FACTOR_FILTERS = ["all", "on", "off"] as const;
export type TwoFactorFilter = (typeof TWO_FACTOR_FILTERS)[number];
export const USER_SORTS = ["created", "name", "email", "signin"] as const;
export type UserSort = (typeof USER_SORTS)[number];

export interface UserFilters {
  q: string | null;
  kind: UserKindFilter;
  twoFactor: TwoFactorFilter;
  sort: UserSort;
  dir: "asc" | "desc";
  page: number;
}

const DEFAULT_SORT_DIR: Record<UserSort, "asc" | "desc"> = { created: "desc", name: "asc", email: "asc", signin: "desc" };

/** URL → filters; anything invalid falls back to the default (never an error page for a bad link). */
export function parseUserFilters(q: Record<string, string | string[] | undefined>): UserFilters {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const search = one(q.q).trim().slice(0, 64);
  const kind = one(q.kind);
  const twoFactorRaw = one(q.twoFactor);
  const sort = one(q.sort);
  const dir = one(q.dir);
  const page = Number.parseInt(one(q.page), 10);
  const sortKey: UserSort = (USER_SORTS as readonly string[]).includes(sort) ? (sort as UserSort) : "created";
  return {
    q: search.length ? search : null,
    kind: (USER_KINDS as readonly string[]).includes(kind) ? (kind as UserKindFilter) : "all",
    twoFactor: (TWO_FACTOR_FILTERS as readonly string[]).includes(twoFactorRaw) ? (twoFactorRaw as TwoFactorFilter) : "all",
    sort: sortKey,
    dir: dir === "asc" || dir === "desc" ? dir : DEFAULT_SORT_DIR[sortKey],
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, 10_000) : 1,
  };
}

/** Filters → query string (page links keep every other filter). */
export function userQueryString(filters: UserFilters, page: number = filters.page): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.kind !== "all") params.set("kind", filters.kind);
  if (filters.twoFactor !== "all") params.set("twoFactor", filters.twoFactor);
  if (filters.sort !== "created") params.set("sort", filters.sort);
  if (filters.dir !== DEFAULT_SORT_DIR[filters.sort]) params.set("dir", filters.dir);
  if (page > 1) params.set("page", String(page));
  const s = params.toString();
  return s ? `?${s}` : "";
}

export function isUserFiltered(filters: UserFilters): boolean {
  return Boolean(filters.q || filters.kind !== "all" || filters.twoFactor !== "all");
}

// ---------------------------------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------------------------------

export interface MembershipSummary {
  id: string;
  name: string;
  slug: string;
  role: string;
}

export interface SessionSummary {
  /** sessions whose `expires_at` lies in the future */
  active: number;
  /** newest session row (`created_at`) — null when no session row exists any more (rows vanish on sign-out and expiry clean-up) */
  lastSignInAt: string | null;
  /** newest session refresh (`updated_at`) */
  lastSeenAt: string | null;
}

export interface OperatorView {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  twoFactor: boolean;
  platformRole: Exclude<PlatformRole, "NONE">;
  createdAt: string;
  sessions: SessionSummary;
  /** organisations the account is a member of (operators are normally members of none) */
  memberships: number;
  /** the account counts as an approving admin (admin, verified e-mail, two-factor while required) */
  eligible: boolean;
  /** a request for this account is waiting for a decision */
  pendingRequest: boolean;
  viewer: {
    isSelf: boolean;
    /** what a role change filed by the viewer would be for this account (null: refused — own account or last admin) */
    changeMode: RoleChangeMode | null;
    changeRefusal: RoleChangeRefusal | null;
  };
}

export interface RoleActorView {
  kind: string;
  userId: string | null;
  name: string | null;
  detail: string | null;
}

export interface RoleRequestView {
  id: string;
  target: { id: string; name: string | null; email: string | null; platformRole: PlatformRole };
  fromRole: PlatformRole;
  toRole: PlatformRole;
  reason: string;
  ticketRef: string | null;
  proposer: { id: string; name: string | null };
  createdAt: string;
  expiresAt: string;
  state: RoleRequestState;
  viewer: {
    isProposer: boolean;
    /** the request concerns the viewer's own account: the viewer neither applies nor declines it */
    isTarget: boolean;
    /** the viewer may apply the request (null when the request is not pending) */
    approve: ApprovalVerdict | null;
    /** the viewer may decline (any other admin except the affected account, see `isTarget`) or withdraw (the proposer) */
    decline: "decline" | "withdraw";
  };
}

export interface RoleHistoryEntry {
  id: string;
  action: string;
  target: { id: string | null; name: string | null; email: string | null };
  actor: RoleActorView;
  before: PlatformRole | null;
  after: PlatformRole | null;
  selfApproved: boolean;
  requestId: string | null;
  reason: string | null;
  ticketRef: string | null;
  /** sessions deleted by the change (forced sign-out) */
  sessionsRevoked: number | null;
  createdAt: string;
}

export interface PlatformUsersOverview {
  operators: OperatorView[];
  requests: RoleRequestView[];
  history: RoleHistoryEntry[];
  /** every PLATFORM_ADMIN and how many of them may decide requests */
  adminCount: number;
  eligibleAdminCount: number;
  /** an eligible admin other than the viewer exists: the viewer's own requests need a second admin */
  otherAdminExists: boolean;
  requiresTwoFactor: boolean;
  sessionCacheMinutes: number;
  now: string;
}

export interface DirectoryRow {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  twoFactor: boolean;
  platformRole: PlatformRole;
  createdAt: string;
  memberships: MembershipSummary[];
  sessions: SessionSummary;
  /** the viewer's own account: no two-factor reset from here (another admin has to) */
  isSelf: boolean;
}

export interface UserDirectoryPage {
  rows: DirectoryRow[];
  total: number;
  operators: number;
  page: number;
  pageCount: number;
  pageSize: number;
  generatedAt: string;
}

export interface MembershipView {
  id: string;
  organization: { id: string; name: string; slug: string; suspendedAt: string | null };
  role: OrgRole | null;
  rawRole: string;
  joinedAt: string;
}

export interface SessionView {
  id: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  state: SessionState;
  activeOrganization: { id: string; name: string } | null;
}

export interface UserAuditEntryView {
  id: string;
  action: string;
  actor: RoleActorView;
  metadata: Array<{ path: string; value: string }>;
  createdAt: string;
}

export interface UserDetail {
  generatedAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    twoFactor: boolean;
    /** the two-factor secret was verified once (better-auth `two_factor.verified`); null without a two-factor row */
    twoFactorVerified: boolean | null;
    passkeys: number;
    platformRole: PlatformRole;
    locale: string;
    createdAt: string;
    updatedAt: string;
  };
  memberships: MembershipView[];
  sessions: { rows: SessionView[]; active: number; expired: number; truncated: boolean };
  requests: RoleRequestView[];
  audit: UserAuditEntryView[];
  viewer: OperatorView["viewer"] & { canRevokeSessions: boolean };
  sessionCacheMinutes: number;
}

// ---------------------------------------------------------------------------------------------------
// Shared query pieces
// ---------------------------------------------------------------------------------------------------

const iso = (value: Date | string | null | undefined): string | null => (value == null ? null : value instanceof Date ? value.toISOString() : new Date(value).toISOString());
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
const roleOf = (value: string): PlatformRole => (isPlatformRole(value) ? value : "NONE");

/** every PLATFORM_ADMIN id (the last-admin rule counts all of them, eligibility aside) */
async function allAdminIds(tx: DbOrTx): Promise<string[]> {
  const rows = await tx.select({ id: user.id }).from(user).where(eq(user.platformRole, "PLATFORM_ADMIN"));
  return rows.map((r) => r.id);
}

function sessionSummaryCte(tx: Tx) {
  return tx.$with("sess").as(
    tx
      .select({
        userId: session.userId,
        active: sql<number>`count(*) filter (where ${session.expiresAt} > now())`.as("active"),
        lastSignInAt: max(session.createdAt).as("last_sign_in_at"),
        lastSeenAt: max(session.updatedAt).as("last_seen_at"),
      })
      .from(session)
      .groupBy(session.userId),
  );
}

function membershipsCte(tx: Tx) {
  return tx.$with("mem").as(
    tx
      .select({
        userId: member.userId,
        n: count().as("n"),
        list: sql<MembershipSummary[]>`json_agg(json_build_object('id', ${organization.id}, 'name', ${organization.name}, 'slug', ${organization.slug}, 'role', ${member.role}) order by ${organization.name})`.as("list"),
      })
      .from(member)
      .innerJoin(organization, eq(organization.id, member.organizationId))
      .groupBy(member.userId),
  );
}

const summaryOf = (r: { active: number | string | null; lastSignInAt: Date | string | null; lastSeenAt: Date | string | null }): SessionSummary => ({
  active: Number(r.active ?? 0),
  lastSignInAt: iso(r.lastSignInAt),
  lastSeenAt: iso(r.lastSeenAt),
});

/** The stored user of one request, as the propose row carries it in `metadata`. */
export interface RoleRequestRow {
  id: string;
  targetId: string;
  fromRole: PlatformRole;
  toRole: PlatformRole;
  reason: string;
  ticketRef: string | null;
  proposedBy: string;
  createdAt: Date;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length ? value : null;
}

/** A propose row → request; null when the row is not one of ours (defensive: the log is shared with every module). */
export function parseRoleRequest(row: { id: string; targetId: string | null; metadata: Record<string, unknown>; createdAt: Date }): RoleRequestRow | null {
  const m = row.metadata ?? {};
  const fromRole = m.fromRole;
  const toRole = m.toRole;
  const proposedBy = readString(m.proposedBy);
  if (!row.targetId || !isUuid(row.targetId) || !isPlatformRole(fromRole) || !isPlatformRole(toRole) || !proposedBy || !isUuid(proposedBy)) return null;
  return { id: row.id, targetId: row.targetId, fromRole, toRole, reason: readString(m.reason) ?? "", ticketRef: readString(m.ticketRef), proposedBy, createdAt: row.createdAt };
}

/**
 * Requests without a decision inside the TTL: `platform.role.propose` rows that no `set` / `decline` /
 * `withdraw` row names in `metadata.requestId`. Optionally limited to one account (`targetId`).
 */
export async function pendingRoleRequests(tx: DbOrTx, now: Date, targetId?: string): Promise<RoleRequestRow[]> {
  const since = new Date(now.getTime() - ROLE_REQUEST_TTL_MS);
  const proposals = await tx
    .select({ id: auditLog.id, targetId: auditLog.targetId, metadata: auditLog.metadata, createdAt: auditLog.createdAt })
    .from(auditLog)
    .where(and(eq(auditLog.action, ROLE_ACTIONS.propose), eq(auditLog.targetType, USER_TARGET), gte(auditLog.createdAt, since), targetId ? eq(auditLog.targetId, targetId) : undefined))
    .orderBy(desc(auditLog.createdAt))
    .limit(100);
  const parsed = proposals.map(parseRoleRequest).filter((r): r is RoleRequestRow => r !== null);
  if (!parsed.length) return [];
  const targetIds = [...new Set(parsed.map((r) => r.targetId))];
  const resolutions = await tx
    .select({ requestId: sql<string | null>`${auditLog.metadata}->>'requestId'` })
    .from(auditLog)
    .where(and(eq(auditLog.targetType, USER_TARGET), inArray(auditLog.targetId, targetIds), inArray(auditLog.action, RESOLVING_ACTIONS), gte(auditLog.createdAt, since), sql`${auditLog.metadata} ? 'requestId'`));
  const resolved = new Set(resolutions.map((r) => r.requestId).filter((id): id is string => typeof id === "string"));
  return parsed.filter((r) => !resolved.has(r.id));
}

function actorView(actor: Record<string, unknown> | null, names: Map<string, string>): RoleActorView {
  const kind = typeof actor?.kind === "string" ? actor.kind : "unknown";
  const userId = typeof actor?.userId === "string" ? actor.userId : null;
  const detail = typeof actor?.name === "string" ? actor.name : null;
  return { kind, userId, name: userId ? (names.get(userId) ?? null) : null, detail };
}

async function nameLookup(tx: DbOrTx, ids: Iterable<string>): Promise<Map<string, { name: string; email: string }>> {
  const list = [...new Set([...ids].filter(isUuid))];
  if (!list.length) return new Map();
  const rows = await tx.select({ id: user.id, name: user.name, email: user.email }).from(user).where(inArray(user.id, list));
  return new Map(rows.map((r) => [r.id, { name: r.name, email: r.email }]));
}

async function requestViews(tx: DbOrTx, ctx: PlatformContext, rows: RoleRequestRow[], now: Date): Promise<RoleRequestView[]> {
  if (!rows.length) return [];
  const targetIds = [...new Set(rows.map((r) => r.targetId))];
  const targets = await tx.select({ id: user.id, name: user.name, email: user.email, platformRole: user.platformRole, emailVerified: user.emailVerified }).from(user).where(inArray(user.id, targetIds));
  const targetBy = new Map(targets.map((t) => [t.id, t]));
  const names = await nameLookup(tx, rows.map((r) => r.proposedBy));
  const adminIds = await allAdminIds(tx);
  return rows.map((r) => {
    const target = targetBy.get(r.targetId) ?? null;
    const currentRole = target ? roleOf(target.platformRole) : "NONE";
    const state = target ? requestState(r, currentRole, now) : "stale";
    const approve =
      state === "pending" && target
        ? approvalVerdict({ approverId: ctx.user.id, request: { proposedBy: r.proposedBy, targetId: r.targetId, fromRole: r.fromRole, toRole: r.toRole, createdAt: r.createdAt }, target: { platformRole: currentRole, emailVerified: target.emailVerified }, adminIds, now })
        : null;
    return {
      id: r.id,
      target: { id: r.targetId, name: target?.name ?? null, email: target?.email ?? null, platformRole: currentRole },
      fromRole: r.fromRole,
      toRole: r.toRole,
      reason: r.reason,
      ticketRef: r.ticketRef,
      proposer: { id: r.proposedBy, name: names.get(r.proposedBy)?.name ?? null },
      createdAt: r.createdAt.toISOString(),
      expiresAt: new Date(r.createdAt.getTime() + ROLE_REQUEST_TTL_MS).toISOString(),
      state,
      viewer: { isProposer: r.proposedBy === ctx.user.id, isTarget: r.targetId === ctx.user.id, approve, decline: r.proposedBy === ctx.user.id ? "withdraw" : "decline" },
    };
  });
}

function viewerRights(ctx: PlatformContext, target: { id: string; platformRole: PlatformRole; emailVerified: boolean }, adminIds: readonly string[], eligible: readonly string[]): OperatorView["viewer"] {
  const isSelf = target.id === ctx.user.id;
  // the viewer may file a change when at least one other role is lawful for this account (own account and the
  // last admin never are; an unverified account can still lose its role)
  let refusal: RoleChangeRefusal | null = null;
  for (const nextRole of PLATFORM_ROLES) {
    if (nextRole === target.platformRole) continue;
    const verdict = roleChangeVerdict({ actorId: ctx.user.id, target, nextRole, adminIds, eligibleAdminIds: eligible, ticketRef: "probe" });
    if (verdict.ok) return { isSelf, changeMode: verdict.mode, changeRefusal: null };
    refusal ??= verdict.reason;
  }
  return { isSelf, changeMode: null, changeRefusal: refusal ?? "unchanged" };
}

// ---------------------------------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------------------------------

/** Operators, pending role requests and the recent role-change history — everything `/ops/users` shows. */
export async function loadPlatformUsers(ctx: PlatformContext, now: Date = new Date()): Promise<PlatformUsersOverview> {
  return withPlatform(ctx, async (tx) => {
    const sessions = sessionSummaryCte(tx);
    const memberCounts = tx.$with("memc").as(tx.select({ userId: member.userId, n: count().as("n") }).from(member).groupBy(member.userId));
    const rows = await tx
      .with(sessions, memberCounts)
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        twoFactor: user.twoFactorEnabled,
        platformRole: user.platformRole,
        createdAt: user.createdAt,
        active: sql<number>`coalesce(${sessions.active}, 0)::int`.mapWith(Number),
        lastSignInAt: sessions.lastSignInAt,
        lastSeenAt: sessions.lastSeenAt,
        memberships: sql<number>`coalesce(${memberCounts.n}, 0)::int`.mapWith(Number),
      })
      .from(user)
      .leftJoin(sessions, eq(sessions.userId, user.id))
      .leftJoin(memberCounts, eq(memberCounts.userId, user.id))
      .where(ne(user.platformRole, "NONE"))
      .orderBy(desc(sql`${user.platformRole} = 'PLATFORM_ADMIN'`), asc(sql`lower(${user.email})`));
    const eligible = await eligibleAdminIds(tx);
    const adminIds = rows.filter((r) => r.platformRole === "PLATFORM_ADMIN").map((r) => r.id);
    const pending = await pendingRoleRequests(tx, now);
    const pendingTargets = new Set(pending.map((p) => p.targetId));
    const operators: OperatorView[] = rows
      .filter((r): r is typeof r & { platformRole: "PLATFORM_SUPPORT" | "PLATFORM_ADMIN" } => r.platformRole === "PLATFORM_SUPPORT" || r.platformRole === "PLATFORM_ADMIN")
      .map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        emailVerified: r.emailVerified,
        twoFactor: Boolean(r.twoFactor),
        platformRole: r.platformRole,
        createdAt: r.createdAt.toISOString(),
        sessions: summaryOf(r),
        memberships: r.memberships,
        eligible: eligible.includes(r.id),
        pendingRequest: pendingTargets.has(r.id),
        viewer: viewerRights(ctx, { id: r.id, platformRole: r.platformRole, emailVerified: r.emailVerified }, adminIds, eligible),
      }));
    const requests = await requestViews(tx, ctx, pending, now);
    const history = await roleHistory(tx, HISTORY_LIMIT);
    return {
      operators,
      requests,
      history,
      adminCount: adminIds.length,
      eligibleAdminCount: eligible.length,
      otherAdminExists: otherEligibleAdminExists(eligible, ctx.user.id),
      requiresTwoFactor: opsRequiresTwoFactor(),
      sessionCacheMinutes: SESSION_CACHE_MINUTES,
      now: now.toISOString(),
    };
  });
}

/** The newest role-change entries (propose, set — CLI included —, decline, withdraw) across all accounts. */
async function roleHistory(tx: DbOrTx, limit: number, targetId?: string): Promise<RoleHistoryEntry[]> {
  const rows = await tx
    .select({ id: auditLog.id, action: auditLog.action, targetId: auditLog.targetId, actor: auditLog.actor, diff: auditLog.diff, metadata: auditLog.metadata, createdAt: auditLog.createdAt })
    .from(auditLog)
    .where(and(eq(auditLog.targetType, USER_TARGET), inArray(auditLog.action, [ROLE_ACTIONS.propose, ROLE_ACTIONS.set, ROLE_ACTIONS.decline, ROLE_ACTIONS.withdraw]), targetId ? eq(auditLog.targetId, targetId) : undefined))
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(limit);
  const ids = new Set<string>();
  for (const r of rows) {
    if (r.targetId) ids.add(r.targetId);
    const actorId = r.actor?.userId;
    if (typeof actorId === "string") ids.add(actorId);
  }
  const people = await nameLookup(tx, ids);
  const names = new Map([...people].map(([id, p]) => [id, p.name]));
  return rows.map((r) => {
    const m = r.metadata ?? {};
    const change = (r.diff?.platformRole ?? null) as { before?: unknown; after?: unknown } | null;
    const before = change && isPlatformRole(change.before) ? change.before : isPlatformRole(m.fromRole) ? m.fromRole : null;
    const after = change && isPlatformRole(change.after) ? change.after : isPlatformRole(m.toRole) ? m.toRole : null;
    const target = r.targetId ? (people.get(r.targetId) ?? null) : null;
    const revoked = typeof m.sessionsRevoked === "number" ? m.sessionsRevoked : null;
    return {
      id: r.id,
      action: r.action,
      target: { id: r.targetId, name: target?.name ?? null, email: target?.email ?? null },
      actor: actorView(r.actor, names),
      before,
      after,
      selfApproved: m.selfApproved === true,
      requestId: readString(m.requestId),
      reason: readString(m.reason),
      ticketRef: readString(m.ticketRef),
      sessionsRevoked: revoked,
      createdAt: r.createdAt.toISOString(),
    };
  });
}

function directoryWhere(filters: UserFilters): SQL | undefined {
  const where: SQL[] = [];
  if (filters.q) {
    const pattern = `%${escapeLike(filters.q)}%`;
    where.push(or(ilike(user.name, pattern), ilike(user.email, pattern), sql`${user.id}::text ilike ${pattern}`)!);
  }
  if (filters.kind === "operators") where.push(ne(user.platformRole, "NONE"));
  if (filters.kind === "customers") where.push(eq(user.platformRole, "NONE"));
  if (filters.twoFactor === "on") where.push(eq(user.twoFactorEnabled, true));
  if (filters.twoFactor === "off") where.push(sql`coalesce(${user.twoFactorEnabled}, false) = false`);
  return where.length ? and(...where) : undefined;
}

/** One page of the read-only user directory (metadata only); totals are counted, never estimated. */
export async function loadUserDirectory(ctx: PlatformContext, filters: UserFilters, now: Date = new Date()): Promise<UserDirectoryPage> {
  return withPlatform(ctx, async (tx) => {
    const [totals] = await tx
      .select({ total: count(), operators: sql<number>`count(*) filter (where ${user.platformRole} <> 'NONE')`.mapWith(Number) })
      .from(user)
      .where(directoryWhere(filters));
    const total = Number(totals?.total ?? 0);
    const pageCount = Math.max(1, Math.ceil(total / DIRECTORY_PAGE_SIZE));
    const page = Math.min(filters.page, pageCount);
    let rows: DirectoryRow[] = [];
    if (total) {
      const sessions = sessionSummaryCte(tx);
      const memberships = membershipsCte(tx);
      const sortExpr: Record<UserSort, SQL> = {
        created: sql`${user.createdAt}`,
        name: sql`lower(${user.name})`,
        email: sql`lower(${user.email})`,
        signin: sql`${sessions.lastSignInAt}`,
      };
      const direction = filters.dir === "asc" ? sql`asc nulls last` : sql`desc nulls last`;
      const raw = await tx
        .with(sessions, memberships)
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
          emailVerified: user.emailVerified,
          twoFactor: user.twoFactorEnabled,
          platformRole: user.platformRole,
          createdAt: user.createdAt,
          active: sql<number>`coalesce(${sessions.active}, 0)::int`.mapWith(Number),
          lastSignInAt: sessions.lastSignInAt,
          lastSeenAt: sessions.lastSeenAt,
          memberships: sql<MembershipSummary[] | null>`${memberships.list}`,
        })
        .from(user)
        .leftJoin(sessions, eq(sessions.userId, user.id))
        .leftJoin(memberships, eq(memberships.userId, user.id))
        .where(directoryWhere(filters))
        .orderBy(sql`${sortExpr[filters.sort]} ${direction}`, asc(sql`lower(${user.email})`), asc(user.id))
        .limit(DIRECTORY_PAGE_SIZE)
        .offset((page - 1) * DIRECTORY_PAGE_SIZE);
      rows = raw.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        emailVerified: r.emailVerified,
        twoFactor: Boolean(r.twoFactor),
        platformRole: roleOf(r.platformRole),
        createdAt: r.createdAt.toISOString(),
        memberships: Array.isArray(r.memberships) ? r.memberships : [],
        sessions: summaryOf(r),
        isSelf: r.id === ctx.user.id,
      }));
    }
    return { rows, total, operators: Number(totals?.operators ?? 0), page, pageCount, pageSize: DIRECTORY_PAGE_SIZE, generatedAt: now.toISOString() };
  });
}

/** Everything the user detail page shows, or null when the account does not exist. Metadata only. */
export async function loadUserDetail(ctx: PlatformContext, userId: string, now: Date = new Date()): Promise<UserDetail | null> {
  if (!isUuid(userId)) return null;
  return withPlatform(ctx, async (tx): Promise<UserDetail | null> => {
    const [u] = await tx
      .select({ id: user.id, name: user.name, email: user.email, emailVerified: user.emailVerified, twoFactor: user.twoFactorEnabled, platformRole: user.platformRole, locale: user.locale, createdAt: user.createdAt, updatedAt: user.updatedAt })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    if (!u) return null;
    const platformRole = roleOf(u.platformRole);
    const [tf] = await tx.select({ verified: twoFactor.verified }).from(twoFactor).where(eq(twoFactor.userId, u.id)).limit(1);
    const [pk] = await tx.select({ n: count() }).from(passkey).where(eq(passkey.userId, u.id));
    const membershipRows = await tx
      .select({ id: member.id, role: member.role, joinedAt: member.createdAt, orgId: organization.id, orgName: organization.name, orgSlug: organization.slug, suspendedAt: organization.suspendedAt })
      .from(member)
      .innerJoin(organization, eq(organization.id, member.organizationId))
      .where(eq(member.userId, u.id))
      .orderBy(organization.name);
    const [sessionCounts] = await tx
      .select({ active: sql<number>`count(*) filter (where ${session.expiresAt} > now())`.mapWith(Number), expired: sql<number>`count(*) filter (where ${session.expiresAt} <= now())`.mapWith(Number) })
      .from(session)
      .where(eq(session.userId, u.id));
    const sessionRows = await tx
      .select({ id: session.id, createdAt: session.createdAt, updatedAt: session.updatedAt, expiresAt: session.expiresAt, activeOrganizationId: session.activeOrganizationId, orgName: organization.name })
      .from(session)
      .leftJoin(organization, eq(organization.id, session.activeOrganizationId))
      .where(eq(session.userId, u.id))
      .orderBy(desc(session.updatedAt), desc(session.createdAt))
      .limit(DETAIL_SESSIONS_LIMIT);
    const pending = await pendingRoleRequests(tx, now, u.id);
    const requests = await requestViews(tx, ctx, pending, now);
    const auditRows = await tx
      .select({ id: auditLog.id, action: auditLog.action, actor: auditLog.actor, metadata: auditLog.metadata, createdAt: auditLog.createdAt })
      .from(auditLog)
      .where(and(eq(auditLog.targetType, USER_TARGET), eq(auditLog.targetId, u.id)))
      .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
      .limit(DETAIL_AUDIT_LIMIT);
    const actorIds = auditRows.map((r) => r.actor?.userId).filter((id): id is string => typeof id === "string");
    const names = new Map([...(await nameLookup(tx, actorIds))].map(([id, p]) => [id, p.name]));
    const adminIds = await allAdminIds(tx);
    const eligible = await eligibleAdminIds(tx);
    const viewer = viewerRights(ctx, { id: u.id, platformRole, emailVerified: u.emailVerified }, adminIds, eligible);
    const active = Number(sessionCounts?.active ?? 0);
    const expired = Number(sessionCounts?.expired ?? 0);
    return {
      generatedAt: now.toISOString(),
      user: {
        id: u.id,
        name: u.name,
        email: u.email,
        emailVerified: u.emailVerified,
        twoFactor: Boolean(u.twoFactor),
        twoFactorVerified: tf ? Boolean(tf.verified) : null,
        passkeys: Number(pk?.n ?? 0),
        platformRole,
        locale: u.locale,
        createdAt: u.createdAt.toISOString(),
        updatedAt: u.updatedAt.toISOString(),
      },
      memberships: membershipRows.map((m) => ({
        id: m.id,
        organization: { id: m.orgId, name: m.orgName, slug: m.orgSlug, suspendedAt: iso(m.suspendedAt) },
        role: isOrgRole(m.role) ? m.role : null,
        rawRole: m.role,
        joinedAt: m.joinedAt.toISOString(),
      })),
      sessions: {
        rows: sessionRows.map((s) => ({
          id: s.id,
          createdAt: s.createdAt.toISOString(),
          updatedAt: s.updatedAt.toISOString(),
          expiresAt: s.expiresAt.toISOString(),
          state: sessionState(s.expiresAt, now),
          activeOrganization: s.activeOrganizationId && s.orgName ? { id: s.activeOrganizationId, name: s.orgName } : null,
        })),
        active,
        expired,
        truncated: active + expired > sessionRows.length,
      },
      requests,
      audit: auditRows.map((r) => ({
        id: r.id,
        action: r.action,
        actor: actorView(r.actor, names),
        metadata: flattenMetadata(r.metadata),
        createdAt: r.createdAt.toISOString(),
      })),
      // sessions are revoked for operators only: the customer directory is read-only by design
      viewer: { ...viewer, canRevokeSessions: platformRole !== "NONE" },
      sessionCacheMinutes: SESSION_CACHE_MINUTES,
    };
  });
}

/** `{ a: 1, b: { c: "x" } }` → rows `a: 1`, `b.c: x` (strings, at most 40 rows); values are stored redacted already. */
export function flattenMetadata(value: Record<string, unknown> | null | undefined, prefix = "", out: Array<{ path: string; value: string }> = []): Array<{ path: string; value: string }> {
  if (!value) return out;
  for (const [key, v] of Object.entries(value)) {
    if (out.length >= 40) break;
    const path = prefix ? `${prefix}.${key}` : key;
    if (v && typeof v === "object" && !Array.isArray(v)) flattenMetadata(v as Record<string, unknown>, path, out);
    else out.push({ path, value: v == null ? "—" : Array.isArray(v) ? v.map(String).join(", ") : String(v) });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------
// Helpers of the actions (run inside the action's transaction)
// ---------------------------------------------------------------------------------------------------

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  twoFactor: boolean;
  platformRole: PlatformRole;
}

const accountColumns = { id: user.id, name: user.name, email: user.email, emailVerified: user.emailVerified, twoFactor: user.twoFactorEnabled, platformRole: user.platformRole };
const toAccount = (r: { id: string; name: string; email: string; emailVerified: boolean; twoFactor: boolean | null; platformRole: string }): UserAccount => ({ id: r.id, name: r.name, email: r.email, emailVerified: r.emailVerified, twoFactor: Boolean(r.twoFactor), platformRole: roleOf(r.platformRole) });

/** The account by id, locked for the rest of the transaction (`FOR UPDATE`) so two admins cannot decide the same change twice. */
export async function lockAccount(tx: Tx, userId: string): Promise<UserAccount | null> {
  if (!isUuid(userId)) return null;
  const rows = await tx.select(accountColumns).from(user).where(eq(user.id, userId)).for("update").limit(1);
  return rows[0] ? toAccount(rows[0]) : null;
}

/** Exact, case-insensitive e-mail lookup for the "grant a role" form (unique index on `user.email`). */
export async function findAccountByEmail(tx: DbOrTx, email: string): Promise<UserAccount | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const rows = await tx.select(accountColumns).from(user).where(sql`lower(${user.email}) = ${normalized}`).limit(1);
  return rows[0] ? toAccount(rows[0]) : null;
}

/** The propose row by id, decided or not (null when unknown or not one of ours). Actions lock the account first, then confirm openness with `isRequestOpen`. */
export async function readRoleRequest(tx: DbOrTx, requestId: string): Promise<RoleRequestRow | null> {
  if (!isUlid(requestId)) return null;
  const [row] = await tx
    .select({ id: auditLog.id, targetId: auditLog.targetId, metadata: auditLog.metadata, createdAt: auditLog.createdAt })
    .from(auditLog)
    .where(and(eq(auditLog.id, requestId), eq(auditLog.action, ROLE_ACTIONS.propose), eq(auditLog.targetType, USER_TARGET)))
    .limit(1);
  return row ? parseRoleRequest(row) : null;
}

/** Whether the request is still undecided and inside the TTL — evaluated after the account row is locked. */
export async function isRequestOpen(tx: DbOrTx, request: RoleRequestRow, now: Date): Promise<boolean> {
  const open = await pendingRoleRequests(tx, now, request.targetId);
  return open.some((r) => r.id === request.id);
}

/** Ids of the organisations the account is a member of (the support two-factor reset records the ticket's organisation, which must be one of them). */
export async function membershipOrganizationIds(tx: DbOrTx, userId: string): Promise<string[]> {
  const rows = await tx.select({ organizationId: member.organizationId }).from(member).where(eq(member.userId, userId));
  return rows.map((r) => r.organizationId);
}

/** Deletes every stored session of the account (forced sign-out) and returns how many there were. */
export async function revokeSessionsOf(tx: Tx, userId: string): Promise<number> {
  const deleted = await tx.delete(session).where(eq(session.userId, userId)).returning({ id: session.id });
  return deleted.length;
}

export async function adminIdsOf(tx: DbOrTx): Promise<{ all: string[]; eligible: string[] }> {
  return { all: await allAdminIds(tx), eligible: await eligibleAdminIds(tx) };
}
