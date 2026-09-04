/**
 * Localized marketing copy, one module per area (en + de objects of the same shape). Kept in code
 * (typed, reviewed in PRs) instead of the message catalogs because each page is a self-contained
 * document. Every shape lives in types.ts, the strict/fallback rules in pick.ts; this barrel
 * re-exports every constant and type. Client components import the area module they need (and
 * types from ./types) so the client bundle carries only that area's texts.
 *
 * Module map:
 *   types.ts              locale model (COPY_LOCALES, Locale, LocalizedCopy) and every copy shape
 *   pick.ts               pick(locale, copy) — strict for active locales, English fallback for inactive ones
 *   shared.ts             HEADER_COPY, FOOTER_COPY, CONSENT_COPY (site shell), FORM_COPY (contact form)
 *   home.ts               HOME_COPY
 *   features.ts           FEATURES, FEATURES_PAGE_COPY, FEATURE_DETAIL_COPY, FEATURE_UI_COPY
 *   how-it-works.ts       HOW_IT_WORKS
 *   integrations.ts       INTEGRATIONS_COPY
 *   pricing.ts            PRICING_COPY (wording only; prices come from the tariff catalogue)
 *   auth.ts               AUTH_COPY (auth shell)
 *   secondary.ts          SECONDARY_COPY (docs, support, contact, demo, status, security, legal frame)
 *   knowledge.ts          KNOWLEDGE_HUB_COPY (Tracking Knowledge hub)
 *   knowledge-article.ts  KNOWLEDGE_ARTICLE_COPY (Tracking Knowledge article template)
 */
export * from "./types";
export { isCopyLocale, pick } from "./pick";
export { CONSENT_COPY, FOOTER_COPY, FORM_COPY, HEADER_COPY } from "./shared";
export { HOME_COPY } from "./home";
export { FEATURES, FEATURES_PAGE_COPY, FEATURE_DETAIL_COPY, FEATURE_UI_COPY } from "./features";
export { HOW_IT_WORKS } from "./how-it-works";
export { INTEGRATIONS_COPY } from "./integrations";
export { PRICING_COPY } from "./pricing";
export { AUTH_COPY } from "./auth";
export { SECONDARY_COPY, SUBPROCESSORS_UPDATED } from "./secondary";
export { KNOWLEDGE_HUB_COPY } from "./knowledge";
export { KNOWLEDGE_ARTICLE_COPY } from "./knowledge-article";
