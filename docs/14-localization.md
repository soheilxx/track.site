# Localization — EN, DE, FR, ES, IT, NL

Binding rules and the exact file map for the six-locale programme (owner supplement §7). The structure described here is in place, translated and reviewed for every locale, and the enable stage has switched all six on (phase 4). Programme context: `docs/11-track-redesign-program.md`; knowledge metadata rules: `docs/14-knowledge-content-rules.md`; article authoring: `docs/13-knowledge-authoring.md`.

Status (2026-09-04): all six locales `en`, `de`, `fr`, `es`, `it`, `nl` are ACTIVE — served publicly under their prefix, listed in the language switcher, hreflang, sitemap index, feeds and 404 pages. `node apps/web/scripts/i18n-parity.mjs --strict` exits 0 with zero gaps in every section (`docs/i18n-parity-report.md`, `docs/i18n-parity-report.json`, both committed). `COPY_LOCALES` lists all six, so a missing copy entry is a compile error and `pick()` never falls back to English on a public page. Withdrawing a locale means removing it from `ACTIVE_LOCALES` only (routing, switcher, hreflang, sitemaps and the validators follow); its files stay required by the type model. This document keeps the per-locale file map and the rules as the reference for every later change to the texts.

Verification commands (run from the repo root):

```
pnpm --filter @track-site/web typecheck
pnpm --filter @track-site/web test
pnpm --filter @track-site/catalog test
pnpm --filter @track-site/web knowledge:validate
pnpm --filter @track-site/web i18n:parity            # exit 1 when an ACTIVE locale has a gap
node apps/web/scripts/i18n-parity.mjs --strict       # exit 1 when any of the six locales has a gap
```

## 1. Where text lives

| Kind | Location | Format | Read by |
| --- | --- | --- | --- |
| UI messages (dashboard, auth forms, chat, destinations, common shell strings) | `apps/web/messages/<locale>/{common,auth,app,chat,destinations}.json` | next-intl JSON, ICU messages with `{placeholders}` and `{n, plural, …}` | `apps/web/src/i18n/request.ts` (`NAMESPACES`), `useTranslations` / `getTranslations` |
| Marketing copy (pages are self-contained documents) | `apps/web/src/lib/marketing-copy/<area>/<locale>.ts` | typed TypeScript objects, one shape per area (`types.ts`) | pages via `pick(locale, <AREA>_COPY)` |
| Knowledge taxonomy + author labels | `apps/web/src/lib/marketing-copy/knowledge-labels/<locale>.ts` | typed (`KnowledgeLabels`) | `apps/web/src/lib/knowledge.ts` projects them into `TOPICS`, `*_LABELS`, `AUTHORS` |
| Integration catalogue text (summary, vendor prerequisite note, public-id labels of the 25 integrations) | `apps/web/src/lib/marketing-copy/integration-catalog/<locale>.ts` (`en`/`de` are projected from `apps/web/src/lib/integrations-catalog.ts`, which keeps its `LocalizedText { en, de }` next to the technical facts) | typed (`IntegrationCatalogText`, keyed by catalogue `slug` and public-id `key`) | integration pages via `integrationText()` / `publicIdLabel()` in `components/marketing/integrations/text.ts` |
| Legal documents (security, privacy, data processing, terms) | `apps/web/src/lib/legal-copy/<locale>.ts` | typed (`LegalCopy`) | legal pages via `pick(locale, LEGAL)` |
| Transactional e-mails | `apps/web/src/server/mail/templates/<locale>.ts` | typed (`MailCopy`), plain text with `{placeholders}` | `apps/web/src/server/auth.ts` via `getMailCopy(userLocale)` + `renderMail` |
| Tracking Knowledge articles (30 topics) | `apps/web/content/knowledge/<locale>/<translationGroupId>.mdx` | MDX with YAML front matter | `apps/web/src/lib/knowledge.ts` |
| Curated learning paths | `apps/web/content/knowledge/paths.<locale>.json` | JSON array | `lib/knowledge.ts` (`readLearningPaths`) |
| Tariff catalogue labels (plan audience, highlights, limits, feature names, overage policies, non-billable reasons) | `packages/catalog/src/{plans,features,overage}.ts` | `Label = { en: string } & Partial<Record<locale, string>>` | `apps/web/src/server/pricing.ts` (`text()`), `labelIn()` |
| Locale-aware formatting | `apps/web/src/lib/format.ts` | `formatNumber`, `formatCurrency`, `formatCents`, `formatDate` on `Intl` with one BCP 47 tag per locale | pricing, billing, knowledge dates |

