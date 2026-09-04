import "server-only";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { deliveryAttempts, eventAggregates, siteHealthSnapshots, type Tx } from "@track-site/db";
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

/** One hourly bucket of the site's event flow (from `event_aggregates`, written by the worker's ingest stage). */
export interface FlowBucket {
  /** ISO timestamp of the hour (UTC) */
  bucketStart: string;
  received: number;
  accepted: number;
  deduplicated: number;
  /** dropped for any reason other than deduplication (validation, bot, consent/policy, PII) */
  dropped: number;
  delivered: number;
  failed: number;
}

/**
 * Hourly event flow of one site environment since `since`, summed over event names and sources.
 * `dropped` excludes the duplicate reasons because `deduplicated` already counts them (the ingest
 * stage records duplicates in both places). Runs inside the caller's tenant transaction.
 */
export async function hourlyEventFlow(tx: Tx, siteId: string, environmentId: string, since: Date): Promise<FlowBucket[]> {
  const rows = await tx
    .select({
      bucketStart: eventAggregates.bucketStart,
      received: sql<number>`coalesce(sum(${eventAggregates.received}), 0)::int`,
      accepted: sql<number>`coalesce(sum(${eventAggregates.accepted}), 0)::int`,
      deduplicated: sql<number>`coalesce(sum(${eventAggregates.deduplicated}), 0)::int`,
      dropped: sql<number>`coalesce(sum((select coalesce(sum(d.value::int), 0) from jsonb_each_text(${eventAggregates.dropped}) d where d.key not in ('duplicate', 'duplicate_conversion'))), 0)::int`,
      delivered: sql<number>`coalesce(sum(${eventAggregates.delivered}), 0)::int`,
      failed: sql<number>`coalesce(sum(${eventAggregates.failed}), 0)::int`,
    })
    .from(eventAggregates)
    .where(and(eq(eventAggregates.siteId, siteId), eq(eventAggregates.environmentId, environmentId), gte(eventAggregates.bucketStart, since)))
    .groupBy(eventAggregates.bucketStart)
    .orderBy(eventAggregates.bucketStart);
  return rows.map((r) => ({ ...r, bucketStart: new Date(r.bucketStart).toISOString() }));
}

/** Delivery attempts of one UTC day by outcome (from `delivery_attempts`). */
export interface DeliveryDay {
  /** `YYYY-MM-DD` (UTC) */
  day: string;
  success: number;
  failed: number;
  dead: number;
  retry: number;
  skipped: number;
  pending: number;
}

/** Delivery outcomes per UTC day for one site since `since`; days without attempts are omitted. Runs inside the caller's tenant transaction. */
export async function deliveryOutcomesByDay(tx: Tx, siteId: string, since: Date): Promise<DeliveryDay[]> {
  const rows = await tx
    .select({
      day: sql<string>`to_char(date_trunc('day', ${deliveryAttempts.startedAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
      status: deliveryAttempts.status,
      n: sql<number>`count(*)::int`,
    })
    .from(deliveryAttempts)
    .where(and(eq(deliveryAttempts.siteId, siteId), gte(deliveryAttempts.startedAt, since)))
    .groupBy(sql`1`, deliveryAttempts.status)
    .orderBy(sql`1`);
  const days = new Map<string, DeliveryDay>();
  for (const r of rows) {
    const day = days.get(r.day) ?? { day: r.day, success: 0, failed: 0, dead: 0, retry: 0, skipped: 0, pending: 0 };
    day[r.status] += r.n;
    days.set(r.day, day);
  }
  return Array.from(days.values());
}
