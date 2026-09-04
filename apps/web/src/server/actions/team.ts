"use server";

import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ORG_ROLES, assignableRoles, can, isOrgRole, type OrgRole } from "@track-site/core";
import { approvalRequests, invitation, member, orgSettings, recordAudit, user } from "@track-site/db";
import { auth } from "@/server/auth";
import { requireOrgContext, withOrg } from "@/server/session";
import { APPROVAL_REQUEST_TTL_MS, approvalPolicyFromForm, canDecideRequest, diffApprovalPolicy, effectiveRequestStatus, isRelaxing, loadApprovalPolicy, loadTeamEntitlements, normalizeApprovalPolicy, requiresFourEyes, seatUsage } from "@/server/team";
import type { ActionState } from "./organization";

/**
 * Team & Access actions. Every action requires the permission of the change, validates its input
 * with zod, writes an audit entry and revalidates the module. Risky changes (removing a member,
 * giving or taking the OWNER role, relaxing the approval policy, applying a four-eyes request) are
 * confirmed in the UI and re-checked here through the `confirm` field. When the organization's
 * approval policy puts role changes behind four eyes, the change is stored as a request instead of
 * executed; a different member with approver rights applies it.
 */
export type TeamNotice = "invited" | "resent" | "cancelled" | "roleUpdated" | "roleRequested" | "removed" | "policySaved" | "policyUnchanged" | "requestApplied" | "requestRejected" | "requestWithdrawn";

export interface TeamActionState extends ActionState {
  notice?: TeamNotice | null;
}

type OrgApi = {
  createInvitation: (args: { body: { email: string; role: string; organizationId: string; resend?: boolean }; headers: Headers }) => Promise<unknown>;
  cancelInvitation: (args: { body: { invitationId: string }; headers: Headers }) => Promise<unknown>;
  updateMemberRole: (args: { body: { memberId: string; role: string; organizationId: string }; headers: Headers }) => Promise<unknown>;
  removeMember: (args: { body: { memberIdOrEmail: string; organizationId: string }; headers: Headers }) => Promise<unknown>;
};

const api = () => auth().api as unknown as OrgApi;
const roleSchema = z.enum(ORG_ROLES as unknown as [OrgRole, ...OrgRole[]]);
const uuid = z.string().uuid();
const TEAM_PATHS = ["/app/team", "/app/team/audit"];

function revalidateTeam(): void {
  for (const path of TEAM_PATHS) revalidatePath(path);
}

const fail = (error: string, fieldErrors?: Record<string, string>): TeamActionState => ({ ok: false, error, notice: null, ...(fieldErrors ? { fieldErrors } : {}) });
const done = (notice: TeamNotice): TeamActionState => ({ ok: true, error: null, notice });

/** Invites by e-mail (better-auth sends the mail); seats and duplicates are checked first. */
export async function inviteMemberAction(_prev: TeamActionState, formData: FormData): Promise<TeamActionState> {
  const ctx = await requireOrgContext("members.invite");
  const parsed = z.object({ email: z.string().trim().email().max(254), role: roleSchema }).safeParse({ email: formData.get("email"), role: formData.get("role") });
  if (!parsed.success) return fail("email", { email: "email" });
  const email = parsed.data.email.toLowerCase();
  if (!assignableRoles(ctx.role).includes(parsed.data.role)) return fail("forbidden");
  const entitlements = await loadTeamEntitlements(ctx);
  const check = await withOrg(ctx, async (tx) => {
    const members = await tx.select({ userId: member.userId, email: user.email }).from(member).innerJoin(user, eq(user.id, member.userId)).where(eq(member.organizationId, ctx.organization.id));
    const pending = await tx.select({ id: invitation.id, email: invitation.email, expiresAt: invitation.expiresAt }).from(invitation).where(and(eq(invitation.organizationId, ctx.organization.id), eq(invitation.status, "pending")));
    const now = Date.now();
    if (members.some((m) => m.email.toLowerCase() === email)) return "alreadyMember" as const;
    if (pending.some((i) => i.email.toLowerCase() === email && i.expiresAt.getTime() > now)) return "alreadyInvited" as const;
    const seats = seatUsage(members.length, pending.filter((i) => i.expiresAt.getTime() > now).length, entitlements.teamMembers);
    if (seats.reached) return "seatLimit" as const;
    return null;
  });
  if (check) return fail(check);
  try {
    await api().createInvitation({ body: { email, role: parsed.data.role, organizationId: ctx.organization.id, resend: true }, headers: await headers() });
  } catch {
    return fail("generic");
  }
  await withOrg(ctx, (tx) => recordAudit(tx, { organizationId: ctx.organization.id, actor: ctx.tenant.actor, action: "member.invite", targetType: "organization", targetId: ctx.organization.id, diff: { role: parsed.data.role }, requestId: ctx.tenant.requestId }));
  revalidateTeam();
  return done("invited");
}