### The copy model (typed copy, legal, mail, knowledge labels)

```ts
// apps/web/src/lib/marketing-copy/types.ts
export const COPY_LOCALES = ["en", "de", "fr", "es", "it", "nl"] as const;   // entries the type system requires: all six since the enable stage
export type LocalizedCopy<T> = { [L in AppLocale]: L extends CopyLocale ? T : T | null };

// apps/web/src/lib/marketing-copy/home/index.ts
export const HOME_COPY: LocalizedCopy<HomeCopy> = { en: HOME_COPY_EN, de: HOME_COPY_DE, fr: HOME_COPY_FR, es: HOME_COPY_ES, it: HOME_COPY_IT, nl: HOME_COPY_NL };

// apps/web/src/lib/marketing-copy/pick.ts
pick(locale, copy)   // active locale + null  → throws (never English on a localized page)
                     // unknown value          → English fallback (defensive paths only, e.g. an unvalidated param)
```

- Every copy constant carries all six keys with a translated object each; a `null` entry is a compile error (`COPY_LOCALES`) and would throw in `pick()` at build time (every public page is prerendered in every locale).
- `pick()` is the only reader that decides between strict and fallback behaviour. `labelFor()` in `lib/knowledge.ts` and `getMailCopy()` delegate to it.
- `apps/web/src/lib/marketing-copy/parity.ts` (`copyParity`, `shapeOf`) defines "same shape": identical key paths recursively, identical array lengths, identical value kinds. The unit tests (`pick.test.ts`, `legal-copy.test.ts`, `templates.test.ts`) and the parity script apply this one rule.
- `apps/web/src/lib/marketing-copy/<area>/samples.ts` holds locale-neutral fixtures (code snippets). Translators never edit `samples.ts`, `index.ts` or `types.ts` — with one exception: replacing `<locale>: null` in `index.ts` (section 3).

## 2. File map per locale

Everything a translator creates for one locale `<xx>` ∈ {`fr`, `es`, `it`, `nl`} (`<XX>` = upper-case locale in export names). English is always the source; German is a reference for register and terminology decisions already taken.

### 2.1 Message catalogs

| Create | Translate from | Keys |
| --- | --- | --- |
| `apps/web/messages/<xx>/common.json` | `apps/web/messages/en/common.json` | 77 |
| `apps/web/messages/<xx>/auth.json` | `apps/web/messages/en/auth.json` | 71 |
| `apps/web/messages/<xx>/app.json` | `apps/web/messages/en/app.json` | 331 |
| `apps/web/messages/<xx>/chat.json` | `apps/web/messages/en/chat.json` | 68 |
| `apps/web/messages/<xx>/destinations.json` | `apps/web/messages/en/destinations.json` | 121 |

Rules: identical key tree (no missing, no extra keys); ICU syntax stays valid (`{name}`, `{count, plural, one {…} other {…}}`, `{value, number}`); placeholder names never change; HTML-like tags used by rich messages (`<b>…</b>`, `<link>…</link>`) stay. No wiring is needed — `request.ts` loads catalogs by locale.

### 2.2 Marketing copy (`apps/web/src/lib/marketing-copy/`)

