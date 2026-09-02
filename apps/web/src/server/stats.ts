import "server-only";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { eventAggregates, siteHealthSnapshots } from "@track-site/db";
import type { OrgContext } from "./session";
import { withOrg } from "./session";

export interface OverviewStats {
  health: number | null;
  accepted: number;
  delivered: number;
}

/** Aggregates for the overview from the hourly event_aggregates table (last 30 days). */
export async function overviewStats(ctx: OrgContext, siteIds: string[]): Promise<OverviewStats> {
  if (siteIds.length === 0) return { health: null, accepted: 0, delivered: 0 };
  const since = new Date(Date.now() - 30 * 86_400_000);
  return withOrg(ctx, async (tx) => {
    const agg = await tx
      .select({ accepted: sql<number>`coalesce(sum(${eventAggregates.accepted}), 0)::int`, delivered: sql<number>`coalesce(sum(${eventAggregates.delivered}), 0)::int` })
      .from(eventAggregates)
      .where(and(inArray(eventAggregates.siteId, siteIds), gte(eventAggregates.bucketStart, since)));
    const health = await tx.select({ score: siteHealthSnapshots.score }).from(siteHealthSnapshots).where(eq(siteHealthSnapshots.siteId, siteIds[0]!)).orderBy(desc(siteHealthSnapshots.computedAt)).limit(1);
    return { health: health[0]?.score ?? null, accepted: agg[0]?.accepted ?? 0, delivered: agg[0]?.delivered ?? 0 };
  });
}
