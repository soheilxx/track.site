# Track redesign programme (supplement of 2026-09-03)

Source: the owner's supplement prompt "Track Redesign, Pricing, Tracking Knowledge und Dashboard" (kept outside the repo, `claude-code-ergaenzung-track-redesign.md`). It amends the master prompt; everything not listed there stays as specified before. This document is the required as-is/to-be report and the route-by-route change matrix, and it tracks progress across sessions.

## 1. As-is (verified 2026-09-03 on www.track.site and in the repo)

| Area | As-is | Verified how |
| --- | --- | --- |
| Brand | Visible name is `track.site` (root metadata, header/footer aria labels, JSON-LD `Organization`, e-mails, author "track.site editorial team") | grep over `apps/web`, `packages/ui/src/brand.tsx` |
| Locales | `en` (unprefixed) and `de` (`/de`) via next-intl `localePrefix: "as-needed"`; message catalogs `messages/{en,de}/{common,auth,app,chat,destinations}.json`; marketing copy typed in `apps/web/src/lib/marketing-copy.ts` (25 KB, en/de), legal copy in `legal-copy.ts` (20 KB) | `apps/web/src/i18n/routing.ts`, file sizes |
| `<html lang>` | Root layout hard-codes `lang="en"`; locale layouts only set `lang` on a `<div>` → German pages declare `lang="en"` | `curl https://www.track.site/de` |
| hreflang | `alternatesFor()` exists but no `<link rel="alternate" hreflang>` tags reach the HTML on `/` (metadata alternates not emitted for every route) | curl of the home page head |
| Social cards | No `og:image`, `twitter:card=summary` only | curl of an article |
| Blog | 30 MDX posts per locale under `apps/web/content/blog/{en,de}`, shared slugs, loader `apps/web/src/lib/blog.ts`, routes `/[locale]/blog`, `/[locale]/blog/[slug]`, feed `/[locale]/blog/feed.xml`, 3-column card grid, no search/filters, no reading progress/TOC | route inventory |
| Pricing | Plans `starter/growth/scale/enterprise` from the `plans` table (seeded), limits 50k/500k/2M events, prices only from Stripe (`STRIPE_PRICE_*`), 4 equal cards, "price not published yet" fallback, monthly/yearly toggle | `packages/db/src/cli/seed.ts`, pricing page |
| Stripe (live) | Restricted key, webhook, six prices set by the owner: monthly 19/90/180 €, yearly 220/990/1 840 €, product names "track.site Starter/Growth/Scale" | `/api/health` → `billing: ok`, pricing page amounts |
| Home | Static hero with a non-interactive `DashboardPreview`, six sections of text cards | `apps/web/src/app/[locale]/page.tsx` |
| Nested interactive elements | `<Link><Button/></Link>` pattern in dashboard (e.g. overview "create site") and marketing CTAs | grep |
| Dashboard | Sidebar nav (overview, AI setup, sites, events, debugger, destinations, data quality, consent, audiences, team, billing, settings); page-scrolling layout (`min-h-screen`), no viewport-fixed shell, no persistent assistant panel (setup chat lives on `/app/sites/[siteId]/setup`) | `apps/web/src/components/app/shell.tsx` |
| Assistant stream | SSE events from `/api/ai/chat` (`message`, `card`, `approval`, `error`, `done` …); activity messages not yet a first-class, localized event set | `apps/web/src/app/api/ai/chat/route.ts` |
| Tests | Vitest unit/integration/contract, Playwright smoke (`marketing.spec.ts` with axe, `app.spec.ts`), SEO gate script, SDK budget; no visual regression, no Lighthouse gate | `apps/web/e2e`, scripts |

## 2. To-be (binding, from the supplement)

