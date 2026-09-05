# Track redesign — release report and evidence pack (2026-09-05)

Closing report of the Track redesign programme (`docs/11-track-redesign-program.md`, phases 1–7) against the owner supplement §10 (responsive QA, accessibility, performance) and §11 (binding tests, definition of done, "Abschlussbelege" 1–8). Every number in this report is copied from a file in `docs/qa/2026-09-05/` or from a command output stored there; nothing is estimated. A check that could not run is listed as "not run" with the reason, never as passed.

| | |
| --- | --- |
| Before (pre-redesign) | commit `0f0f5b5` ("docs: design system reference for the Track redesign"), worktree `C:/Users/Soheil/Downloads/track-site-before`, `BUILD_ID` `sb9bxPyxbPMYA9tK0DYEV` |
| After (redesign) | commit `85fe3b7` on `feat/ai-tag-manager-platform` **plus the uncommitted working tree** of task F1 (fixes for the QA findings) and the QA tooling — see `docs/qa/2026-09-05/changed-files.md` §3; builds `rCAJOqYs841hSlnLSc99W` (85fe3b7 clean, S1–S4 evidence), `UANQbZ2DkEqCtTt7EriZY` (F1 re-check), `8k-9hBUufCX88fLKrM1Yp` (gate build of this report, `docs/qa/2026-09-05/reports/build.txt`) |
| Evidence pack | `docs/qa/2026-09-05/` (`README.md` = baselines, rules, reproduction; the actual layout is listed there under "Actual layout") |
| Gates | `docs/12-design-system.md` §6: WCAG 2.2 AA, Lighthouse ≥ 95 accessibility / best practices / SEO, performance as close to 95 as realistic, LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1, 320–1920 px without horizontal scroll |

## 0. Result at a glance

| Gate / deliverable | Status | Evidence |
| --- | --- | --- |
| 1 Changed files and routes | done | §1, `docs/qa/2026-09-05/changed-files.md` |
| 2 Before/after screenshots 375 / 768 / 1440 / 1920 | done (25 pages, 511 WebP) | §2, `docs/qa/2026-09-05/before-after/index.md` |
| 3 Language and article parity | pass — 0 gaps in 5 locales vs English, 30 × 6 articles published | §3, `docs/i18n-parity-report.md` |
| 4 Redirect matrix Blog → Tracking Knowledge | pass — 224 rows, 58 fetched (0 failures), 166 by verified pattern rule | §4, `docs/qa/2026-09-05/seo/redirect-matrix-six-locales.md` |
| 5 Pricing / entitlement matrix | pass — catalogue-generated, 61 unit tests + 3 integration tests, live Stripe verification `billing: ok` | §5, `docs/qa/2026-09-05/pricing-matrix.md` |
| 6a Responsive 320–1920 | pass after F1 — 144 re-check runs: 0 horizontal scroll, 0 clipped, 0 hidden primary actions (was 5 / 63 / 57 of 336) | §6.1 |
| 6b axe WCAG 2.2 AA | pass — 0 violations in 24 re-check runs (was 2 serious nodes in 96 runs) | §6.2 |
| 6c Keyboard focus | pass — 120 / 120 tab stops with a visible indicator (was 116 / 120) | §6.2 |
| 6d Lighthouse a11y / BP / SEO ≥ 95 | pass on every public indexable page (100 / 96–100 / 100); `/en/login` and `/app` SEO 63 / 54 are `noindex` by design | §6.3 |
| 6e Lighthouse performance ≈ 95 (mobile) | **below target**: 87–94 after F1 (was 72–83) | §6.3, defect D9 |
| 6f Core Web Vitals (lab, mobile) | LCP **fail** 2.92–3.99 s (target ≤ 2.5 s; was 4.45–4.93 s); CLS pass 0–0.029; INP not measurable in a lab run (TBT proxy 33–79 ms) | §6.4, defect D9 |
| 6g Visual regression | pass — 12 baselines, 4 verify runs × 12 passed | §6.5 |
| 7 typecheck / unit / contract / integration / production build | pass (typecheck 17 tasks; 823 unit tests; 63 contract tests; 22 integration tests; 715 / 715 pages) | §7 |
| 7 lint | pass after the final verification (§11): the 14 errors in `apps/web/scripts/qa/*.mjs` were fixed in place, `pnpm lint` exit 0, 17 / 17 tasks (`reports/final/lint.txt`; the failing run is kept as `reports/final/lint-before-fix.txt`) | §7, §11, defect D6 (fixed) |
| 7 SEO gate (`pnpm seo:check`) | **exit 0** after the fixes of 2026-09-05 (336 pages in six locales, redirects, robots, sitemap index and feeds OK) — the checker now measures decoded text lengths, counts only the `<head>` title and accepts TechArticle; evidence `docs/qa/2026-09-05/reports/final/seo-check-after-d1-d5.txt` | fixed (D5) |
| 7 e2e (Playwright chromium) | pass — 28 / 28 twice (one flaky reduced-motion test in a third run) + 12 new responsive/focus specs; not re-run in this task (no server) | §7 |
| Social cards of Tracking Knowledge pages | **pass** after the fix of 2026-09-05 — the cards are served by stable route handlers `…/tracking-knowledge/card.png` and `…/tracking-knowledge/<slug>/card.png` (200, image/png, localized `og:image:alt`, `twitter:image`); verified locally for hub and article, unknown slugs answer 404 | fixed (D1) |
| 8 Open points (external) | Resend key + vault on the Fly worker, Stripe test purchase, vendor OAuth apps, legal review of the imprint texts, first real vendor/shop test events | §8 |

The programme is complete as far as the repository can make it. Defects D1, D2c, D5, D7, D8 and D13 were fixed on 2026-09-05 (see §9); the release ships with the documented mobile performance gap (D9) and the owed evidence items D10/D15/D16, which the follow-up run addresses.

## 1. Changed files and routes

Generated by `docs/qa/2026-09-05/changed-files.mjs` → `docs/qa/2026-09-05/changed-files.md` (summary by area, the 23 commits, the uncommitted working tree, route tables from the two build manifests, and every file). `git diff --stat 0f0f5b5..HEAD`: **1 008 files changed, 117 827 insertions, 6 616 deletions** (772 added, 139 modified, 31 deleted, 66 renamed). On top of HEAD the working tree carries the F1 fixes and the QA tooling: 40 paths, 35 modified tracked files with 344 insertions / 103 deletions (`git diff --stat`), plus the untracked `apps/web/e2e/visual.spec.ts`, `apps/web/e2e/README.md`, `apps/web/e2e/__screenshots__/` (12), `apps/web/scripts/qa/` (3) and `docs/qa/`.

Largest areas (files, + / − lines; full table in `changed-files.md` §1):

| Area | Files | + | − |
| --- | ---: | ---: | ---: |
| Tracking Knowledge articles + learning paths ×6 (`apps/web/content/knowledge`) | 186 | 10 688 | 132 |
| UI message catalogs ×6 (`apps/web/messages`) | 100 | 27 644 | 78 |
| Marketing copy modules ×6 (`apps/web/src/lib/marketing-copy`) | 93 | 13 084 | 0 |
| Dashboard module components (`apps/web/src/components/app/**`, without the shell) | 90 | 10 830 | 301 |
| Public routes under `/[locale]` (marketing, knowledge, auth, metadata) | 57 | 2 183 | 1 445 |
| Web server (data access, actions, billing, entitlements) | 57 | 13 022 | 159 |
| Marketing components (header, footer, home, features, integrations, auth shell) | 47 | 4 426 | 282 |
| Dashboard routes `/app/**` | 44 | 2 997 | 852 |
| Dashboard shell (viewport-fixed layout, Track AI panel, Living AI Core, palette) | 28 | 3 885 | 0 |
| `packages/db` (migrations 0004–0013, repositories, seed) | 28 | 2 026 | 93 |
| `packages/ui` (tokens, primitives, brand) | 24 | 2 261 | 184 |
| Track AI chat (store, reducer, virtual list, workspace moves) | 23 | 2 663 | 314 |
| Tracking Knowledge components | 21 | 2 236 | 0 |
| `packages/ai` (UI event contract, scope gate, evals) | 20 | 2 028 | 37 |
| Interactive hero demo | 19 | 1 667 | 0 |
| Pricing components | 17 | 1 567 | 0 |
| `packages/catalog` (new tariff catalogue) | 13 | 1 120 | 0 |

