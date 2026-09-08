"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { breakGlassAccess, member, organization } from "@track-site/db";
import { env } from "@/env";
import {
  BREAK_GLASS_DURATIONS,
  BREAK_GLASS_PATH,
  BREAK_GLASS_REASON_MAX,
  BREAK_GLASS_REASON_MIN,
  BREAK_GLASS_TARGET,
  BREAK_GLASS_TICKET_MAX,
  BREAK_GLASS_TICKET_PATTERN,
  SUPPORT_ORG_COOKIE,
  activeGrantFor,
  activeGrantsForOrganization,
  approvalVerdict,
  breakGlassState,
  isUuid,
  latestActiveGrantOf,
  notifyOwners,
  otherAdminExists,
  requestedMinutes,
  revokeKindFor,
  type NotifyResult,
  type RevokeKind,
} from "@/server/ops/break-glass";
import { auditPlatform, checkPlatform, withPlatform, type PlatformContext, type PlatformMinRole } from "@/server/ops/platform";
import { getOrgContext } from "@/server/session";

/**
 * Break-glass server actions (docs/17 §4). Every mutation resolves the operator with the module's minimum
 * role, validates with zod, re-checks the UI confirmation, writes its `auditPlatform` entry inside the same
 * transaction (organisation id of the affected tenant, actor kind `platform`) and revalidates the page.
 * Owners of the organisation are e-mailed on approval and on revocation of an active grant. The metadata never
 * carries operator user ids: the rows land in the customer's audit log, which shows Track support by role and
 * grant id only (`break_glass_access` itself records who requested and who approved).
 */
export type BreakGlassNotice = "requested" | "approved" | "revoked" | "withdrawn" | "declined";

export type BreakGlassError =
  | "generic"
  | "forbidden"
  | "notFound"
  | "validation"
  | "organization"
  | "duplicate"
  | "notPending"
  | "stale"
  | "fourEyes"
  | "ticketRequired"
  | "notActive"
  | "notGrantee"
  | "confirmRequired";

export interface BreakGlassActionState {
  ok: boolean;
  error: BreakGlassError | null;
  notice: BreakGlassNotice | null;
  fieldErrors?: Record<string, string>;
  /** owners e-mailed by the action (approval and revocation of an active grant) */
  notified?: NotifyResult | null;
}

const uuid = z.string().uuid();

const fail = (error: BreakGlassError, fieldErrors?: Record<string, string>): BreakGlassActionState => ({ ok: false, error, notice: null, ...(fieldErrors ? { fieldErrors } : {}) });
const done = (notice: BreakGlassNotice, notified: NotifyResult | null = null): BreakGlassActionState => ({ ok: true, error: null, notice, notified });

async function operator(minRole: PlatformMinRole): Promise<PlatformContext | null> {
  const access = await checkPlatform(minRole);
  return access.ok ? access.ctx : null;
}

const requestSchema = z.object({
  organizationId: uuid,
  reason: z.string().trim().min(BREAK_GLASS_REASON_MIN).max(BREAK_GLASS_REASON_MAX),
  ticketRef: z.string().trim().max(BREAK_GLASS_TICKET_MAX).regex(BREAK_GLASS_TICKET_PATTERN).nullable(),
  durationMinutes: z.coerce.number().int().refine((n) => (BREAK_GLASS_DURATIONS as readonly number[]).includes(n)),
});

