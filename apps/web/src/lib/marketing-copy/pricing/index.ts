import type { LocalizedCopy, PricingCopy } from "../types";
import { PRICING_COPY_EN } from "./en";
import { PRICING_COPY_DE } from "./de";
import { PRICING_COPY_FR } from "./fr";
import { PRICING_COPY_ES } from "./es";
import { PRICING_COPY_IT } from "./it";
import { PRICING_COPY_NL } from "./nl";

/**
 * Pricing page copy (supplement §5 layout: toggle, three main cards, Enterprise panel, plan finder,
 * cost calculator, comparison matrix, event definition, overage, trial, FAQ, tax note).
 *
 * Prices, limits, entitlements, packs and the trial never live here — they come from the typed
 * tariff catalogue (`@track-site/catalog`) through `@/server/pricing`; this module only holds the
 * wording around them. Strings that client components render use `{placeholder}` templates filled
 * with `fill()` from components/marketing/pricing/pricing-helpers.ts (functions cannot cross the
 * server/client boundary). The shape is `PricingCopy` in types.ts.
 */

export const PRICING_COPY: LocalizedCopy<PricingCopy> = { en: PRICING_COPY_EN, de: PRICING_COPY_DE, fr: PRICING_COPY_FR, es: PRICING_COPY_ES, it: PRICING_COPY_IT, nl: PRICING_COPY_NL };
