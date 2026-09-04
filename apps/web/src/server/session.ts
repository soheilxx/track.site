import { cache } from "react";
import { logger } from "@/server/db";
import "server-only";
import { eq, and } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppError, assertCan, isOrgRole, newUlid, type OrgRole, type Permission, type PlatformRole, type TenantContext, type UserActor } from "@track-site/core";
import { member, organization, withTenant, type Tx } from "@track-site/db";
import { auth } from "./auth";
import { db } from "./db";

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
  organization: { id: string; name: string; slug: string };
  role: OrgRole;
  tenant: TenantContext;
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
    .select({ orgId: member.organizationId, role: member.role, name: organization.name, slug: organization.slug })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, s.user.id));
  const chosen = memberships.find((m) => m.orgId === s.activeOrganizationId) ?? memberships[0];
  if (!chosen) return null;
  const role: OrgRole = isOrgRole(chosen.role) ? chosen.role : "READ_ONLY";
  const actor: UserActor = { kind: "user", userId: s.user.id, role, platformRole: s.user.platformRole };
  return {
    user: s.user,
    organization: { id: chosen.orgId, name: chosen.name, slug: chosen.slug },
    role,
    tenant: { organizationId: chosen.orgId, actor, requestId: newUlid() },
  };
}

export async function requireOrgContext(permission?: Permission): Promise<OrgContext> {
  const ctx = await getOrgContext();
  if (!ctx) {
    const s = await getSession();
    redirect(s ? "/app/onboarding/organization" : "/login");
  }
  if (permission) {
    try {
      assertCan(ctx.role, permission);
    } catch {
      throw new AppError("FORBIDDEN", `Missing permission ${permission}`);
    }
  }
  return ctx;
}

/** Tenant-scoped transaction for the current request (RLS enforced). */
export async function withOrg<T>(ctx: OrgContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withTenant(db(), ctx.organization.id, fn);
}

export async function isMemberOf(userId: string, organizationId: string): Promise<boolean> {
  const rows = await db().select({ id: member.id }).from(member).where(and(eq(member.userId, userId), eq(member.organizationId, organizationId))).limit(1);
  return rows.length > 0;
}
