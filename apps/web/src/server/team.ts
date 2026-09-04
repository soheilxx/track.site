import "server-only";
import { and, count, desc, eq, gte, ilike, inArray, lte, notInArray, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { findPlan, isPlanId, planHasFeature, type FeatureKey } from "@track-site/catalog";
import { ORG_ROLES, PERMISSIONS, ROLE_PERMISSIONS, can, isOrgRole, redactDeep, type OrgRole, type Permission } from "@track-site/core";
import { APPROVAL_CHANGE_TYPES, approvalRequests, auditLog, invitation, member, orgSettings, pgErrorCode, user, type ApprovalChangeType, type ApprovalPolicy, type ApprovalRequestStatus, type PlanLimits } from "@track-site/db";
import { logger } from "./db";
import { planLimits } from "./entitlements";
import { withOrg, type OrgContext } from "./session";

/**
 * Team & Access (redesign supplement §8 "Team & Access", §5 Pro entitlements "feinere Rollen,
 * Freigabeprozesse, Vier-Augen-Prinzip und vollständiges Audit Log"). Read side of the module plus
 * the pure rules (permission grouping, approval policy, audit filters) the actions and tests share.
 *
 * Storage: the approval policy lives in `organization_settings.approval_policy` (jsonb) and four-eyes
 * requests in `approval_requests`, both added by `packages/db/drizzle/0012_team_policies.sql`. Until
 * that migration is applied the loaders return an honest "not persisted" state (SQLSTATE 42703 /
 * 42P01) instead of failing; nothing is invented. Every tenant query runs inside `withOrg` (RLS).
 */

// ---------------------------------------------------------------------------------------------------
// Roles and permissions
// ---------------------------------------------------------------------------------------------------

/** Permission areas in display order; a permission's area is the segment before the dot. */
export const PERMISSION_AREAS = ["org", "members", "sites", "domains", "events", "config", "integrations", "credentials", "consent", "privacy", "ai", "billing", "audit", "kill_switch"] as const;
export type PermissionArea = (typeof PERMISSION_AREAS)[number];

export function permissionArea(permission: Permission): PermissionArea {
  return permission.slice(0, permission.indexOf(".")) as PermissionArea;
}

export interface PermissionGroup {
  area: PermissionArea;
  permissions: Array<{ permission: Permission; granted: boolean }>;
  granted: number;
}

/** Every permission grouped by area with the grant of one role (per-member permission view). */
export function permissionGroups(role: OrgRole): PermissionGroup[] {
  const set = ROLE_PERMISSIONS[role];
  return PERMISSION_AREAS.map((area) => {
    const permissions = PERMISSIONS.filter((p) => permissionArea(p) === area).map((permission) => ({ permission, granted: set.has(permission) }));
    return { area, permissions, granted: permissions.filter((p) => p.granted).length };
  });
}

export interface RoleMatrixRow {
  area: PermissionArea;
  permission: Permission;
  roles: Record<OrgRole, boolean>;
}

/** Roles × permissions, straight from `ROLE_PERMISSIONS` (the same table the server enforces). */
export function roleMatrix(): RoleMatrixRow[] {
  return PERMISSIONS.map((permission) => ({
    area: permissionArea(permission),
    permission,
    roles: Object.fromEntries(ORG_ROLES.map((role) => [role, ROLE_PERMISSIONS[role].has(permission)])) as Record<OrgRole, boolean>,
  }));
}

// ---------------------------------------------------------------------------------------------------
// Approval policy (four-eyes)
// ---------------------------------------------------------------------------------------------------

/** Roles that can be granted approval rights; OWNER always has them, the read-only roles never. */
export const APPROVER_ROLE_OPTIONS = ["OWNER", "ADMIN", "DEVELOPER"] as const satisfies readonly OrgRole[];

export const DEFAULT_APPROVAL_POLICY: ApprovalPolicy = { fourEyes: {}, approverRoles: ["OWNER"], updatedAt: null, updatedBy: null };

/** Validates a stored (or submitted) policy: unknown keys drop out, OWNER is always an approver. */
export function normalizeApprovalPolicy(raw: unknown): ApprovalPolicy {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const fourEyesRaw = source.fourEyes && typeof source.fourEyes === "object" && !Array.isArray(source.fourEyes) ? (source.fourEyes as Record<string, unknown>) : {};
  const fourEyes: ApprovalPolicy["fourEyes"] = {};
  for (const type of APPROVAL_CHANGE_TYPES) if (fourEyesRaw[type] === true) fourEyes[type] = true;
  const rolesRaw = Array.isArray(source.approverRoles) ? source.approverRoles : [];
  const approverRoles = APPROVER_ROLE_OPTIONS.filter((role) => role === "OWNER" || rolesRaw.includes(role));
  return {
    fourEyes,
    approverRoles: [...approverRoles],
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : null,
    updatedBy: typeof source.updatedBy === "string" ? source.updatedBy : null,
  };
}

/** Form encoding of the policy editor: `fourEyes.<changeType>` and `approver.<ROLE>` checkboxes. */
export function approvalPolicyFromForm(checked: (name: string) => boolean): Pick<ApprovalPolicy, "fourEyes" | "approverRoles"> {
  const fourEyes: ApprovalPolicy["fourEyes"] = {};
  for (const type of APPROVAL_CHANGE_TYPES) if (checked(`fourEyes.${type}`)) fourEyes[type] = true;
  const approverRoles = APPROVER_ROLE_OPTIONS.filter((role) => role === "OWNER" || checked(`approver.${role}`));
  return { fourEyes, approverRoles: [...approverRoles] };
}

export type ApprovalPolicyChange = { kind: "required" | "relaxed"; changeType: ApprovalChangeType } | { kind: "approverAdded" | "approverRemoved"; role: OrgRole };

/** Effective differences between two policies (what the confirmation dialog and the audit entry list). */
export function diffApprovalPolicy(before: ApprovalPolicy, after: ApprovalPolicy): ApprovalPolicyChange[] {
  const changes: ApprovalPolicyChange[] = [];
  for (const changeType of APPROVAL_CHANGE_TYPES) {
    const was = before.fourEyes[changeType] === true;
    const is = after.fourEyes[changeType] === true;
    if (was !== is) changes.push({ kind: is ? "required" : "relaxed", changeType });
  }
  for (const role of APPROVER_ROLE_OPTIONS) {
    const was = before.approverRoles.includes(role);
    const is = after.approverRoles.includes(role);
    if (was !== is) changes.push({ kind: is ? "approverAdded" : "approverRemoved", role });
  }
  return changes;
}

/** A change is "relaxing" when it drops a four-eyes requirement or widens who may approve. */
export function isRelaxing(changes: ApprovalPolicyChange[]): boolean {
  return changes.some((c) => c.kind === "relaxed" || c.kind === "approverAdded");
}

export function requiresFourEyes(policy: ApprovalPolicy, changeType: ApprovalChangeType): boolean {
  return policy.fourEyes[changeType] === true;
}

/** The requester never approves their own change; approvers are OWNER or a role granted in the policy. */
export function canApprove(policy: ApprovalPolicy, actor: { userId: string; role: OrgRole }, requestedBy: string): boolean {
  if (actor.userId === requestedBy) return false;
  return actor.role === "OWNER" || policy.approverRoles.includes(actor.role);
}

/** Four-eyes requests expire after seven days without a decision (evaluated on read, no job). */
export const APPROVAL_REQUEST_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------------------------------
// Entitlements
// ---------------------------------------------------------------------------------------------------

/** Plans without the full audit log show this many days of history (the Starter retention window). */
export const BASIC_AUDIT_WINDOW_DAYS = 90;
/** The plan that carries the governance features (approval workflows, four eyes, full audit log). */
export const GOVERNANCE_PLAN_ID = "pro";

export interface TeamEntitlements {
  planId: string;
  planName: string;
  status: string;
  approvals: boolean;
  fourEyes: boolean;
  fullAuditLog: boolean;
  fineGrainedRoles: boolean;
  /** seat cap; `null` = no fixed cap (fair use) */
  teamMembers: number | null;
  /** audit history shown; `null` = full history */
  auditWindowDays: number | null;
}

/** Feature gates from the tariff catalogue for the organization's plan (the same source the pricing page uses). */
export function teamEntitlementsFor(planId: string, limits: Pick<PlanLimits, "teamMembers">, status: string): TeamEntitlements {
  const known = isPlanId(planId);
  const has = (key: FeatureKey) => known && planHasFeature(planId, key);
  const fullAuditLog = has("full_audit_log");
  return {
    planId,
    planName: findPlan(planId)?.name ?? planId,
    status,
    approvals: has("approval_workflows"),
    fourEyes: has("four_eyes_principle"),
    fullAuditLog,
    fineGrainedRoles: has("fine_grained_roles"),
    teamMembers: limits.teamMembers ?? null,
    auditWindowDays: fullAuditLog ? null : BASIC_AUDIT_WINDOW_DAYS,
  };
}

export async function loadTeamEntitlements(ctx: OrgContext): Promise<TeamEntitlements> {
  const { planId, limits, status } = await planLimits(ctx);
  return teamEntitlementsFor(planId, limits, status);
}

// ---------------------------------------------------------------------------------------------------
// Members, invitations, seats
// ---------------------------------------------------------------------------------------------------

export interface SeatUsage {
  members: number;
  pending: number;
  cap: number | null;
  remaining: number | null;
  reached: boolean;
}

/** Pending invitations count against the plan's seats so an invitation never exceeds the cap on acceptance. */
export function seatUsage(members: number, pending: number, cap: number | null): SeatUsage {
  if (cap == null) return { members, pending, cap: null, remaining: null, reached: false };
  const remaining = Math.max(0, cap - members - pending);
  return { members, pending, cap, remaining, reached: remaining === 0 };
}

export interface TeamMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: OrgRole;
  twoFactor: boolean;
  joinedAt: Date;
  isSelf: boolean;
}

