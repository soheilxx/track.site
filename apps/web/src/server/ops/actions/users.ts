"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PLATFORM_ROLES, type PlatformRole } from "@track-site/core";
import { user, type Tx } from "@track-site/db";
import { PlatformAccessError, auditPlatform, requirePlatform, withPlatform, type PlatformContext } from "@/server/ops/platform";
import {
  DIRECTORY_PATH,
  ROLE_ACTIONS,
  ROLE_REASON_MAX,
  ROLE_REASON_MIN,
  ROLE_TICKET_MAX,
  ROLE_TICKET_PATTERN,
  USERS_PATH,
  adminIdsOf,
  approvalVerdict,
  findAccountByEmail,
  isRequestOpen,
  lockAccount,
  pendingRoleRequests,
  readRoleRequest,
  revokeSessionsOf,
  roleChangeVerdict,
  type UserAccount,
} from "@/server/ops/users";

/**
 * Track Operations → Platform users actions (docs/17 §1, §3). Admin only. Every action resolves the operator
 * with `requirePlatform("PLATFORM_ADMIN")`, validates with zod, re-checks the UI confirmation through the
 * `confirm` field, locks the affected account row, applies the four-eyes rules of `server/ops/users.ts`
 * again at decision time, and writes the change and its `auditPlatform` entry (actor kind `platform`,
 * target type `user`, no organisation) in one `tracksite_ops` transaction. Role changes delete the
 * account's sessions in the same transaction (forced sign-out).
 */
export type UsersActionError =
  | "forbidden"
  | "invalid"
  | "confirm_required"
  | "not_found"
  | "self"
  | "unchanged"
  | "lastAdmin"
  | "emailNotVerified"
  | "ticketRequired"
  | "needsThirdAdmin"
  | "duplicate"
  | "fourEyes"
  | "stale"
  | "expired"
  | "notPending"
  | "notOperator"
  | "generic";
export type UsersActionNotice = "proposed" | "applied" | "approved" | "declined" | "withdrawn" | "sessionsRevoked";

export interface UsersActionState {
  ok: boolean;
  error: UsersActionError | null;
  notice: UsersActionNotice | null;
  fieldErrors?: Record<string, string>;
  /** sessions deleted by the action (role change or explicit revocation) */
  sessionsRevoked?: number;
  /** id of the filed request (`proposed`) or of the decided one */
  requestId?: string | null;
}

const uuid = z.string().uuid();
const ulid = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);
const reason = z.string().trim().min(ROLE_REASON_MIN).max(ROLE_REASON_MAX);
const ticketRef = z.string().trim().max(ROLE_TICKET_MAX).regex(ROLE_TICKET_PATTERN).nullable();
const role = z.enum(PLATFORM_ROLES);

const fail = (error: UsersActionError, extra: Partial<UsersActionState> = {}): UsersActionState => ({ ok: false, error, notice: null, ...extra });
const done = (notice: UsersActionNotice, extra: Partial<UsersActionState> = {}): UsersActionState => ({ ok: true, error: null, notice, ...extra });

const str = (formData: FormData, name: string): string => {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
};
const optional = (formData: FormData, name: string): string | null => {
  const v = str(formData, name).trim();
  return v ? v : null;
};

async function admin(): Promise<PlatformContext | null> {
  try {
    return await requirePlatform("PLATFORM_ADMIN");
  } catch (e) {
    if (e instanceof PlatformAccessError) return null;
    throw e;
  }
}

function fieldErrorsOf(issues: ReadonlyArray<{ path: PropertyKey[] }>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) out[String(issue.path[0] ?? "form")] = "invalid";
  return out;
}

function invalid(parsed: { error: { issues: ReadonlyArray<{ path: PropertyKey[] }> } }): UsersActionState {
  if (parsed.error.issues.some((i) => i.path[0] === "confirm")) return fail("confirm_required");
  return fail("invalid", { fieldErrors: fieldErrorsOf(parsed.error.issues) });
}

function revalidate(userId?: string | null): void {
  revalidatePath(USERS_PATH);
  revalidatePath(DIRECTORY_PATH);
  if (userId) revalidatePath(`${USERS_PATH}/${userId}`);
}

interface ChangeMeta {
  requestId: string | null;
  proposedBy: string;
  approvedBy: string;
  selfApproved: boolean;
  reason: string;
  ticketRef: string | null;
}

/**
 * Applies a role change to a locked account: the role column (guarded by the expected previous value), the
 * forced sign-out (every session row deleted) and the `platform.role.set` audit entry — the same action name
 * the CLI writes — with the request id, both admins, the self-approval flag and the number of sessions.
 */
