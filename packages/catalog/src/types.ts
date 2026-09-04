/**
 * Shared primitives of the tariff catalogue. The catalogue is the single typed source of truth for
 * plans, list prices, entitlements, overage packs, the trial and the billable-event definition
 * (owner supplement §5 "Technische Pricing-Wahrheit"). Everything else (marketing page, checkout,
 * entitlements, usage ledger, portal, webhooks) derives from it and never restates a number.
 */

export const PLAN_IDS = ["starter", "growth", "pro", "enterprise"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

/** Plans with a published list price and a Stripe price slot per interval. */
export const PAID_PLAN_IDS = ["starter", "growth", "pro"] as const;
export type PaidPlanId = (typeof PAID_PLAN_IDS)[number];

export const BILLING_INTERVALS = ["monthly", "yearly"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

export const CURRENCY = "EUR" as const;
export type Currency = typeof CURRENCY;

/** Locales the product will ship (mirrors ALL_LOCALES of apps/web; the catalogue has no dependency on the app). */
export const CATALOG_LOCALES = ["en", "de", "fr", "es", "it", "nl"] as const;
export type CatalogLocale = (typeof CATALOG_LOCALES)[number];
export type OptionalCatalogLocale = Exclude<CatalogLocale, "en">;

/**
 * Locales every label must carry today (mirrors ACTIVE_LOCALES of apps/web). `catalog.test.ts`
 * fails when any label lacks one of them, so the enable stage of a locale adds it here and the
 * missing labels surface as test failures instead of English fallbacks on a localized page.
 */
export const REQUIRED_LABEL_LOCALES = ["en", "de", "fr", "es", "it", "nl"] as const satisfies readonly CatalogLocale[];

/**
 * A localised text. English is required (it is the source every translation is made from); every
 * other locale is added when translated. The catalogue itself never falls back: `labelIn` returns
 * `null` for a missing translation. The only place that falls back to English is the pricing/billing
 * data layer of apps/web (`apps/web/src/server/pricing.ts`, `text()`), and only for locales that are
 * not active; the parity report (`apps/web/scripts/i18n-parity.mjs`) lists every missing label per
 * locale.
 */
export type Label = { en: string } & Partial<Record<OptionalCatalogLocale, string>>;

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && (PLAN_IDS as readonly string[]).includes(value);
}

export function isPaidPlanId(value: unknown): value is PaidPlanId {
  return typeof value === "string" && (PAID_PLAN_IDS as readonly string[]).includes(value);
}

export function isBillingInterval(value: unknown): value is BillingInterval {
  return typeof value === "string" && (BILLING_INTERVALS as readonly string[]).includes(value);
}

export function isCatalogLocale(value: unknown): value is CatalogLocale {
  return typeof value === "string" && (CATALOG_LOCALES as readonly string[]).includes(value);
}

/**
 * Strict lookup: the label in exactly this locale, or `null` when it is not translated yet.
 * The catalogue never falls back on its own; a caller that wants English as a fallback decides
 * that explicitly (and only in a data layer that is allowed to mix languages).
 */
export function labelIn(label: Label, locale: string): string | null {
  if (!isCatalogLocale(locale)) return null;
  const text = label[locale];
  return typeof text === "string" && text.length > 0 ? text : null;
}
