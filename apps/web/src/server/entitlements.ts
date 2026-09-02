import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { plans, sites, subscriptions, type PlanLimits } from "@track-site/db";
import { db } from "./db";
import type { OrgContext } from "./session";
import { withOrg } from "./session";

const FALLBACK: PlanLimits = { sites: 1, eventsPerMonth: 50_000, destinations: 2, retentionDays: 90, teamMembers: 2, serverSide: false, exports: false, sso: false };

/** Effective plan limits from the verified subscription (or the starter defaults). */
export async function planLimits(ctx: OrgContext): Promise<{ planId: string; limits: PlanLimits; status: string }> {
  const rows = await db()
    .select({ planId: subscriptions.planId, status: subscriptions.status, limits: plans.limits })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.organizationId, ctx.organization.id))
    .limit(1);
  const row = rows[0];
  if (!row) {
    const starter = await db().select({ limits: plans.limits }).from(plans).where(eq(plans.id, "starter")).limit(1);
    return { planId: "starter", limits: starter[0]?.limits ?? FALLBACK, status: "none" };
  }
  return { planId: row.planId, limits: row.limits, status: row.status };
}

export async function siteLimitReached(ctx: OrgContext): Promise<boolean> {
  const { limits } = await planLimits(ctx);
  const count = await withOrg(ctx, async (tx) => {
    const r = await tx.select({ n: sql<number>`count(*)::int` }).from(sites).where(and(eq(sites.organizationId, ctx.organization.id), isNull(sites.deletedAt)));
    return r[0]?.n ?? 0;
  });
  return count >= limits.sites;
}