async function applyRoleChange(tx: Tx, ctx: PlatformContext, target: UserAccount, nextRole: PlatformRole, meta: ChangeMeta): Promise<number> {
  const updated = await tx
    .update(user)
    .set({ platformRole: nextRole, updatedAt: new Date() })
    .where(and(eq(user.id, target.id), eq(user.platformRole, target.platformRole)))
    .returning({ id: user.id });
  if (!updated.length) throw new Error("role changed concurrently");
  const sessionsRevoked = await revokeSessionsOf(tx, target.id);
  await auditPlatform(
    ctx,
    {
      action: ROLE_ACTIONS.set,
      targetType: "user",
      targetId: target.id,
      diff: { platformRole: { before: target.platformRole, after: nextRole } },
      metadata: { module: "users", ...meta, sessionsRevoked, forcedSignOut: true },
    },
    tx,
  );
  return sessionsRevoked;
}

const proposeSchema = z.object({
  userId: uuid.nullable(),
  email: z.string().trim().toLowerCase().email().max(254).nullable(),
  role,
  reason,
  ticketRef,
  confirm: z.literal("role"),
});

/**
 * Files a role change (or applies it at once under the single-admin fallback). The target is an account id
 * (operators table, detail page) or an e-mail address (the "grant a role" form). Rules: never the actor's own
 * account, never the last admin, verified e-mail for any role above NONE, one open request per account,
 * four eyes whenever another eligible admin can decide; refused (`needsThirdAdmin`) when the only other
 * eligible admin is the affected account; ticket + reason and self-approved only when no other eligible
 * admin exists at all.
 */
export async function proposeRoleChangeAction(_prev: UsersActionState, formData: FormData): Promise<UsersActionState> {
  const ctx = await admin();
  if (!ctx) return fail("forbidden");
  const parsed = proposeSchema.safeParse({
    userId: optional(formData, "userId"),
    email: optional(formData, "email"),
    role: str(formData, "role"),
    reason: str(formData, "reason"),
    ticketRef: optional(formData, "ticketRef"),
    confirm: str(formData, "confirm"),
  });
  if (!parsed.success) return invalid(parsed);
  const input = parsed.data;
  if (!input.userId && !input.email) return fail("invalid", { fieldErrors: { email: "invalid" } });
  const now = new Date();
  let targetId: string | null = null;
  const outcome = await withPlatform(ctx, async (tx): Promise<UsersActionState> => {
    const found = input.userId ? { id: input.userId } : await findAccountByEmail(tx, input.email ?? "");
    if (!found) return fail("not_found", { fieldErrors: input.email ? { email: "not_found" } : undefined });
    const target = await lockAccount(tx, found.id);
    if (!target) return fail("not_found");
    targetId = target.id;
    if ((await pendingRoleRequests(tx, now, target.id)).length) return fail("duplicate");
    const admins = await adminIdsOf(tx);
    const verdict = roleChangeVerdict({ actorId: ctx.user.id, target, nextRole: input.role, adminIds: admins.all, eligibleAdminIds: admins.eligible, ticketRef: input.ticketRef });
    if (!verdict.ok) return fail(verdict.reason, verdict.reason === "ticketRequired" ? { fieldErrors: { ticketRef: "required" } } : {});
    if (verdict.mode === "proposal") {
      const requestId = await auditPlatform(
        ctx,
        {
          action: ROLE_ACTIONS.propose,
          targetType: "user",
          targetId: target.id,
          diff: { platformRole: { before: target.platformRole, after: input.role } },
          metadata: { module: "users", fromRole: target.platformRole, toRole: input.role, reason: input.reason, ticketRef: input.ticketRef, proposedBy: ctx.user.id, eligibleApprovers: admins.eligible.filter((id) => id !== ctx.user.id && id !== target.id).length },
        },
        tx,
      );
      return done("proposed", { requestId });
    }
    const sessionsRevoked = await applyRoleChange(tx, ctx, target, input.role, { requestId: null, proposedBy: ctx.user.id, approvedBy: ctx.user.id, selfApproved: true, reason: input.reason, ticketRef: input.ticketRef });
    return done("applied", { sessionsRevoked, requestId: null });
  });
  if (outcome.ok) revalidate(targetId);
  return outcome;
}

const decideSchema = z.object({ requestId: ulid, confirm: z.literal("approve") });

