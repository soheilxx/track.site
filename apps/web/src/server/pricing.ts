import "server-only";
import {
  DEFAULT_OVERAGE_POLICY,
  FEATURES,
  FEATURE_KEYS,
  NON_BILLABLE_REASONS,
  NON_BILLABLE_REASON_LABELS,
  OVERAGE_POLICIES,
  OVERAGE_POLICY_LABELS,
  PAID_PLAN_IDS,
  TRIAL,
  USAGE_PAUSE_GRACE_PERCENT,
  USAGE_WARNING_THRESHOLDS,
  findPlan,
  inheritsLabel,
  labelIn,
  limitBullets,
  overagePackFor,
  planById,
  publicPlanOrder,
  type FeatureGroup,
  type FeatureKey,
  type Label,
  type OveragePolicy,
  type PaidPlanId,
  type PlanId,
  type PlanLimits,
} from "@track-site/catalog";

export interface PublicPrice {
  /** major units (EUR) */
  amount: number;
  currency: string;
}

export interface PublicPlan {
  id: PlanId;
  name: string;
  audience: string;
  recommended: boolean;
  contactSales: boolean;
  /** list prices from the tariff catalogue; null only for custom-priced plans */
  monthly: PublicPrice | null;
  /** charged yearly total plus the computed monthly equivalent; `instalments` = how many monthly prices the yearly price equals (null when not a whole number) */
  yearly: (PublicPrice & { monthlyEquivalent: number; instalments: number | null }) | null;
  /** opt-in event pack beyond the monthly limit; null when overage is contractual */
  overage: { events: number; price: PublicPrice } | null;
  limits: PlanLimits;
  /** lead-in above the highlights ("Everything in Starter, plus"); null for the first plan */
  inherits: string | null;
  /** exactly one localised list: hard limits first, then the purchase-deciding highlights */
  bullets: string[];
  /** the hard limits as localised sentences (first part of `bullets`) */
  limitBullets: string[];
  /** at most six purchase-deciding highlights (second part of `bullets`): the single feature list of a plan card */
  highlights: string[];
  /** cumulative feature gates (comparison matrix) */
  features: FeatureKey[];
}

/**
 * English fallback for a label that is not translated into `locale` yet. This data layer is the only
 * place allowed to fall back; pages render what they get and never mix languages themselves.
 */
function text(label: Label, locale: string): string {
  return labelIn(label, locale) ?? label.en;
}

function wholeInstalments(monthlyCents: number, yearlyCents: number): number | null {
  if (monthlyCents <= 0) return null;
  const n = yearlyCents / monthlyCents;
  return Number.isInteger(n) ? n : null;
}

/** Public plans straight from the tariff catalogue (names, audience, list prices, limits, bullets per locale). */
export function publicPlans(locale: string): PublicPlan[] {
  return publicPlanOrder().map((p) => {
    const pack = overagePackFor(p.id);
    const lead = inheritsLabel(p);
    const limits = limitBullets(p).map((l) => text(l, locale));
    const highlights = p.highlights.map((h) => text(h, locale));
    return {
      id: p.id,
      name: p.name,
      audience: text(p.audience, locale),
      recommended: p.recommended,
      contactSales: p.contactSales,
      monthly: p.price ? { amount: p.price.monthlyCents / 100, currency: p.price.currency } : null,
      yearly: p.price ? { amount: p.price.yearlyCents / 100, currency: p.price.currency, monthlyEquivalent: p.price.yearlyCents / 100 / 12, instalments: wholeInstalments(p.price.monthlyCents, p.price.yearlyCents) } : null,
      overage: pack ? { events: pack.events, price: { amount: pack.priceCents / 100, currency: pack.currency } } : null,
      limits: p.limits,
      inherits: lead ? text(lead, locale) : null,
      bullets: [...limits, ...highlights],
      limitBullets: limits,
      highlights,
      features: [...p.features],
    };
  });
}

/** Localised bullets for one plan id (dashboard plan cards); null when the id is not a catalogue plan. */
export function planBullets(planId: string, locale: string): string[] | null {
  const plan = findPlan(planId);
  if (!plan) return null;
  return [...limitBullets(plan).map((l) => text(l, locale)), ...plan.highlights.map((h) => text(h, locale))];
}