- Visible brand `Track` everywhere; `track.site` only as domain/technical address; own mark + variants (header, app icon, favicon, social card, dark).
- New visual system (off-white, ink, cobalt primary, violet/cyan AI accents, semantic colours only for states; 8 px spacing; no card soup; motion budget; reduced motion).
- Home with a real interactive demo (Overview, Live Events, Destinations, AI Setup, Attribution; deterministic fixtures; reset), new section order, no invented social proof.
- Pricing: Starter 19 €/190 €, Growth 90 €/900 € ("Empfohlen"), Pro 180 €/1 800 €, Enterprise custom; new entitlements, event definition, overage packs (6 €/100k, 18 €/1M, 30 €/5M) opt-in, 70/90/100 % warnings, 14-day Growth trial without card, plan finder, cost calculator, comparison matrix, FAQ; one central typed tariff catalogue driving marketing, checkout, entitlements, usage ledger, portal and webhooks.
- "Blog" → "Tracking Knowledge" (`/[locale]/tracking-knowledge`, `/[locale]/tracking-knowledge/[localizedSlug]`), 301 redirect matrix, knowledge hub (search, topic worlds, learning paths, filters), new article template, dynamic 1200×630 social cards, `BlogPosting`/`TechArticle` + `BreadcrumbList` JSON-LD.
- Six locales `en, de, fr, es, it, nl` with consistent prefixes (`/en` included), `/` → English, correct `lang`, self-canonicals, reciprocal hreflang + `x-default`, sitemap index per locale and section, 30 topics × 6 languages fully localized, parity report, statuses `draft/translated/reviewed/published`.
- Dashboard as Tracking Command Center with the 13 modules (real, backend-backed, honest empty states), task-oriented navigation, site/workspace switcher, command palette, environment indicator.
- Track AI: viewport-fixed app shell (`100dvh`), persistent 380–440 px panel, mobile bottom sheet, Living AI Core (SSR gradient → CSS fallback → WebGL2 metaballs; state machine `idle/listening/working/streaming/approval_required/success/blocked`), allow-listed UI stream events (`activity.*`, `assistant.message`, `ui.card`, `approval.required`, `job.progress`, `ui.final`), strict scope, localized activity sentences, per-user motion setting.
- QA: responsive 320–1920, WCAG 2.2 AA, Lighthouse ≥ 95 (a11y/BP/SEO), CWV targets, unit/integration/e2e/a11y/SEO/visual/security tests, final evidence pack.

## 3. Decisions taken for the implementation

| Topic | Decision | Reason |
| --- | --- | --- |
| Locale prefix | `localePrefix: "always"`; `/` and every unprefixed marketing URL 301 → `/en/...` (query preserved); dashboard/API/CDN paths stay unprefixed | Supplement §7 asks for consistent prefixes incl. `/en` and a deterministic `/` |
| New locales roll-out | `fr, es, it, nl` are added to routing only once their UI catalogs, marketing/legal copy and all 30 articles exist, so no English fallback is ever served on a localized public page | Supplement forbids mixed-language pages; avoids indexing half-translated locales |
| Tariff catalogue | New package `@track-site/catalog` (pure TS, tested): plans, list prices, entitlements, overage packs, trial, billable-event rules, plan finder + cost calculator. DB `plans` table is synced from it by the seed; Stripe amounts are verified against it by `/api/health` (`amount_mismatch`) | "Preise, Limits oder Feature-Gates dürfen nicht an mehreren Stellen auseinanderlaufen" |
| Plan ids | `starter`, `growth`, `pro`, `enterprise`; `scale` is migrated to `pro` (data migration keeps subscriptions), env names `STRIPE_PRICE_PRO_*` (legacy `STRIPE_PRICE_SCALE_*` still read as fallback and reported as deprecated in health) | Supplement renames the third plan |
| Article slugs | Front matter may set `slug` per locale; `translationGroupId` = the English file name; old `/blog` URLs redirect to the localized new slug | Localized slugs without breaking existing URLs |
| Social cards | Dynamic `opengraph-image` routes (Next `ImageResponse`) per page/article/locale; no static image files | Supplement prefers generated 1200×630 cards over 180 files |
| Living AI Core | Own component, no new rendering dependency; WebGL2 fragment shader with CSS/static fallbacks and a per-user setting persisted in `user` preferences | Supplement §9 |

## 4. Route-by-route change matrix