Routes (`apps/web/.next/app-path-routes-manifest.json`, before 64 → after 86 routes; `changed-files.md` §4):

| Group | Before (`0f0f5b5`) | After |
| --- | --- | --- |
| Public pages ×6 locales | `/`, `/de`, `/[locale]/{features, features/[slug], how-it-works, integrations, integrations/[slug], pricing, docs, support, contact, demo, status, security, privacy, terms, data-processing, subprocessors, imprint}`, auth pages; `en` unprefixed, `de` prefixed | the same pages under `/[locale]/(marketing)` and `/[locale]/(auth)` for `en, de, fr, es, it, nl` (`localePrefix: "always"`; `/` and every unprefixed marketing URL 308 → `/en/...`, query preserved) |
| Blog → Tracking Knowledge | `/[locale]/blog`, `/[locale]/blog/[slug]`, `/[locale]/blog/feed.xml` | `/[locale]/tracking-knowledge`, `/[locale]/tracking-knowledge/[slug]`, `/[locale]/tracking-knowledge/feed.xml`, generated social cards `…/opengraph-image-1vcy9h` (hub) and `…/[slug]/opengraph-image-qnehfz` (article), `/[locale]/opengraph-image` (pages); old URLs answered by permanent redirects only (§4) |
| Sitemaps / metadata | `/sitemap.xml`, `/robots.txt`, `/icon.svg` | `/sitemap.xml` (index) + `/sitemaps/[name]` (`pages-<locale>.xml`, `knowledge-<locale>.xml` ×6), `/robots.txt`, `/icon.svg`, `/apple-icon.png`, `/manifest.webmanifest` |
| Dashboard | `/app`, `/app/debugger`, `/app/audiences`, `/app/events`, `/app/destinations`, `/app/data-quality`, `/app/consent`, `/app/team`, `/app/billing`, `/app/settings`, `/app/sites/**`, `/app/onboarding/**` | `/app` (Command Center), `/app/ai-setup`, `/app/events` + `/explorer` + `/matrix` + `/test-lab`, `/app/destinations`, `/app/data-quality` + `/revenue-leaks`, `/app/consent` + `/simulator`, `/app/insights` + `/attribution` + `/audiences`, `/app/releases` + `/[versionId]`, `/app/team` + `/audit`, `/app/billing` + `/usage`, `/app/settings` + `/alerts`, `/app/sites/**`, `/app/onboarding/**`; `/app/setup` → 308 `/app/ai-setup`, `/app/debugger` → 308 `/app/events/explorer`, `/app/audiences` → 308 `/app/insights/audiences` (crawl-verified, `seo/summary.md`) |
| API | `/api/ai/{chat,confirm,credential,health,wizard}`, `/api/auth/[...all]`, `/api/health`, `/api/oauth/[provider]/callback`, `/api/privacy/dsar/[id]`, `/api/stripe/webhook`, `/cdn/v1/c/[...path]` | + `/api/ai/dev-fixture` (dev only, 404 in production), `/api/app/events/explorer`, `/api/app/events/test-lab/[runId]`, `/api/knowledge/feedback` |

Prerendered output: 661 static routes (107 per locale + 19 shared) and 22 dynamic patterns (`prerender-manifest.json`); the build log reports 715 / 715 static pages (`reports/build.txt`).

## 2. Before / after screenshots (375, 768, 1440, 1920 px)

`docs/qa/2026-09-05/before-after/index.md` — one table per page with the four widths side by side, page heights, HTTP status and a factual change description; `capture.json` (URL, status, final URL, page height, captured width, file sizes, WebP quality, document-overflow flag per capture) and `mapping.json` (route pairing). 511 WebP files, every file ≤ 150 KB (largest 150 KB, verified by decoding), long pages split into `-partN` segments in reading order. Both sides are running production builds (`next start`): before `0f0f5b5` on :3004, after `85fe3b7` on :3005 (`AI_DEV_FIXTURES=1`), Playwright Chromium, `deviceScaleFactor` 1, full page, default motion preference.

| Page | Directory | Notes |
| --- | --- | --- |
| Home en / de | `before-after/home-en/`, `home-de/` | brand `track.site` → `Track`, dropdown navigation + six-language switcher, static preview card → interactive demo (Overview / Live Events / Destinations / AI Setup / Attribution), new section order, page height at 1440 px 4 032 → 8 028 px |
| Home fr / es / it / nl | `home-fr/`, `home-es/`, `home-it/`, `home-nl/` | after only (locales did not exist before) |
| Pricing en / de / fr / es / it / nl | `pricing-en/` … `pricing-nl/` | after: 3 plan cards + Enterprise panel, toggle, plan finder, calculator, comparison matrix, FAQ, tax note; **before renders HTTP 500** because the before tree reads the shared database migrated to the after schema (`index.md` "Limitations") |
| Knowledge hub en / de | `knowledge-en/`, `knowledge-de/` | blog card grid → hub with search, learning paths, cover family |
| Article `consent-mode-v2-guide` en / de | `article-consent-mode-v2-guide-en/`, `-de/` | new article template (TOC, reading progress, takeaways, callouts, feedback, print) |
| Features, integrations (en) | `features-en/`, `integrations-en/` | product views / searchable catalogue |
| Login, signup en / de | `login-en/`, `login-de/`, `signup-en/`, `signup-de/` | focused auth shell |
| Dashboard `/app`, `/app/events/explorer`, `/app/releases` | `app-overview/`, `app-events-explorer/`, `app-releases/` | viewport-fixed shell with Track AI panel; `/app/releases` after only (404 before) |

Horizontal overflow recorded during the captures (`index.md` "Horizontal overflow observed"): 18 before captures (the old site at 768 px and the old article at 375 px) and 6 after captures (dashboard shell at 375 / 768 px, `/de` and `/nl` pricing at 768 px). The after cases are findings F1 and F3 of the responsive sweep and are fixed by F1 (§6.1); the before/after WebPs deliberately show the state of `85fe3b7` before the fixes, the re-check screenshots of the fixed build are under `docs/qa/2026-09-05/recheck/screenshots/`.

## 3. Language and article parity

`docs/i18n-parity-report.md` / `.json` (copies in `docs/qa/2026-09-05/seo/`), generated 2026-09-05T09:13:52Z by `node apps/web/scripts/i18n-parity.mjs --strict` (exit 0). Reference English: 3 808 message keys in 17 namespaces, 21 typed copy modules, 30 knowledge topics (30 published), 4 learning paths, 95 catalogue labels.

| Locale | Active | Message keys (gaps) | Copy modules (gaps) | Knowledge labels | Legal | Mail | Knowledge published / topics | Learning paths (gaps) | Catalogue labels (gaps / 95) | Status |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | --- | --- |
| en | yes | reference | reference | reference | reference | reference | 30 / 30 | reference | reference | reference |
| de | yes | 0 | 0 | 0 | 0 | 0 | 30 / 30 | 0 | 0 / 95 | complete |
| fr | yes | 0 | 0 | 0 | 0 | 0 | 30 / 30 | 0 | 0 / 95 | complete |
| es | yes | 0 | 0 | 0 | 0 | 0 | 30 / 30 | 0 | 0 / 95 | complete |
| it | yes | 0 | 0 | 0 | 0 | 0 | 30 / 30 | 0 | 0 / 95 | complete |
| nl | yes | 0 | 0 | 0 | 0 | 0 | 30 / 30 | 0 | 0 / 95 | complete |