export interface PendingInvitationView {
  id: string;
  email: string;
  role: OrgRole | null;
  createdAt: Date;
  expiresAt: Date;
  expired: boolean;
  inviterName: string | null;
}

export interface TeamOverview {
  members: TeamMember[];
  invitations: PendingInvitationView[];
  seats: SeatUsage;
  owners: number;
}

/** Members (with 2FA state), pending invitations and seat usage of the organization. */
export async function loadTeam(ctx: OrgContext, entitlements: TeamEntitlements, now: Date = new Date()): Promise<TeamOverview> {
  return withOrg(ctx, async (tx) => {
    const inviter = alias(user, "inviter");
    // sequential on purpose: a transaction runs on one pg client, and concurrent queries on a single client are deprecated (pg 9 removes the implicit queue)
    const memberRows = await tx
      .select({ id: member.id, role: member.role, createdAt: member.createdAt, userId: user.id, name: user.name, email: user.email, twoFactor: user.twoFactorEnabled })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(member.organizationId, ctx.organization.id))
      .orderBy(member.createdAt);
    const invitationRows = await tx
      .select({ id: invitation.id, email: invitation.email, role: invitation.role, createdAt: invitation.createdAt, expiresAt: invitation.expiresAt, inviterName: inviter.name })
      .from(invitation)
      .leftJoin(inviter, eq(inviter.id, invitation.inviterId))
      .where(and(eq(invitation.organizationId, ctx.organization.id), eq(invitation.status, "pending")))
      .orderBy(desc(invitation.createdAt));
    const members: TeamMember[] = memberRows.map((m) => ({
      id: m.id,
      userId: m.userId,
      name: m.name,
      email: m.email,
      role: isOrgRole(m.role) ? m.role : "READ_ONLY",
      twoFactor: Boolean(m.twoFactor),
      joinedAt: m.createdAt,
      isSelf: m.userId === ctx.user.id,
    }));
    const invitations: PendingInvitationView[] = invitationRows.map((i) => ({
      id: i.id,
      email: i.email,
      role: isOrgRole(i.role) ? i.role : null,
      createdAt: i.createdAt,
      expiresAt: i.expiresAt,
      expired: i.expiresAt.getTime() < now.getTime(),
      inviterName: i.inviterName ?? null,
    }));
    const pending = invitations.filter((i) => !i.expired).length;
    return { members, invitations, seats: seatUsage(members.length, pending, entitlements.teamMembers), owners: members.filter((m) => m.role === "OWNER").length };
  });
}

