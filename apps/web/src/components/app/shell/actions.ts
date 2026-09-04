"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { environments, getSite, recordAudit, withTenant, workspacePreferences } from "@track-site/db";
import { env } from "@/env";
import { auth } from "@/server/auth";
import { db, logger } from "@/server/db";
import { getSession, listMemberships, requireOrgContext, withOrg } from "@/server/session";
import { ACTIVE_SITE_COOKIE } from "@/server/workspace";

/**
 * Workspace switcher actions (dashboard shell). Tenant and user come from the session only; the
 * site/environment ids from the client are validated against the active organization inside the
 * RLS transaction, the choice is stored per (organization, user) and mirrored into the
 * `ts-active-site` cookie, and every switch is audited.
 */
export interface WorkspaceActionState {
  ok: boolean;
  error: "invalid" | "not_found" | "forbidden" | "generic" | null;
}

const uuid = z.string().regex(/^[0-9a-f-]{36}$/i);

function cookieOptions() {
  const e = env();
  return { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 24 * 365, secure: e.APP_ENV === "production" || e.APP_ENV === "staging" };
}

/** Makes `siteId` (and optionally one of its environments) the active workspace of the current user. */
export async function setActiveSiteAction(input: { siteId: string; environmentId?: string | null }): Promise<WorkspaceActionState> {
  const ctx = await requireOrgContext("sites.read");
  const parsed = z.object({ siteId: uuid, environmentId: uuid.nullable().optional() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const result = await withOrg(ctx, async (tx) => {
    const site = await getSite(tx, ctx.organization.id, parsed.data.siteId);
    if (!site) return "not_found" as const;
    let environmentId: string | null = null;
    if (parsed.data.environmentId) {
      const rows = await tx
        .select({ id: environments.id })
        .from(environments)
        .where(and(eq(environments.siteId, site.id), eq(environments.id, parsed.data.environmentId)))
        .limit(1);
      if (!rows[0]) return "not_found" as const;
      environmentId = rows[0].id;
    }
    await tx
      .insert(workspacePreferences)
      .values({ organizationId: ctx.organization.id, userId: ctx.user.id, activeSiteId: site.id, activeEnvironmentId: environmentId })
      .onConflictDoUpdate({ target: [workspacePreferences.organizationId, workspacePreferences.userId], set: { activeSiteId: site.id, activeEnvironmentId: environmentId, updatedAt: new Date() } });
    await recordAudit(tx, { organizationId: ctx.organization.id, actor: ctx.tenant.actor, action: "workspace.active_site", targetType: "site", targetId: site.id, diff: { siteId: site.id, environmentId }, requestId: ctx.tenant.requestId });
    return site.id;
  });
  if (result === "not_found") return { ok: false, error: "not_found" };
  (await cookies()).set(ACTIVE_SITE_COOKIE, result, cookieOptions());
  revalidatePath("/app", "layout");
  return { ok: true, error: null };
}

/** Switches the active environment of the active site (Test / Staging / Production indicator). */
export async function setActiveEnvironmentAction(input: { siteId: string; environmentId: string }): Promise<WorkspaceActionState> {
  const parsed = z.object({ siteId: uuid, environmentId: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  return setActiveSiteAction({ siteId: parsed.data.siteId, environmentId: parsed.data.environmentId });
}

/** Activates another organization of the signed-in user for this session (better-auth) and audits it there. */
export async function setActiveOrganizationAction(input: { organizationId: string }): Promise<WorkspaceActionState> {
  const session = await getSession();
  if (!session) return { ok: false, error: "forbidden" };
  const parsed = z.object({ organizationId: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const membership = (await listMemberships()).find((m) => m.id === parsed.data.organizationId);
  if (!membership) return { ok: false, error: "forbidden" };
  const api = auth().api as unknown as { setActiveOrganization: (args: { body: { organizationId: string }; headers: Headers }) => Promise<unknown> };
  try {
    await api.setActiveOrganization({ body: { organizationId: parsed.data.organizationId }, headers: await headers() });
  } catch (e) {
    logger.warn({ err: e instanceof Error ? e.message : String(e) }, "setActiveOrganization failed");
    return { ok: false, error: "generic" };
  }
  await withTenant(db(), parsed.data.organizationId, (tx) =>
    recordAudit(tx, {
      organizationId: parsed.data.organizationId,
      actor: { kind: "user", userId: session.user.id, role: membership.role, platformRole: session.user.platformRole },
      action: "workspace.active_organization",
      targetType: "organization",
      targetId: parsed.data.organizationId,
      diff: null,
      requestId: null,
    }),
  );
  // the site cookie belongs to the previous organization; the workspace resolver ignores foreign sites anyway
  (await cookies()).delete(ACTIVE_SITE_COOKIE);
  revalidatePath("/app", "layout");
  return { ok: true, error: null };
}