Corroborating evidence:

- `docs/qa/2026-09-05/seo/knowledge-validate.txt` (`pnpm --filter @track-site/web knowledge:validate`, exit 0): 180 files, 30 translation groups, locales en/de/fr/es/it/nl, learning paths and featured story valid; front matter check: 0 fields to change, 0 internal `/blog` links left.
- Crawl of the production build (`docs/qa/2026-09-05/seo/summary.md`, `crawl.json`): 12 sitemaps (`pages-<locale>.xml` 48 URLs, `knowledge-<locale>.xml` 30 URLs each), 468 public URLs crawled, 468 / 468 with 7 hreflang links (six locales + `x-default`), 468 / 468 with a self-canonical and a meta description, 6 RSS feeds with 30 items each, no `/blog/` URL in any sitemap or feed; `<html lang>` correct on the 336 pages of the SEO gate (`seo/seo-check.txt` reports no `lang` finding).
- Catalogue labels: `docs/qa/2026-09-05/pricing-matrix.md` §11 — 76 catalogue labels × 6 required locales, 0 missing.
- Playwright `marketing.spec.ts`: "serves all six programme locales" and home ×6 with the right `lang`, one `h1`, hreflang ×7 and no serious axe violation; language switcher stays on `/pricing` en → de → fr (`reports/e2e/e2e-run4.log`, 28 passed).
- Machine-readable parity per `translationGroupId`: `docs/i18n-parity-report.json` (knowledge section per locale) and the validator's 30 groups × 6 locales.

Not measured: automatic language detection of rendered text (mixed-language pages are prevented structurally — `pick()` throws on a missing copy entry and the parity script is strict — but no language classifier ran over the HTML).

## 4. Redirect matrix Blog → Tracking Knowledge

- Rules: `apps/web/src/lib/routes.ts` `KNOWLEDGE_LEGACY_REDIRECTS`, applied as permanent redirects by `apps/web/next.config.ts` before the locale proxy: `/blog` → `/en/tracking-knowledge`, `/blog/feed.xml` → `/en/tracking-knowledge/feed.xml`, `/blog/:slug` → `/en/tracking-knowledge/:slug`, and `/:locale(en|de|fr|es|it|nl)/blog[/feed.xml|/:slug]` → `/:locale/tracking-knowledge[...]`; explicit per-article rules would run first if a localized slug differed from the old shared slug (none needed: `KNOWLEDGE_SLUG_REDIRECTS` is empty and every localized slug equals the English file name). Next.js preserves query strings.
- Matrix: `docs/qa/2026-09-05/seo/redirect-matrix-six-locales.md` (generated by `seo/redirect-matrix-six-locales.mjs` from the 180 article files and the active locales) — **224 rows**: 2 unprefixed index/feed, 12 locale index/feed, 30 unprefixed article rows, 180 locale article rows. `docs/redirects-blog-to-tracking-knowledge.md` (generated 2026-09-03 by `apps/web/scripts/redirect-matrix.mjs` when only en/de were active) holds the 96-row subset; regenerating it is defect D8.
- Verification (crawl of the production build, `seo/crawl.json` → `redirectMatrix`): 46 matrix rows fetched (all 6 index/feed rows + a deterministic sample of 40 article rows) and 19 additional checks (fr/es/it/nl index, feed and one article each; `?utm_source=qa&utm_medium=crawl` and `?category=guides` preserved; `/` → `/en`, `/pricing` → `/en/pricing`; the three dashboard legacy paths): **every row answers exactly one 308 whose Location equals the documented target and the target answers 200 — 0 failures, 0 redirect chains**. In the six-locale matrix that is 58 rows verified by fetch and 166 rows covered by a pattern rule that was verified for the same locale group and URL shape; 0 rows unchecked, 0 failed.
- Playwright `marketing.spec.ts` "old blog URLs redirect permanently and directly to Tracking Knowledge, query string included" and "unprefixed URLs redirect permanently to English and keep the query string" (28-test runs, `reports/e2e/e2e-run2.log`, `e2e-run4.log`).
- Link integrity of the new site (crawl): 960 unique internal link/image targets, 0 redirect chains, exactly one link answered via a single redirect (`/contact?topic=enterprise` linked from `/app/billing` → `/en/contact?topic=enterprise`, defect D2c); the 186 "broken image" targets are all the `og:image` URLs of defect D1.

## 5. Pricing and entitlement matrix

`docs/qa/2026-09-05/pricing-matrix.md`, generated by `docs/qa/2026-09-05/pricing-matrix.mjs`, which imports `@track-site/catalog` (`packages/catalog/src/*.ts`) and renders every table from the exported objects and functions: plans and list prices, hard limits, the 42 feature gates × 4 plans (cumulative), overage packs, policies, warning thresholds and grace window, trial, billable-event definition, Stripe price slots with `verifyStripeAmount` examples, deterministic plan-finder and cost-calculator cases, database plan records, label coverage and the test evidence.

| Plan | Monthly | Yearly (= 10 × monthly) | Sites | Events / month | Team | Retention | Overage pack | Recommended / sales |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| Starter | 19 € | 190 € | 1 | 500 000 | 2 | 90 days | 100 000 events for 6 € (opt-in) | — |
| Growth | 90 € | 900 € | 5 | 5 000 000 | 10 | 13 months (396 days) | 1 000 000 events for 18 € (opt-in) | recommended |
| Pro | 180 € | 1 800 € | 25 | 20 000 000 | unlimited (fair use) | 25 months (761 days) | 5 000 000 events for 30 € (opt-in) | — |
| Enterprise | custom | custom | contract | contract | contract | contract | contractual | contact sales |

Overage policies `allow` / `cost_limit` / `pause` (default `pause`, never activated without a choice), warnings at 70 / 90 / 100 %, `pause` grace 20 %; trial: Growth, 14 days, no card, 100 000 accepted events, no auto-conversion, read-only + export after expiry; billable = accepted by ingestion, counted once, fan-out never counts, six non-billable reasons.

Automated evidence (`pricing-matrix.md` §12; results in `docs/qa/2026-09-05/reports/test.txt` and `test-integration.txt`):

| Test | Count | Result |
| --- | ---: | --- |
| `packages/catalog/src/catalog.test.ts` (four plans, binding prices in cents / yearly = 10 × monthly, entitlements per supplement §5, cumulative features with labels in every required locale, strict labels, overage/thresholds/trial, DB records with PRO env names, billable rules, plan finder determinism, cost calculator incl. yearly and contractual overage, Stripe slots + deprecated SCALE fallback, amount verification, label locales) | 20 | passed |
| `apps/web/src/components/marketing/pricing/pricing-helpers.test.ts` (EUR formatting per locale without invented decimals, validated signup links, slider stops incl. every plan limit, deterministic finder mirroring `recommendPlan`, calculator with packs and honest upgrade hint, whole yearly instalments) | 13 | passed |
| `apps/web/src/components/marketing/pricing/plan-selection.test.ts` (pricing → signup hand-over round trip) | 10 | passed |
| `apps/web/src/server/usage.test.ts` (usage guard: thresholds 70/90/100, forecast, hard limit mirroring the worker — `allow` never pauses, `pause` at 120 %, `cost_limit` by pack cost — pack maths, cheaper-upgrade advice, contractual Enterprise) | 18 | passed |
| `apps/web/src/server/usage.integration.test.ts` (DB-backed ledger) | 3 | passed (serial run) |
| Health price verification: `/api/health` → `billingStatus()` resolves all six `STRIPE_PRICE_<PLAN>_<INTERVAL>` slots through `resolvePrice`, which rejects amounts/currencies that differ from the catalogue (`amount_mismatch` / `currency_mismatch`), and checks active / recurring / interval / tax behaviour | live | `reports/health-www-track-site.json` (fetched 2026-09-05T11:29:15Z): `billing: ok`, ok = all six slots, missing = [], failed = [], deprecated = [] → the live Stripe prices equal 19 / 190 / 90 / 900 / 180 / 1 800 € and the `PRO` env names are in use (docs/11 §6 owner actions 1–3 done) |
| Playwright: `/en/pricing` one `h1` and no invented amounts; responsive `/fr/pricing` @320, `/de/pricing` @768, `/nl/pricing` @1024; visual baselines `pricing-375` / `pricing-1440` | 3 + 3 + 2 | passed (`reports/e2e/e2e-run4.log`, `recheck/e2e-new-specs.log`, `reports/e2e/visual-verify-final-*.log`) |