// ---------------------------------------------------------------------------------------------------
// Approval policy + requests (storage)
// ---------------------------------------------------------------------------------------------------

export interface ApprovalPolicyState {
  policy: ApprovalPolicy;
  /** false while migration 0012 is not applied: the editor is shown read-only with an honest note */
  persisted: boolean;
}

/**
 * Migration note: reads `organization_settings.approval_policy` (added by 0012_team_policies.sql).
 * SQLSTATE 42703 (undefined column) means the migration is missing → default policy, `persisted: false`.
 */
export async function loadApprovalPolicy(ctx: OrgContext): Promise<ApprovalPolicyState> {
  return withOrg(ctx, async (tx) => {
    try {
      // nested transaction = SAVEPOINT so a missing column never aborts the outer RLS transaction (25P02)
      const rows = await tx.transaction((sp) => sp.select({ approvalPolicy: orgSettings.approvalPolicy }).from(orgSettings).where(eq(orgSettings.organizationId, ctx.organization.id)).limit(1));
      return { policy: normalizeApprovalPolicy(rows[0]?.approvalPolicy ?? {}), persisted: true };
    } catch (e) {
      if (pgErrorCode(e) !== "42703") throw e;
      logger.warn("organization_settings.approval_policy missing: apply migration 0012_team_policies");
      return { policy: DEFAULT_APPROVAL_POLICY, persisted: false };
    }
  });
}