/** Sends the invitation mail again (same e-mail and role); the expiry is renewed by better-auth. */
export async function resendInvitationAction(_prev: TeamActionState, formData: FormData): Promise<TeamActionState> {
  const ctx = await requireOrgContext("members.invite");
  const parsed = uuid.safeParse(formData.get("invitationId"));
  if (!parsed.success) return fail("generic");
  const row = await withOrg(ctx, async (tx) => {
    const rows = await tx
      .select({ id: invitation.id, email: invitation.email, role: invitation.role })
      .from(invitation)
      .where(and(eq(invitation.organizationId, ctx.organization.id), eq(invitation.id, parsed.data), eq(invitation.status, "pending")))
      .limit(1);
    return rows[0] ?? null;
  });
  if (!row) return fail("notFound");
  const role = isOrgRole(row.role) ? row.role : "READ_ONLY";
  if (!assignableRoles(ctx.role).includes(role)) return fail("forbidden");
  try {
    await api().createInvitation({ body: { email: row.email, role, organizationId: ctx.organization.id, resend: true }, headers: await headers() });
  } catch {
    return fail("generic");
  }
  await withOrg(ctx, (tx) => recordAudit(tx, { organizationId: ctx.organization.id, actor: ctx.tenant.actor, action: "member.invite_resend", targetType: "invitation", targetId: row.id, diff: { role }, requestId: ctx.tenant.requestId }));
  revalidateTeam();
  return done("resent");
}

export async function cancelInvitationAction(_prev: TeamActionState, formData: FormData): Promise<TeamActionState> {
  const ctx = await requireOrgContext("members.invite");
  const parsed = uuid.safeParse(formData.get("invitationId"));
  if (!parsed.success) return fail("generic");
  try {
    await api().cancelInvitation({ body: { invitationId: parsed.data }, headers: await headers() });
  } catch {
    return fail("generic");
  }
  await withOrg(ctx, (tx) => recordAudit(tx, { organizationId: ctx.organization.id, actor: ctx.tenant.actor, action: "member.invite_cancel", targetType: "invitation", targetId: parsed.data, requestId: ctx.tenant.requestId }));
  revalidateTeam();
  return done("cancelled");
}

/**
 * Role change. OWNER changes need the `owner` confirmation and the last OWNER cannot be demoted.
 * Behind four eyes (policy + plan) the change becomes an approval request for a different member.
 */