Supplement §11 "Pricing" checklist: exact 19 / 90 / 180 € monthly and 190 / 900 / 1 800 € yearly — catalogue test + live health + `before-after/pricing-en/after-1440-part1.webp`; Starter / Growth / Pro / Enterprise consistent between UI, checkout and entitlements — one catalogue drives `pricing.ts`, `billing.ts` (checkout refuses a mismatching price), `entitlements.ts`, the seed and the worker usage job (`packages/catalog` README block in `docs/11` §3); no "price not published" state — the pricing page renders catalogue prices without a Stripe dependency; plan finder and calculator deterministic — `catalog.test.ts` + `pricing-helpers.test.ts`; tax, billing and cancellation notes localized — `apps/web/src/lib/marketing-copy/pricing/{en,de,fr,es,it,nl}.ts` (`hero.facts`, `tax`, `billedMonthly`), parity 0 gaps.

## 6. Accessibility, Lighthouse and Core Web Vitals

### 6.1 Responsive QA (supplement §10)

Sweep script `apps/web/scripts/qa/responsive-a11y-sweep.mjs` (Playwright Chromium, axe-core 4.13, sharp), production build, 320 / 375 (mobile emulation) / 768 / 1024 / 1440 / 1920 px. Per route × width: `document.scrollWidth` vs `clientWidth`, `visualViewport.scale`, dashboard `main` overflow, elements wider than the viewport outside scroll containers, clipped headings/buttons/links, reachability of the primary action, screenshots ≤ 150 KB.

| Run | Routes × widths | Horizontal page scroll | Dashboard main overflow | Runs with elements wider than the viewport | Clipped headings / buttons | Primary action not reachable | Report |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| S1 on `rCAJOqYs841hSlnLSc99W` | 56 × 6 = 336 (15 public pages en + de, home / pricing in all six locales, 18 dashboard views) | 5 | 7 | 63 | 0 | 57 | `docs/qa/2026-09-05/screenshots/responsive-sweep.md`, `responsive-findings.md` (F1–F10), 633 route screenshots |
| F1 re-check on `UANQbZ2DkEqCtTt7EriZY` | 144 (18 `/app` routes at 320 / 375 / 768, six of them at all widths, home ×6 locales, pricing ×4, article en/de) | **0** | **0** | **0** | **0** | **0** | `docs/qa/2026-09-05/recheck/screenshots/responsive-sweep.md`, `recheck/README.md` §1 |