export type ApprovalRequestEffectiveStatus = ApprovalRequestStatus;

export interface ApprovalRequestView {
  id: string;
  changeType: ApprovalChangeType;
  targetType: string;
  targetId: string;
  /** human label of the target (member name for role changes); null when unknown */
  targetLabel: string | null;
  payload: Record<string, unknown>;
  requestedBy: { userId: string; name: string | null };
  /** stored status with expiry applied on read */
  status: ApprovalRequestEffectiveStatus;
  decidedBy: { userId: string; name: string | null } | null;
  decidedAt: Date | null;
  decisionNote: string | null;
  expiresAt: Date;
  createdAt: Date;
  canDecide: boolean;
  canWithdraw: boolean;
}

export interface ApprovalRequestsState {
  pending: ApprovalRequestView[];
  recent: ApprovalRequestView[];
  persisted: boolean;
}

/** Effective status: a pending request past its expiry reads as expired (no job flips the row). */
export function effectiveRequestStatus(status: ApprovalRequestStatus, expiresAt: Date, now: Date): ApprovalRequestEffectiveStatus {
  return status === "pending" && expiresAt.getTime() < now.getTime() ? "expired" : status;
}

/** Whether the actor may apply/reject a request of this change type: approver rights plus the permission the change itself needs. */
export function canDecideRequest(policy: ApprovalPolicy, entitlements: Pick<TeamEntitlements, "fourEyes">, actor: { userId: string; role: OrgRole }, request: { changeType: ApprovalChangeType; requestedBy: string }): boolean {
  if (!entitlements.fourEyes) return false;
  if (!canApprove(policy, actor, request.requestedBy)) return false;
  const needed: Record<ApprovalChangeType, Permission> = {
    config_publish: "config.publish",
    config_rollback: "config.rollback",
    consent_publish: "consent.manage",
    credential_change: "credentials.write",
    destination_pause: "integrations.manage",
    member_role_change: "members.update",
    kill_switch: "kill_switch.manage",
  };
  return can(actor.role, needed[request.changeType]);
}