export async function updateMemberRoleAction(_prev: TeamActionState, formData: FormData): Promise<TeamActionState> {
  const ctx = await requireOrgContext("members.update");
  const parsed = z.object({ memberId: uuid, role: roleSchema, confirm: z.enum(["owner"]).nullable() }).safeParse({ memberId: formData.get("memberId"), role: formData.get("role"), confirm: formData.get("confirm") || null });
  if (!parsed.success) return fail("generic");
  const { memberId, role, confirm } = parsed.data;
  if (!assignableRoles(ctx.role).includes(role)) return fail("forbidden");
  const [entitlements, policyState] = await Promise.all([loadTeamEntitlements(ctx), loadApprovalPolicy(ctx)]);
  const fourEyes = entitlements.fourEyes && requiresFourEyes(policyState.policy, "member_role_change");

  const outcome = await withOrg(ctx, async (tx) => {
    const rows = await tx.select({ id: member.id, userId: member.userId, role: member.role }).from(member).where(eq(member.organizationId, ctx.organization.id));
    const target = rows.find((m) => m.id === memberId);
    if (!target) return { error: "notFound" as const };
    if (target.userId === ctx.user.id) return { error: "self" as const };
    if (target.role === role) return { error: "sameRole" as const };
    if (target.role === "OWNER" && ctx.role !== "OWNER") return { error: "forbidden" as const };
    const ownerInvolved = target.role === "OWNER" || role === "OWNER";
    if (ownerInvolved && confirm !== "owner") return { error: "confirmOwner" as const };
    if (target.role === "OWNER" && rows.filter((m) => m.role === "OWNER").length <= 1) return { error: "lastOwner" as const };
    if (!fourEyes) return { apply: true as const, fromRole: target.role };
    const open = await tx
      .select({ id: approvalRequests.id, expiresAt: approvalRequests.expiresAt })
      .from(approvalRequests)
      .where(and(eq(approvalRequests.organizationId, ctx.organization.id), eq(approvalRequests.targetType, "member"), eq(approvalRequests.targetId, memberId), eq(approvalRequests.status, "pending")));
    if (open.some((r) => effectiveRequestStatus("pending", r.expiresAt, new Date()) === "pending")) return { error: "requestExists" as const };
    const [inserted] = await tx
      .insert(approvalRequests)
      .values({ organizationId: ctx.organization.id, changeType: "member_role_change", targetType: "member", targetId: memberId, payload: { role, fromRole: target.role }, requestedBy: ctx.user.id, expiresAt: new Date(Date.now() + APPROVAL_REQUEST_TTL_MS) })
      .returning({ id: approvalRequests.id });
    await recordAudit(tx, { organizationId: ctx.organization.id, actor: ctx.tenant.actor, action: "member.role_requested", targetType: "member", targetId: memberId, diff: { role, fromRole: target.role, approvalRequestId: inserted!.id }, requestId: ctx.tenant.requestId });
    return { requested: true as const };
  });
  if (outcome.error) return fail(outcome.error);
  if ("requested" in outcome) {
    revalidateTeam();
    return done("roleRequested");
  }
  try {
    await api().updateMemberRole({ body: { memberId, role, organizationId: ctx.organization.id }, headers: await headers() });
  } catch {
    return fail("generic");
  }
  await withOrg(ctx, (tx) => recordAudit(tx, { organizationId: ctx.organization.id, actor: ctx.tenant.actor, action: "member.role", targetType: "member", targetId: memberId, diff: { role, fromRole: outcome.fromRole }, requestId: ctx.tenant.requestId }));
  revalidateTeam();
  return done("roleUpdated");
}

/** Removal is irreversible for the member's access: it is confirmed in a dialog and re-checked here. */
export async function removeMemberAction(_prev: TeamActionState, formData: FormData): Promise<TeamActionState> {
  const ctx = await requireOrgContext("members.remove");
  const parsed = z.object({ memberId: uuid, confirm: z.literal("remove") }).safeParse({ memberId: formData.get("memberId"), confirm: formData.get("confirm") });
  if (!parsed.success) return fail(parsed.error.issues.some((i) => i.path[0] === "confirm") ? "confirmRequired" : "generic");
  const { memberId } = parsed.data;
  const check = await withOrg(ctx, async (tx) => {
    const rows = await tx.select({ id: member.id, userId: member.userId, role: member.role }).from(member).where(eq(member.organizationId, ctx.organization.id));
    const target = rows.find((m) => m.id === memberId);
    if (!target) return "notFound" as const;
    if (target.userId === ctx.user.id) return "self" as const;
    if (target.role === "OWNER" && ctx.role !== "OWNER") return "forbidden" as const;
    if (target.role === "OWNER" && rows.filter((m) => m.role === "OWNER").length <= 1) return "lastOwner" as const;
    return null;
  });
  if (check) return fail(check);
  try {
    await api().removeMember({ body: { memberIdOrEmail: memberId, organizationId: ctx.organization.id }, headers: await headers() });
  } catch {
    return fail("generic");
  }
  await withOrg(ctx, (tx) => recordAudit(tx, { organizationId: ctx.organization.id, actor: ctx.tenant.actor, action: "member.remove", targetType: "member", targetId: memberId, requestId: ctx.tenant.requestId }));
  revalidateTeam();
  return done("removed");
}

