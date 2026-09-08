import { cache } from "react";
import { logger } from "@/server/db";
import "server-only";
import { eq, and } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { AppError, assertCan, isOrgRole, newUlid, type Actor, type OrgRole, type Permission, type PlatformRole, type TenantContext, type UserActor } from "@track-site/core";
import { member, organization, withTenant, type Tx } from "@track-site/db";
import { sql } from "drizzle-orm";
import { auth } from "./auth";
import { db } from "./db";
import { auditSupportView, isReadPermission, resolveSupportAccess, type SupportActor } from "./ops/break-glass";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  platformRole: PlatformRole;
  locale: string;
  twoFactorEnabled: boolean;
}

export interface OrgContext {
  user: SessionUser;
  /** `suspendedAt`: the tenant kill switch set by platform admins (Track Operations); `requireOrgContext` and `requireApiOrgContext` refuse a suspended organization */
  organization: { id: string; name: string; slug: string; suspendedAt: Date | null };
  role: OrgRole;
  tenant: TenantContext;
  /** break-glass (docs/17 §4): a platform operator viewing the organization read-only under an active grant — every mutation is refused */
  readOnly?: boolean;
  breakGlass?: { grantId: string; endsAt: Date } | null;
}

/** Session lookup, deduplicated per request so layouts, pages and the i18n request config share one call. */
export const getSession = cache(async (): Promise<{ user: SessionUser; activeOrganizationId: string | null } | null> => {
  let s: Awaited<ReturnType<ReturnType<typeof auth>["api"]["getSession"]>>;
  try {
    s = await auth().api.getSession({ headers: await headers() });
  } catch (e) {
    // no database (or an unreachable one) means no session: callers redirect to the sign-in page instead of failing with 500
    logger.warn({ err: e instanceof Error ? e.message : String(e) }, "session lookup failed");
    return null;
  }
  if (!s) return null;
  const u = s.user as unknown as SessionUser & { platformRole?: string };
  return {
    user: {
      id: u.id,
      email: u.email,
      name: u.name,
      emailVerified: u.emailVerified,
      platformRole: (u.platformRole as PlatformRole) ?? "NONE",
      locale: u.locale ?? "en",
      twoFactorEnabled: Boolean(u.twoFactorEnabled),
    },
    activeOrganizationId: (s.session as unknown as { activeOrganizationId?: string | null } | null)?.activeOrganizationId ?? null,
  };
});

export interface MembershipSummary {
  id: string;
  name: string;
  slug: string;
  role: OrgRole;
}

/**
 * Every organization the signed-in user belongs to (for the workspace switcher). Deduplicated per
 * request; an unknown stored role is shown as READ_ONLY, exactly as `getOrgContext` treats it.
 */
export const listMemberships = cache(async (): Promise<MembershipSummary[]> => {
  const s = await getSession();
  if (!s) return [];
  const rows = await db()
    .select({ id: member.organizationId, role: member.role, name: organization.name, slug: organization.slug })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, s.user.id))
    .orderBy(organization.name);
  return rows.map((r) => ({ id: r.id, name: r.name, slug: r.slug, role: isOrgRole(r.role) ? r.role : "READ_ONLY" }));
});

export async function requireUser(): Promise<SessionUser> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s.user;
}

/** Resolves the active organization + role; falls back to the user's first membership. */
export async function getOrgContext(): Promise<OrgContext | null> {
  const s = await getSession();
  if (!s) return null;
  const memberships = await db()
    .select({ orgId: member.organizationId, role: member.role, name: organization.name, slug: organization.slug, suspendedAt: organization.suspendedAt })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, s.user.id));
  const chosen = memberships.find((m) => m.orgId === s.activeOrganizationId) ?? memberships[0];
  // break-glass (docs/17 §4): a platform operator opens a tenant they are no member of read-only under an active,
  // approved grant; the view is audited with the grant id and the actor is of kind "platform"
  const support = await resolveSupportAccess(s.user, memberships.map((m) => m.orgId));
  if (support) {
    const supportActor: SupportActor = { kind: "platform", userId: s.user.id, email: s.user.email, platformRole: s.user.platformRole, grantId: support.grant.id, readOnly: true };
    await auditSupportView(support, supportActor);
    return {
      user: s.user,
      organization: { id: support.organization.id, name: support.organization.name, slug: support.organization.slug, suspendedAt: support.organization.suspendedAt },
      role: "READ_ONLY",
      readOnly: true,
      breakGlass: { grantId: support.grant.id, endsAt: support.grant.endsAt },
      // the core `Actor` union has no platform kind; the object is only ever stored (redacted) in audit rows
      tenant: { organizationId: support.organization.id, actor: supportActor as unknown as Actor, requestId: newUlid() },
    };
  }
  if (!chosen) return null;
  const role: OrgRole = isOrgRole(chosen.role) ? chosen.role : "READ_ONLY";
  const actor: UserActor = { kind: "user", userId: s.user.id, role, platformRole: s.user.platformRole };
  return {
    user: s.user,
    organization: { id: chosen.orgId, name: chosen.name, slug: chosen.slug, suspendedAt: chosen.suspendedAt ?? null },
    role,
    tenant: { organizationId: chosen.orgId, actor, requestId: newUlid() },
  };
}

/**
 * 403 of a suspended organization (`organization.suspended_at`, docs/17 §4 "tenant kill switch"). The
 * `message` is the notice in the user's language; `digest` carries the same notice because Next strips
 * the message of a server-side error before it reaches the dashboard error boundary, which shows the
 * digest — so the customer reads why the workspace is closed instead of a hash. `details.reason` lets
 * API handlers and actions tell the case apart from a missing permission.
 */