/** Files a request: organisation, reason (≥ 20 characters), optional ticket reference, 15 min – 4 h. */
export async function requestBreakGlassAction(_prev: BreakGlassActionState, formData: FormData): Promise<BreakGlassActionState> {
  const ctx = await operator("PLATFORM_SUPPORT");
  if (!ctx) return fail("forbidden");
  const ticketRaw = formData.get("ticketRef");
  const parsed = requestSchema.safeParse({
    organizationId: formData.get("organizationId"),
    reason: formData.get("reason"),
    ticketRef: typeof ticketRaw === "string" && ticketRaw.trim() ? ticketRaw : null,
    durationMinutes: formData.get("durationMinutes"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "");
      if (field && !fieldErrors[field]) fieldErrors[field] = field;
    }
    return fail("validation", fieldErrors);
  }
  const { organizationId, reason, ticketRef, durationMinutes } = parsed.data;
  const outcome = await withPlatform(ctx, async (tx) => {
    const [org] = await tx.select({ id: organization.id }).from(organization).where(eq(organization.id, organizationId)).limit(1);
    if (!org) return { error: "organization" as const };
    const own = await tx
      .select({ approvedAt: breakGlassAccess.approvedAt, revokedAt: breakGlassAccess.revokedAt, startsAt: breakGlassAccess.startsAt, endsAt: breakGlassAccess.endsAt, createdAt: breakGlassAccess.createdAt })
      .from(breakGlassAccess)
      .where(and(eq(breakGlassAccess.organizationId, organizationId), eq(breakGlassAccess.platformUserId, ctx.user.id), isNull(breakGlassAccess.revokedAt)));
    const now = new Date();
    if (own.some((r) => ["pending", "active"].includes(breakGlassState(r, now)))) return { error: "duplicate" as const };
    const [row] = await tx
      .insert(breakGlassAccess)
      .values({
        organizationId,
        platformUserId: ctx.user.id,
        reason,
        ticketRef,
        startsAt: sql`now()`,
        endsAt: sql`now() + (${durationMinutes} * interval '1 minute')`,
      })
      .returning({ id: breakGlassAccess.id });
    await auditPlatform(
      ctx,
      {
        action: "ops.break_glass.request",
        organizationId,
        targetType: BREAK_GLASS_TARGET,
        targetId: row!.id,
        metadata: { breakGlassId: row!.id, durationMinutes, ticketRef, reason, mode: "read_only" },
      },
      tx,
    );
    return { id: row!.id };
  });
  if (outcome.error) return fail(outcome.error);
  revalidatePath(BREAK_GLASS_PATH);
  return done("requested");
}

const grantColumns = {
  id: breakGlassAccess.id,
  organizationId: breakGlassAccess.organizationId,
  organizationName: organization.name,
  platformUserId: breakGlassAccess.platformUserId,
  approvedBy: breakGlassAccess.approvedBy,
  approvedAt: breakGlassAccess.approvedAt,
  revokedAt: breakGlassAccess.revokedAt,
  startsAt: breakGlassAccess.startsAt,
  endsAt: breakGlassAccess.endsAt,
  createdAt: breakGlassAccess.createdAt,
  reason: breakGlassAccess.reason,
  ticketRef: breakGlassAccess.ticketRef,
};

/**
 * Approval by a platform admin (confirmed in the UI, re-checked here). Four eyes: the approver must differ
 * from the requester whenever another eligible admin exists; otherwise self-approval with ticket + reason,
 * recorded as such (`approved_by = platform_user_id`, `metadata.selfApproved`). The window starts now.
 */
export async function approveBreakGlassAction(_prev: BreakGlassActionState, formData: FormData): Promise<BreakGlassActionState> {
  const ctx = await operator("PLATFORM_ADMIN");
  if (!ctx) return fail("forbidden");
  const parsed = z.object({ grantId: uuid, confirm: z.literal("approve") }).safeParse({ grantId: formData.get("grantId"), confirm: formData.get("confirm") });
  if (!parsed.success) return fail(parsed.error.issues.some((i) => i.path[0] === "confirm") ? "confirmRequired" : "generic");
  const { grantId } = parsed.data;
  const outcome = await withPlatform(ctx, async (tx) => {
    const [row] = await tx.select(grantColumns).from(breakGlassAccess).innerJoin(organization, eq(organization.id, breakGlassAccess.organizationId)).where(eq(breakGlassAccess.id, grantId)).for("update", { of: breakGlassAccess }).limit(1);
    if (!row) return { error: "notFound" as const };
    const state = breakGlassState(row, new Date());
    if (state !== "pending") return { error: state === "stale" ? ("stale" as const) : ("notPending" as const) };
    const verdict = approvalVerdict({ approverId: ctx.user.id, requesterId: row.platformUserId, otherAdminExists: await otherAdminExists(tx, row.platformUserId), ticketRef: row.ticketRef });
    if (!verdict.ok) return { error: verdict.reason };
    const minutes = requestedMinutes(row);
    const [updated] = await tx
      .update(breakGlassAccess)
      .set({ approvedBy: ctx.user.id, approvedAt: sql`now()`, startsAt: sql`now()`, endsAt: sql`now() + (${minutes} * interval '1 minute')` })
      .where(eq(breakGlassAccess.id, row.id))
      .returning({ endsAt: breakGlassAccess.endsAt });
    await auditPlatform(
      ctx,
      {
        action: "ops.break_glass.approve",
        organizationId: row.organizationId,
        targetType: BREAK_GLASS_TARGET,
        targetId: row.id,
        metadata: { breakGlassId: row.id, selfApproved: verdict.selfApproved, ticketRef: row.ticketRef, durationMinutes: minutes, endsAt: updated!.endsAt.toISOString(), mode: "read_only" },
      },
      tx,
    );
    return { grant: { id: row.id, organizationId: row.organizationId, organizationName: row.organizationName, endsAt: updated!.endsAt, reason: row.reason, ticketRef: row.ticketRef } };
  });
  if (outcome.error) return fail(outcome.error);
  const notified = await notifyOwners("approved", outcome.grant);
  await withPlatform(ctx, async (tx) => {
    if (notified.sent > 0) await tx.update(breakGlassAccess).set({ customerNotifiedAt: sql`now()` }).where(eq(breakGlassAccess.id, outcome.grant.id));
    await auditPlatform(ctx, { action: "ops.break_glass.notify", organizationId: outcome.grant.organizationId, targetType: BREAK_GLASS_TARGET, targetId: outcome.grant.id, metadata: { breakGlassId: outcome.grant.id, kind: "approved", ...notified } }, tx);
  });
  revalidatePath(BREAK_GLASS_PATH);
  return done("approved", notified);
}

