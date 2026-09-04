import { estimateCost, findPlan, overagePackFor, planById, publicPlanOrder, recommendPlan, type BillingInterval, type CostEstimate, type OveragePack, type PaidPlanId, type Plan, type PlanFinderInput, type PlanId } from "@track-site/catalog";
import { intlLocale } from "@/lib/format";
import { planSelectionQuery, safePlanSelection } from "./plan-selection";

/**
 * Pure helpers of the pricing page (client-safe, no server-only imports). Every number and every
 * recommendation comes from the tariff catalogue: `recommendPlan` for the plan finder,
 * `estimateCost` for the calculator. This module only formats and validates around them.
 */

/** Fills `{placeholder}` templates from the copy module (functions cannot cross the client boundary). */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match));
}

/** BCP 47 tag for number formatting per app locale (`lib/format.ts`; EUR formats: `€19` / `19 €` / `€ 19`). */
export function numberLocale(locale: string): string {
  return intlLocale(locale);
}

/** Integer cents → currency string; whole amounts without decimals, fractional ones with two. */
export function formatMoney(cents: number, currency: string, locale: string, fractionDigits?: number): string {
  const amount = cents / 100;
  const digits = fractionDigits ?? (Number.isInteger(amount) ? 0 : 2);
  return new Intl.NumberFormat(numberLocale(locale), { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(amount);
}

/** Major units (as delivered by `PublicPrice.amount`) → currency string. */
export function formatAmount(amount: number, currency: string, locale: string, fractionDigits?: number): string {
  return formatMoney(Math.round(amount * 100), currency, locale, fractionDigits);
}

export function formatInteger(n: number, locale: string): string {
  return new Intl.NumberFormat(numberLocale(locale), { maximumFractionDigits: 0 }).format(n);
}

/** `500,000` → `500K` / `500.000`, `5,000,000` → `5M` / `5 Mio.` (slider end labels). */
export function formatCompact(n: number, locale: string): string {
  return new Intl.NumberFormat(numberLocale(locale), { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

/** `["70 %", "90 %", "100 %"]` → `70 %, 90 % and 100 %` / `70 %, 90 % und 100 %`. */
export function formatList(items: string[], locale: string): string {
  return new Intl.ListFormat(numberLocale(locale), { style: "long", type: "conjunction" }).format(items);
}

/* ------------------------------------------------------------------- links */

export const CONTACT_SALES_HREF = "/contact?topic=enterprise";
export const SIGNUP_HREF = "/signup";

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

/* ---------------------------------------------------------------- volumes */

/** Upper bound of the calculator input (events per month). */
export const MAX_EVENTS = 1_000_000_000;

/** Discrete stops of the event-volume slider; strictly increasing and covering every paid plan limit. */
export const EVENT_STOPS: readonly number[] = [50_000, 100_000, 250_000, 500_000, 750_000, 1_000_000, 1_500_000, 2_000_000, 3_000_000, 5_000_000, 7_500_000, 10_000_000, 15_000_000, 20_000_000, 30_000_000, 50_000_000];

/** Index of the largest stop that is ≤ `events` (0 when below the first stop). */
export function nearestStopIndex(events: number): number {
  let index = 0;
  for (let i = 0; i < EVENT_STOPS.length; i += 1) {
    const stop = EVENT_STOPS[i];
    if (stop !== undefined && stop <= events) index = i;
  }
  return index;
}

export function clampEvents(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(MAX_EVENTS, Math.floor(n));
}

/** Parses a typed volume ("1.500.000", "2,000,000", "750000"); null when there is no digit at all. */
export function parseEventsInput(raw: string): number | null {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  return clampEvents(Number.parseInt(digits, 10));
}

/** Answer options of the finder's event question; `Infinity` = "more than the largest listed volume". */
export const FINDER_EVENT_OPTIONS: readonly number[] = [100_000, 250_000, 500_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000, 20_000_000, Number.POSITIVE_INFINITY];

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
