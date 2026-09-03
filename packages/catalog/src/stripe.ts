import { listPriceCents, planById, stripePriceEnvName } from "./plans.ts";
import { CURRENCY, PAID_PLAN_IDS, isBillingInterval, isPaidPlanId, type BillingInterval, type PaidPlanId, type PlanId } from "./types.ts";

/**
 * Stripe price ids are deployment secrets read from `STRIPE_PRICE_<PLAN>_<INTERVAL>`. The third plan
 * was renamed from "Scale" to "Pro": the old names keep working as a fallback during the transition
 * and are reported as deprecated by the health endpoint.
 */
export const LEGACY_STRIPE_PRICE_ENV: Readonly<Record<string, string>> = {
  STRIPE_PRICE_PRO_MONTHLY: "STRIPE_PRICE_SCALE_MONTHLY",
  STRIPE_PRICE_PRO_YEARLY: "STRIPE_PRICE_SCALE_YEARLY",
};

const LEGACY_PLAN_NAMES: Readonly<Record<string, PaidPlanId>> = { SCALE: "pro" };

export interface StripePriceSlot {
  planId: PaidPlanId;
  interval: BillingInterval;
  /** current env name for this slot */
  envName: string;
  /** deprecated env name that is still read as a fallback, if any */
  legacyEnvName: string | null;
}

/** Every Stripe price slot the catalogue expects, in plan order. */
export function stripePriceSlots(): StripePriceSlot[] {
  const out: StripePriceSlot[] = [];
  for (const planId of PAID_PLAN_IDS) {
    for (const interval of ["monthly", "yearly"] as const) {
      const envName = stripePriceEnvName(planId, interval);
      out.push({ planId, interval, envName, legacyEnvName: LEGACY_STRIPE_PRICE_ENV[envName] ?? null });
    }
  }
  return out;
}

/** Parses `STRIPE_PRICE_<PLAN>_<INTERVAL>` (current or deprecated plan name) into its slot. */
export function planForStripePriceEnv(envName: string): { planId: PaidPlanId; interval: BillingInterval; deprecated: boolean } | null {
  const m = /^STRIPE_PRICE_([A-Z]+)_(MONTHLY|YEARLY)$/.exec(envName);
  if (!m) return null;
  const interval = m[2]!.toLowerCase();
  if (!isBillingInterval(interval)) return null;
  const raw = m[1]!;
  const legacy = LEGACY_PLAN_NAMES[raw];
  if (legacy) return { planId: legacy, interval, deprecated: true };
  const planId = raw.toLowerCase();
  return isPaidPlanId(planId) ? { planId, interval, deprecated: false } : null;
}

export function formatMinorAmount(cents: number, currency: string): string {
  return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
}

export interface StripeAmountCheck {
  planId: PlanId;
  interval: BillingInterval;
  /** Stripe `unit_amount` in minor units, `null` when the price has none (tiered/metered) */
  unitAmount: number | null;
  /** Stripe `currency` (lower-case ISO code) */
  currency: string;
}

/**
 * Verifies a Stripe price against the catalogue list price. Errors are stable strings for health
 * and logs: `no_unit_amount`, `currency_mismatch:<stripe>≠<catalogue>`, `amount_mismatch:<stripe>≠<catalogue>`,
 * `no_list_price` (custom-priced plan).
 */
export function verifyStripeAmount(input: StripeAmountCheck): { ok: true } | { ok: false; error: string } {
  const expected = listPriceCents(input.planId, input.interval);
  if (expected == null) return { ok: false, error: "no_list_price" };
  if (input.unitAmount == null) return { ok: false, error: "no_unit_amount" };
  const wantCurrency = planById(input.planId).price?.currency ?? CURRENCY;
  if (input.currency.toLowerCase() !== wantCurrency.toLowerCase()) return { ok: false, error: `currency_mismatch:${input.currency.toLowerCase()}≠${wantCurrency.toLowerCase()}` };
  if (input.unitAmount !== expected) return { ok: false, error: `amount_mismatch:${formatMinorAmount(input.unitAmount, input.currency)}≠${formatMinorAmount(expected, wantCurrency)}` };
  return { ok: true };
}