/** Open and recent four-eyes requests with the actor's rights on each (names resolved from the member list). */
export async function loadApprovalRequests(ctx: OrgContext, policy: ApprovalPolicy, entitlements: TeamEntitlements, members: TeamMember[], now: Date = new Date()): Promise<ApprovalRequestsState> {
  const names = new Map(members.map((m) => [m.userId, m.name]));
  const memberLabel = new Map(members.map((m) => [m.id, m.name || m.email]));
  return withOrg(ctx, async (tx) => {
    let rows: Array<typeof approvalRequests.$inferSelect>;
    try {
      rows = await tx.transaction((sp) => sp.select().from(approvalRequests).where(eq(approvalRequests.organizationId, ctx.organization.id)).orderBy(desc(approvalRequests.createdAt)).limit(100));
    } catch (e) {
      if (pgErrorCode(e) !== "42P01") throw e;
      logger.warn("approval_requests missing: apply migration 0012_team_policies");
      return { pending: [], recent: [], persisted: false };
    }
    const actor = { userId: ctx.user.id, role: ctx.role };
    const views = rows.map((r): ApprovalRequestView => {
      const status = effectiveRequestStatus(r.status, r.expiresAt, now);
      const pending = status === "pending";
      return {
        id: r.id,
        changeType: r.changeType,
        targetType: r.targetType,
        targetId: r.targetId,
        targetLabel: r.targetType === "member" ? (memberLabel.get(r.targetId) ?? null) : null,
        payload: redactDeep(r.payload ?? {}),
        requestedBy: { userId: r.requestedBy, name: names.get(r.requestedBy) ?? null },
        status,
        decidedBy: r.decidedBy ? { userId: r.decidedBy, name: names.get(r.decidedBy) ?? null } : null,
        decidedAt: r.decidedAt ?? null,
        decisionNote: r.decisionNote ?? null,
        expiresAt: r.expiresAt,
        createdAt: r.createdAt,
        canDecide: pending && canDecideRequest(policy, entitlements, actor, { changeType: r.changeType, requestedBy: r.requestedBy }),
        canWithdraw: pending && (r.requestedBy === ctx.user.id || can(ctx.role, "members.update")),
      };
    });
    return { pending: views.filter((v) => v.status === "pending"), recent: views.filter((v) => v.status !== "pending").slice(0, 20), persisted: true };
  });
}

// ---------------------------------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------------------------------

export const AUDIT_CATEGORIES = ["team", "organization", "sites", "config", "consent", "destinations", "credentials", "privacy", "billing", "ai", "other"] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

/** Action prefixes (the segment before the first dot) per category; everything else is "other". */
const CATEGORY_PREFIXES: Record<Exclude<AuditCategory, "other">, readonly string[]> = {
  team: ["member", "approval_request"],
  organization: ["org", "workspace"],
  sites: ["site", "source_key", "shop", "domain"],
  config: ["config", "quality_issue", "release"],
  consent: ["consent_policy", "consent"],
  destinations: ["destination", "integration"],
  credentials: ["credential"],
  privacy: ["dsar", "retention", "privacy"],
  billing: ["billing", "usage", "subscription"],
  ai: ["ai", "chat", "approval", "agent"],
};
const ALL_PREFIXES = Object.values(CATEGORY_PREFIXES).flat();

export function auditCategory(action: string): AuditCategory {
  const dot = action.indexOf(".");
  const prefix = dot === -1 ? action : action.slice(0, dot);
  for (const [category, prefixes] of Object.entries(CATEGORY_PREFIXES)) if (prefixes.includes(prefix)) return category as AuditCategory;
  return "other";
}

export const AUDIT_PAGE_SIZE = 50;
export const AUDIT_ACTOR_KINDS = ["system", "agent", "source_key"] as const;

export interface AuditFilters {
  category: AuditCategory | "all";
  /** a member's user id, one of AUDIT_ACTOR_KINDS, or null = everyone */
  actor: string | null;
  targetType: string | null;
  q: string | null;
  from: Date | null;
  to: Date | null;
  page: number;
}

const UUID = /^[0-9a-f-]{36}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** URL → filters; anything invalid falls back to the default (never an error page for a bad link). */
export function parseAuditFilters(q: Record<string, string | string[] | undefined>): AuditFilters {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const category = one(q.category) as AuditCategory;
  const actor = one(q.actor);
  const targetType = one(q.target).trim();
  const search = one(q.q).trim().slice(0, 64);
  const from = one(q.from);
  const to = one(q.to);
  const page = Number.parseInt(one(q.page), 10);
  const fromDate = DAY.test(from) ? new Date(`${from}T00:00:00.000Z`) : null;
  const toDate = DAY.test(to) ? new Date(`${to}T23:59:59.999Z`) : null;
  return {
    category: (AUDIT_CATEGORIES as readonly string[]).includes(category) ? category : "all",
    actor: UUID.test(actor) || (AUDIT_ACTOR_KINDS as readonly string[]).includes(actor) ? actor : null,
    targetType: /^[a-z_]{1,40}$/.test(targetType) ? targetType : null,
    q: search.length ? search : null,
    from: fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate : null,
    to: toDate && !Number.isNaN(toDate.getTime()) ? toDate : null,
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, 10_000) : 1,
  };
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Filters → query string (page links keep every other filter). */
export function auditQueryString(filters: AuditFilters, page: number = filters.page): string {
  const params = new URLSearchParams();
  if (filters.category !== "all") params.set("category", filters.category);
  if (filters.actor) params.set("actor", filters.actor);
  if (filters.targetType) params.set("target", filters.targetType);
  if (filters.q) params.set("q", filters.q);
  if (filters.from) params.set("from", isoDay(filters.from));
  if (filters.to) params.set("to", isoDay(filters.to));
  if (page > 1) params.set("page", String(page));
  const s = params.toString();
  return s ? `?${s}` : "";
}