const REVOKE_ACTION: Record<RevokeKind, string> = { withdraw: "ops.break_glass.withdraw", decline: "ops.break_glass.decline", revoke: "ops.break_glass.revoke" };
const REVOKE_NOTICE: Record<RevokeKind, BreakGlassNotice> = { withdraw: "withdrawn", decline: "declined", revoke: "revoked" };

/**
 * Ends a row: the requester withdraws an open request, an admin declines one, and an active grant is revoked
 * by its grantee, its approver or any admin (confirmed in the UI). Owners are told when an active grant ends.
 */
export async function revokeBreakGlassAction(_prev: BreakGlassActionState, formData: FormData): Promise<BreakGlassActionState> {
  const ctx = await operator("PLATFORM_SUPPORT");
  if (!ctx) return fail("forbidden");
  const parsed = z.object({ grantId: uuid, confirm: z.literal("revoke") }).safeParse({ grantId: formData.get("grantId"), confirm: formData.get("confirm") });
  if (!parsed.success) return fail(parsed.error.issues.some((i) => i.path[0] === "confirm") ? "confirmRequired" : "generic");
  const { grantId } = parsed.data;
  const outcome = await withPlatform(ctx, async (tx) => {
    const [row] = await tx.select(grantColumns).from(breakGlassAccess).innerJoin(organization, eq(organization.id, breakGlassAccess.organizationId)).where(eq(breakGlassAccess.id, grantId)).for("update", { of: breakGlassAccess }).limit(1);
    if (!row) return { error: "notFound" as const };
    const state = breakGlassState(row, new Date());
    const kind = revokeKindFor({ state, requesterId: row.platformUserId, approverId: row.approvedBy }, { userId: ctx.user.id, platformRole: ctx.platformRole });
    if (!kind) return { error: state === "pending" || state === "stale" || state === "active" ? ("forbidden" as const) : ("notActive" as const) };
    await tx.update(breakGlassAccess).set({ revokedAt: sql`now()` }).where(eq(breakGlassAccess.id, row.id));
    await auditPlatform(
      ctx,
      {
        action: REVOKE_ACTION[kind],
        organizationId: row.organizationId,
        targetType: BREAK_GLASS_TARGET,
        targetId: row.id,
        metadata: { breakGlassId: row.id, previousState: state, endsAt: row.endsAt.toISOString() },
      },
      tx,
    );
    return { kind, grant: { id: row.id, organizationId: row.organizationId, organizationName: row.organizationName, endsAt: row.endsAt, reason: row.reason, ticketRef: row.ticketRef } };
  });
  if (outcome.error) return fail(outcome.error);
  let notified: NotifyResult | null = null;
  if (outcome.kind === "revoke") {
    notified = await notifyOwners("revoked", outcome.grant);
    await auditPlatform(ctx, { action: "ops.break_glass.notify", organizationId: outcome.grant.organizationId, targetType: BREAK_GLASS_TARGET, targetId: outcome.grant.id, metadata: { breakGlassId: outcome.grant.id, kind: "revoked", ...notified } });
  }
  revalidatePath(BREAK_GLASS_PATH);
  return done(REVOKE_NOTICE[outcome.kind], notified);
}

/**
 * Opens the tenant's dashboard read-only under the caller's active grant: remembers the organisation in a
 * cookie (a hint only — `getOrgContext` verifies the grant on every request) and redirects to `/app`.
 */
