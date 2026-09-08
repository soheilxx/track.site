import "server-only";
import { and, desc, eq, gt, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { AppError, hasPlatformPermission, newUlid, redactDeep, type PlatformPermission, type PlatformRole } from "@track-site/core";
import {
  auditLog,
  breakGlassAccess,
  withPlatform as withOpsRole,
  type BreakGlassMode,
  type DbOrTx,
  type Tx,
} from "@track-site/db";
import { env } from "@/env";
import { LOCALE_COOKIE, isLocale, routing } from "@/i18n/routing";
import { db } from "@/server/db";
import { getSession, type SessionUser } from "@/server/session";

/**
 * Track Operations console access model (docs/17-operations-console.md, docs/03 §B8).
 *
 * - `platformGate()` resolves the signed-in operator once per request: signed out → login redirect with the
 *   console as `next`; no platform role → `no_role`; two-factor missing while the step-up rule applies →
 *   `two_factor_required`. The /ops layout renders the localized 403 / "enable two-factor first" page for the
 *   two failure states instead of the shell.
 * - `requirePlatform(minRole)` is what pages and server actions call: it returns the `PlatformContext` or
 *   throws a `PlatformAccessError` (HTTP semantics 403). `PLATFORM_ADMIN` satisfies `PLATFORM_SUPPORT`.
 * - `withPlatform(ctx, tx => …)` is the only path to the RLS-bypassing role `tracksite_ops` (migration 0014).
 *   It records nothing by itself; a mutation writes its own `auditPlatform` entry inside the same transaction.
 * - `auditPlatform(ctx, …)` appends an `audit_log` row with actor kind `platform` (redacted, append-only).
 * - `activeBreakGlass(ctx, organizationId)` returns the caller's approved, unrevoked, currently valid grant for
 *   an organization — the precondition for any tenant-detail view beyond aggregates and metadata.
 */

export type PlatformMinRole = "PLATFORM_SUPPORT" | "PLATFORM_ADMIN";
export type ActivePlatformRole = Exclude<PlatformRole, "NONE">;

/** Audit actor of every operator action; stored (redacted) in `audit_log.actor`. */
export interface PlatformActor {
  kind: "platform";
  userId: string;
  email: string;
  platformRole: ActivePlatformRole;
}

export interface PlatformContext {
  user: SessionUser;
  platformRole: ActivePlatformRole;
  actor: PlatformActor;
  requestId: string;
}

export type PlatformGateReason = "no_role" | "two_factor_required";
export type PlatformAccessReason = PlatformGateReason | "insufficient_role";

export type PlatformGate =
  { ok: true; ctx: PlatformContext } | { ok: false; reason: PlatformGateReason; user: SessionUser };

/** Thrown by `requirePlatform` (403): the /ops shell components render it as a localized page. */
export class PlatformAccessError extends AppError {
  readonly reason: PlatformAccessReason;
  constructor(reason: PlatformAccessReason, message: string) {
    super("FORBIDDEN", message, { details: { reason } });
    this.name = "PlatformAccessError";
    this.reason = reason;
  }
}

const RANK: Record<PlatformRole, number> = { NONE: 0, PLATFORM_SUPPORT: 1, PLATFORM_ADMIN: 2 };

export function isActivePlatformRole(role: unknown): role is ActivePlatformRole {
  return role === "PLATFORM_SUPPORT" || role === "PLATFORM_ADMIN";
}

/** `PLATFORM_ADMIN` satisfies every minimum; `NONE` satisfies nothing. */
export function hasPlatformRole(role: PlatformRole, minRole: PlatformMinRole): boolean {
  return RANK[role] >= RANK[minRole];
}

/**
 * Step-up rule: two-factor is required for the console unless `OPS_REQUIRE_2FA=false` — and production
 * ignores the switch (docs/17 §"Two-factor requirement"); the value is only a local-development convenience.
 */
export function opsRequiresTwoFactor(): boolean {
  const e = env();
  return e.OPS_REQUIRE_2FA || e.APP_ENV === "production";
}

/** Locale of the operator: the account preference, then the language cookie, then English. */
export async function platformLocale(user: SessionUser | null): Promise<string> {
  if (user && isLocale(user.locale)) return user.locale;
  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(cookieLocale) ? cookieLocale : routing.defaultLocale;
}

/** Resolves the signed-in operator, or says why the console stays closed; deduplicated per request. */
export const platformGate = cache(async (): Promise<PlatformGate> => {
  const session = await getSession();
  if (!session) {
    const h = await headers();
    const path = h.get("x-invoke-path") ?? "";
    const next = path.startsWith("/ops") ? path : "/ops";
    const locale = await platformLocale(null);
    redirect(`/${locale}/login?next=${encodeURIComponent(next)}`);
  }
  const user = session.user;
  if (!isActivePlatformRole(user.platformRole)) return { ok: false, reason: "no_role", user };
  if (opsRequiresTwoFactor() && !user.twoFactorEnabled)
    return { ok: false, reason: "two_factor_required", user };
  const platformRole = user.platformRole;
  return {
    ok: true,
    ctx: {
      user,
      platformRole,
      actor: { kind: "platform", userId: user.id, email: user.email, platformRole },
      requestId: newUlid(),
    },
  };
});

/**
 * Platform context for a page or server action. Redirects to the login page when signed out and throws a
 * `PlatformAccessError` when the account has no platform role, lacks two-factor while the step-up rule
 * applies, is below `minRole`, or — when a `permission` is given — lacks that platform permission
 * (`PLATFORM_PERMISSIONS` in packages/core, docs/18 §"Permissions"). A permission-scoped call is written
 * as `requirePlatform("PLATFORM_SUPPORT", "platform.tickets.write")`; the role stays the coarse gate, the
 * permission the fine one, and both are enforced here, never in the navigation alone.
 */
export async function requirePlatform(
  minRole: PlatformMinRole = "PLATFORM_SUPPORT",
  permission?: PlatformPermission,
): Promise<PlatformContext> {
  const gate = await platformGate();
  if (!gate.ok)
    throw new PlatformAccessError(
      gate.reason,
      gate.reason === "no_role" ? "No platform role" : "Two-factor authentication required",
    );
  if (!hasPlatformRole(gate.ctx.platformRole, minRole))
    throw new PlatformAccessError("insufficient_role", `Requires ${minRole}`);
  if (permission && !hasPlatformPermission(gate.ctx.platformRole, permission))
    throw new PlatformAccessError("insufficient_role", `Requires ${permission}`);
  return gate.ctx;
}

/** Same check without throwing, for pages that render the 403 inline. */
export async function checkPlatform(
  minRole: PlatformMinRole = "PLATFORM_SUPPORT",
  permission?: PlatformPermission,
): Promise<{ ok: true; ctx: PlatformContext } | { ok: false; reason: PlatformAccessReason }> {
  try {
    return { ok: true, ctx: await requirePlatform(minRole, permission) };
  } catch (e) {
    if (e instanceof PlatformAccessError) return { ok: false, reason: e.reason };
    throw e;
  }
}

/** Whether the resolved operator holds a platform permission (for hiding actions in a page; actions re-check). */
export function platformCan(ctx: PlatformContext, permission: PlatformPermission): boolean {
  return hasPlatformPermission(ctx.platformRole, permission);
}

/**
 * Transaction as `tracksite_ops` (BYPASSRLS). The context parameter is deliberately required: nothing reaches
 * the role without a resolved operator. Records nothing by itself — see `auditPlatform`.
 */
export async function withPlatform<T>(
  ctx: PlatformContext,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  if (!ctx.actor.userId) throw new PlatformAccessError("no_role", "No platform context");
  return withOpsRole(db(), fn);
}

export interface PlatformAuditEntry {
  /** dotted verb, e.g. `platform.organization.suspend`, `platform.break_glass.approve` */
  action: string;
  /** the affected tenant when the action concerns one; null for platform-wide actions */
  organizationId?: string | null;
  targetType: string;
  targetId?: string | null;
  /** redacted before/after values; never raw payloads, PII of end users or secrets */
  diff?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

/**
 * Append-only audit entry with actor kind `platform`. Pass the transaction of the mutation so the change and
 * its record commit together; without one the entry is written in its own `withPlatform` transaction (page
 * views under an active break-glass grant record the grant id in `metadata.breakGlassId`).
 */
export async function auditPlatform(
  ctx: PlatformContext,
  entry: PlatformAuditEntry,
  tx?: DbOrTx,
): Promise<string> {
  const id = newUlid();
  const values = {
    id,
    organizationId: entry.organizationId ?? null,
    actor: redactDeep({ ...ctx.actor }) as unknown as Record<string, unknown>,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId ?? null,
    diff: entry.diff ? redactDeep(entry.diff) : null,
    metadata: redactDeep({ ...(entry.metadata ?? {}), platformRole: ctx.platformRole }),
    ipHash: null,
    requestId: ctx.requestId,
  };
  if (tx) await tx.insert(auditLog).values(values);
  else await withPlatform(ctx, (t) => t.insert(auditLog).values(values));
  return id;
}

export interface BreakGlassGrant {
  id: string;
  organizationId: string;
  platformUserId: string;
  reason: string;
  ticketRef: string | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  mode: BreakGlassMode;
  startsAt: Date;
  endsAt: Date;
  customerNotifiedAt: Date | null;
}

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * The caller's active break-glass grant for an organization: approved, not revoked, and the database clock
 * inside [starts_at, ends_at). Null otherwise — and null means aggregates and metadata only.
 */
export async function activeBreakGlass(
  ctx: PlatformContext,
  organizationId: string,
  tx?: Tx,
): Promise<BreakGlassGrant | null> {
  if (!UUID.test(organizationId)) return null;
  const query = (t: DbOrTx) =>
    t
      .select({
        id: breakGlassAccess.id,
        organizationId: breakGlassAccess.organizationId,
        platformUserId: breakGlassAccess.platformUserId,
        reason: breakGlassAccess.reason,
        ticketRef: breakGlassAccess.ticketRef,
        approvedBy: breakGlassAccess.approvedBy,
        approvedAt: breakGlassAccess.approvedAt,
        mode: breakGlassAccess.mode,
        startsAt: breakGlassAccess.startsAt,
        endsAt: breakGlassAccess.endsAt,
        customerNotifiedAt: breakGlassAccess.customerNotifiedAt,
      })
      .from(breakGlassAccess)
      .where(
        and(
          eq(breakGlassAccess.organizationId, organizationId),
          eq(breakGlassAccess.platformUserId, ctx.user.id),
          isNotNull(breakGlassAccess.approvedAt),
          isNull(breakGlassAccess.revokedAt),
          lte(breakGlassAccess.startsAt, sql`now()`),
          gt(breakGlassAccess.endsAt, sql`now()`),
        ),
      )
      .orderBy(desc(breakGlassAccess.endsAt))
      .limit(1);
  const rows = tx ? await query(tx) : await withPlatform(ctx, query);
  return rows[0] ?? null;
}