export interface AuditDiffRow {
  path: string;
  value: string;
}

export const DIFF_VALUE_MAX = 160;
export const DIFF_ROWS_MAX = 40;

function diffValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "–";
  if (typeof value === "string") return value.length > DIFF_VALUE_MAX ? `${value.slice(0, DIFF_VALUE_MAX)}…` : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  const json = JSON.stringify(value);
  return json.length > DIFF_VALUE_MAX ? `${json.slice(0, DIFF_VALUE_MAX)}…` : json;
}

/**
 * Flattens a stored diff into dotted-path rows for display. Entries are redacted when written
 * (`recordAudit`) and again here, so a value never reaches the client unredacted even if an older row
 * predates a detector.
 */
export function flattenDiff(diff: unknown): { rows: AuditDiffRow[]; truncated: boolean } {
  const rows: AuditDiffRow[] = [];
  let truncated = false;
  const walk = (value: unknown, path: string, depth: number) => {
    if (rows.length >= DIFF_ROWS_MAX) {
      truncated = true;
      return;
    }
    if (value && typeof value === "object" && depth < 4) {
      if (Array.isArray(value)) {
        if (value.every((v) => v === null || typeof v !== "object")) {
          rows.push({ path, value: value.length ? value.map(diffValue).join(", ") : "[]" });
          return;
        }
        value.forEach((v, i) => walk(v, `${path}[${i}]`, depth + 1));
        return;
      }
      const entries = Object.entries(value as Record<string, unknown>);
      if (!entries.length) {
        rows.push({ path, value: "{}" });
        return;
      }
      for (const [k, v] of entries) walk(v, path ? `${path}.${k}` : k, depth + 1);
      return;
    }
    rows.push({ path: path || "value", value: diffValue(value) });
  };
  if (diff && typeof diff === "object") walk(redactDeep(diff), "", 0);
  return { rows, truncated };
}

export interface AuditActorView {
  kind: "user" | "agent" | "system" | "source_key" | "unknown";
  userId: string | null;
  /** member name; null for a former member or a non-user actor */
  name: string | null;
  role: string | null;
  /** system job name, agent session, source-key id */
  detail: string | null;
}

export function auditActorView(actor: Record<string, unknown> | null, names: Map<string, string>): AuditActorView {
  const kind = typeof actor?.kind === "string" ? actor.kind : "unknown";
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  if (kind === "user") {
    const userId = str(actor?.userId);
    return { kind, userId, name: userId ? (names.get(userId) ?? null) : null, role: str(actor?.role), detail: null };
  }
  if (kind === "agent") {
    const userId = str(actor?.onBehalfOfUserId);
    return { kind, userId, name: userId ? (names.get(userId) ?? null) : null, role: str(actor?.role), detail: str(actor?.chatSessionId) };
  }
  if (kind === "system") return { kind, userId: null, name: null, role: null, detail: str(actor?.name) };
  if (kind === "source_key") return { kind, userId: null, name: null, role: null, detail: str(actor?.sourceKeyId) };
  return { kind: "unknown", userId: null, name: null, role: null, detail: null };
}

export interface AuditEntryView {
  id: string;
  action: string;
  category: AuditCategory;
  targetType: string;
  targetId: string | null;
  actor: AuditActorView;
  diff: AuditDiffRow[];
  diffTruncated: boolean;
  metadata: AuditDiffRow[];
  requestId: string | null;
  createdAt: Date;
}

export interface AuditWindow {
  from: Date | null;
  to: Date | null;
  /** the plan's window cut the requested range */
  limitedByPlan: boolean;
  windowDays: number | null;
}

