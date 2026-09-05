import { estimateCost, findPlan, overagePackFor, planById, publicPlanOrder, recommendPlan, type BillingInterval, type CostEstimate, type OveragePack, type PaidPlanId, type Plan, type PlanFinderInput, type PlanId } from "@track-site/catalog";
import { planSelectionQuery, safePlanSelection } from "./plan-selection";
import { CONTACT_SALES_HREF, FINDER_EVENT_OPTIONS, SIGNUP_HREF, clampEvents, type PlanHrefs } from "./pricing-format";

/**
 * Pure helpers of the pricing page. Every number and every recommendation comes from the tariff
 * catalogue: `recommendPlan` for the plan finder, `estimateCost` for the calculator. This module only
 * formats and validates around them.
 *
 * Bundle boundary: this file imports `@track-site/catalog`, so it is used on the server (page,
 * static finder/calculator) and inside the lazily loaded interactive finder/calculator chunk. The
 * client islands of the first viewport (plan cards, matrix CTAs) import `./pricing-format` instead
 * and receive resolved hrefs from the page — see `planHrefs()`.
 */
export * from "./pricing-format";

/**
 * Signup link with validated `plan` and `interval` query params (contract in `./plan-selection`):
 * only catalogue plan ids with a list price and only `monthly | yearly` are ever emitted. A
 * contact-sales plan goes to the enterprise contact form, an unknown id falls back to the plain
 * signup, an unknown interval to monthly.
 */
export function signupHref(planId: string, interval: string): string {
  const selection = safePlanSelection(planId, interval);
  if (!selection) return findPlan(planId)?.contactSales ? CONTACT_SALES_HREF : SIGNUP_HREF;
  return `${SIGNUP_HREF}${planSelectionQuery(selection)}`;
}

/** Both interval links of a plan (server side), so a client island can follow the toggle without the catalogue. */
export function planHrefs(planId: string): PlanHrefs {
  return { monthly: signupHref(planId, "monthly"), yearly: signupHref(planId, "yearly") };
}

/** `planHrefs()` for every plan of a list, keyed by plan id. */
export function planHrefMap(plans: ReadonlyArray<{ id: string }>): Record<string, PlanHrefs> {
  const map: Record<string, PlanHrefs> = {};
  for (const p of plans) map[p.id] = planHrefs(p.id);
  return map;
}

/* ---------------------------------------------------------------- volumes */

export interface RetentionOption {
  id: string;
  /** days wanted; `Infinity` for "longer than the longest plan retention" */
  days: number;
  /** months as communicated by the plan (Growth/Pro), null for day-based retention */
  months: number | null;
  longer: boolean;
}

/** Retention choices derived from the paid plans (90 days, 13 months, 25 months) plus "longer". */
export function retentionOptions(): RetentionOption[] {
  const seen = new Map<number, RetentionOption>();
  for (const plan of publicPlanOrder()) {
    const days = plan.limits.retentionDays;
    if (!plan.price || days == null || seen.has(days)) continue;
    seen.set(days, { id: `d${days}`, days, months: plan.limits.retentionMonths, longer: false });
  }
  const options = [...seen.values()].sort((a, b) => a.days - b.days);
  return [...options, { id: "longer", days: Number.POSITIVE_INFINITY, months: null, longer: true }];
}

/** The longest retention promise of a paid plan in months (label of the "longer than" option). */
export function longestPaidRetentionMonths(): number {
  return Math.max(0, ...publicPlanOrder().flatMap((p) => (p.price && p.limits.retentionMonths != null ? [p.limits.retentionMonths] : [])));
}

/** The largest event limit of a paid plan (label of the "more than" option, "beyond Pro" hint). */
export function largestPaidEventLimit(): number {
  return Math.max(0, ...publicPlanOrder().flatMap((p) => (p.price && p.limits.eventsPerMonth != null ? [p.limits.eventsPerMonth] : [])));
}

/* ------------------------------------------------------------ plan finder */

export type FinderDimension = "sites" | "events" | "team" | "retention";

export interface FinderCheck {
  key: FinderDimension;
  wanted: number;
  /** the recommended plan's cap; null = no fixed cap */
  limit: number | null;
  fits: boolean;
}

export interface FinderResult {
  planId: PlanId;
  plan: Plan;
  checks: FinderCheck[];
}

function sanitize(n: number): number {
  return Number.isNaN(n) || n < 0 ? 0 : n;
}

/** Deterministic plan finder: `recommendPlan` from the catalogue plus a per-dimension explanation. */
export function findPlanFor(input: PlanFinderInput): FinderResult {
  const clean: PlanFinderInput = { sites: sanitize(input.sites), eventsPerMonth: sanitize(input.eventsPerMonth), teamMembers: sanitize(input.teamMembers), retentionDays: sanitize(input.retentionDays) };
  const planId = recommendPlan(clean);
  const plan = planById(planId);
  const dims: Array<[FinderDimension, number, number | null]> = [
    ["sites", clean.sites, plan.limits.sites],
    ["events", clean.eventsPerMonth, plan.limits.eventsPerMonth],
    ["team", clean.teamMembers, plan.limits.teamMembers],
    ["retention", clean.retentionDays, plan.limits.retentionDays],
  ];
  return { planId, plan, checks: dims.map(([key, wanted, limit]) => ({ key, wanted, limit, fits: limit == null || wanted <= limit })) };
}

/** Index of the finder's default event answer (500 000 events per month). */
export const FINDER_DEFAULT_EVENTS_INDEX = Math.max(0, FINDER_EVENT_OPTIONS.indexOf(500_000));

/* -------------------------------------------------------------- calculator */

export interface CalculatorResult {
  plan: Plan;
  estimate: CostEstimate;
  pack: OveragePack | null;
  /** the cheapest higher plan that costs less for the same volume, if any (from `estimateCost`) */
  cheaper: { plan: Plan; total: number; savings: number } | null;
  /** the volume exceeds the largest paid plan limit (an Enterprise agreement is an option) */
  beyondTopPlan: boolean;
}

/** Cost calculator: `estimateCost` from the catalogue with the plans and packs resolved for display. */
export function calculate(planId: PaidPlanId, eventsPerMonth: number, interval: BillingInterval): CalculatorResult | null {
  const events = clampEvents(eventsPerMonth);
  const estimate = estimateCost({ planId, eventsPerMonth: events, interval });
  if (!estimate) return null;
  const upgrade = estimate.cheaperUpgrade;
  return {
    plan: planById(planId),
    estimate,
    pack: overagePackFor(planId),
    cheaper: upgrade ? { plan: planById(upgrade.planId), total: upgrade.total, savings: upgrade.savings } : null,
    beyondTopPlan: events > largestPaidEventLimit(),
  };
}

/** How many monthly prices the yearly price equals (10 for the catalogue plans); null when not whole. */
export function yearlyInstalments(monthlyCents: number, yearlyCents: number): number | null {
  if (monthlyCents <= 0) return null;
  const n = yearlyCents / monthlyCents;
  return Number.isInteger(n) ? n : null;
}
