import { and, asc, eq, gte } from "drizzle-orm";
import { integrations, revenueReconciliationSnapshots, shopConnections, sourceKeys, type DbOrTx, type ReconciliationGapReason } from "@track-site/db";

/**
 * Signal Gap & Revenue Leak Detector (redesign supplement §8 module 4): aggregates the worker's daily
 * `revenue_reconciliation_snapshots` of one site over a range, per destination and at site level, and reports the
 * gaps with their reasons and the uncertainty they carry. Nothing is estimated: an order without a value is
 * counted but never valued, mixed currencies are never summed, an unobservable delivery stays `unknown`.
 */
export const LEAK_RANGES = [7, 30] as const;
export type LeakRange = (typeof LEAK_RANGES)[number];
export type LeakKind = "purchase" | "lead";

export type SnapshotRow = typeof revenueReconciliationSnapshots.$inferSelect;

export interface LeakTotals {
  authoritative: number;
  valued: number;
  /** sum of the known values; null when nothing is valued or the currencies are mixed */
  value: number | null;
  currency: string | null;
  currencyMixed: boolean;
  observedBrowser: number;
  deduplicated: number;
  delivered: number;
  gaps: Record<ReconciliationGapReason, number>;
  /** definitive gaps (no consent, blocked, not captured, delivery failed) */
  definiteGaps: number;
  leakMin: number | null;
  leakMax: number | null;
  leakUnvalued: number;
  /** number of daily snapshots aggregated */
  days: number;
  computedAt: Date | null;
}

export interface DailyPoint {
  day: string;
  authoritative: number;
  delivered: number;
  gaps: number;
  unknown: number;
}

export interface DestinationLeak {
  integrationId: string;
  name: string;
  connectorType: string;
  status: string;
  /** delivery mode in the active bundle at computation time; null when the destination is not in the bundle */
  mode: string | null;
  mapped: boolean | null;
  totals: LeakTotals | null;
}

export interface RevenueLeakReport {
  kind: LeakKind;
  rangeDays: LeakRange;
  from: Date;
  to: Date;
  site: LeakTotals | null;
  daily: DailyPoint[];
  destinations: DestinationLeak[];
  sources: { shopConnections: Array<{ platform: string; status: string; lastEventAt: Date | null }>; serverKeys: number };
  computedAt: Date | null;
  /** the newest snapshot is older than a day: the report is stale */
  stale: boolean;
}

