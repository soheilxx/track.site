/**
 * Localized marketing copy, one module per area (en + de objects of the same shape). Kept in code
 * (typed, reviewed in PRs) instead of the message catalogs because each page is a self-contained
 * document. Copy locales and the strict/fallback rules live in types.ts and pick.ts.
 *
 * Module map:
 *   types.ts         locale model (COPY_LOCALES, Locale, LocalizedCopy) and every copy shape
 *   pick.ts          pick(locale, copy) — strict for active locales, English fallback for inactive ones
 *   shared.ts        SHARED_COPY (nav, footer, trust strip, CTAs), FORM_COPY (contact form)
 *   home.ts          HOME_COPY
 *   features.ts      FEATURES
 *   how-it-works.ts  HOW_IT_WORKS
 *   integrations.ts  INTEGRATIONS_COPY
 *   pricing.ts       PRICING_COPY (wording only; prices come from the tariff catalogue)
 *   auth.ts          AUTH_COPY (auth shell)
 *   secondary.ts     SECONDARY_COPY (docs, support, contact, demo, status, security intros)
 */
export * from "./types";
export { isCopyLocale, pick } from "./pick";
export { FORM_COPY, SHARED_COPY } from "./shared";
export { HOME_COPY } from "./home";
export { FEATURES } from "./features";
export { HOW_IT_WORKS } from "./how-it-works";
export { INTEGRATIONS_COPY } from "./integrations";
export { PRICING_COPY } from "./pricing";
export { AUTH_COPY } from "./auth";
export { SECONDARY_COPY } from "./secondary";
