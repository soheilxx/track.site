import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import {
  DEFAULT_OVERAGE_POLICY,
  USAGE_PAUSE_GRACE_PERCENT,
  USAGE_WARNING_THRESHOLDS,
  estimateCost,
  findPlan,
  isBillingInterval,
  isOveragePolicy,
  isPlanId,
  overagePackFor,
  planById,
  publicPlanOrder,
  type BillingInterval,
  type OveragePack,
  type OveragePolicy,
  type PlanId,
  type UsageWarningThreshold,
} from "@track-site/catalog";
import { usagePeriodKey } from "@track-site/core";
import { orgSettings, sites, subscriptions, usageLedger, usagePeriods, type PlanLimits, type Tx } from "@track-site/db";

/**
 * Usage & Cost Guard (owner supplement §5 "Mehrverbrauch und Kostenkontrolle", §8 module 12).
 *
 * Everything on the page is derived from two stores the worker writes: the immutable `usage_ledger`
 * (one row per billable event, `recorded_at` = when the ingestion accepted it) and the per-period
 * counters in `usage_periods` (what the plan limit is measured against, incl. the threshold stamps
 * and the limit markers of the usage check). The pure functions below turn those facts into the
 * forecast, the load check, the threshold states, the policy consequence and the honest pack-vs-plan
 * comparison; every derived figure carries its method and window so the UI can label it as such.
 * Unknown stays null: without ledger rows there is no rate, without a baseline there is no verdict.
 */

export const DAY_MS = 86_400_000;
/** complete UTC days the forecast rate is averaged over */
export const RECENT_DAYS = 7;
/** complete UTC days of the baseline the recent window is compared with (4 weeks) */
export const BASELINE_DAYS = 28;
/** billable events the recent window needs before a higher rate is called unusual (guards against noise on tiny volumes) */
export const UNUSUAL_LOAD_MIN_EVENTS = 100;
/** recent rate ÷ baseline rate from which the load counts as elevated */
export const UNUSUAL_LOAD_FACTOR = 1.5;
/** recent rate ÷ baseline rate below which the load counts as reduced */
export const REDUCED_LOAD_FACTOR = 0.5;

export interface DailyCount {
  /** `YYYY-MM-DD` (UTC) */
  day: string;
  events: number;
}

/** `YYYY-MM-DD` of a date in UTC. */
export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Start of the UTC day `offsetDays` days away from `date`'s UTC day. */
export function dayStart(date: Date, offsetDays = 0): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + offsetDays));
}

export interface PeriodBounds {
  key: string;
  start: Date;
  /** exclusive: first instant of the next period */
  end: Date;
  totalDays: number;
  /** fractional days since the period started */
  elapsedDays: number;
  /** fractional days until the period ends */
  remainingDays: number;
}

/** The usage period (UTC calendar month, the ledger's `period_key`) that contains `now`. */
export function periodBounds(now: Date): PeriodBounds {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const totalDays = (end.getTime() - start.getTime()) / DAY_MS;
  const elapsedDays = Math.min(totalDays, Math.max(0, (now.getTime() - start.getTime()) / DAY_MS));
  return { key: usagePeriodKey(now), start, end, totalDays, elapsedDays, remainingDays: totalDays - elapsedDays };
}