export async function openTenantDashboardAction(_prev: BreakGlassActionState, formData: FormData): Promise<BreakGlassActionState> {
  const ctx = await operator("PLATFORM_SUPPORT");
  if (!ctx) return fail("forbidden");
  const parsed = uuid.safeParse(formData.get("grantId"));
  if (!parsed.success) return fail("generic");
  const grant = await withPlatform(ctx, async (tx) => {
    const [row] = await tx.select(grantColumns).from(breakGlassAccess).innerJoin(organization, eq(organization.id, breakGlassAccess.organizationId)).where(eq(breakGlassAccess.id, parsed.data)).limit(1);
    if (!row) return { error: "notFound" as const };
    if (row.platformUserId !== ctx.user.id) return { error: "notGrantee" as const };
    if (breakGlassState(row, new Date()) !== "active") return { error: "notActive" as const };
    await auditPlatform(ctx, { action: "ops.break_glass.open", organizationId: row.organizationId, targetType: BREAK_GLASS_TARGET, targetId: row.id, metadata: { breakGlassId: row.id, endsAt: row.endsAt.toISOString(), mode: "read_only" } }, tx);
    return { row };
  });
  if (grant.error) return fail(grant.error);
  const secure = env().HOST_APP.startsWith("https://");
  (await cookies()).set(SUPPORT_ORG_COOKIE, grant.row.organizationId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure,
    maxAge: Math.max(60, Math.ceil((grant.row.endsAt.getTime() - Date.now()) / 1000)),
  });
  redirect("/app");
}

/**
 * Leaves the support view (docs/17 §4): forgets the chosen organisation so the operator's own memberships apply
 * again, records `ops.break_glass.close` for the organisation and returns the operator to their own workspace —
 * or to the console when they are a member nowhere (on `/app` a member-less operator's latest active grant
 * would open the tenant again). The grant itself stays active until it expires or is revoked.
 */
export async function leaveSupportViewAction(_prev: BreakGlassActionState, _formData: FormData): Promise<BreakGlassActionState> {
  const store = await cookies();
  const wanted = store.get(SUPPORT_ORG_COOKIE)?.value ?? null;
  store.delete({ name: SUPPORT_ORG_COOKIE, path: "/" });
  const ctx = await operator("PLATFORM_SUPPORT");
  // no operator (signed out, role removed, step-up missing): the cookie was meaningless anyway — just leave
  if (!ctx) redirect("/app");
  const hasMembership = await withPlatform(ctx, async (tx) => {
    const memberships = await tx.select({ id: member.id }).from(member).where(eq(member.userId, ctx.user.id)).limit(1);
    const isMember = memberships.length > 0;
    // the grant the view was under: the chosen organisation's, or — for a member-less operator without a choice — the latest one
    const grant = isUuid(wanted) ? await activeGrantFor(ctx.user.id, wanted) : isMember ? null : await latestActiveGrantOf(ctx.user.id);
    const organizationId = grant?.organizationId ?? (isUuid(wanted) ? wanted : null);
    if (organizationId) {
      await auditPlatform(
        ctx,
        {
          action: "ops.break_glass.close",
          organizationId,
          targetType: BREAK_GLASS_TARGET,
          targetId: grant?.id ?? null,
          metadata: { breakGlassId: grant?.id ?? null, endsAt: grant?.endsAt.toISOString() ?? null, mode: "read_only" },
        },
        tx,
      );
    }
    return isMember;
  });
  redirect(hasMembership ? "/app" : BREAK_GLASS_PATH);
}

export type SupportAccessBannerState =
  | { kind: "operator"; organization: string; grantId: string; endsAt: string }
  | { kind: "customer"; grants: Array<{ grantId: string; endsAt: string }> }
  | null;

/**
 * Support-access state for the dashboard shell's banner: the operator viewing a tenant under a grant sees
 * the grant's end, the organisation's own members see that (and until when) a read-only support grant is
 * active — grant id and end only, never the operator's identity. A read; nothing is recorded here.
 */
export async function supportAccessBannerAction(): Promise<SupportAccessBannerState> {
  const ctx = await getOrgContext();
  if (!ctx) return null;
  if (ctx.breakGlass) return { kind: "operator", organization: ctx.organization.name, grantId: ctx.breakGlass.grantId, endsAt: ctx.breakGlass.endsAt.toISOString() };
  const grants = await activeGrantsForOrganization(ctx.organization.id);
  if (!grants.length) return null;
  return { kind: "customer", grants: grants.map((g) => ({ grantId: g.id, endsAt: g.endsAt.toISOString() })) };
}