| Create | Exports (type) | Translate from | Then wire in |
| --- | --- | --- | --- |
| `shared/<xx>.ts` | `HEADER_COPY_<XX>: HeaderCopy`, `FOOTER_COPY_<XX>: FooterCopy`, `CONSENT_COPY_<XX>: ConsentCopy`, `FORM_COPY_<XX>: ContactFormCopy` | `shared/en.ts` | `shared/index.ts` |
| `home/<xx>.ts` | `HOME_COPY_<XX>: HomeCopy` (plus a file-local `DEMO_<XX>: DemoCopy`, as in `home/en.ts`) | `home/en.ts` | `home/index.ts` |
| `features/<xx>.ts` | `FEATURES_<XX>: FeatureCopy[]`, `FEATURES_PAGE_COPY_<XX>: FeaturesPageCopy`, `FEATURE_DETAIL_COPY_<XX>: FeatureDetailLabels`, `FEATURE_UI_COPY_<XX>: FeatureUiCopy` (imports `PAYLOAD_EXAMPLE` from `./samples`) | `features/en.ts` | `features/index.ts` |
| `how-it-works/<xx>.ts` | `HOW_IT_WORKS_<XX>: HowItWorksCopy` (imports `SNIPPET` from `./samples`) | `how-it-works/en.ts` | `how-it-works/index.ts` |
| `integrations/<xx>.ts` | `INTEGRATIONS_COPY_<XX>: IntegrationsCopy` | `integrations/en.ts` | `integrations/index.ts` |
| `pricing/<xx>.ts` | `PRICING_COPY_<XX>: PricingCopy` | `pricing/en.ts` | `pricing/index.ts` |
| `auth/<xx>.ts` | `AUTH_COPY_<XX>: AuthCopy` | `auth/en.ts` | `auth/index.ts` |
| `secondary/<xx>.ts` | `SECONDARY_COPY_<XX>: SecondaryCopy` (imports `SNIPPET`, `CONSENT_CALL`, `SERVER_CALL`, `browserEvents` from `./samples`; the argument of `browserEvents("…")` is a code comment and is translated) | `secondary/en.ts` | `secondary/index.ts` |
| `knowledge/<xx>.ts` | `KNOWLEDGE_HUB_COPY_<XX>: KnowledgeHubCopy`, `KNOWLEDGE_COPY_<XX>: KnowledgeCopy` | `knowledge/en.ts` | `knowledge/index.ts` |
| `knowledge-article/<xx>.ts` | `KNOWLEDGE_ARTICLE_COPY_<XX>: KnowledgeArticleCopy` | `knowledge-article/en.ts` | `knowledge-article/index.ts` |
| `knowledge-labels/<xx>.ts` | `KNOWLEDGE_LABELS_<XX>: KnowledgeLabels` | `knowledge-labels/en.ts` | `knowledge-labels/index.ts` |
| `integration-catalog/<xx>.ts` | `INTEGRATION_CATALOG_TEXT_<XX>: IntegrationCatalogText` — one object per catalogue `slug` with `summary`, `accessNote` (`null` exactly where English is `null`) and `publicIds` keyed by the config key | the catalogue itself (`apps/web/src/lib/integrations-catalog.ts`, `summary.en`, `accessNote.en`, `publicIds[].label.en`; `en.ts`/`de.ts` project it via `from-catalog.ts`) | `integration-catalog/index.ts` |

Rules for every copy file:

- Copy `en.ts`, rename the exports, translate values only. Keys, nesting, array lengths and the order of array items stay (the tests compare the shape; arrays such as FAQ lists, steps, nav columns must keep their length and order).
- `href`, `key`, `id`, `slug`, `tone`, `language`, `code` values and everything typed as an id/enum in `types.ts` stay identical to English. Navigation `href`s are locale-neutral (`/pricing`, `/docs#install`); never add a locale prefix.
- `{placeholder}` templates (`{n}`, `{total}`, `{q}`, `{version}`, `{name}`, …) stay, including their braces and names; their position in the sentence may change. `one`/`other` plural pairs stay pairs.
- Strings that are code, snippets, event names, parameter names or product/platform names are not translated (section 4).
- Numbers inside copy (event limits, prices, retention) are never typed by hand — they come from the tariff catalogue and `lib/format.ts`. If an English sentence contains a number as a verifiable product fact ("six organization roles", "1200 × 630"), keep the fact, adapt the notation (section 6).

### 2.3 Legal copy

| Create | Export | Translate from | Wire in |
| --- | --- | --- | --- |
| `apps/web/src/lib/legal-copy/<xx>.ts` | `LEGAL_<XX>: LegalCopy` (documents `security`, `privacy`, `data-processing`, `terms`, each `{ title, intro, updated, sections[] }`) | `apps/web/src/lib/legal-copy/en.ts` | `apps/web/src/lib/legal-copy/index.ts` |

`updated` is an ISO date and stays the date of the English revision the translation is based on. `SUBPROCESSORS` (index.ts) are facts, not copy. Operator identity comes from the environment (`operatorFromEnv`) and is never written into a locale file. Legal texts are translations of the operator's English documents, not new legal drafting: do not add, drop or "localize" obligations, article references or legal bases; refer to the local GDPR name and authority as in section 6.

### 2.4 Transactional e-mails

| Create | Export | Translate from | Wire in |
| --- | --- | --- | --- |
| `apps/web/src/server/mail/templates/<xx>.ts` | `MAIL_COPY_<XX>: MailCopy` (`resetPassword`, `verifyEmail`, `invitation`, each `{ subject, text }`) | `apps/web/src/server/mail/templates/en.ts` | `apps/web/src/server/mail/templates/index.ts` |

Plain text only; `{url}`, `{inviter}`, `{organization}` stay; every template mentions "Track". The recipient's stored `locale` selects the template; the invitation uses the inviter's locale (the invitee has no account yet).