/**
 * Approval requirements (which change types need four eyes, who may approve). Gated by the plan's
 * entitlements; a relaxing change (dropping a requirement, widening approvers) needs the `relax`
 * confirmation. Stored in `organization_settings.approval_policy` (migration 0012).
 */
export async function updateApprovalPolicyAction(_prev: TeamActionState, formData: FormData): Promise<TeamActionState> {
  const ctx = await requireOrgContext("org.update");
  const parsed = z.object({ confirm: z.enum(["relax"]).nullable() }).safeParse({ confirm: formData.get("confirm") || null });
  if (!parsed.success) return fail("generic");
  const [entitlements, state] = await Promise.all([loadTeamEntitlements(ctx), loadApprovalPolicy(ctx)]);
  if (!entitlements.approvals || !entitlements.fourEyes) return fail("notInPlan");
  if (!state.persisted) return fail("notPersisted");
  const form = approvalPolicyFromForm((name) => formData.get(name) === "on");
  const now = new Date().toISOString();
  const next = normalizeApprovalPolicy({ ...form, updatedAt: now, updatedBy: ctx.user.id });
  const changes = diffApprovalPolicy(state.policy, next);
  if (!changes.length) return done("policyUnchanged");
  if (isRelaxing(changes) && parsed.data.confirm !== "relax") return fail("confirmRelax");
  await withOrg(ctx, async (tx) => {
    await tx.insert(orgSettings).values({ organizationId: ctx.organization.id, locale: ctx.user.locale, approvalPolicy: next }).onConflictDoUpdate({ target: orgSettings.organizationId, set: { approvalPolicy: next } });
    await recordAudit(tx, {
      organizationId: ctx.organization.id,
      actor: ctx.tenant.actor,
      action: "org.approval_policy",
      targetType: "organization",
      targetId: ctx.organization.id,
      diff: { changes, before: { fourEyes: state.policy.fourEyes, approverRoles: state.policy.approverRoles }, after: { fourEyes: next.fourEyes, approverRoles: next.approverRoles }, relaxing: isRelaxing(changes) },
      requestId: ctx.tenant.requestId,
    });
  });
  revalidateTeam();
  return done("policySaved");
}

/**
 * Applies or rejects a four-eyes request. The decider must differ from the requester, hold an
 * approver role and the permission of the change; only `member_role_change` is applied here (other
 * change types are applied by the module that owns them).
 */