| Route (today) | Change | New route(s) |
| --- | --- | --- |
| `/` (en), `/de` | Redesign (hero + interactive demo, new section order); `/` → 301 `/en` | `/{en,de,fr,es,it,nl}` |
| `/features`, `/features/[slug]` | Product views, data-flow diagrams, before/after; localized ×6 | `/[locale]/features…` |
| `/how-it-works` | Visual "Snippet → Track → Platforms" flow, 3–4 milestones (remove "19 steps" style claims) | `/[locale]/how-it-works` |
| `/integrations`, `/integrations/[slug]` | Search + filters (Ads/Analytics/Commerce/Affiliate; Browser/Server/Offline), licensed icons, modes, status, detail pages | `/[locale]/integrations…` |
| `/pricing` | New layout (3 main cards + Enterprise panel), toggle, plan finder, calculator, matrix, FAQ, tax note; catalogue-driven | `/[locale]/pricing` |
| `/blog`, `/blog/[slug]`, `/blog/feed.xml` | Renamed + rebuilt; 301 matrix; hub with search/filters; new article template; OG images; JSON-LD | `/[locale]/tracking-knowledge`, `/[locale]/tracking-knowledge/[localizedSlug]`, `/[locale]/tracking-knowledge/feed.xml` |
| `/docs`, `/support`, `/contact`, `/demo`, `/status`, `/security` | Brand + visual system + localization ×6 | `/[locale]/…` |
| Legal (`/privacy`, `/terms`, `/data-processing`, `/subprocessors`, `/imprint`) | Brand + localization ×6 (imprint stays optional per owner: HK company) | `/[locale]/…` |
| Auth (`/login`, `/signup`, `/forgot-password`, `/reset-password`, `/verify-email`, `/two-factor`, `/accept-invitation/[id]`) | Focused auth shell, domain prefill from hero, localized ×6 | unchanged paths under `/[locale]` |
| `/sitemap.xml` | Sitemap index → per-locale pages + knowledge sitemaps | `/sitemap.xml`, `/sitemaps/[section]-[locale].xml` |
| `/app` | Tracking Command Center | `/app` |
| `/app/setup` (AI setup) | Persistent Track AI panel in the shell; setup as first-run large mode | `/app/ai-setup` (+ redirect) |
| `/app/events`, `/app/debugger` | Events + Live Event Explorer (lineage) + Event Coverage Matrix + Live Test Lab | `/app/events`, `/app/events/explorer`, `/app/events/coverage`, `/app/events/test-lab` |
| `/app/destinations` | Destination Health Center | `/app/destinations` |
| `/app/data-quality` | Data Quality Inbox (prioritised) + Signal Gap & Revenue Leak Detector | `/app/data-quality`, `/app/data-quality/revenue-leaks` |
| `/app/consent` | Consent & Privacy + Consent Impact Simulator | `/app/consent`, `/app/consent/simulator` |
| (new) | Insights: Attribution & Click-ID Health | `/app/insights/attribution` |
| (new) | Releases: Change & Release Center + Change Impact Preview | `/app/releases`, `/app/releases/[versionId]` |
| `/app/team` | Team & Access | `/app/team` |
| `/app/billing` | Billing + Usage & Cost Guard (overage choice, cost limit, pause, 70/90/100 % alerts) | `/app/billing`, `/app/billing/usage` |
| `/app/settings` | Settings + Alerts & Incident Mode + AI motion preference | `/app/settings`, `/app/settings/alerts` |
| `/app/audiences`, `/app/sites…` | kept; sites move under the workspace switcher | unchanged |

## 5. Phases and status

| # | Phase | Scope | Status |
| --- | --- | --- | --- |
| 0 | Analysis | this document | done 2026-09-03 |
| 1 | Foundations | tariff catalogue + plan migration; six-locale routing infrastructure (`always` prefix, redirects, `lang`, hreflang, sitemap index) with `en/de` live; brand "Track" + new mark (done 2026-09-04: route glyph + wordmark in `packages/ui/src/brand.tsx`, assets `apps/web/public/brand/{logo,logo-dark,mark,mark-dark}.svg` + `icon-{192,512}.png`, `src/app/{icon.svg,apple-icon.png,manifest.ts}`, visible strings in messages/pages/legal/e-mails/AI assistant rebranded, guard test `apps/web/src/lib/brand-guard.test.ts`); Blog → Tracking Knowledge routes, redirects, OG images, JSON-LD | in progress |
| 2 | Marketing redesign | design system, header/footer/nav, home with interactive demo, features, how-it-works, integrations, pricing, auth shell, legal pages | pending |
| 3 | Tracking Knowledge | hub, search/filters, article template, covers, feedback, related, print | pending |
| 4 | Localization ×6 | UI catalogs, marketing/legal copy, 30 articles in fr/es/it/nl, parity report, enable locales | pending |
| 5 | Dashboard | shell (viewport-fixed, panel, switcher, palette, environment), Command Center and the 13 modules | pending |
| 6 | Track AI | UI event allow-list + activity sentences ×6, Living AI Core, motion setting, scope enforcement evals | pending |
| 7 | QA + evidence | responsive, a11y, Lighthouse, CWV, visual regression, tests, screenshots, reports | pending |

## 6. Owner actions raised by this programme

1. Stripe yearly prices must be 190 €, 900 € and 1 800 € (ten monthly instalments). The live yearly prices are 220 €, 990 € and 1 840 €. Create the three new yearly prices in Stripe (existing ones can be archived) and update the yearly env values on Vercel.
2. Rename the Stripe products to `Track Starter`, `Track Growth`, `Track Pro` (the product name appears on Checkout, invoices and in the portal). The third plan is called Pro, not Scale.
3. Rename the env variables `STRIPE_PRICE_SCALE_MONTHLY/YEARLY` to `STRIPE_PRICE_PRO_MONTHLY/YEARLY` on Vercel (the old names keep working during the transition and are reported as deprecated by `/api/health`).
