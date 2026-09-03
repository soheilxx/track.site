import "server-only";
import { NON_BILLABLE_REASONS, NON_BILLABLE_REASON_LABELS, OVERAGE_POLICY_LABELS, findPlan, inheritsLabel, labelIn, limitBullets, overagePackFor, publicPlanOrder, type Label, type PlanId, type PlanLimits } from "@track-site/catalog";

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
  yearly: (PublicPrice & { monthlyEquivalent: number }) | null;
  /** opt-in event pack beyond the monthly limit; null when overage is contractual */
  overage: { events: number; price: PublicPrice } | null;
  limits: PlanLimits;
  /** lead-in above the highlights ("Everything in Starter, plus"); null for the first plan */
  inherits: string | null;
  /** exactly one localised list: hard limits first, then the purchase-deciding highlights */
  bullets: string[];
}

/**
 * English fallback for a label that is not translated into `locale` yet. This data layer is the only
 * place allowed to fall back; pages render what they get and never mix languages themselves.
 */
function text(label: Label, locale: string): string {
  return labelIn(label, locale) ?? label.en;
}

/** Public plans straight from the tariff catalogue (names, audience, list prices, limits, bullets per locale). */
export function publicPlans(locale: string): PublicPlan[] {
  return publicPlanOrder().map((p) => {
    const pack = overagePackFor(p.id);
    const lead = inheritsLabel(p);
    return {
      id: p.id,
      name: p.name,
      audience: text(p.audience, locale),
      recommended: p.recommended,
      contactSales: p.contactSales,
      monthly: p.price ? { amount: p.price.monthlyCents / 100, currency: p.price.currency } : null,
      yearly: p.price ? { amount: p.price.yearlyCents / 100, currency: p.price.currency, monthlyEquivalent: p.price.yearlyCents / 100 / 12 } : null,
      overage: pack ? { events: pack.events, price: { amount: pack.priceCents / 100, currency: pack.currency } } : null,
      limits: p.limits,
      inherits: lead ? text(lead, locale) : null,
      bullets: [...limitBullets(p).map((l) => text(l, locale)), ...p.highlights.map((h) => text(h, locale))],
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