### 2.5 Tracking Knowledge

| Create | Translate from |
| --- | --- |
| `apps/web/content/knowledge/<xx>/<translationGroupId>.mdx` — one file per topic, file name = `translationGroupId` = English file name | `apps/web/content/knowledge/en/<translationGroupId>.mdx` |
| `apps/web/content/knowledge/paths.<xx>.json` — same path ids and the same `groupIds` in the same order; `title` and `description` translated | `apps/web/content/knowledge/paths.en.json` |

The 30 topics (`translationGroupId`): `ad-blockers-itp-measurement`, `affiliate-postbacks-s2s`, `ai-assistant-tag-management-safety`, `click-ids-attribution-windows`, `consent-mode-v2-guide`, `data-retention-policy-tracking`, `dedup-event-id-order-id`, `dsar-deletion-tracking-data`, `event-taxonomy-standard-events`, `first-party-tracking-domains`, `ga4-measurement-protocol-eu`, `google-ads-enhanced-conversions`, `kill-switch-incident-playbook`, `lead-gen-tracking-b2b`, `linkedin-conversions-api-b2b`, `meta-conversions-api-deduplication`, `microsoft-conversions-api-uet`, `migrating-from-gtm`, `offline-conversions-crm`, `pii-in-tracking-data`, `reddit-pinterest-snapchat-capi`, `server-side-tracking-explained`, `shopify-server-side-purchases`, `shopware-6-tracking`, `signed-configuration-supply-chain`, `subscription-saas-events`, `tcf-2-2-gpp-gpc`, `tiktok-events-api-setup`, `tracking-health-score`, `woocommerce-server-side-tracking`. MDX rules: section 7.

### 2.6 Tariff catalogue labels (`packages/catalog`)

Not a new file: add the locale key to every `Label` in

