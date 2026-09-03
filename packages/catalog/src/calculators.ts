import { overagePackFor } from "./overage.ts";
import { PLANS, listPriceCents, planById, publicPlanOrder, type Plan } from "./plans.ts";
import { CURRENCY, type BillingInterval, type Currency, type PlanId } from "./types.ts";

export interface PlanFinderInput {
  /** production websites */
  sites: number;
  /** accepted events per month */
  eventsPerMonth: number;
  teamMembers: number;
  /** wanted event retention in days */
  retentionDays: number;
}

function satisfies(plan: Plan, input: PlanFinderInput): boolean {
  const l = plan.limits;
  const fits = (limit: number | null, wanted: number) => limit == null || wanted <= limit;
  return fits(l.sites, input.sites) && fits(l.eventsPerMonth, input.eventsPerMonth) && fits(l.teamMembers, input.teamMembers) && fits(l.retentionDays, input.retentionDays);
}

/**
 * Deterministic plan finder: the smallest plan (by sort order) whose limits satisfy every input;
 * Enterprise when none does. Negative or NaN inputs are treated as zero; an infinite wish only
 * fits a plan without a cap.
 */
export function recommendPlan(input: PlanFinderInput): PlanId {
  const clean: PlanFinderInput = {
    sites: sanitize(input.sites),
    eventsPerMonth: sanitize(input.eventsPerMonth),
    teamMembers: sanitize(input.teamMembers),
    retentionDays: sanitize(input.retentionDays),
  };
  for (const plan of publicPlanOrder()) if (satisfies(plan, clean)) return plan.id;
  return "enterprise";
}

function sanitize(n: number): number {
  return Number.isNaN(n) || n < 0 ? 0 : n;
}

export interface CostEstimateInput {
  planId: PlanId;
  /** expected accepted events per month */
  eventsPerMonth: number;
  interval: BillingInterval;
}

export interface CheaperUpgrade {
  planId: PlanId;
  /** total for the same volume and interval, cents per billing period */
  total: number;
  /** how much less than the estimated plan, cents per billing period */
  savings: number;
}

/**
 * All amounts are integer cents for one billing period (`periodMonths` = 1 or 12). Overage is
 * estimated per month from the expected volume and multiplied by the period length.
 */
export interface CostEstimate {
  planId: PlanId;
  interval: BillingInterval;
  currency: Currency;
  periodMonths: 1 | 12;
  /** list price of the plan for the period */
  base: number;
  includedEventsPerMonth: number;
  overageEventsPerMonth: number;
  /** packs needed per month to cover the overage */
  overagePacks: number;
  /** overage list price for the period (packs × price × months) */
  overageCost: number;
  total: number;
  /** honest comparison: the cheapest higher plan that costs less for the same volume, if any */
  cheaperUpgrade?: CheaperUpgrade;
  /** the plan's overage is contractual (Enterprise) or the volume exceeds what packs can honestly cover */
  overageContractual: boolean;
}

function estimateOne(planId: PlanId, eventsPerMonth: number, interval: BillingInterval): CostEstimate | null {
  const plan = planById(planId);
  const base = listPriceCents(planId, interval);
  if (base == null || plan.limits.eventsPerMonth == null) return null;
  const periodMonths = interval === "yearly" ? 12 : 1;
  const included = plan.limits.eventsPerMonth;
  const overageEvents = Math.max(0, eventsPerMonth - included);
  const pack = overagePackFor(planId);
  const packs = pack && overageEvents > 0 ? Math.ceil(overageEvents / pack.events) : 0;
  const overageCost = pack ? packs * pack.priceCents * periodMonths : 0;
  return {
    planId,
    interval,
    currency: CURRENCY,
    periodMonths,
    base,
    includedEventsPerMonth: included,
    overageEventsPerMonth: overageEvents,
    overagePacks: packs,
    overageCost,
    total: base + overageCost,
    overageContractual: overageEvents > 0 && pack == null,
  };
}

/**
 * Cost calculator for the pricing page and the usage guard. Returns `null` for custom-priced plans.
 * `cheaperUpgrade` names the cheapest higher plan whose total for the same volume is lower.
 */
export function estimateCost(input: CostEstimateInput): CostEstimate | null {
  const events = sanitize(input.eventsPerMonth);
  const estimate = estimateOne(input.planId, events, input.interval);
  if (!estimate) return null;
  const current = planById(input.planId);
  let best: CheaperUpgrade | undefined;
  for (const plan of publicPlanOrder()) {
    if (plan.sortOrder <= current.sortOrder) continue;
    const other = estimateOne(plan.id, events, input.interval);
    if (!other || other.total >= estimate.total) continue;
    if (!best || other.total < best.total) best = { planId: plan.id, total: other.total, savings: estimate.total - other.total };
  }
  return best ? { ...estimate, cheaperUpgrade: best } : estimate;
}

/** Plans that can be estimated (have a list price and an event limit), in display order. */
export function estimablePlanIds(): PlanId[] {
  return PLANS.filter((p) => p.price && p.limits.eventsPerMonth != null)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((p) => p.id);
}
