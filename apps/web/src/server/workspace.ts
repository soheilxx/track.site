import "server-only";
import { cache } from "react";
import { and, asc, desc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { environments, integrations, listSites, pgErrorCode, sites, withTenant, workspacePreferences } from "@track-site/db";
import { db, logger } from "./db";
import type { OrgContext } from "./session";

/**
 * Workspace = the site (and its environment) a user is working on inside the active organization.
 * Resolution order per request: the user's stored preference (`workspace_preferences`, per
 * organization and user) → the `ts-active-site` cookie (fast hint from the last switch on this
 * browser) → the organization's first site. A cookie or preference that points to a site outside
 * the active organization is ignored, so tenant switches never mix data. Every dashboard module
 * calls `activeSite(ctx)`; the switcher persists changes through the shell's server actions.
 */
export const ACTIVE_SITE_COOKIE = "ts-active-site";

export interface WorkspaceSite {
  id: string;
  name: string;
  trackingId: string;
  primaryDomain: string | null;
  status: "active" | "paused" | "deleted";
  platform: string;
}

export interface WorkspaceEnvironment {
  id: string;
  kind: "production" | "staging" | "development";
  name: string;
  isDefault: boolean;
  testMode: boolean;
}

export interface Workspace {
  sites: WorkspaceSite[];
  site: WorkspaceSite | null;
  environments: WorkspaceEnvironment[];
  environment: WorkspaceEnvironment | null;
  /** Where the active site came from; `none` when the organization has no site. */
  source: "preference" | "cookie" | "default" | "none";
}

const UUID = /^[0-9a-f-]{36}$/i;

function toSite(row: typeof sites.$inferSelect): WorkspaceSite {
  return { id: row.id, name: row.name, trackingId: row.trackingId, primaryDomain: row.primaryDomain, status: row.status, platform: row.platform };
}

const loadWorkspace = cache(async (organizationId: string, userId: string, cookieSiteId: string | null): Promise<Workspace> => {
  return withTenant(db(), organizationId, async (tx) => {
    const siteRows = (await listSites(tx, organizationId)).map(toSite);
    if (siteRows.length === 0) return { sites: [], site: null, environments: [], environment: null, source: "none" };

    let preference: { activeSiteId: string | null; activeEnvironmentId: string | null } | null = null;
    try {
      // nested transaction = SAVEPOINT: a failed statement would otherwise abort the outer RLS transaction (25P02) and the fallback below could not run
      preference = await tx.transaction(async (sp) => {
        const rows = await sp
          .select({ activeSiteId: workspacePreferences.activeSiteId, activeEnvironmentId: workspacePreferences.activeEnvironmentId })
          .from(workspacePreferences)
          .where(and(eq(workspacePreferences.organizationId, organizationId), eq(workspacePreferences.userId, userId)))
          .limit(1);
        return rows[0] ?? null;
      });
    } catch (e) {
      // 42P01 = relation does not exist: migration 0006 not applied yet → cookie/default only (never a crash)
      if (pgErrorCode(e) !== "42P01") throw e;
      logger.warn("workspace_preferences missing: apply migration 0006_workspace_preferences");
    }

    let site: WorkspaceSite | undefined;
    let source: Workspace["source"] = "default";
    if (preference?.activeSiteId) {
      site = siteRows.find((s) => s.id === preference!.activeSiteId);
      if (site) source = "preference";
    }
    if (!site && cookieSiteId && UUID.test(cookieSiteId)) {
      site = siteRows.find((s) => s.id === cookieSiteId);
      if (site) source = "cookie";
    }
    if (!site) {
      site = siteRows[0]!;
      source = "default";
    }

    const envRows = await tx
      .select({ id: environments.id, kind: environments.kind, name: environments.name, isDefault: environments.isDefault, testMode: environments.testMode })
      .from(environments)
      .where(eq(environments.siteId, site.id))
      .orderBy(desc(environments.isDefault), asc(environments.kind));
    const environment = (preference?.activeEnvironmentId ? envRows.find((e) => e.id === preference!.activeEnvironmentId) : undefined) ?? envRows.find((e) => e.isDefault) ?? envRows[0] ?? null;
    return { sites: siteRows, site, environments: envRows, environment, source };
  });
});

/** The active site, environment and the organization's site list for the current request (deduplicated). */
export async function activeSite(ctx: OrgContext): Promise<Workspace> {
  const cookieSiteId = (await cookies()).get(ACTIVE_SITE_COOKIE)?.value ?? null;
  return loadWorkspace(ctx.organization.id, ctx.user.id, cookieSiteId);
}

/** Like `activeSite`, but sends the user to site onboarding when the organization has no site yet. */
export async function requireActiveSite(ctx: OrgContext): Promise<Workspace & { site: WorkspaceSite }> {
  const workspace = await activeSite(ctx);
  if (!workspace.site) redirect("/app/onboarding");
  return workspace as Workspace & { site: WorkspaceSite };
}

export interface PaletteDestination {
  id: string;
  name: string;
  connectorType: string;
  siteId: string;
  siteName: string;
}

/** Destinations of the organization for the command palette (name, connector, site); capped, newest first. */
export const paletteDestinations = cache(async (organizationId: string): Promise<PaletteDestination[]> => {
  return withTenant(db(), organizationId, async (tx) => {
    const rows = await tx
      .select({ id: integrations.id, name: integrations.name, connectorType: integrations.connectorType, siteId: integrations.siteId, siteName: sites.name })
      .from(integrations)
      .innerJoin(sites, eq(sites.id, integrations.siteId))
      .where(eq(integrations.organizationId, organizationId))
      .orderBy(desc(integrations.createdAt))
      .limit(100);
    return rows;
  });
});