- `packages/catalog/src/features.ts` — `FEATURES[*].label` (the `f(key, group, en, de)` helper gains one parameter per locale),
- `packages/catalog/src/plans.ts` — `audience`, `highlights[]` of every plan, `inheritsLabel()`, `limitBullets()` (numbers formatted with the locale's `Intl.NumberFormat`; extend the `nf()` locale map),
- `packages/catalog/src/overage.ts` — `OVERAGE_POLICY_LABELS`, `NON_BILLABLE_REASON_LABELS`.

95 labels in total (`docs/i18n-parity-report.md` lists every missing id per locale). `en` is the only required key of `Label`; the catalogue never falls back on its own (`labelIn` returns `null`). The pricing/billing data layer (`apps/web/src/server/pricing.ts`, `text()`) is the only place that falls back to English, and the parity report shows every label it would fall back on. `REQUIRED_LABEL_LOCALES` in `packages/catalog/src/types.ts` (all six since the enable stage) is enforced by `catalog.test.ts`; the enable stage adds a new locale there, so a missing label fails the test instead of rendering English.

### 2.7 Locale conditionals — resolved and remaining

Resolved at the enable stage (2026-09-04); nothing on a public page reads `locale === "de"` any more:

- Integration catalogue text moved to the copy model: `marketing-copy/integration-catalog/` (section 2.2) with `integrationText()` in `components/marketing/integrations/text.ts`; `catalogLang()` in `lib/integrations-catalog.ts` is no longer used by pages.
- `lib/format.ts` (`intlLocale`, `formatNumber`, `formatCents`, `formatDate`) is used by `components/marketing/pricing/pricing-helpers.ts` (`numberLocale`), `components/marketing/home/pricing-teaser.tsx`, `app/app/billing/page.tsx` and `components/marketing/knowledge/hub/server.ts` (`formatHubDate`).
- `app/[locale]/(marketing)/tracking-knowledge/opengraph-image.tsx` takes the article count from `KNOWLEDGE_HUB_COPY.hero.articles`; `app/[locale]/opengraph-image.tsx` carries a tagline and footer per programme locale.

- The contact/demo/support form action (`server/actions/contact.ts`) accepts every programme locale (`z.enum(ALL_LOCALES)`): the hidden `locale` field of a French page posts `locale=fr`, which the former `en`/`de` enum rejected as "invalid".
- `REQUIRED_LABEL_LOCALES` in `packages/catalog/src/types.ts` lists all six locales, so `catalog.test.ts` fails on any future label gap instead of `pricing.ts` falling back to English.

Still hard-coded to `en`/`de` (dashboard scope, phase 5 — not on a public marketing page): the zod enum in `server/actions/settings.ts` (`updateLocaleAction`, `settingsSchema`) and the language `<select>` in `components/app/settings.tsx` (should read `ACTIVE_LOCALES` + `LOCALE_NAMES`); the dashboard therefore still offers English and German as UI language although the `app` catalogs exist in six locales.

## 3. Wiring a translated area

1. Create `<area>/<xx>.ts` from `<area>/en.ts` (section 2.2).
2. In `<area>/index.ts` import it and replace the `null`:

```ts
import { HOME_COPY_FR } from "./fr";
export const HOME_COPY: LocalizedCopy<HomeCopy> = { en: HOME_COPY_EN, de: HOME_COPY_DE, fr: HOME_COPY_FR, es: null, it: null, nl: null };
```

3. `pnpm --filter @track-site/web typecheck` (the shape is enforced by the type annotation) and `pnpm --filter @track-site/web test` (`pick.test.ts` compares every non-null locale with English, key by key).
4. `pnpm --filter @track-site/web i18n:parity` — the locale's row must show the area as complete.

The same steps apply to `legal-copy/index.ts` (`LEGAL`) and `server/mail/templates/index.ts` (`MAIL_COPY`). Message catalogs, articles, learning paths and catalogue labels need no wiring.

### Enable stage (release owner, once a locale is complete)

Done on 2026-09-04 for `fr`, `es`, `it`, `nl` (steps 1–5; the remaining dashboard items are listed in section 2.7): `ACTIVE_LOCALES` and `COPY_LOCALES` list all six, the proxy no longer knows an "inactive programme locale" (a prefix outside `ACTIVE_LOCALES` is redirected like any unprefixed path), the switcher offers six native names and stays on the same page/article, hreflang carries six locales + `x-default` on every page, the sitemap index lists `pages-<locale>.xml` and `knowledge-<locale>.xml` for six, feeds and 404 pages exist per locale. Gates: `apps/web/src/i18n/routing.test.ts` (six active locales, message catalogs, 30 published articles and learning paths per locale), `pick.test.ts` (every copy module in six locales), `proxy.test.ts`, `catalog.test.ts` (integration text ×6), `apps/web/e2e/marketing.spec.ts` (home ×6: `lang`, one `h1`, 7 hreflang links, axe), `scripts/seo-check.ts` (fails unless six locales are active). The steps below remain the procedure for a seventh locale.

1. `docs/i18n-parity-report.md`: the locale has 0 gaps in every section and all 30 articles are `published`.
2. `apps/web/src/i18n/routing.ts`: add the locale to `ACTIVE_LOCALES` (the switcher, hreflang, sitemaps, `isLocale` and the knowledge validator follow automatically).
3. `apps/web/src/lib/marketing-copy/types.ts`: add it to `COPY_LOCALES` — from now on a `null` entry anywhere is a compile error, and `pick()` throws for a missing entry.
4. `packages/catalog/src/types.ts`: add it to `REQUIRED_LABEL_LOCALES`.
5. Resolve the items of section 2.7 for the locale; run the full verification list at the top plus `pnpm --filter @track-site/web test:e2e` (marketing smoke + axe) and the SEO gate (`seo:check`).
6. `pnpm --filter @track-site/web i18n:parity` now fails on any regression for that locale (default mode checks active locales; `--strict` checks all six).

## 4. Glossary — never translated

| Category | Terms (exact spelling) |
| --- | --- |
| Product and brand | `Track` (visible name, capital T, never "track.site" as a name), `Track AI`, `Tracking Knowledge` (the knowledge area, identical in every language), `Docs` may be translated ("Documentation", "Dokumentation", "Documentation", "Documentación", "Documentazione", "Documentatie") |
| Domains and technical addresses | `track.site`, `app.track.site`, `api.track.site`, `cdn.track.site`, `ingest.track.site`, e-mail addresses, `TRACKING_ID`, `tsq`, `tsk_…`, env names, config keys |
| Platforms and vendors | Meta, Meta Ads, Facebook, Instagram, Google Ads, Google Analytics 4 / GA4, Google Marketing Platform, Floodlight, TikTok Ads, LinkedIn Ads, Microsoft Ads, Reddit Ads, Pinterest, Snapchat, X, Taboola, Outbrain, Amazon, Criteo, AdRoll, Spotify, Quora, Yahoo, The Trade Desk, Stripe, OpenAI, AWS, Resend, Cookiebot, OneTrust, Usercentrics |
| Platform APIs and features | Conversions API (CAPI), Events API, Measurement Protocol, Enhanced Conversions, Enhanced Matching, UET, Consent Mode v2, Offline Conversions (as Google's feature name), TCF 2.2, GPP, GPC, IAB, Global Privacy Control, Data Processing Agreement/DPA only when the English text uses the English name of a vendor document |
| Shop systems | Shopify, WooCommerce, WordPress, Shopware 6 |
| Click ids and identifiers | `gclid`, `gbraid`, `wbraid`, `fbclid`, `ttclid`, `msclkid`, `li_fat_id`, `rdt_cid`, `epik`, `ScCid`, `dclid`, `event_id`, `order_id`, `anonymous_id`, `user_id`, `em`, `ph` |
| Event names | Vendor names as written by the vendor: `PageView`, `ViewContent`, `AddToCart`, `InitiateCheckout`/`BeginCheckout`, `Purchase`, `Lead`, `CompleteRegistration`; Track SDK names: `page_view`, `view_item`, `add_to_cart`, `begin_checkout`, `purchase`, `generate_lead`, `sign_up`, `subscribe`, `start_trial`, `contact`, `book_appointment`, `download`, `search`, `login` |
| Parameter and field names | `currency`, `value`, `items`, `item_id`, `price`, `quantity`, `email`, `phone`, `consent`, `granted`, `source`, `policy_version`, `props.offline`, JSON keys in every code block |
| Consent purposes (ids) | `necessary`, `analytics`, `marketing`, `personalization` — the ids in code; their display labels are translated (section 5) |
| Plans and billing terms | Starter, Growth, Pro, Enterprise (plan names), EUR, "Consent Engine", "Live Event Explorer", "Tracking Health Score", "Data Quality Inbox", "Event Replay", "Config-Versionierung"-style module names follow the German precedent: product module names stay English, the explanation next to them is translated |
| Statuses and enums | `draft`, `translated`, `reviewed`, `published`; `topic`, `level`, `contentType` values; `browser`, `server`, `offline` mode ids |
| Placeholders and markup | `{n}`, `{total}`, `{q}`, `{url}`, `{inviter}`, `{organization}`, `{title}`, ICU plural forms, `<b>`, `<link>`, MDX component names, code blocks, URLs |

Terms that are translated but must be consistent within a language (decide once, reuse everywhere; German precedent in brackets): consent → see section 5; "server-side tracking" (de: Server-Side Tracking, kept English), "first-party" (de: First-Party), "destination" (de: Destination — a Track concept: the configured delivery target), "deduplication" (de: Deduplizierung), "click id" (de: Click-ID), "event" (de: Event, never "Ereignis"), "site" (de: Website/Site), "workspace", "snippet" (de: Snippet), "tag manager" (de: Tag Manager), "data plane" (technical proof only, keep), "signed configuration" (de: signierte Konfiguration), "kill switch" (de: Kill Switch), "retention" (de: Aufbewahrung), "overage" (de: Mehrverbrauch), "billable event" (de: abrechenbares Event), "trial" (de: Testphase), "recommended" plan badge (de: Empfohlen).

## 5. Register per language

Professional, precise, calm. Benefit first, technical proof later (supplement §4). No hype, no invented customers, numbers, results or legal certainty. Translate meaning and search intent, not words; sentence length may change; headings stay short.

| Locale | Address | Notes |
| --- | --- | --- |
| `de` | **du** (informal, lower-case "du/dein/dich/dir"), never "Sie" | Verified on the existing German copy, message catalogs, legal texts and all 30 articles: they use "du" throughout (a capitalised "Sie" only appears as the pronoun "they" at sentence start). Keep it. Product module names stay English (see glossary); compound nouns with hyphens for English parts ("Server-Side-Tracking-Setup" → prefer "Server-Side Tracking" as a fixed term + German noun). |
| `fr` | **vous** (vouvoiement), never "tu" | French typography: non-breaking space before `:` `;` `?` `!` and inside « », « guillemets » instead of "…"; "e-mail" → « e-mail » or « adresse e-mail »; product terms in English keep English capitalisation. Consent: « consentement »; "cookie banner" → « bandeau cookies ». In TypeScript copy the literal U+00A0/U+202F characters are fine inside `"…"` strings, but inside template literals (`` `…${x}…` ``) write them as `\u00a0` / `\u202f` — ESLint's `no-irregular-whitespace` rejects the raw characters there. |
| `es` | **tú** (tuteo, European Spanish), never "usted" | Inverted marks ¿ ¡; "e-mail" → "correo electrónico" (UI: "correo"); decimal comma; consent: "consentimiento"; "cookie banner" → "banner de cookies". Avoid Latin-American-only terms. |
| `it` | **tu**, never "Lei" | Consent: "consenso"; "cookie banner" → "banner dei cookie"; "e-mail" stays "e-mail"; product terms in English keep English plural (no "-s"). |
| `nl` | **je/jij** (informal; "je" unstressed, "jij" only for emphasis), never "u" | Consent: "toestemming"; "cookie banner" → "cookiebanner"; compounds are written as one word ("cookiebanner", "trackingsetup") unless an English product term is involved (then hyphen: "Consent Mode v2-instellingen"). |
| `en` | you | Source language; British/Irish spelling is already used ("organisation" only where the existing English uses it — follow the source file). |

"Consent" terminology per language (product feature vs. legal noun):

| Locale | Product/feature term (as used in UI) | Legal noun | Verb "to consent" |
| --- | --- | --- | --- |
| `en` | Consent, consent state, consent gate | consent | grant consent |
| `de` | Consent (product term, kept), Consent-Zustand, Consent-Gate | Einwilligung (legal texts, DSGVO wording) | einwilligen |
| `fr` | Consent (only inside product/platform names such as Consent Mode v2, Consent Engine); otherwise consentement, état du consentement | consentement | donner son consentement |
| `es` | Consent (only inside names); consentimiento, estado del consentimiento | consentimiento | dar el consentimiento |
| `it` | Consent (only inside names); consenso, stato del consenso | consenso | prestare il consenso |
| `nl` | Consent (only inside names); toestemming, toestemmingsstatus | toestemming | toestemming geven |

## 6. Locale conventions

Formatting in code goes through `apps/web/src/lib/format.ts` (`INTL_LOCALES`: en → `en-IE`, de → `de-DE`, fr → `fr-FR`, es → `es-ES`, it → `it-IT`, nl → `nl-NL`; dates are formatted in UTC so date-only values never shift). In prose, follow the same conventions:

| Locale | Number 500000 | Price 19 € / 1 800 € | Date 2026-08-17 | Decimal |
| --- | --- | --- | --- | --- |
| `en` | 500,000 | €19 / €1,800 | 17 August 2026 | 19.90 |
| `de` | 500.000 | 19 € / 1.800 € | 17. August 2026 | 19,90 |
| `fr` | 500 000 | 19 € / 1 800 € | 17 août 2026 | 19,90 |
| `es` | 500.000 | 19 € / 1.800 € | 17 de agosto de 2026 | 19,90 |
| `it` | 500.000 | 19 € / 1.800 € | 17 agosto 2026 | 19,90 |
| `nl` | 500.000 | € 19 / € 1.800 | 17 augustus 2026 | 19,90 |

Prices are EUR only and come from the tariff catalogue; never write a price in copy or an article that the catalogue does not carry. Percentages: "70 %" with a (narrow) non-breaking space in de/fr; "70%" in en/es/it/nl follows `Intl`.

Privacy references — use the local name of the regulation and the local supervisory authority where the English source says "GDPR" or names a regulator; do not add legal claims the source does not make:

| Locale | Regulation | Supervisory authority | Notes |
| --- | --- | --- | --- |
| `en` | GDPR (Regulation (EU) 2016/679) | the competent supervisory authority (e.g. the Irish DPC for many EU-established vendors) | ePrivacy Directive for cookies |
| `de` | DSGVO | Datenschutzbehörde des Bundeslandes (LfDI/LDI) bzw. BfDI | "Art. 28 DSGVO" for processor contracts; a national cookie law is named only where the English source names one |
| `fr` | RGPD | CNIL | "traceurs" for trackers in legal context; CNIL guidance is cited only where the English source cites guidance |
| `es` | RGPD | AEPD | national law is named only where the English source names one |
| `it` | GDPR (commonly kept in Italian; "Regolamento (UE) 2016/679" in legal text) | Garante per la protezione dei dati personali | Garante guidance is cited only where the English source cites guidance |
| `nl` | AVG | Autoriteit Persoonsgegevens | a national cookie law is named only where the English source names one |

Examples in articles: adapt currency, shop examples and regulatory references to the language area (a French article uses € prices formatted the French way and refers to the CNIL; a Dutch article to the Autoriteit Persoonsgegevens); platform behaviour, API fields and screenshots-as-text do not change.

## 7. MDX rules for Tracking Knowledge translations

One file per topic in `apps/web/content/knowledge/<xx>/`, file name and `translationGroupId` identical to the English file. The validator (`knowledge:validate`, rules in `docs/14-knowledge-content-rules.md`) checks the structure once the locale is active; the parity script lists missing and unpublished versions for every locale.

Front matter — keys never change, values as follows:

| Key | Rule |
| --- | --- |
| `title`, `description`, `excerpt` | translated; search intent of the language area, not a literal title |
| `category` | unchanged (legacy value, identical to en) |
| `translationGroupId` | unchanged (= English file name) |
| `slug` | **identical to the English slug** for fr/es/it/nl (localized slugs are possible later — the loader and redirects support them — but the release uses the English slug so hreflang and the redirect matrix stay simple) |
| `topic`, `platforms`, `shopSystems`, `contentType`, `level` | unchanged (must be identical across the language versions of a group) |
| `takeaways` | translated; 3–4 plain-text strings, no Markdown |
| `tags` | translate words (`"data-loss"` → `"perte-de-données"` is allowed), keep technical tags (`"itp"`, `"gclid"`, `"capi"`, platform names) |
| `author` | unchanged (`track-editorial`; the display name is localized by `knowledge-labels`) |
| `publishedAt` | unchanged (date of the topic) |
| `updatedAt` | unchanged; set later only when the body changes materially |
| `reviewedAt` | **omit or leave unchanged from en until a reviewer of the target language has actually reviewed the translation**; never invented |
| `status` | `"translated"` when the translator hands over; `"reviewed"` after review; `"published"` only by the release owner (section 8) |
| `coverAlt` | translated |
| `sources` | unchanged (titles and URLs of the primary sources; a translated official source may be added *in addition* only if it is the same document in the target language) |
| `legalNotice`, `featured` | unchanged (`featured: true` stays on the same group as in en) |

Body:

- Translate headings, paragraphs, lists, table cells, callout text and diagram labels. Keep the heading hierarchy and order (the table of contents, search index and internal anchors depend on it).
- Keep code blocks (fences, language tag, content) unchanged, including comments that are code identifiers; a comment that is prose may be translated.
- Keep MDX component names and props: `<Note>`, `<Warning>`, `<Privacy>`, `<Practice>`, `<Steps>`, `<Diagram>`, `<FlowNode>`, `<FlowEdge>`, `<ConsentGate>`, `<DestinationChip>`, `<SignalDot>`; a `title="…"` prop is text and is translated; blank lines around component content stay.
- Keep GFM task-list syntax (`- [ ]`, `- [x]`), tables (same column count), bold/italic and inline code as in the source.
- Internal links point to the same locale: `/tracking-knowledge/<slug>` with the English slug (never `/blog/…`, never a locale prefix, never a link to another language's article). Links to product pages stay locale-neutral (`/features/consent`).
- Numbers, dates and currencies in prose follow section 6; regulatory references follow the table in section 6; vendor field names, event names and parameter names follow section 4.
- No new facts, numbers, sources, dates or claims; if the English article is wrong, fix English first (a new `updatedAt`), then the translations.

Learning paths (`paths.<xx>.json`): same `id`s, same `groupIds` in the same order as `paths.en.json`; `title` and `description` translated.

## 8. Review and publish workflow

| Status | Who sets it | Meaning |
| --- | --- | --- |
| `draft` | author | English original in progress (never used for a translation) |
| `translated` | translator | complete translation delivered (front matter + body), builds, passes `knowledge:validate` in a local run with the locale temporarily added to `ACTIVE_LOCALES` |
| `reviewed` | native reviewer | terminology (section 4), register (section 5), conventions (section 6), fidelity to the English version, links; `reviewedAt` set to the review date |
| `published` | release owner | set for all 30 topics of a locale in one change together with the enable stage (section 3); a locale is never public with a partially published set |

Typed copy, legal, mail, catalogs and message catalogs have no status field: the pull request review is the review step, the parity report is the completeness gate, and the enable stage is the publish step. Only `published` articles are listed, indexed, in the sitemap and linked as hreflang alternates; a missing or unpublished version is simply absent for that locale (never an English fallback under a localized URL).

Deliverable check for a locale hand-over: `pnpm --filter @track-site/web typecheck && pnpm --filter @track-site/web test && pnpm --filter @track-site/catalog test && node apps/web/scripts/i18n-parity.mjs --strict` — the last command may still fail for the *other* locales; the row of the delivered locale in `docs/i18n-parity-report.md` must be complete except for article status (`translated`/`reviewed` until publication).