export class OrganizationSuspendedError extends AppError {
  readonly digest: string;
  constructor(notice: string, organizationId: string, suspendedAt: Date) {
    super("FORBIDDEN", notice, { details: { reason: "organization_suspended", organizationId, suspendedAt: suspendedAt.toISOString() } });
    this.name = "OrganizationSuspendedError";
    this.digest = notice;
  }
}

const SUSPENSION_NOTICE_FALLBACK = "This organisation is currently suspended by Track. Its dashboard, API and event processing are paused; contact Track support to resolve the suspension.";

/** The suspension notice in the user's language from the `ops-organisations` catalog (English when it cannot be loaded). */
async function suspensionNotice(locale: string): Promise<string> {
  const lang = /^[a-z]{2}$/.test(locale) ? locale : "en";
  try {
    const catalog = (await import(`../../messages/${lang}/ops-organisations.json`)).default as { opsOrganisations?: { suspended?: { notice?: string } } };
    return catalog.opsOrganisations?.suspended?.notice ?? SUSPENSION_NOTICE_FALLBACK;
  } catch {
    return SUSPENSION_NOTICE_FALLBACK;
  }
}

/**
 * Hook of the tenant kill switch: a suspended organization gets 403 on every dashboard page, server
 * action and API route that goes through `requireOrgContext` or `requireApiOrgContext`. Reads nothing
 * beyond the membership row already loaded; throws `OrganizationSuspendedError` (code FORBIDDEN, status 403).
 */
export async function assertOrganizationActive(ctx: OrgContext): Promise<void> {
  if (!ctx.organization.suspendedAt) return;
  throw new OrganizationSuspendedError(await suspensionNotice(ctx.user.locale), ctx.organization.id, ctx.organization.suspendedAt);
}

/**
 * The read-only rule of a break-glass support session (docs/17 §4, docs/03 §B8), in one place: a platform
 * operator viewing a tenant under a grant may read, never write. `requireOrgContext` applies it to every
 * permission that is not a `*.read`; a mutating server action that is guarded by a read permission (or by
 * none — a per-user preference, an approval decision) calls it explicitly before its first write. `withOrg`
 * additionally opens read-only transactions for such a session, so a forgotten call fails at the database
 * (SQLSTATE 25006) instead of writing. Throws `AppError` FORBIDDEN with `reason: "read_only_support_access"`.
 */
export function assertOrgWritable(ctx: OrgContext, what = "mutation"): void {
  if (!ctx.readOnly) return;
  throw new AppError("FORBIDDEN", `Read-only support access: ${what} refused`, { details: { reason: "read_only_support_access", grantId: ctx.breakGlass?.grantId ?? null } });
}

export async function requireOrgContext(permission?: Permission): Promise<OrgContext> {
  const ctx = await getOrgContext();
  if (!ctx) {
    const s = await getSession();
    redirect(s ? "/app/onboarding/organization" : "/login");
  }
  await assertOrganizationActive(ctx);
  if (permission) {
    // read-only support session (break-glass): every permission that is not a `*.read` is refused before the role check
    if (!isReadPermission(permission)) assertOrgWritable(ctx, permission);
    try {
      assertCan(ctx.role, permission);
    } catch {
      throw new AppError("FORBIDDEN", `Missing permission ${permission}`);
    }
  }
  return ctx;
}

/**
 * `requireOrgContext` for route handlers, which answer instead of redirecting. Returns the context or
 * the response the handler must send: 401 `UNAUTHORIZED` when signed out (or `signedOut()` when the
 * route prefers a redirect, as the OAuth flows do) and 403 `FORBIDDEN` with `reason: "organization_suspended"`
 * and the localized notice when the tenant kill switch is set (docs/17 §4: the dashboard and API answer
 * 403 for the members of a suspended organisation). Permission checks stay with the caller.
 *
 *   const ctx = await requireApiOrgContext();
 *   if (ctx instanceof Response) return ctx;
 */
export async function requireApiOrgContext(options: { signedOut?: () => NextResponse } = {}): Promise<OrgContext | NextResponse> {
  const ctx = await getOrgContext();
  if (!ctx) return options.signedOut?.() ?? NextResponse.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 });
  try {
    await assertOrganizationActive(ctx);
  } catch (e) {
    if (!(e instanceof OrganizationSuspendedError)) throw e;
    return NextResponse.json({ ok: false, code: "FORBIDDEN", reason: "organization_suspended", message: e.message }, { status: 403, headers: { "cache-control": "no-store" } });
  }
  return ctx;
}

/** Tenant-scoped transaction for the current request (RLS enforced). */
export async function withOrg<T>(ctx: OrgContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!ctx.readOnly) return withTenant(db(), ctx.organization.id, fn);
  // break-glass support session: read-only down to the database — the transaction refuses every write (SQLSTATE 25006)
  return withTenant(db(), ctx.organization.id, async (tx) => {
    await tx.execute(sql`SET LOCAL transaction_read_only = on`);
    return fn(tx);
  });
}

export async function isMemberOf(userId: string, organizationId: string): Promise<boolean> {
  const rows = await db().select({ id: member.id }).from(member).where(and(eq(member.userId, userId), eq(member.organizationId, organizationId))).limit(1);
  return rows.length > 0;
}