export interface AuditPage {
  entries: AuditEntryView[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  window: AuditWindow;
  targetTypes: string[];
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Effective range: the plan's window (unless the full audit log is included) intersected with the request. */
export function effectiveAuditWindow(filters: Pick<AuditFilters, "from" | "to">, entitlements: Pick<TeamEntitlements, "auditWindowDays">, now: Date): AuditWindow {
  const days = entitlements.auditWindowDays;
  if (days == null) return { from: filters.from, to: filters.to, limitedByPlan: false, windowDays: null };
  const planFrom = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const limited = !filters.from || filters.from.getTime() < planFrom.getTime();
  return { from: limited ? planFrom : filters.from, to: filters.to, limitedByPlan: limited, windowDays: days };
}

/** One page of the organization's audit log with filters; totals are counted, never estimated. */
export async function loadAuditLog(ctx: OrgContext, filters: AuditFilters, entitlements: TeamEntitlements, names: Map<string, string>, now: Date = new Date()): Promise<AuditPage> {
  const window = effectiveAuditWindow(filters, entitlements, now);
  const where: SQL[] = [eq(auditLog.organizationId, ctx.organization.id)];
  if (window.from) where.push(gte(auditLog.createdAt, window.from));
  if (window.to) where.push(lte(auditLog.createdAt, window.to));
  if (filters.category !== "all") {
    const prefix = sql`split_part(${auditLog.action}, '.', 1)`;
    where.push(filters.category === "other" ? notInArray(prefix, ALL_PREFIXES) : inArray(prefix, [...CATEGORY_PREFIXES[filters.category]]));
  }
  if (filters.actor) {
    where.push(UUID.test(filters.actor) ? sql`(${auditLog.actor}->>'userId' = ${filters.actor} OR ${auditLog.actor}->>'onBehalfOfUserId' = ${filters.actor})` : sql`${auditLog.actor}->>'kind' = ${filters.actor}`);
  }
  if (filters.targetType) where.push(eq(auditLog.targetType, filters.targetType));
  if (filters.q) {
    const pattern = `%${escapeLike(filters.q)}%`;
    where.push(or(ilike(auditLog.action, pattern), ilike(auditLog.targetId, pattern), ilike(auditLog.targetType, pattern), ilike(auditLog.requestId, pattern))!);
  }
  const condition = and(...where);
  return withOrg(ctx, async (tx) => {
    // sequential on purpose (one pg client per transaction)
    const totalRows = await tx.select({ n: count() }).from(auditLog).where(condition);
    const targetRows = await tx
      .selectDistinct({ targetType: auditLog.targetType })
      .from(auditLog)
      .where(and(eq(auditLog.organizationId, ctx.organization.id), window.from ? gte(auditLog.createdAt, window.from) : undefined))
      .orderBy(auditLog.targetType)
      .limit(50);
    const total = Number(totalRows[0]?.n ?? 0);
    const pageCount = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
    const page = Math.min(filters.page, pageCount);
    const rows = total
      ? await tx
          .select()
          .from(auditLog)
          .where(condition)
          .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
          .limit(AUDIT_PAGE_SIZE)
          .offset((page - 1) * AUDIT_PAGE_SIZE)
      : [];
    const entries = rows.map((r): AuditEntryView => {
      const diff = flattenDiff(r.diff);
      const metadata = flattenDiff(r.metadata);
      return {
        id: r.id,
        action: r.action,
        category: auditCategory(r.action),
        targetType: r.targetType,
        targetId: r.targetId ?? null,
        actor: auditActorView(r.actor ?? null, names),
        diff: diff.rows,
        diffTruncated: diff.truncated,
        metadata: metadata.rows,
        requestId: r.requestId ?? null,
        createdAt: r.createdAt,
      };
    });
    return { entries, total, page, pageCount, pageSize: AUDIT_PAGE_SIZE, window, targetTypes: targetRows.map((t) => t.targetType) };
  });
}

/** Names of the organization's members (for actor labels and the actor filter); former members stay unnamed. */
export async function loadMemberNames(ctx: OrgContext): Promise<Map<string, string>> {
  const rows = await withOrg(ctx, (tx) =>
    tx
      .select({ userId: member.userId, name: user.name })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(member.organizationId, ctx.organization.id)),
  );
  return new Map(rows.map((r) => [r.userId, r.name]));
}