/** The "what counts as an event" rules and the overage choices, localised for the pricing page. */
export function usageRulesCopy(locale: string): { notCounted: string[]; overagePolicies: string[] } {
  return {
    notCounted: NON_BILLABLE_REASONS.map((r) => text(NON_BILLABLE_REASON_LABELS[r], locale)),
    overagePolicies: (["allow", "cost_limit", "pause"] as const).map((p) => text(OVERAGE_POLICY_LABELS[p], locale)),
  };
}

/* ------------------------------------------------------------- comparison */

export interface FeatureMatrixRow {
  key: FeatureKey;
  group: FeatureGroup;
  label: string;
  /** included per plan (cumulative gates from the catalogue) */
  plans: Record<PlanId, boolean>;
}

export interface FeatureMatrix {
  /** groups in display order (only groups that have at least one feature) */
  groups: FeatureGroup[];
  rows: FeatureMatrixRow[];
}

/** Display order of the feature groups on the pricing page; groups not listed here are appended. */
const GROUP_ORDER: readonly FeatureGroup[] = ["tracking", "commerce", "ai", "quality", "governance", "data", "support", "enterprise"];

/** Every catalogue feature with its localised label and the plans that include it. */
export function featureMatrix(locale: string): FeatureMatrix {
  const plans = publicPlanOrder();
  const rows: FeatureMatrixRow[] = FEATURE_KEYS.map((key) => {
    const def = FEATURES[key];
    const included = {} as Record<PlanId, boolean>;
    for (const p of plans) included[p.id] = p.features.includes(key);
    return { key, group: def.group, label: text(def.label, locale), plans: included };
  });
  const present = new Set(rows.map((r) => r.group));
  const groups: FeatureGroup[] = [...GROUP_ORDER.filter((g) => present.has(g)), ...[...present].filter((g) => !GROUP_ORDER.includes(g))];
  return { groups, rows };
}

/** Localised labels of the features every paid plan includes (the "included in every plan" strip). */
export function sharedPaidFeatures(locale: string): string[] {
  const paid = PAID_PLAN_IDS.map((id) => planById(id));
  return FEATURE_KEYS.filter((key) => paid.every((p) => p.features.includes(key))).map((key) => text(FEATURES[key].label, locale));
}

/* ------------------------------------------------------ overage and trial */

export interface PublicOveragePack {
  planId: PaidPlanId;
  planName: string;
  events: number;
  price: PublicPrice;
}

/** Opt-in event packs of the paid plans in display order (Enterprise overage is contractual and has no pack). */
export function publicOveragePacks(): PublicOveragePack[] {
  return PAID_PLAN_IDS.flatMap((id) => {
    const pack = overagePackFor(id);
    return pack ? [{ planId: id, planName: planById(id).name, events: pack.events, price: { amount: pack.priceCents / 100, currency: pack.currency } }] : [];
  });
}

export interface PublicTrial {
  planId: PlanId;
  planName: string;
  days: number;
  maxEvents: number;
  cardRequired: boolean;
  autoConvert: boolean;
  afterExpiry: string;
}

/** The trial as configured in the catalogue (supplement §5 "Testphase"). */
export function publicTrial(): PublicTrial {
  return { planId: TRIAL.planId, planName: planById(TRIAL.planId).name, days: TRIAL.days, maxEvents: TRIAL.maxEvents, cardRequired: TRIAL.cardRequired, autoConvert: TRIAL.autoConvert, afterExpiry: TRIAL.afterExpiry };
}

export interface PublicUsagePolicy {
  /** percent of the monthly limit at which the customer is warned */
  thresholds: number[];
  /** percent above the limit the `pause` policy still processes before pausing */
  gracePercent: number;
  defaultPolicy: OveragePolicy;
  policies: Array<{ id: OveragePolicy; label: string }>;
  /** reasons an event is never billed, localised */
  notCounted: string[];
}

/** Overage policies, warning thresholds, grace window and non-billable reasons, localised. */
export function publicUsagePolicy(locale: string): PublicUsagePolicy {
  return {
    thresholds: [...USAGE_WARNING_THRESHOLDS],
    gracePercent: USAGE_PAUSE_GRACE_PERCENT,
    defaultPolicy: DEFAULT_OVERAGE_POLICY,
    policies: OVERAGE_POLICIES.map((id) => ({ id, label: text(OVERAGE_POLICY_LABELS[id], locale) })),
    notCounted: NON_BILLABLE_REASONS.map((r) => text(NON_BILLABLE_REASON_LABELS[r], locale)),
  };
}