export async function decideApprovalRequestAction(_prev: TeamActionState, formData: FormData): Promise<TeamActionState> {
  const ctx = await requireOrgContext("members.read");
  const parsed = z
    .object({ requestId: uuid, decision: z.enum(["approve", "reject"]), confirm: z.literal("decide"), note: z.string().trim().max(500).optional() })
    .safeParse({ requestId: formData.get("requestId"), decision: formData.get("decision"), confirm: formData.get("confirm"), note: formData.get("note") ?? undefined });
  if (!parsed.success) return fail(parsed.error.issues.some((i) => i.path[0] === "confirm") ? "confirmRequired" : "generic");
  const { requestId, decision, note } = parsed.data;
  const [entitlements, policyState] = await Promise.all([loadTeamEntitlements(ctx), loadApprovalPolicy(ctx)]);

  const outcome = await withOrg(ctx, async (tx) => {
    const [request] = await tx
      .select()
      .from(approvalRequests)
      .where(and(eq(approvalRequests.organizationId, ctx.organization.id), eq(approvalRequests.id, requestId)))
      .limit(1);
    if (!request) return { error: "notFound" as const };
    if (effectiveRequestStatus(request.status, request.expiresAt, new Date()) !== "pending") return { error: "notPending" as const };
    if (!canDecideRequest(policyState.policy, entitlements, { userId: ctx.user.id, role: ctx.role }, { changeType: request.changeType, requestedBy: request.requestedBy })) {
      return { error: request.requestedBy === ctx.user.id ? ("selfApproval" as const) : ("forbidden" as const) };
    }
    if (decision === "reject") {
      await tx.update(approvalRequests).set({ status: "rejected", decidedBy: ctx.user.id, decidedAt: new Date(), decisionNote: note || null }).where(eq(approvalRequests.id, request.id));
      await recordAudit(tx, { organizationId: ctx.organization.id, actor: ctx.tenant.actor, action: "approval_request.reject", targetType: request.targetType, targetId: request.targetId, diff: { changeType: request.changeType, approvalRequestId: request.id, noteLength: note?.length ?? 0 }, requestId: ctx.tenant.requestId });
      return { rejected: true as const };
    }
    if (request.changeType !== "member_role_change") return { error: "notAppliedHere" as const };
    const role = (request.payload as { role?: unknown }).role;
    if (!isOrgRole(role) || !assignableRoles(ctx.role).includes(role)) return { error: "forbidden" as const };
    const rows = await tx.select({ id: member.id, userId: member.userId, role: member.role }).from(member).where(eq(member.organizationId, ctx.organization.id));
    const target = rows.find((m) => m.id === request.targetId);
    if (!target) return { error: "notFound" as const };
    if (target.userId === ctx.user.id) return { error: "self" as const };
    if (target.role === "OWNER" && ctx.role !== "OWNER") return { error: "forbidden" as const };
    if (target.role === "OWNER" && role !== "OWNER" && rows.filter((m) => m.role === "OWNER").length <= 1) return { error: "lastOwner" as const };
    return { apply: true as const, memberId: target.id, role, fromRole: target.role, requestedBy: request.requestedBy };
  });
  if (outcome.error) return fail(outcome.error);
  if ("rejected" in outcome) {
    revalidateTeam();
    return done("requestRejected");
  }
  try {
    await api().updateMemberRole({ body: { memberId: outcome.memberId, role: outcome.role, organizationId: ctx.organization.id }, headers: await headers() });
  } catch {
    return fail("generic");
  }
  await withOrg(ctx, async (tx) => {
    await tx.update(approvalRequests).set({ status: "applied", decidedBy: ctx.user.id, decidedAt: new Date(), decisionNote: note || null }).where(eq(approvalRequests.id, requestId));
    await recordAudit(tx, { organizationId: ctx.organization.id, actor: ctx.tenant.actor, action: "member.role", targetType: "member", targetId: outcome.memberId, diff: { role: outcome.role, fromRole: outcome.fromRole, approvalRequestId: requestId, requestedBy: outcome.requestedBy }, requestId: ctx.tenant.requestId });
  });
  revalidateTeam();
  return done("requestApplied");
}

/** The requester (or a member who may update members) withdraws an open request. */
export async function withdrawApprovalRequestAction(_prev: TeamActionState, formData: FormData): Promise<TeamActionState> {
  const ctx = await requireOrgContext("members.read");
  const parsed = uuid.safeParse(formData.get("requestId"));
  if (!parsed.success) return fail("generic");
  const error = await withOrg(ctx, async (tx) => {
    const [request] = await tx
      .select({ id: approvalRequests.id, status: approvalRequests.status, expiresAt: approvalRequests.expiresAt, requestedBy: approvalRequests.requestedBy, targetType: approvalRequests.targetType, targetId: approvalRequests.targetId, changeType: approvalRequests.changeType })
      .from(approvalRequests)
      .where(and(eq(approvalRequests.organizationId, ctx.organization.id), eq(approvalRequests.id, parsed.data)))
      .limit(1);
    if (!request) return "notFound" as const;
    if (effectiveRequestStatus(request.status, request.expiresAt, new Date()) !== "pending") return "notPending" as const;
    if (request.requestedBy !== ctx.user.id && !can(ctx.role, "members.update")) return "forbidden" as const;
    await tx.update(approvalRequests).set({ status: "withdrawn", decidedBy: ctx.user.id, decidedAt: new Date() }).where(eq(approvalRequests.id, request.id));
    await recordAudit(tx, { organizationId: ctx.organization.id, actor: ctx.tenant.actor, action: "approval_request.withdraw", targetType: request.targetType, targetId: request.targetId, diff: { changeType: request.changeType, approvalRequestId: request.id }, requestId: ctx.tenant.requestId });
    return null;
  });
  if (error) return fail(error);
  revalidateTeam();
  return done("requestWithdrawn");
}
