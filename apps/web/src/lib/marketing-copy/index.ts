/**
 * Localized marketing copy, one folder per area. Kept in code (typed, reviewed in PRs) instead of
 * the message catalogs because each page is a self-contained document. Every shape lives in
 * types.ts, the strict/fallback rules in pick.ts, the parity helpers in parity.ts; this barrel
 * re-exports every constant and type. Client components import the area module they need (and
 * types from ./types) so the client bundle carries only that area's texts.
 *
 * Area layout (docs/14-localization.md has the full file map for translators):
 *   <area>/index.ts       composes `NAME: LocalizedCopy<Shape> = { en, de, fr: null, es: null, it: null, nl: null }`
 *   <area>/en.ts          `NAME_EN: Shape` — the English source every other language is translated from
 *   <area>/de.ts          `NAME_DE: Shape`
 *   <area>/<locale>.ts    `NAME_<LOCALE>: Shape` — created by the translator, then wired in index.ts
 *   <area>/samples.ts     locale-neutral fixtures (code samples) shared by every language file, where needed
 *
 * Module map:
 *   types.ts              locale model (COPY_LOCALES, Locale, LocalizedCopy) and every copy shape
 *   pick.ts               pick(locale, copy) — strict for active locales, English fallback for inactive ones
 *   parity.ts             shapeOf / copyParity / isLocalizedCopy (tests + scripts/i18n-parity.mjs)
 *   shared/               HEADER_COPY, FOOTER_COPY, CONSENT_COPY (site shell), FORM_COPY (contact form)
 *   home/                 HOME_COPY
 *   features/             FEATURES, FEATURES_PAGE_COPY, FEATURE_DETAIL_COPY, FEATURE_UI_COPY
 *   how-it-works/         HOW_IT_WORKS
 *   integrations/         INTEGRATIONS_COPY
 *   integration-catalog/  INTEGRATION_CATALOG_TEXT (summary, prerequisite note and public-id labels per catalogue entry; en/de projected from lib/integrations-catalog)
 *   pricing/              PRICING_COPY (wording only; prices come from the tariff catalogue)
 *   auth/                 AUTH_COPY (auth shell)
 *   secondary/            SECONDARY_COPY (docs, support, contact, demo, status, security, legal frame)
 *   knowledge/            KNOWLEDGE_HUB_COPY (Tracking Knowledge hub), KNOWLEDGE_COPY (index page, feed, social cards)
 *   knowledge-article/    KNOWLEDGE_ARTICLE_COPY (Tracking Knowledge article template)
 *   knowledge-labels/     KNOWLEDGE_LABELS (topic worlds, content types, levels, recency, authors)
 */
export * from "./types";
export { availableLocales, isCopyLocale, pick } from "./pick";
export { copyParity, isLocalizedCopy, shapeOf, type LocaleParity } from "./parity";
export { CONSENT_COPY, FOOTER_COPY, FORM_COPY, HEADER_COPY } from "./shared";
export { HOME_COPY } from "./home";
export { FEATURES, FEATURES_PAGE_COPY, FEATURE_DETAIL_COPY, FEATURE_UI_COPY } from "./features";
export { HOW_IT_WORKS } from "./how-it-works";
export { INTEGRATIONS_COPY } from "./integrations";
export { INTEGRATION_CATALOG_TEXT } from "./integration-catalog";
export { PRICING_COPY } from "./pricing";
export { AUTH_COPY } from "./auth";
export { SECONDARY_COPY, SUBPROCESSORS_UPDATED } from "./secondary";
export { KNOWLEDGE_COPY, KNOWLEDGE_HUB_COPY } from "./knowledge";
export { KNOWLEDGE_ARTICLE_COPY } from "./knowledge-article";
export { KNOWLEDGE_LABELS } from "./knowledge-labels";