const num = (v: string | number | null | undefined): number | null => {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const round2 = (n: number): number => Math.round(n * 100) / 100;
export const utcDay = (d: Date): Date => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/** Sums daily snapshots; values are only summed when every valued day shares one currency. */
export function aggregateSnapshots(rows: SnapshotRow[]): LeakTotals | null {
  if (rows.length === 0) return null;
  const totals: LeakTotals = {
    authoritative: 0,
    valued: 0,
    value: 0,
    currency: null,
    currencyMixed: false,
    observedBrowser: 0,
    deduplicated: 0,
    delivered: 0,
    gaps: { no_consent: 0, blocked: 0, not_captured: 0, delivery_failed: 0, unknown: 0 },
    definiteGaps: 0,
    leakMin: 0,
    leakMax: 0,
    leakUnvalued: 0,
    days: rows.length,
    computedAt: null,
  };
  const currencies = new Set<string>();
  let mixed = false;
  for (const r of rows) {
    totals.authoritative += r.authoritativeCount;
    totals.valued += r.authoritativeValuedCount;
    totals.observedBrowser += r.observedBrowserCount;
    totals.deduplicated += r.deduplicatedCount;
    totals.delivered += r.deliveredCount;
    totals.gaps.no_consent += r.gapNoConsent;
    totals.gaps.blocked += r.gapBlocked;
    totals.gaps.not_captured += r.gapNotCaptured;
    totals.gaps.delivery_failed += r.gapDeliveryFailed;
    totals.gaps.unknown += r.gapUnknown;
    totals.leakUnvalued += r.leakUnvaluedCount;
    if (r.currencyMixed) mixed = true;
    if (r.currency) currencies.add(r.currency);
    const v = num(r.authoritativeValue);
    if (v != null) totals.value = (totals.value ?? 0) + v;
    const min = num(r.leakValueMin);
    const max = num(r.leakValueMax);
    if (min != null) totals.leakMin = (totals.leakMin ?? 0) + min;
    if (max != null) totals.leakMax = (totals.leakMax ?? 0) + max;
    if (!totals.computedAt || r.computedAt > totals.computedAt) totals.computedAt = r.computedAt;
  }
  totals.definiteGaps = totals.gaps.no_consent + totals.gaps.blocked + totals.gaps.not_captured + totals.gaps.delivery_failed;
  if (mixed || currencies.size > 1) {
    totals.currencyMixed = true;
    totals.currency = null;
    totals.value = null;
    totals.leakMin = null;
    totals.leakMax = null;
    // every valued order becomes unquantifiable once currencies are mixed
    totals.leakUnvalued = totals.definiteGaps + totals.gaps.unknown;
  } else if (currencies.size === 1 && totals.valued > 0) {
    totals.currency = [...currencies][0]!;
    totals.value = round2(totals.value ?? 0);
    totals.leakMin = round2(totals.leakMin ?? 0);
    totals.leakMax = round2(totals.leakMax ?? 0);
  } else {
    totals.value = null;
    totals.leakMin = null;
    totals.leakMax = null;
  }
  return totals;
}

/** Share of authoritative conversions that definitively did not arrive (0–1); null without authoritative data. */
export function leakShare(t: LeakTotals | null): number | null {
  if (!t || t.authoritative === 0) return null;
  return t.definiteGaps / t.authoritative;
}

/** Most frequent definitive gap reason; null when there is none. */
export function dominantReason(t: LeakTotals | null): ReconciliationGapReason | null {
  if (!t) return null;
  const entries = (["no_consent", "blocked", "not_captured", "delivery_failed"] as const).map((k) => [k, t.gaps[k]] as const).filter(([, n]) => n > 0);
  if (entries.length === 0) return null;
  return entries.sort((a, b) => b[1] - a[1])[0]![0];
}

/** Reads the report of one site inside an RLS-scoped transaction. */
export async function loadRevenueLeaks(tx: DbOrTx, input: { siteId: string; kind: LeakKind; rangeDays: LeakRange; now?: Date }): Promise<RevenueLeakReport> {
  const now = input.now ?? new Date();
  const to = now;
  const from = new Date(utcDay(now).getTime() - (input.rangeDays - 1) * 86_400_000);
  const rows = await tx
    .select()
    .from(revenueReconciliationSnapshots)
    .where(and(eq(revenueReconciliationSnapshots.siteId, input.siteId), eq(revenueReconciliationSnapshots.kind, input.kind), eq(revenueReconciliationSnapshots.granularity, "day"), gte(revenueReconciliationSnapshots.periodStart, from)))
    .orderBy(asc(revenueReconciliationSnapshots.periodStart));
  const siteRows = rows.filter((r) => r.integrationId === null);
  const byIntegration = new Map<string, SnapshotRow[]>();
  for (const r of rows) {
    if (!r.integrationId) continue;
    const list = byIntegration.get(r.integrationId) ?? [];
    list.push(r);
    byIntegration.set(r.integrationId, list);
  }
  const ints = await tx.select({ id: integrations.id, name: integrations.name, connectorType: integrations.connectorType, status: integrations.status }).from(integrations).where(eq(integrations.siteId, input.siteId)).orderBy(asc(integrations.createdAt));
  const destinations: DestinationLeak[] = ints.map((i) => {
    const list = byIntegration.get(i.id) ?? [];
    const newest = list.length ? list[list.length - 1]! : null;
    const sources = newest?.sources;
    return { integrationId: i.id, name: i.name, connectorType: i.connectorType, status: i.status, mode: sources?.destination_mode ?? null, mapped: typeof sources?.mapped === "boolean" ? sources.mapped : null, totals: aggregateSnapshots(list) };
  });
  const shops = await tx.select({ platform: shopConnections.platform, status: shopConnections.status, lastEventAt: shopConnections.lastEventAt }).from(shopConnections).where(eq(shopConnections.siteId, input.siteId)).orderBy(asc(shopConnections.createdAt));
  const keys = await tx.select({ id: sourceKeys.id }).from(sourceKeys).where(and(eq(sourceKeys.siteId, input.siteId), eq(sourceKeys.status, "active")));
  const site = aggregateSnapshots(siteRows);
  let computedAt: Date | null = null;
  for (const r of rows) if (!computedAt || r.computedAt > computedAt) computedAt = r.computedAt;
  const daily: DailyPoint[] = siteRows.map((r) => ({ day: r.periodStart.toISOString().slice(0, 10), authoritative: r.authoritativeCount, delivered: r.deliveredCount, gaps: r.gapNoConsent + r.gapBlocked + r.gapNotCaptured + r.gapDeliveryFailed, unknown: r.gapUnknown }));
  return {
    kind: input.kind,
    rangeDays: input.rangeDays,
    from,
    to,
    site,
    daily,
    destinations,
    sources: { shopConnections: shops.map((s) => ({ platform: s.platform, status: s.status, lastEventAt: s.lastEventAt ?? null })), serverKeys: keys.length },
    computedAt,
    stale: computedAt ? now.getTime() - computedAt.getTime() > 86_400_000 : false,
  };
}