Root causes fixed by F1 (`recheck/README.md` §1, uncommitted working tree): dashboard shell grid without an explicit column (implicit `auto` track sized to the header's min-content → `grid-cols-[minmax(0,1fr)]`, shrinkable header, drawer entry for the palette below `sm`), `grid-auto-columns: minmax(0,1fr)` for dashboard grids, hero demo switched to container queries and a full-width metric strip, `ScrollRegion` positioned relative with an edge fade (sr-only spans no longer escape the scroller), wrapping CTAs (`/fr` hero, `/fr/pricing` Enterprise panel, overage value), footer link wrapping (`/nl` at 1024), consent-simulator sticky form capped to the viewport. Regression specs: `apps/web/e2e/app.spec.ts` "responsive header" (320 / 375 / 768) and "keyboard focus in the header", `apps/web/e2e/marketing.spec.ts` "responsive layout" (7 locale × width cases) — 12 passed (`recheck/e2e-new-specs.log`).

Not covered: public routes other than home / pricing / article were not re-swept after F1 (their code paths changed only by the footer and font fixes); full-page screenshots are capped at 6 000 px and split, so very long pages (home at 375 px ≈ 15 000 px) are only partly covered visually while the DOM checks cover the whole page; 200 % zoom was not tested as a separate state.

### 6.2 Accessibility (WCAG 2.2 AA)

| Check | S1 (`rCAJOqYs841hSlnLSc99W`) | F1 re-check (`UANQbZ2DkEqCtTt7EriZY`) | Files |
| --- | --- | --- | --- |
| axe-core, tags `wcag2a` + `wcag2aa` + `wcag22aa`, all impacts, widths 375 (touch) and 1440 | 96 runs (public en + de and dashboard): **2 serious nodes** (`scrollable-region-focusable` on the article table wrapper at 375 en/de), 0 critical / moderate / minor; 94 / 96 pages clean | 24 runs: **0 violations of any impact**, 24 / 24 clean | `axe/summary.md`, `axe/<slug>--<width>.json` (96 raw), `recheck/axe/summary.md` + raw JSON |
| Keyboard: 40 × Tab from load on `/en`, `/en/pricing`, `/app` at 1440; focused vs blurred computed styles; crop per stop | `/en` 40 / 40 visible, `/en/pricing` 40 / 40, `/app` 36 / 40 (workspace switcher triggers and account menu: Tailwind v4 `outline-none` cancelled `focus-visible:outline-2`) | **120 / 120 visible**, 0 not matching `:focus-visible` | `axe/keyboard-summary.md`, `axe/keyboard/*.json`, `screenshots/keyboard/<slug>/tab-NN.webp`; `recheck/axe/keyboard-summary.md` |
| Lighthouse accessibility | 100 on all 24 runs | 100 on all 8 runs | §6.3 |
| Playwright axe (`marketing.spec.ts`, home ×6 with `wcag2a`/`wcag2aa`) | 6 / 6 passed | — | `reports/e2e/e2e-run4.log` |
| Skip link, landmarks, one `h1` | skip link is tab stop 1 on every checked page; 496 / 498 crawled pages have exactly one `h1` (`/app/destinations` has two → defect D2a; `/app/onboarding/organization` is a 307) | — | `axe/keyboard-summary.md`, `seo/summary.md` |
| Reduced motion | e2e "prefers-reduced-motion renders the static tier from the server on" and "motion preference off produces no animated frame" passed (run 2 and 4; flaky once, see §7) | — | `reports/e2e/` |

Not verified: the 1 935 `color-contrast` nodes axe reports as "incomplete" (needs review: gradients / overlays) were not checked either way; screen-reader announcements for chat stream, search, filters, tables and status changes were not tested with a screen reader (the chat feed uses a polite live region — e2e "exposes the activity live region"); menu items inside opened popovers were not tabbed through; browsers other than Chromium were not run.

### 6.3 Lighthouse (13.4.1)

Method: `apps/web/scripts/qa/lighthouse.mjs`; mobile = Lighthouse default mobile emulation with simulated throttling (Moto G Power class, 4 × CPU, 150 ms RTT / 1.6 Mbps), desktop = `--preset=desktop`; scores are `categories.*.score × 100`, metrics are `audits.*.numericValue`. S2 ran 3 mobile runs per page (medians reported) and 1 desktop run for `/en` and `/en/pricing`; the F1 re-check ran 1 mobile run per page (± 5 points of noise). Browser: Playwright's `chrome-headless-shell` 151 via `CHROME_PATH` because the full Playwright Chromium cannot start on this machine ("Side-by-Side-Konfiguration ungültig"); a cross-check with the installed Google Chrome 152 gave the same picture (`lighthouse/diagnostics/home-mobile-chrome152-crosscheck.report.json`: performance 59, LCP 5.33 s before the fixes).

| Page (mobile) | Perf before → after | A11y | BP before → after | SEO | LCP before → after | TBT before → after | CLS after | Target check (after) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/en` | 77 → **87** | 100 | 96 → 100 | 100 | 4.73 s → **3.99 s** | 162 → 58 ms | 0.000 | a11y / BP / SEO pass; perf and LCP below target |
| `/de` | 73 → **87** | 100 | 96 → 100 | 100 | 4.93 s → **3.96 s** | 317 → 67 ms | 0.000 | same |
| `/en/pricing` | 75 → **93** | 100 | 96 → 100 | 100 | 4.58 s → **3.09 s** | 310 → 38 ms | 0.029 | same |
| `/en/tracking-knowledge` | 80 → **87** | 100 | 96 → 100 | 100 | 4.61 s → **3.82 s** | 135 → 48 ms | 0.000 | same |
| `/en/tracking-knowledge/consent-mode-v2-guide` | 83 → **94** | 100 | 100 → 100 | 100 | 4.45 s → **3.01 s** | 107 → 33 ms | 0.019 | same |
| `/en/integrations` | 76 → **94** | 100 | 96 → 100 | 100 | 4.53 s → **2.92 s** | 229 → 38 ms | 0.000 | same |
| `/en/login` | 79 → **89** | 100 | 92 → 96 | 63 | 4.74 s → **3.62 s** | 237 → 79 ms | 0.000 | SEO 63 = `is-crawlable` fails because the page is `noindex` by design |
| `/app` (authenticated, stored session) | 72 → **89** | 100 | 100 → 100 | 54 | 4.82 s → **3.77 s** | 397 → 57 ms | 0.000 | SEO 54 = `noindex` + no description by design (dashboard) |
| `/en` desktop (S2 only) | 99 | 100 | 96 | 100 | 836 ms | 35 ms | 0.001 | all pass |
| `/en/pricing` desktop (S2 only) | 99 | 100 | 96 | 100 | 919 ms | 7 ms | 0.000 | all pass |

Sources: `docs/qa/2026-09-05/lighthouse/summary.md` + `summary.json` (24 raw `*.report.json/.html`, `run.log`), `docs/qa/2026-09-05/recheck/lighthouse/summary.md` + raw reports. What F1 changed for performance: fonts (`latin` subset only, Bricolage no longer preloaded — font transfer on `/en` 197 929 → 91 792 B, 4 → 2 requests) and the invalid SVG `height="auto"` that logged a console error per page with a diagram or cover (best practices 96 → 100). What remains and why (`recheck/README.md` §3): 16 hydration script files (217–231 KB gzip) of which 13.6 KB are Next.js's unconditional `@next/polyfill-module` and 22–29 KB React/Next runtime, 94–107 KB HTML documents, one site-wide render-blocking stylesheet (Tailwind v4 emits no per-route CSS), and the comparison matrix rendered twice (desktop table + mobile accordion, 2 251 DOM nodes on pricing) — defect D9.

### 6.4 Core Web Vitals (lab values)

| Metric | Target (mobile) | After F1 (Lighthouse simulated, 1 run per page) | Before (S2 medians) | Status |
| --- | --- | --- | --- | --- |
| LCP | ≤ 2.5 s | 2.92 s (`/en/integrations`) … 3.99 s (`/en`) | 4.45 … 4.93 s | **fail** on every mobile page; desktop 0.84–0.92 s pass |
| INP | ≤ 200 ms | not measurable in a lab run without interactions; TBT proxy 33–79 ms (was 107–397 ms) | — | not run (INP) / proxy pass |
| CLS | ≤ 0.1 | 0.000–0.029 | 0.000–0.001 | pass |

Lantern's simulated LCP is higher than a replication with real CDP throttling on the same pages before the fixes (`lighthouse/diagnostics/lcp-probe.json`: `/en` 2.11 s, `/de` 2.92 s, `/en/integrations` 2.79 s, hub 2.36 s, pricing 1.89 s, article 1.74 s, login 1.40 s); both methods rank the same causes (fonts, document size, hydration). Field data (CrUX) does not exist for a pre-release site; the lab numbers are the release evidence.

### 6.5 Visual regression

`apps/web/e2e/visual.spec.ts` (project `visual` in `playwright.config.ts`, `snapshotPathTemplate` → `apps/web/e2e/__screenshots__/<snapshot>-visual-<platform>.png`): `home`, `pricing`, `knowledge-hub`, `article-consent-mode-v2-guide`, `login` (anonymous) and `app-overview` (stored owner session) at 375 and 1440 px, reduced motion, first 2 500 px, `maxDiffPixelRatio` 0.01, masks for timestamps, "Measured …" lines, progress bars and the persisted Track AI transcript. Baselines generated against the `85fe3b7` production build (`reports/e2e/visual-update-final.log`, 12 passed) and verified four times (`reports/e2e/visual-verify-final-{1,2,3,4}.log`, 12 passed each). The baselines are Windows-only (`-win32`, bundled Chromium of `@playwright/test` 1.62); CI does not run Playwright yet (defect D14). Procedure and update rules: `apps/web/e2e/README.md`.

### 6.6 Living AI Core budget (docs/15 §4)

Measured: Lighthouse on `/app` with the panel docked — accessibility 100, best practices 100, performance 72 → 89, TBT 397 → 57 ms (§6.3); the e2e specs prove the static tier under reduced motion and motion `off` and the viewport-high shell with 250 messages. **Not produced** (defect D10): the comparison "mobile Lighthouse median within 3 points of the static panel", the long-task check while idle, the 30-minute soak for memory/listeners, the qualitative visual comparison and the cross-browser matrix — these need a browser session per configuration and were outside every QA task of 2026-09-05.

## 7. Test and production build output

All outputs under `docs/qa/2026-09-05/reports/` (`run-gates.sh`, `_gates.log` with timestamps; `NO_COLOR=1 CI=1`, turbo `--force` so no cached log is replayed; no server started). Host: Windows 11, Node 24.18.0, pnpm 11.21.0, HEAD `85fe3b7` + working tree.

| Gate | Command | Result | Output |
| --- | --- | --- | --- |
| Typecheck | `pnpm typecheck --force` | **exit 0**, 17 / 17 tasks | `reports/typecheck.txt` |
| Lint | `pnpm lint --force` | **exit 1**: 16 / 17 tasks clean; `@track-site/web` reports 14 errors (`no-console`, `no-empty`, `no-unused-vars`, `no-unused-expressions`), **all in the untracked QA scripts** `apps/web/scripts/qa/{crawl,lighthouse,responsive-a11y-sweep}.mjs` | `reports/lint.txt` |
| Lint without the QA scripts | `pnpm exec eslint . --ignore-pattern "scripts/qa/**"` in `apps/web` | **exit 0** (application, e2e and F1 code lint clean) | `reports/lint-excluding-qa-scripts.txt` |
| Unit tests | `pnpm test --force` | **exit 0**, 15 / 15 tasks, 0 cached; **823 tests passed**: catalog 20, core 35, events 8, policy 17, config 7, analytics 2, connectors 8, queue 4, sdk 12, collector 24, worker 16, ai 170, web 500 (58 files) | `reports/test.txt` |
| Integration tests, parallel | `pnpm test:integration` | **exit 1**: PostgreSQL `deadlock detected` (40P01) inside `packages/db/src/testing/global-setup.ts` when db, worker and web migrate the shared `tracksite_test` database at the same time under turbo's default concurrency; web then reported "No test files found" | `reports/test-integration-run1-parallel.txt` (defect D7) |
| Integration tests, serial | `pnpm test:integration --concurrency=1` | **exit 0**, 7 / 7 tasks; **22 tests passed**: db 8 (RLS, event store), queue 3, analytics 2, worker 6 (pipeline), web 3 (usage ledger); collector 0 (`--passWithNoTests`) | `reports/test-integration.txt` |
| Contract tests | `pnpm test:contract` | **exit 0**, **63 tests in 7 files** against the mock vendors | `reports/test-contract.txt` |
| Production build | `pnpm --filter @track-site/web build` | **exit 0**, Next.js 16.3.4 (Turbopack), compiled in 3.8 s, **715 / 715 static pages** in 18.2 s, `BUILD_ID` `8k-9hBUufCX88fLKrM1Yp`; pre-existing warning `no CONFIG_SIGNING_PUBLIC_KEY set; the built tracker will reject every config` (the SDK build reads the shell environment, not `.env`; see `docs/qa/2026-09-05/README.md`) | `reports/build.txt`; earlier builds of the same tree: `recheck/build.log` (`UANQbZ2DkEqCtTt7EriZY`), P0 logs referenced in `docs/qa/2026-09-05/README.md` |
| SEO gate | `SEO_BASE_URL=http://localhost:3003 pnpm seo:check` (S3) | **exit 1**: 202 problems on 336 pages — 102 × "expected one `<title>`" (the checker counts the accessible `<title>` elements of the inline SVG diagrams: `/en` has 1 document title + 2 SVG titles, `/en/features` 9), 96 × "missing BlogPosting JSON-LD" (reference/tutorial articles carry `TechArticle` by design, `knowledge-article.test.ts`), 4 × description length 171–175 > 170 (fr: `event-taxonomy-standard-events`, `dsar-deletion-tracking-data`, `tcf-2-2-gpp-gpc`; it: `kill-switch-incident-playbook`); no `lang`, canonical, hreflang, h1, robots, sitemap or feed problem | `seo/seo-check.txt` (defects D4, D5) |
| SEO / schema / broken-link crawl | `node apps/web/scripts/qa/crawl.mjs` (S3, production build on :3003) | 498 pages (468 public + 30 dashboard): 497 × 200, 1 × 307; canonical, description and hreflang ×7 on 468 / 468; 912 JSON-LD blocks, 6 with errors (`/docs` `TechArticle` without `datePublished` / `author`, defect D3); 186 broken `og:image` targets (defect D1); 1 page with two `h1` (D2a); 14 titles > 60 characters and 62 article headlines > 110 characters (warnings, D4) | `seo/summary.md`, `seo/crawl.json` |
| Knowledge content | `pnpm --filter @track-site/web knowledge:validate` | **exit 0**: 180 files, 30 groups, six locales, learning paths valid, 0 front-matter changes, 0 `/blog` links | `seo/knowledge-validate.txt` |
| i18n parity | `node apps/web/scripts/i18n-parity.mjs --strict` (S3) | **exit 0**, 0 gaps in every section | `docs/i18n-parity-report.md`, copy in `seo/` |
| e2e (Playwright, chromium project) | `pnpm --filter @track-site/web test:e2e` with `--grep-invert "phase 6\|soak"` (phase 6 close-out, same source tree before F1) | run 2: **28 passed**; run 4: **28 passed**; run 3: 27 passed, 1 failed — "prefers-reduced-motion renders the static tier" found `data-pref="off"` because the motion-preference test had just persisted `off` for the seeded owner (test-order dependency, defect D11); run 1 (35 tests incl. a temporary `phase6-verify.tmp.spec.ts`, since removed): 30 passed, 5 failed in the temporary spec | `reports/e2e/e2e-run{1,2,3,4}.log` (base URL not recorded in the logs; Playwright default `http://localhost:3000`) |
| e2e, new F1 specs | `npx playwright test --project=chromium --no-deps -g "responsive header\|keyboard focus in the header\|responsive layout"` on :3006 | **12 passed** | `recheck/e2e-new-specs.log` |
| Visual regression | `playwright test --project=visual --no-deps` on :3005 | 12 passed × 4 verify runs | `reports/e2e/visual-verify-final-{1..4}.log` |

The full e2e suite was not re-run inside this report task (no server may be started here); the F1 fixes changed only layout/CSS, fonts and the two e2e spec files whose new tests passed on the rebuilt server.

## 8. Open points

Only items that need real external credentials, legal texts to be approved, or third-party decisions (supplement §11, point 8). Everything else is done or listed as a defect with an owner in §9.

| # | Open point | Needed for | Owner | Evidence / where it is read |
| --- | --- | --- | --- | --- |
| O1 | Mail transport and vault on the Fly worker: `RESEND_API_KEY` (or `SMTP_URL`) + `MAIL_FROM` + `HOST_APP`, and the worker `MASTER_KEY` / KMS for encrypted webhook and Slack URLs | Alerts & Incident Mode e-mail / webhook / Slack delivery (`alerts` job); without them the event records `delivery[channel].error` and nothing is sent | owner (Fly secrets) | `docs/07-deployment-runbook.md` §Worker jobs, `apps/worker/src/env.ts`; the web app's own mail works (`/api/health` `mail: resend`, `mailDomain.status: sending_only_key`) |
| O2 | Stripe end-to-end test purchase on the live account (checkout → webhook → entitlement → portal) | proof of the billing loop with real money; the six prices verify (`billing: ok`), the webhook rejects unsigned calls (400) | owner (live Stripe) | `IMPLEMENTATION_STATUS.md` Stripe row, `reports/health-www-track-site.json` |
| O3 | Vendor platform apps: Google Ads developer token + OAuth client, LinkedIn app, Login with Amazon app, X developer app | OAuth "Connect" for those destinations | owner / vendor approval | `IMPLEMENTATION_STATUS.md` external blockers, `docs/05-connector-credential-matrix.md` |
| O4 | Legal review and approval of the imprint / privacy / terms texts and the operator identity (`LEGAL_*`); the live imprint renders an operator identity today (`https://www.track.site/en/imprint` names a Hong Kong Limited company), the wording in six languages has not been approved by counsel | publication of the legal pages as binding texts | owner / legal | `apps/web/src/lib/legal-copy/*`, `docs/07` §Vercel (`LEGAL_*`) |
| O5 | First real test event per destination on real vendor accounts and the shop integrations against one real Shopify, WooCommerce and Shopware installation each | production sign-off of connectors and commerce sources | owner / vendor accounts | `docs/09-integrations-handover.md` §7, `docs/10-commerce-integrations.md` checklist |
| O6 | `CONFIG_SIGNING_PUBLIC_KEY` present in the Vercel build environment | a tracker that verifies signed configs in production (the local builds in this pack embed no key and fail closed) | owner (Vercel env) | `docs/07` §Vercel env list; build warning in `reports/build.txt` |

Done since docs/11 §6 was written (no longer open): the three Stripe owner actions — yearly prices 190 / 900 / 1 800 €, product/plan name Pro and `STRIPE_PRICE_PRO_*` env names — are live (`billing: ok`, `deprecated: []`); the OpenAI key is set (`ai: ok`, three models available).

## 9. Defects and owed evidence (with owner)

| # | Defect | Severity | Owner | Evidence | Fix hint |
| --- | --- | --- | --- | --- | --- |
| D1 | `og:image` / `twitter:image` of the Tracking Knowledge hub and of all 180 articles answer **404**: the pages build the URL `…/opengraph-image` (`tracking-knowledge/page.tsx` line 23, `[slug]/page.tsx` line 40) while Next.js emits the metadata routes under dynamic segments with a hash suffix (`opengraph-image-1vcy9h`, `opengraph-image-qnehfz`); verified on the production build: `/en/tracking-knowledge/consent-mode-v2-guide/opengraph-image` → 404, `…/opengraph-image-qnehfz` → 200 `image/png`; `/en/opengraph-image` (static segment) → 200 | **critical** (§11 "Social Card" per language version fails; 186 broken targets in the crawl) | web / marketing | `seo/summary.md` "Broken links and images", `seo/crawl.json` | fixed 2026-09-05: the renderers became plain modules (`card.tsx`) served by stable route handlers `card.png/route.tsx` with `generateStaticParams`; page metadata and JSON-LD reference `…/tracking-knowledge[/<slug>]/card.png` (200 image/png, localized alt); e2e and the SEO checker follow |
| D2a | `/app/destinations` renders two `h1` elements | moderate | dashboard | `seo/summary.md` dashboard table | fixed 2026-09-05: the second `h1` came from the streaming skeleton `apps/web/src/app/app/destinations/loading.tsx` (visible in the raw HTML next to the streamed page); the skeleton now renders a presentational `<p>` |
| D2b | `/app/billing` links to the unprefixed `/contact?topic=enterprise` (one redirect hop) | minor | dashboard | `seo/summary.md` "Links answered via exactly one redirect" | fixed 2026-09-05: `/app/billing` links to `/<locale>/contact?topic=enterprise` via `useLocale()` |
| D3 | `/[locale]/docs` `TechArticle` JSON-LD lacks `datePublished` and `author` (6 blocks) | minor | marketing | `seo/summary.md` "Schema errors" | add the fields or use `WebPage` |
| D4 | Content limits: 4 fr/it article descriptions are 171–175 characters (checker limit 170), 14 titles > 60 characters, 62 article headlines > 110 characters (Google truncates) | minor | content / localization | `seo/seo-check.txt`, `seo/summary.md` "Titles longer than 60 characters", "Schema warnings" | shorten in the front matter |
| D5 | `apps/web/scripts/seo-check.ts` is stale for the redesign: counts SVG `<title>` elements as document titles and requires `BlogPosting` although reference/tutorial articles carry `TechArticle` → `pnpm seo:check` fails with 198 false positives | major (gate) | web QA tooling | `seo/seo-check.txt` | fixed 2026-09-05: decoded-length checks, `<head>`-scoped title count, BlogPosting or TechArticle, `card.png` rule — `pnpm seo:check` exit 0 (`reports/final/seo-check-after-d1-d5.txt`) |
| D6 | ~~`apps/web/scripts/qa/{crawl,lighthouse,responsive-a11y-sweep}.mjs` (untracked) fail `eslint` (14 errors) → `pnpm lint` fails~~ **fixed in the final verification (§11)**: progress lines go through a local `stdout()` helper (`process.stdout.write`, as in `scripts/i18n-parity.mjs`), the empty `catch` carries a comment, the comma expression became two statements, the unused `here` / `lhr` bindings were removed or prefixed | closed | web QA tooling | `reports/final/lint.txt` (exit 0), `reports/final/lint-before-fix.txt` | — |
| D7 | `pnpm test:integration` deadlocks when db, worker and web run their `global-setup.ts` migration of `tracksite_test` concurrently | major (gate; CI runs the same command) | platform / db | `reports/test-integration-run1-parallel.txt` | fixed 2026-09-05: root script runs `turbo run test:integration --concurrency=1` |
| D8 | `docs/redirects-blog-to-tracking-knowledge.md` still lists 2 active locales (generated 2026-09-03); the six-locale matrix lives in the evidence pack | minor (docs) | web | §4 | fixed 2026-09-05: matrix regenerated for six locales (224 rows) |
| D9 | Mobile performance 87–94 and LCP 2.92–3.99 s remain below the targets (≈ 95, ≤ 2.5 s) | major (target) | web performance | §6.3, §6.4, `recheck/README.md` §3 | reduce hydration JS on marketing pages (server components for static sections, defer the demo bundle), single responsive rendering of the comparison matrix, smaller HTML; polyfill and runtime bytes belong to Next.js |
| D10 | Living AI Core budget evidence of docs/15 §4 (static-panel comparison, idle long-task check, 30-minute soak, cross-browser matrix) not produced; no Firefox / WebKit run anywhere in the pack | moderate (owed evidence) | QA | §6.6 | dedicated browser session per configuration |
| D11 | e2e test-order dependency: the reduced-motion spec reads the seeded owner's persisted `ai_motion` preference, which another spec sets to `off` | minor (flaky) | web | `reports/e2e/e2e-run3.log` | reset the preference in the spec or use a dedicated user |
| D12 | `updateLocaleAction(locale: "en" \| "de")` in `apps/web/src/server/actions/settings.ts` keeps the two-locale signature; it is unused (the settings action validates `z.enum(ALL_LOCALES)`) | trivial (cleanup) | web | grep in this report | delete or retype |
| D13 | The F1 fixes and the QA tooling are **uncommitted** (35 modified files, 5 untracked paths) — the evidence in `recheck/` and `reports/` was produced from that working tree | blocking for release | integrator | `changed-files.md` §3 | fixed 2026-09-05: committed on `feat/ai-tag-manager-platform`, deployed from `main` |
| D14 | Visual baselines are `-win32` only and CI (`ci.yml`, ubuntu) runs no Playwright project; a Linux run writes its own baselines and fails once | minor (CI) | CI | `apps/web/e2e/README.md` | add a Playwright job with Linux baselines |
| D15 | axe "incomplete" `color-contrast` nodes (1 935 across 96 runs) unverified | minor (owed check) | QA / design | `axe/summary.md` | manual contrast review of gradient/overlay surfaces |
| D16 | The mobile on-screen keyboard vs composer check (§11 "mobile Bildschirmtastatur verdeckt den Composer nicht") and the route-change persistence of chat/job state were not tested end-to-end in this pack (the shell is `100dvh` with the composer in the sheet; the store persists server-side) | moderate (owed evidence) | QA | — | device-lab or emulated virtual-keyboard test; e2e that navigates mid-turn |

## 10. Definition of done (supplement §11) — status per item

| Item | Status | Evidence |
| --- | --- | --- |
| `Track` is the visible brand, `track.site` only as domain | pass | `apps/web/src/lib/brand-guard.test.ts` (in `pnpm test`), crawl titles "· Track", `Organization` JSON-LD name "Track", before/after screenshots |
| Header, mobile navigation, footer, CTA and forms work in all six languages | pass (layout, navigation, CTA); forms: contact/demo/support action accepts every locale (`IMPLEMENTATION_STATUS.md` localization row), submission not e2e-tested | sweep home/pricing ×6 at 6 widths, e2e home ×6 + switcher, `recheck/README.md` #4–#6 |
| Hero demo reacts to keyboard, touch and mouse and changes state | partial: keyboard tab stops on `/en` include the demo controls with visible focus (40 / 40); touch/mouse interaction not scripted | `axe/keyboard-summary.md`, `before-after/home-*` (different stream steps captured) |
| No demo action sends real events or productive requests | by design (local fixtures, `docs/12` §5); not separately measured with a network log | — |
| No invented testimonials, logos, numbers, results | pass: no `Review`/`AggregateRating` in 912 JSON-LD blocks; the recommended plan is "Recommended", not "most popular" (`catalog.test.ts`) | `seo/summary.md` |
| No nested link/button markup | pass: axe `nested-interactive` (wcag2a) clean in 120 runs | `axe/*.json` |
| Pricing: exact amounts, plan consistency, no "price not published", deterministic finder/calculator, honest localized notes | pass | §5 |
| "Blog" fully replaced by "Tracking Knowledge" in the visible product | pass: no `/blog/` in sitemaps/feeds, 0 internal `/blog` links, routes removed, header/footer show "Tracking Knowledge" (screenshots) | §4, `seo/knowledge-validate.txt` |
| All old blog URLs have direct correct 301 targets | pass (308 permanent, no chains) | §4 |
| ≥ 30 topics × EN/DE/FR/ES/IT/NL published | pass (30 × 6, all `published`) | §3 |
| Every language version: content, slug, metadata, canonical, hreflang, social card, schema | **fail on social cards** (D1); the rest passes | §3, D1 |
| No mixed languages / English fallback on localized pages | pass structurally (strict parity, `pick()` throws); not measured by a classifier | §3 |
| `<html lang>` matches the language on every route | pass (336 gate pages, e2e ×6) | `seo/seo-check.txt`, e2e |
| Language switch stays on the same page/article | pass | e2e "language switcher leads to the same page" |
| Search, filters, TOC, related articles, social cards work | partial: TOC / template / feedback covered by the article e2e; hub search and filters have no automated test in this pack; social cards fail (D1) | e2e run logs, D1 |
| Machine-readable parity report per `translationGroupId` | pass | `docs/i18n-parity-report.json`, validator (30 groups) |
| ≥ 200 chat messages: app stays exactly viewport-high, only the transcript scrolls | pass (250 messages) | e2e "keeps the shell exactly viewport-high with a 250-message conversation" |
| Chat and composer reachable on desktop, tablet, mobile | pass after F1 (primary action reachable in 144 / 144 runs; mobile bottom sheet e2e) | §6.1, e2e |
| Mobile on-screen keyboard does not cover the composer | not run (D16) | — |
| Chat and job state survive route changes | not tested end-to-end (D16); store persisted server-side | — |
| No reasoning, prompts, secrets, raw PII or unredacted tool data in DOM/stream/transcript/log | by contract: allow-listed UI events with redaction (`packages/ai/src/ui-events.ts`, 170 ai tests); no runtime DOM audit in this pack | `reports/test.txt` |
| Every activity message equals a real job state | by contract (sentence keys bound to real run ids; `job.progress` only with real stage names) | `docs/11` §5 phase 6 |
| Off-topic / prompt-injection eval ≥ 50 variants without an unauthorised tool call | pass: 63-variant eval in `packages/ai` (commit `83a9c9e`), part of the 170 ai tests | `reports/test.txt` |
| Mutations without a valid action-bound approval token impossible | by design and unit-tested (`packages/ai`, confirm route); not re-verified live here | `docs/08-ai-and-secrets.md` |
| Cross-tenant, role, reconnect, timeout, double-click, replay tests green | partial: RLS integration tests (db 8), reconnectable turns without duplicate execution (`TurnRegistry` tests), webhook replay/signature tests; no dedicated e2e matrix in this pack | `reports/test-integration.txt`, `reports/test.txt` |
| All new dashboard modules show real states or honest empty states | pass: 30 dashboard URLs render (200, one `h1` except D2a) with the seeded data; worker-fed pages show "not measured" until the jobs ran | `seo/summary.md` dashboard table, `before-after/app-*` |
| Final evidence: lint, typecheck, unit, integration, e2e, a11y, SEO, schema, broken-link, visual regression, production build | see §7 and §11 — lint passes after the D6 fix; the SEO gate still fails for tooling reasons (D5), integration passes serially (D7), the rest passes | §7, §11 |

## 11. Final verification of phase 7 (2026-09-05, after the F1 fixes)

One closing run of every gate on the working tree described in §1 (HEAD `85fe3b7` + F1 fixes + QA tooling), production build served on port 3007 with `AI_DEV_FIXTURES=1` and `HOST_MARKETING` / `HOST_APP` pointed at that port (better-auth only trusts the configured origin, so the Playwright `setup` sign-in would otherwise be rejected on any port but 3000). Outputs under `docs/qa/2026-09-05/reports/final/`.

| Gate | Command | Result | Output |
| --- | --- | --- | --- |
| Typecheck | `pnpm typecheck` | **exit 0**, 17 / 17 tasks (15 replayed from the turbo cache, `web` and `collector` executed) | `reports/final/typecheck.txt` |
| Lint, first run | `pnpm lint` | **exit 1**: the 14 errors of D6 in `apps/web/scripts/qa/{crawl,lighthouse,responsive-a11y-sweep}.mjs` | `reports/final/lint-before-fix.txt` |
| Lint, after the in-place fix | `pnpm lint` | **exit 0**, 17 / 17 tasks; `node --check` on the three scripts passes | `reports/final/lint.txt` |
| Unit tests | `pnpm test` | **exit 0**, 15 / 15 tasks, **823 tests passed** (web 500 in 58 files executed; the 14 package tasks replayed from the turbo cache with their counts: catalog 20, core 35, events 8, policy 17, config 7, analytics 2, connectors 8, queue 4, sdk 12, collector 24, worker 16, ai 170) | `reports/final/test.txt` |
| Production build | `pnpm --filter @track-site/web build` | **exit 0**, compiled in 4.1 s, **715 / 715 static pages** in 17.0 s, `BUILD_ID` `WYwzaImZB_f2TD_I3NFt-`; the known `CONFIG_SIGNING_PUBLIC_KEY` warning (O6) | `reports/final/build.txt` |
| e2e, full suite (setup + chromium + visual), run 1 | `E2E_BASE_URL=http://localhost:3007 pnpm --filter @track-site/web test:e2e` | 52 tests: **48 passed, 4 failed** — (a) `marketing.spec.ts` "Tracking Knowledge index …" fetched the JSON-LD publisher logo by its absolute URL, which carries the build-time `HOST_MARKETING` origin `http://localhost:3000` (`ECONNREFUSED`, not a product defect); (b) visual `home-375`, `home-1440`, `app-overview-375` differed from the baselines of 11:47–11:57, which predate the F1 fixes (font subset / size-adjusted fallback shifts the hero and the sections below it by a few pixels, the hero demo lays out by container query, the dashboard header budget at 375 px) — ratios 0.05 / 0.05 / >0.01 | `reports/final/e2e-run1-before-baseline-update.log` |
| Fixes | spec + baselines | (a) the spec now requests the logo by pathname from the server under test (`apps/web/e2e/marketing.spec.ts`); (b) the three baselines were regenerated **once** with `playwright test --project=visual --update-snapshots` after reviewing the diff images (`apps/web/e2e/__screenshots__/{home-375,home-1440,app-overview-375}-visual-win32.png`, the other nine files unchanged) | `reports/final/visual-update-snapshots.log` |
| e2e, full suite, run 2 | same command | **exit 0, 52 / 52 passed** (1 setup, 39 chromium incl. axe on the six home pages and the article template, 12 visual) | `reports/final/e2e-run2.log` |
| Visual regression, second consecutive pass | `playwright test --project=visual` | **13 / 13 passed** (setup + 12 snapshots) | `reports/final/visual-verify-run3.log` |
| Temporary specs | `ls apps/web/e2e/*.tmp.spec.ts` | none present | — |
| Evidence pack completeness | `ls docs/qa/2026-09-05` | `README.md`, `screenshots/` (61 route directories), `axe/` (96 JSON + keyboard + summaries), `lighthouse/` (24 reports + summary + diagnostics), `seo/`, `before-after/` (25 pages), `reports/` (incl. `e2e/` and `final/`), `pricing-matrix.md` (+ generator), `changed-files.md` (+ generator), `recheck/`; 1 722 WebP files, none above 150 KB (`find -name '*.webp' -size +150k` → 0) | this section |
| Links in this report | `node docs/qa/2026-09-05/reports/final/check-links.mjs . docs/16-release-report.md` | **72 unique file references, 0 missing** (exact paths, globs, numbered-document shorthands such as `docs/11`, and paths quoted relative to `apps/web`; counts in the output file) | `reports/final/check-links.txt` |
| Size of the evidence pack | `du -sb docs/qa/2026-09-05` | see `reports/final/check-links.txt` (last line) | — |

Not repeated here (unchanged since §7, no code affected by the D6 fix): integration and contract tests, the SEO gate (D5), Lighthouse (§6.3). Open after this run: D1 (social cards of the knowledge pages), D5, D7 and the owed evidence D10, D15, D16; D13 now also covers the regenerated baselines, the spec change and the QA-script fixes.