/** Period keys of every UTC month touched by `[from, to]` (for the ledger's period index). */
export function periodKeysBetween(from: Date, to: Date): string[] {
  const keys: string[] = [];
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  const last = usagePeriodKey(to);
  while (keys.length < 36) {
    const key = usagePeriodKey(cursor);
    keys.push(key);
    if (key === last) break;
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return keys;
}

/** Every day from `from` to `to` (inclusive, UTC) with the recorded count or zero. */
export function fillDays(rows: DailyCount[], from: Date, to: Date): DailyCount[] {
  const byDay = new Map(rows.map((r) => [r.day, r.events]));
  const out: DailyCount[] = [];
  for (let d = dayStart(from); d.getTime() <= to.getTime(); d = new Date(d.getTime() + DAY_MS)) {
    const key = dayKey(d);
    out.push({ day: key, events: byDay.get(key) ?? 0 });
  }
  return out;
}

export interface DayWindow {
  /** first day key (inclusive) */
  from: string;
  /** last day key (inclusive) */
  to: string;
  days: number;
  events: number;
}

function windowOf(daily: DailyCount[], from: Date, to: Date): DayWindow {
  const fromKey = dayKey(from);
  const toKey = dayKey(to);
  const inside = daily.filter((d) => d.day >= fromKey && d.day <= toKey);
  return { from: fromKey, to: toKey, days: Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1, events: inside.reduce((a, d) => a + d.events, 0) };
}

/** The 7 complete UTC days before today. */
export function recentWindow(daily: DailyCount[], now: Date): DayWindow {
  return windowOf(daily, dayStart(now, -RECENT_DAYS), dayStart(now, -1));
}

/** The 28 complete UTC days before the recent window. */
export function baselineWindow(daily: DailyCount[], now: Date): DayWindow {
  return windowOf(daily, dayStart(now, -(RECENT_DAYS + BASELINE_DAYS)), dayStart(now, -(RECENT_DAYS + 1)));
}

export interface Forecast {
  method: "linear_7d";
  /** events per day averaged over the recent window */
  dailyRate: number;
  window: DayWindow;
  remainingDays: number;
  /** billable events expected at period end (current count + rate × remaining days), rounded */
  projected: number;
  /** `ledger`: the recent window holds ledger rows; `none`: no rows, so the projection is just the current count */
  basis: "ledger" | "none";
}

/** Linear projection to the end of the period from the average of the last 7 complete days. */
export function forecastPeriodEnd(input: { billable: number; daily: DailyCount[]; now: Date }): Forecast {
  const window = recentWindow(input.daily, input.now);
  const { remainingDays } = periodBounds(input.now);
  const dailyRate = window.events / RECENT_DAYS;
  return {
    method: "linear_7d",
    dailyRate,
    window,
    remainingDays,
    projected: Math.round(input.billable + dailyRate * remainingDays),
    basis: window.events > 0 ? "ledger" : "none",
  };
}

export type LoadVerdict = "elevated" | "normal" | "reduced" | "unknown";

export interface LoadCheck {
  verdict: LoadVerdict;
  recent: DayWindow;
  baseline: DayWindow;
  recentRate: number;
  /** null without any baseline rows */
  baselineRate: number | null;
  /** (recent − baseline) ÷ baseline as a ratio (0.5 = +50 %); null without a baseline */
  deviation: number | null;
  /** the busiest day of the recent window; null when it holds no rows */
  peakDay: DailyCount | null;
  reason: "no_baseline" | null;
}

/** Simple deviation of the last 7 days from the 4-week baseline before them; never a verdict without a baseline. */
export function detectUnusualLoad(daily: DailyCount[], now: Date): LoadCheck {
  const recent = recentWindow(daily, now);
  const baseline = baselineWindow(daily, now);
  const recentRate = recent.events / RECENT_DAYS;
  const inRecent = daily.filter((d) => d.day >= recent.from && d.day <= recent.to);
  const peakDay = inRecent.reduce<DailyCount | null>((best, d) => (d.events > 0 && (!best || d.events > best.events) ? d : best), null);
  if (baseline.events === 0) return { verdict: "unknown", recent, baseline, recentRate, baselineRate: null, deviation: null, peakDay, reason: "no_baseline" };
  const baselineRate = baseline.events / BASELINE_DAYS;
  const ratio = recentRate / baselineRate;
  const verdict: LoadVerdict = ratio >= UNUSUAL_LOAD_FACTOR && recent.events >= UNUSUAL_LOAD_MIN_EVENTS ? "elevated" : ratio <= REDUCED_LOAD_FACTOR ? "reduced" : "normal";
  return { verdict, recent, baseline, recentRate, baselineRate, deviation: ratio - 1, peakDay, reason: null };
}

export interface ThresholdState {
  pct: UsageWarningThreshold;
  /** billable events at which the threshold is crossed */
  events: number;
  reached: boolean;
  /** when the usage check stamped the warning; null when not stamped (reached but alert pending, or not reached) */
  warnedAt: Date | null;
  /** events still to go; 0 once reached */
  remaining: number;
  /** when the forecast expects the threshold to be crossed; null when reached, without a rate or beyond the period end */
  expectedAt: Date | null;
}

/** State of the 70 / 90 / 100 % warnings for the current period; null when the plan has no fixed cap. */
export function thresholdStates(input: { limit: number | null; billable: number; warned: Record<UsageWarningThreshold, Date | null>; forecast: Forecast; now: Date }): ThresholdState[] | null {
  if (input.limit == null || input.limit <= 0) return null;
  const { end } = periodBounds(input.now);
  return USAGE_WARNING_THRESHOLDS.map((pct) => {
    const events = Math.ceil((input.limit! * pct) / 100);
    const reached = input.billable >= events;
    const remaining = reached ? 0 : events - input.billable;
    let expectedAt: Date | null = null;
    if (!reached && input.forecast.dailyRate > 0) {
      const at = new Date(input.now.getTime() + (remaining / input.forecast.dailyRate) * DAY_MS);
      expectedAt = at.getTime() < end.getTime() ? at : null;
    }
    return { pct, events, reached, warnedAt: input.warned[pct], remaining, expectedAt };
  });
}

export interface OverageNow {
  /** billable events above the limit */
  events: number;
  /** packs needed to cover them (catalogue pack of the plan) */
  packs: number;
  /** packs × list price, cents */
  costCents: number;
  pack: OveragePack | null;
  /** events above the limit but no pack for the plan (Enterprise: contractual) */
  contractual: boolean;
}

/** Overage of `billable` above `limit` in packs and list price; nothing above a plan without a cap. */
export function overageFor(billable: number, limit: number | null, pack: OveragePack | null): OverageNow {
  const events = limit == null ? 0 : Math.max(0, billable - limit);
  const packs = pack && events > 0 ? Math.ceil(events / pack.events) : 0;
  return { events, packs, costCents: pack ? packs * pack.priceCents : 0, pack, contractual: events > 0 && pack == null };
}

/**
 * Hard-limit rule of the worker's usage check (`apps/worker/src/jobs/usage.ts`), mirrored so a policy
 * change can re-evaluate the current period immediately: `allow` never pauses; `cost_limit` pauses once
 * the packs needed cost more than the limit; `pause` (and `cost_limit` without a limit or a pack) pauses
 * above limit × (1 + grace).
 */
export function evaluateHardLimit(input: { policy: OveragePolicy; billable: number; limit: number | null; pack: OveragePack | null; costLimitCents: number | null }): boolean {
  if (input.limit == null || input.limit <= 0) return false;
  if (input.policy === "allow") return false;
  if (input.policy === "cost_limit" && input.pack && input.costLimitCents != null) {
    const overage = overageFor(input.billable, input.limit, input.pack);
    return overage.packs * input.pack.priceCents > input.costLimitCents;
  }
  return input.billable >= input.limit * (1 + USAGE_PAUSE_GRACE_PERCENT / 100);
}

/** Bounds of the monthly cost limit (integer cents): €1 … €100,000. */
export const COST_LIMIT_BOUNDS = { minCents: 100, maxCents: 10_000_000 } as const;

/** Order of restrictiveness: a move to the right can create cost, so the UI asks for an acknowledgement and the audit entry says so. */
const POLICY_RANK: Record<OveragePolicy, number> = { pause: 0, cost_limit: 1, allow: 2 };

export function isLessRestrictive(from: { policy: OveragePolicy; costLimitCents: number | null }, to: { policy: OveragePolicy; costLimitCents: number | null }): boolean {
  if (POLICY_RANK[to.policy] > POLICY_RANK[from.policy]) return true;
  return to.policy === "cost_limit" && from.policy === "cost_limit" && (to.costLimitCents ?? 0) > (from.costLimitCents ?? 0);
}

export interface PolicyState {
  policy: OveragePolicy;
  costLimitCents: number | null;
  /** how the usage check actually behaves (a cost limit without an amount or without a pack behaves like pause) */
  effective: OveragePolicy;
  /** billable events from which processing pauses; null when it never pauses or the plan has no cap */
  pauseAtEvents: number | null;
  /** packs the cost limit pays for; null unless the effective policy is `cost_limit` */
  packsAllowed: number | null;
  gracePercent: number;
  note: "cost_limit_unset" | "no_pack" | null;
}

/** What the chosen policy means for this plan in events and packs. */
export function describePolicy(input: { policy: OveragePolicy; costLimitCents: number | null; limit: number | null; pack: OveragePack | null }): PolicyState {
  const base = { policy: input.policy, costLimitCents: input.costLimitCents, gracePercent: USAGE_PAUSE_GRACE_PERCENT };
  if (input.limit == null || input.limit <= 0) return { ...base, effective: input.policy, pauseAtEvents: null, packsAllowed: null, note: null };
  if (input.policy === "allow") return { ...base, effective: "allow", pauseAtEvents: null, packsAllowed: null, note: null };
  const pauseAt = Math.ceil(input.limit * (1 + USAGE_PAUSE_GRACE_PERCENT / 100));
  if (input.policy === "cost_limit") {
    if (!input.pack) return { ...base, effective: "pause", pauseAtEvents: pauseAt, packsAllowed: null, note: "no_pack" };
    if (input.costLimitCents == null) return { ...base, effective: "pause", pauseAtEvents: pauseAt, packsAllowed: null, note: "cost_limit_unset" };
    const packsAllowed = Math.floor(input.costLimitCents / input.pack.priceCents);
    // the check pauses once the packs needed cost more than the limit, i.e. beyond limit + packsAllowed × pack events
    return { ...base, effective: "cost_limit", pauseAtEvents: input.limit + packsAllowed * input.pack.events + 1, packsAllowed, note: null };
  }
  return { ...base, effective: "pause", pauseAtEvents: pauseAt, packsAllowed: null, note: null };
}

export interface CostOption {
  planId: PlanId;
  name: string;
  kind: "current" | "upgrade";
  interval: BillingInterval;
  periodMonths: 1 | 12;
  /** list price for the billing period, cents */
  baseCents: number;
  includedEventsPerMonth: number;
  overageEventsPerMonth: number;
  packs: number;
  overageCents: number;
  totalCents: number;
  /** overage above this plan's cap has no pack (contractual) */
  contractual: boolean;
  cheapest: boolean;
}

export interface CostComparison {
  /** monthly volume the options are priced for */
  eventsPerMonth: number;
  interval: BillingInterval;
  options: CostOption[];
  /** `stay`: the current plan plus packs is cheapest; `upgrade`: a higher plan costs less; `contractual`: no list price for this plan; `none`: nothing to compare */
  recommendation: "stay" | "upgrade" | "contractual" | "none";
  cheapestPlanId: PlanId | null;
  /** savings per billing period against the current plan when an upgrade is cheaper, cents */
  savingsCents: number | null;
}

/**
 * Honest comparison for one monthly volume: the current plan with the packs it would need against every
 * higher public plan, all at catalogue list prices for the customer's billing interval. Informational only —
 * nothing here changes the subscription (no silent upgrade).
 */
export function compareOptions(input: { planId: string; eventsPerMonth: number; interval: BillingInterval }): CostComparison {
  const empty: CostComparison = { eventsPerMonth: input.eventsPerMonth, interval: input.interval, options: [], recommendation: "none", cheapestPlanId: null, savingsCents: null };
  if (!isPlanId(input.planId)) return empty;
  const current = estimateCost({ planId: input.planId, eventsPerMonth: input.eventsPerMonth, interval: input.interval });
  if (!current) return { ...empty, recommendation: "contractual" };
  const currentPlan = planById(input.planId);
  const options: CostOption[] = [];
  const toOption = (planId: PlanId, kind: CostOption["kind"], est: NonNullable<ReturnType<typeof estimateCost>>): CostOption => ({
    planId,
    name: planById(planId).name,
    kind,
    interval: est.interval,
    periodMonths: est.periodMonths,
    baseCents: est.base,
    includedEventsPerMonth: est.includedEventsPerMonth,
    overageEventsPerMonth: est.overageEventsPerMonth,
    packs: est.overagePacks,
    overageCents: est.overageCost,
    totalCents: est.total,
    contractual: est.overageContractual,
    cheapest: false,
  });
  options.push(toOption(input.planId, "current", current));
  for (const plan of publicPlanOrder()) {
    if (plan.sortOrder <= currentPlan.sortOrder) continue;
    const est = estimateCost({ planId: plan.id, eventsPerMonth: input.eventsPerMonth, interval: input.interval });
    if (est) options.push(toOption(plan.id, "upgrade", est));
  }
  // packs cannot honestly cover a volume above what the plan sells; such an option is never "cheapest"
  const priced = options.filter((o) => !o.contractual);
  const cheapest = priced.reduce<CostOption | null>((best, o) => (!best || o.totalCents < best.totalCents ? o : best), null);
  if (cheapest) cheapest.cheapest = true;
  const currentOption = options[0]!;
  const recommendation: CostComparison["recommendation"] = !cheapest ? "none" : cheapest.kind === "current" ? "stay" : "upgrade";
  return {
    eventsPerMonth: input.eventsPerMonth,
    interval: input.interval,
    options,
    recommendation,
    cheapestPlanId: cheapest?.planId ?? null,
    savingsCents: cheapest && cheapest.kind === "upgrade" ? currentOption.totalCents - cheapest.totalCents : null,
  };
}

export interface SiteUsage {
  siteId: string;
  name: string;
  trackingId: string;
  events: number;
  /** share of the period's ledgered billable events (0–1) */
  share: number;
}

export interface UsageGuard {
  now: Date;
  period: PeriodBounds;
  plan: {
    id: string;
    name: string;
    interval: BillingInterval;
    status: string;
    /** monthly event limit (the period row's stamp, else the plan); null = no fixed cap */
    limit: number | null;
    pack: OveragePack | null;
  };
  current: {
    billable: number;
    accepted: number | null;
    dropped: number | null;
    deduplicated: number | null;
    /** `period`: the worker's counters; `ledger`: only ledger rows exist for this period; `none`: nothing recorded */
    source: "period" | "ledger" | "none";
    /** when the period counters were last written */
    updatedAt: Date | null;
    softLimitHitAt: Date | null;
    hardLimitHitAt: Date | null;
    warned: Record<UsageWarningThreshold, Date | null>;
  };
  /** billable events per UTC day for the baseline window, the recent window and today */
  daily: DailyCount[];
  forecast: Forecast;
  load: LoadCheck;
  thresholds: ThresholdState[] | null;
  overage: OverageNow;
  /** overage the forecast implies at period end */
  forecastOverage: OverageNow;
  policy: PolicyState;
  comparison: CostComparison;
  sites: SiteUsage[];
  ledger: {
    /** newest billable ledger row of this period */
    latestAt: Date | null;
    /** the ledger holds rows newer than the period counters by more than an hour */
    stale: boolean;
  };
  subscription: { currentPeriodEnd: Date | null; graceUntil: Date | null; cancelAt: Date | null; stripeCustomerId: string | null } | null;
}

/** The effective plan of the organization, as `planLimits()` in `entitlements.ts` resolves it (passed in so this module stays free of `server-only` imports and testable). */
export interface PlanFacts {
  planId: string;
  limits: PlanLimits;
  status: string;
}

/**
 * Loads every fact of the Usage & Cost Guard for one organization. Runs inside the caller's tenant
 * transaction (`withOrg(ctx, tx => usageGuard(tx, ctx.organization.id, plan))`), so RLS scopes every query.
 */
export async function usageGuard(tx: Tx, orgId: string, plan: PlanFacts, now = new Date()): Promise<UsageGuard> {
  const period = periodBounds(now);
  const since = dayStart(now, -(RECENT_DAYS + BASELINE_DAYS));
  const dayExpr = sql<string>`to_char(${usageLedger.recordedAt} at time zone 'UTC', 'YYYY-MM-DD')`;
  const quantity = sql<number>`coalesce(sum(${usageLedger.quantity}), 0)::int`;

  const facts = await (async () => {
    const [row] = await tx.select().from(usagePeriods).where(and(eq(usagePeriods.organizationId, orgId), eq(usagePeriods.periodKey, period.key))).limit(1);
    const [settings] = await tx.select({ policy: orgSettings.usageOveragePolicy, costLimitCents: orgSettings.usageCostLimitCents }).from(orgSettings).where(eq(orgSettings.organizationId, orgId)).limit(1);
    const [sub] = await tx.select({ interval: subscriptions.interval, currentPeriodEnd: subscriptions.currentPeriodEnd, graceUntil: subscriptions.graceUntil, cancelAt: subscriptions.cancelAt, stripeCustomerId: subscriptions.stripeCustomerId }).from(subscriptions).where(eq(subscriptions.organizationId, orgId)).limit(1);
    const dailyRows = await tx
      .select({ day: dayExpr, events: quantity })
      .from(usageLedger)
      .where(and(eq(usageLedger.organizationId, orgId), eq(usageLedger.kind, "billable_event"), inArray(usageLedger.periodKey, periodKeysBetween(since, now)), gte(usageLedger.recordedAt, since)))
      .groupBy(dayExpr)
      .orderBy(dayExpr);
    const siteRows = await tx
      .select({ siteId: usageLedger.siteId, name: sites.name, trackingId: sites.trackingId, events: quantity })
      .from(usageLedger)
      .innerJoin(sites, eq(sites.id, usageLedger.siteId))
      .where(and(eq(usageLedger.organizationId, orgId), eq(usageLedger.kind, "billable_event"), eq(usageLedger.periodKey, period.key)))
      .groupBy(usageLedger.siteId, sites.name, sites.trackingId)
      .orderBy(desc(quantity));
    const [latest] = await tx
      .select({ at: sql<Date | null>`max(${usageLedger.recordedAt})` })
      .from(usageLedger)
      .where(and(eq(usageLedger.organizationId, orgId), eq(usageLedger.kind, "billable_event"), eq(usageLedger.periodKey, period.key)));
    return { row: row ?? null, settings: settings ?? null, sub: sub ?? null, dailyRows, siteRows, latestAt: latest?.at ? new Date(latest.at) : null };
  })();

  const interval: BillingInterval = isBillingInterval(facts.sub?.interval) ? facts.sub.interval : "monthly";
  const limit = facts.row?.limitEvents ?? plan.limits.eventsPerMonth ?? null;
  const pack = isPlanId(plan.planId) ? overagePackFor(plan.planId) : null;
  const ledgerTotal = facts.siteRows.reduce((a, r) => a + r.events, 0);
  const source: UsageGuard["current"]["source"] = facts.row ? "period" : ledgerTotal > 0 ? "ledger" : "none";
  const billable = facts.row?.billableEvents ?? ledgerTotal;
  const daily = fillDays(facts.dailyRows, since, now);
  const forecast = forecastPeriodEnd({ billable, daily, now });
  const load = detectUnusualLoad(daily, now);
  const warned: Record<UsageWarningThreshold, Date | null> = { 70: facts.row?.warned70At ?? null, 90: facts.row?.warned90At ?? null, 100: facts.row?.warned100At ?? null };
  const policy: OveragePolicy = isOveragePolicy(facts.settings?.policy) ? facts.settings.policy : DEFAULT_OVERAGE_POLICY;
  const costLimitCents = facts.settings?.costLimitCents ?? null;
  const updatedAt = facts.row?.updatedAt ?? null;

  return {
    now,
    period,
    plan: { id: plan.planId, name: findPlan(plan.planId)?.name ?? plan.planId, interval, status: plan.status, limit, pack },
    current: {
      billable,
      accepted: facts.row?.acceptedEvents ?? null,
      dropped: facts.row?.droppedEvents ?? null,
      deduplicated: facts.row?.deduplicatedEvents ?? null,
      source,
      updatedAt,
      softLimitHitAt: facts.row?.softLimitHitAt ?? null,
      hardLimitHitAt: facts.row?.hardLimitHitAt ?? null,
      warned,
    },
    daily,
    forecast,
    load,
    thresholds: thresholdStates({ limit, billable, warned, forecast, now }),
    overage: overageFor(billable, limit, pack),
    forecastOverage: overageFor(forecast.projected, limit, pack),
    policy: describePolicy({ policy, costLimitCents, limit, pack }),
    comparison: compareOptions({ planId: plan.planId, eventsPerMonth: Math.max(forecast.projected, billable), interval }),
    sites: facts.siteRows.map((r) => ({ siteId: r.siteId, name: r.name, trackingId: r.trackingId, events: r.events, share: ledgerTotal > 0 ? r.events / ledgerTotal : 0 })),
    ledger: { latestAt: facts.latestAt, stale: Boolean(facts.latestAt && updatedAt && facts.latestAt.getTime() - updatedAt.getTime() > 3_600_000) },
    subscription: facts.sub ? { currentPeriodEnd: facts.sub.currentPeriodEnd, graceUntil: facts.sub.graceUntil, cancelAt: facts.sub.cancelAt, stripeCustomerId: facts.sub.stripeCustomerId } : null,
  };
}