/** Applies a pending request as the second admin (four eyes re-checked at decision time; confirmed in the UI). */
export async function approveRoleRequestAction(_prev: UsersActionState, formData: FormData): Promise<UsersActionState> {
  const ctx = await admin();
  if (!ctx) return fail("forbidden");
  const parsed = decideSchema.safeParse({ requestId: str(formData, "requestId"), confirm: str(formData, "confirm") });
  if (!parsed.success) return invalid(parsed);
  const now = new Date();
  let targetId: string | null = null;
  const outcome = await withPlatform(ctx, async (tx): Promise<UsersActionState> => {
    const request = await readRoleRequest(tx, parsed.data.requestId);
    if (!request) return fail("not_found");
    targetId = request.targetId;
    const target = await lockAccount(tx, request.targetId);
    if (!target) return fail("not_found");
    if (!(await isRequestOpen(tx, request, now))) return fail("notPending", { requestId: request.id });
    const admins = await adminIdsOf(tx);
    const verdict = approvalVerdict({ approverId: ctx.user.id, request, target, adminIds: admins.all, now });
    if (!verdict.ok) return fail(verdict.reason, { requestId: request.id });
    const sessionsRevoked = await applyRoleChange(tx, ctx, target, request.toRole, { requestId: request.id, proposedBy: request.proposedBy, approvedBy: ctx.user.id, selfApproved: false, reason: request.reason, ticketRef: request.ticketRef });
    return done("approved", { sessionsRevoked, requestId: request.id });
  });
  if (outcome.ok) revalidate(targetId);
  return outcome;
}

const declineSchema = z.object({ requestId: ulid, reason: z.string().trim().max(ROLE_REASON_MAX).nullable(), confirm: z.literal("decline") });

/** Ends a pending request: the proposer withdraws it, any other admin except the affected account declines it (optional reason, audited). */
export async function declineRoleRequestAction(_prev: UsersActionState, formData: FormData): Promise<UsersActionState> {
  const ctx = await admin();
  if (!ctx) return fail("forbidden");
  const parsed = declineSchema.safeParse({ requestId: str(formData, "requestId"), reason: optional(formData, "reason"), confirm: str(formData, "confirm") });
  if (!parsed.success) return invalid(parsed);
  const now = new Date();
  let targetId: string | null = null;
  const outcome = await withPlatform(ctx, async (tx): Promise<UsersActionState> => {
    const request = await readRoleRequest(tx, parsed.data.requestId);
    if (!request) return fail("not_found");
    targetId = request.targetId;
    // the lock serialises decisions on the same account; a deleted account still lets the request be closed
    await lockAccount(tx, request.targetId);
    if (!(await isRequestOpen(tx, request, now))) return fail("notPending", { requestId: request.id });
    // the affected account never decides its own change — declining one's own demotion included
    if (request.targetId === ctx.user.id) return fail("self", { requestId: request.id });
    const withdraw = request.proposedBy === ctx.user.id;
    await auditPlatform(
      ctx,
      {
        action: withdraw ? ROLE_ACTIONS.withdraw : ROLE_ACTIONS.decline,
        targetType: "user",
        targetId: request.targetId,
        metadata: { module: "users", requestId: request.id, fromRole: request.fromRole, toRole: request.toRole, proposedBy: request.proposedBy, decidedBy: ctx.user.id, reason: parsed.data.reason },
      },
      tx,
    );
    return done(withdraw ? "withdrawn" : "declined", { requestId: request.id });
  });
  if (outcome.ok) revalidate(targetId);
  return outcome;
}

const revokeSchema = z.object({ userId: uuid, reason, confirm: z.literal("revoke") });

/**
 * Signs an operator out everywhere: every stored session row of the account is deleted (confirmed in the
 * UI, reason mandatory, audited with the count). Limited to accounts with a platform role — the customer
 * directory is read-only by design. Better-auth's cookie cache can keep a stale session alive for a few
 * minutes; the UI says so.
 */
export async function revokeSessionsAction(_prev: UsersActionState, formData: FormData): Promise<UsersActionState> {
  const ctx = await admin();
  if (!ctx) return fail("forbidden");
  const parsed = revokeSchema.safeParse({ userId: str(formData, "userId"), reason: str(formData, "reason"), confirm: str(formData, "confirm") });
  if (!parsed.success) return invalid(parsed);
  const { userId } = parsed.data;
  const outcome = await withPlatform(ctx, async (tx): Promise<UsersActionState> => {
    const target = await lockAccount(tx, userId);
    if (!target) return fail("not_found");
    if (target.platformRole === "NONE") return fail("notOperator");
    const sessionsRevoked = await revokeSessionsOf(tx, target.id);
    await auditPlatform(
      ctx,
      {
        action: ROLE_ACTIONS.sessionsRevoke,
        targetType: "user",
        targetId: target.id,
        metadata: { module: "users", sessionsRevoked, reason: parsed.data.reason, self: target.id === ctx.user.id, targetRole: target.platformRole },
      },
      tx,
    );
    return done("sessionsRevoked", { sessionsRevoked });
  });
  if (outcome.ok) revalidate(userId);
  return outcome;
}
