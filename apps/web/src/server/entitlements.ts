import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { planRecord } from "@track-site/catalog";
import { plans, sites, subscriptions, type PlanLimits } from "@track-site/db";
import { db } from "./db";
import type { OrgContext } from "./session";
import { withOrg } from "./session";

/**
 * Effective plan limits: the subscription's plan row (the `plans` table is synced from the tariff
 * catalogue by the seed); without a subscription the Starter row, and without a seeded table the
 * catalogue's Starter record. `null` inside the limits means "no fixed cap in this plan".
 */
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
    return { planId: "starter", limits: starter[0]?.limits ?? planRecord("starter").limits, status: "none" };
  }
  return { planId: row.planId, limits: row.limits, status: row.status };
}

/** True when the plan caps production sites and the organization has reached that cap. */
export async function siteLimitReached(ctx: OrgContext): Promise<boolean> {
  const { limits } = await planLimits(ctx);
  if (limits.sites == null) return false;
  const cap = limits.sites;
  const count = await withOrg(ctx, async (tx) => {
    const r = await tx.select({ n: sql<number>`count(*)::int` }).from(sites).where(and(eq(sites.organizationId, ctx.organization.id), isNull(sites.deletedAt)));
    return r[0]?.n ?? 0;
  });
  return count >= cap;
}
