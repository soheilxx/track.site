# Changed files and routes — Track redesign programme

Generated 2026-09-05T11:37:19.636Z by `docs/qa/2026-09-05/changed-files.mjs`. Base: `0f0f5b5` (0f0f5b51f909a2c0eb657c9623dc7409f09f58b7; "docs: design system reference for the Track redesign", the last commit before the phase 1–6 implementation commits). Head: `85fe3b7`. 23 commits in between (`git log --oneline 0f0f5b5..HEAD`).

Command: `git diff --stat 0f0f5b5..HEAD` → **1,008 files changed, 117,827 insertions(+), 6,616 deletions(−)** (added 772, modified 139, deleted 31, renamed 66; renames detected with `-M`). Uncommitted working tree on top of HEAD (task F1 fixes and QA tooling, not yet committed at the time of this report): 40 paths (`git status --porcelain`), of which 35 modified tracked files with 344 insertions / 103 deletions (`git diff --numstat`), listed in section 3.

## 1. Summary by area (committed, `0f0f5b5..HEAD`)

| Area | Files | A | M | D | R | + lines | − lines |
| --- | --- | --- | --- | --- | --- | --- | --- |
| web · Tracking Knowledge articles + learning paths ×6 | 186 | 126 | 0 | 0 | 60 | 10,688 | 132 |
| web · UI message catalogs ×6 | 100 | 92 | 8 | 0 | 0 | 27,644 | 78 |
| web · marketing copy modules ×6 | 93 | 93 | 0 | 0 | 0 | 13,084 | 0 |
| web · dashboard modules (components) | 90 | 84 | 3 | 2 | 1 | 10,830 | 301 |
| web · public routes (marketing, knowledge, auth, metadata) under `/[locale]` | 57 | 26 | 8 | 18 | 5 | 2,183 | 1,445 |
| web · server (data access, actions, auth, billing, entitlements) | 57 | 44 | 12 | 1 | 0 | 13,022 | 159 |
| web · marketing components (header, footer, home, features, integrations, auth shell) | 47 | 39 | 8 | 0 | 0 | 4,426 | 282 |
| web · dashboard routes `/app/**` | 44 | 27 | 15 | 2 | 0 | 2,997 | 852 |
| web · dashboard shell (viewport-fixed layout, Track AI panel, Living AI Core, palette) | 28 | 28 | 0 | 0 | 0 | 3,885 | 0 |
| packages/db (schema, migrations 0004–0013, repositories, seed) | 28 | 15 | 13 | 0 | 0 | 2,026 | 93 |
| packages/ui (design system tokens, primitives, brand) | 24 | 19 | 4 | 1 | 0 | 2,261 | 184 |
| web · Track AI chat (store, reducer, virtual list, workspace moves) | 23 | 18 | 5 | 0 | 0 | 2,663 | 314 |
| web · Tracking Knowledge components | 21 | 21 | 0 | 0 | 0 | 2,236 | 0 |
| packages/ai (UI event contract, scope gate, evals) | 20 | 10 | 10 | 0 | 0 | 2,028 | 37 |
| web · interactive hero demo | 19 | 19 | 0 | 0 | 0 | 1,667 | 0 |
| web · lib (knowledge loader, routes, seo, format, brand guard) | 18 | 10 | 5 | 3 | 0 | 3,263 | 550 |
| web · pricing components | 17 | 17 | 0 | 0 | 0 | 1,567 | 0 |
| worker | 16 | 8 | 8 | 0 | 0 | 3,248 | 47 |
| web · other components | 15 | 8 | 6 | 1 | 0 | 523 | 140 |
| web · API routes | 13 | 9 | 4 | 0 | 0 | 687 | 34 |
| packages/catalog (tariff catalogue, new) | 13 | 13 | 0 | 0 | 0 | 1,120 | 0 |
| web · root app files (layout, fonts, globals, icons, manifest, robots, sitemaps) | 12 | 6 | 3 | 3 | 0 | 536 | 94 |
| docs | 12 | 7 | 5 | 0 | 0 | 1,697 | 17 |
| web · legal copy ×6 | 8 | 8 | 0 | 0 | 0 | 472 | 0 |
| web · mail templates ×6 | 8 | 8 | 0 | 0 | 0 | 215 | 0 |
| root (workspace, lockfile, env example, status, gitignore, scripts) | 6 | 0 | 6 | 0 | 0 | 581 | 1,756 |
| web · public assets (brand) | 6 | 6 | 0 | 0 | 0 | 54 | 0 |
| web · scripts (parity, redirects, knowledge tooling, QA) | 6 | 5 | 1 | 0 | 0 | 1,156 | 41 |
| web · i18n routing and namespaces | 5 | 3 | 2 | 0 | 0 | 304 | 11 |
| web · e2e (Playwright specs, visual baselines) | 4 | 2 | 2 | 0 | 0 | 544 | 29 |
| web · config (next.config, playwright, package, vitest, tsconfig) | 4 | 0 | 4 | 0 | 0 | 88 | 6 |
| web · other src | 3 | 1 | 2 | 0 | 0 | 123 | 7 |
| collector | 2 | 0 | 2 | 0 | 0 | 4 | 4 |
| CI | 1 | 0 | 1 | 0 | 0 | 2 | 0 |
| web · destination wizard | 1 | 0 | 1 | 0 | 0 | 2 | 2 |
| packages · other | 1 | 0 | 1 | 0 | 0 | 1 | 1 |

## 2. Commits

- `85fe3b7` web: destinations wizard takes the published version from the review instead of parsing localized text
- `41a0287` web: Track AI — localized activity feed from real tool runs, Living AI Core (SSR gradient → CSS → WebGL2 metaballs) with state machine, motion preference control, onboarding-to-docked transitions, virtualised transcript, dev fixture for e2e
- `83a9c9e` ai: allow-listed UI event contract with redaction filter, scope gate with six-language intent lexicons and tool narrowing, reconnectable turns without duplicate execution, one-question clamp; 63-variant injection eval
- `cb1f070` web: Alerts & Incident Mode — channels, rules with plain-language previews, history, destination pause and environment kill switch with confirmations and audit; per-user AI motion preference
- `cc8b308` platform: alerts data model (channels, rules, events; migration 0013), worker alerts job with e-mail, signed webhook and Slack delivery, derived kill-switch versions; accessible names for Checkbox/Radio
- `4436418` docs: phase 5 state, runbook worker jobs and migrations
- `1125aef` web: Tracking Command Center — viewport-fixed shell with persistent Track AI panel, workspace switcher, environment indicator, command palette; modules Command Center, Events (matrix, explorer, test lab), Destination Health, Data Quality + revenue leaks, Consent + simulator, Insights/attribution, Releases + impact preview, Usage & Cost Guard, Team & Access; six-locale namespaces per module
- `39c6dbe` platform: dashboard data model — workspace preferences, event lineage + test-lab runs, destination health snapshots, revenue reconciliation, release approvals + scheduled publications, team policies; worker jobs registered
- `a3d8322` docs: phases 1–4 live on www.track.site
- `e769925` deploy: drop embedded-postgres from the workspace (its build scripts fail the Vercel install); the local launcher uses a git-ignored tools folder instead
- `126b5cf` web: import the locale list in the settings action
- `b1176c3` web: dashboard language setting accepts all six locales
- `66f60b8` web: six active locales — per-locale copy modules (marketing, legal, mail, knowledge labels, catalogue labels), Intl formatting, parity script and report, SEO for six locales, e2e across locales
- `8863184` web: UI message catalogs for fr, es, it and nl (marketing chrome, auth, dashboard, assistant, destinations)
- `f0b29cd` content: Tracking Knowledge in French, Spanish, Italian and Dutch — 30 articles per language, learning paths, reviewed and published
- `51b7492` web: consolidate the marketing redesign — (marketing)/(auth) route groups, unified copy types and barrel, merged section scaffolding, pricing→signup plan hand-over, vitest JSX + render smoke tests, backup-code validation
- `acd28d2` web: Tracking Knowledge hub with locale-aware fuzzy search, learning paths and cover family; article template with TOC, progress, takeaways, callouts, related articles, feedback API (migration 0005) and print view
- `4f8620d` web: marketing redesign — navigation shell, home with interactive product demo, features and how-it-works, integrations explorer, catalogue-driven pricing with plan finder and calculator, focused auth shell, secondary pages
- `5bb4e02` ui: Track design system — tokens, motion, split primitives with full state coverage, diagram primitives; typed marketing copy modules per area
- `fc8a1dc` web: stored language choice steers unprefixed URLs, dedicated price-mismatch checkout error, Track as mail sender; local Postgres launcher resolves the 18.4 platform package
- `0e2b7a0` brand: visible product name Track with an original mark, icons, social lockups and a guard test
- `764d5dd` web: six-locale routing with /en prefix, correct lang/hreflang, sitemap index; Blog → Tracking Knowledge
- `7092548` billing: central tariff catalogue (@track-site/catalog), plan scale→pro, 70/90/100 usage thresholds

## 3. Uncommitted working tree (on top of HEAD)

| Status | File | + | − |
| --- | --- | --- | --- |
| ?? (untracked directory) | `apps/web/e2e/__screenshots__/ (12 untracked files)` |  |  |
| M | `apps/web/e2e/app.spec.ts` | 75 |  |
| M | `apps/web/e2e/marketing.spec.ts` | 57 |  |
| ?? (untracked) | `apps/web/e2e/README.md` |  |  |
| ?? (untracked) | `apps/web/e2e/visual.spec.ts` |  |  |
| M | `apps/web/playwright.config.ts` | 9 | 1 |
| ?? (untracked directory) | `apps/web/scripts/qa/ (3 untracked files)` |  |  |
| M | `apps/web/src/app/app/consent/simulator/page.tsx` | 3 | 1 |
| M | `apps/web/src/app/fonts.ts` | 11 | 2 |
| M | `apps/web/src/app/globals.css` | 13 |  |
| M | `apps/web/src/components/app/alerts/incident-mode.tsx` | 2 | 2 |
| M | `apps/web/src/components/app/consent/simulation-results.tsx` | 5 | 3 |
| M | `apps/web/src/components/app/shell/app-shell.tsx` | 29 | 8 |
| M | `apps/web/src/components/app/shell/assistant-host.tsx` | 1 | 1 |
| M | `apps/web/src/components/app/shell/command-palette.tsx` | 1 | 1 |
| M | `apps/web/src/components/app/shell/menu.tsx` | 6 | 3 |
| M | `apps/web/src/components/app/shell/user-menu.tsx` | 1 | 1 |
| M | `apps/web/src/components/app/shell/workspace-switcher.tsx` | 7 | 6 |
| M | `apps/web/src/components/marketing/demo/demo-frame.tsx` | 14 | 9 |
| M | `apps/web/src/components/marketing/demo/parts.tsx` | 4 | 3 |
| M | `apps/web/src/components/marketing/demo/views/ai-setup.tsx` | 1 | 1 |
| M | `apps/web/src/components/marketing/demo/views/destinations.tsx` | 5 | 5 |
| M | `apps/web/src/components/marketing/demo/views/live-events.tsx` | 4 | 4 |
| M | `apps/web/src/components/marketing/demo/views/overview.tsx` | 33 | 28 |
| M | `apps/web/src/components/marketing/domain-start-form.tsx` | 3 | 1 |
| M | `apps/web/src/components/marketing/footer.tsx` | 4 | 3 |
| M | `apps/web/src/components/marketing/knowledge/article/mdx-components.tsx` | 5 | 3 |
| M | `apps/web/src/components/marketing/knowledge/cover.tsx` |  | 1 |
| M | `apps/web/src/components/marketing/pricing/comparison-matrix.tsx` | 3 | 2 |
| M | `apps/web/src/components/marketing/pricing/enterprise-panel.tsx` | 4 | 3 |
| M | `apps/web/src/lib/marketing-copy/knowledge-article/de.ts` | 1 |  |
| M | `apps/web/src/lib/marketing-copy/knowledge-article/en.ts` | 1 |  |
| M | `apps/web/src/lib/marketing-copy/knowledge-article/es.ts` | 1 |  |
| M | `apps/web/src/lib/marketing-copy/knowledge-article/fr.ts` | 1 |  |
| M | `apps/web/src/lib/marketing-copy/knowledge-article/it.ts` | 1 |  |
| M | `apps/web/src/lib/marketing-copy/knowledge-article/nl.ts` | 1 |  |
| M | `apps/web/src/lib/marketing-copy/types.ts` | 2 |  |
| ?? (untracked directory) | `docs/qa/ (1986 untracked files)` |  |  |
| M | `packages/ui/src/diagram.tsx` |  | 1 |
| M | `packages/ui/src/primitives/scroll-region.tsx` | 36 | 10 |

## 4. Routes

Source: `apps/web/.next/app-path-routes-manifest.json` of the BEFORE build (worktree `C:/Users/Soheil/Downloads/track-site-before` at `0f0f5b5`, BUILD_ID `sb9bxPyxbPMYA9tK0DYEV`, 64 routes) and of the AFTER build (BUILD_ID `8k-9hBUufCX88fLKrM1Yp`, 86 routes). Route groups `(marketing)` / `(auth)` are Next.js folder groups without a URL segment; `[locale]` ∈ {en, de, fr, es, it, nl} (`localePrefix: "always"`, `/` → 301 `/en`). Removed: 5, added: 27, unchanged: 59.

Prerendered (static) routes in the AFTER build: 661 (other: 19, de: 107, en: 107, es: 107, fr: 107, it: 107, nl: 107) + 22 dynamic route patterns (`prerender-manifest.json`).

### 4.1 Public routes (×6 locales)

| URL pattern | Route (manifest) | Change vs before |
| --- | --- | --- |
| `/[locale]` | `/[locale]` | redesigned (same URL, route group) |
| `/[locale]/accept-invitation/[id]` | `/[locale]/accept-invitation/[id]` | redesigned (same URL, route group) |
| `/[locale]/contact` | `/[locale]/contact` | redesigned (same URL, route group) |
| `/[locale]/data-processing` | `/[locale]/data-processing` | redesigned (same URL, route group) |
| `/[locale]/demo` | `/[locale]/demo` | redesigned (same URL, route group) |
| `/[locale]/docs` | `/[locale]/docs` | redesigned (same URL, route group) |
| `/[locale]/features` | `/[locale]/features` | redesigned (same URL, route group) |
| `/[locale]/features/[slug]` | `/[locale]/features/[slug]` | redesigned (same URL, route group) |
| `/[locale]/forgot-password` | `/[locale]/forgot-password` | redesigned (same URL, route group) |
| `/[locale]/how-it-works` | `/[locale]/how-it-works` | redesigned (same URL, route group) |
| `/[locale]/imprint` | `/[locale]/imprint` | redesigned (same URL, route group) |
| `/[locale]/integrations` | `/[locale]/integrations` | redesigned (same URL, route group) |
| `/[locale]/integrations/[slug]` | `/[locale]/integrations/[slug]` | redesigned (same URL, route group) |
| `/[locale]/login` | `/[locale]/login` | redesigned (same URL, route group) |
| `/[locale]/opengraph-image` | `/[locale]/opengraph-image` | new |
| `/[locale]/pricing` | `/[locale]/pricing` | redesigned (same URL, route group) |
| `/[locale]/privacy` | `/[locale]/privacy` | redesigned (same URL, route group) |
| `/[locale]/reset-password` | `/[locale]/reset-password` | redesigned (same URL, route group) |
| `/[locale]/security` | `/[locale]/security` | redesigned (same URL, route group) |
| `/[locale]/signup` | `/[locale]/signup` | redesigned (same URL, route group) |
| `/[locale]/status` | `/[locale]/status` | redesigned (same URL, route group) |
| `/[locale]/subprocessors` | `/[locale]/subprocessors` | redesigned (same URL, route group) |
| `/[locale]/support` | `/[locale]/support` | redesigned (same URL, route group) |
| `/[locale]/terms` | `/[locale]/terms` | redesigned (same URL, route group) |
| `/[locale]/tracking-knowledge` | `/[locale]/tracking-knowledge` | renamed from `/[locale]/blog` |
| `/[locale]/tracking-knowledge/[slug]` | `/[locale]/tracking-knowledge/[slug]` | renamed from `/[locale]/blog/[slug]` |
| `/[locale]/tracking-knowledge/[slug]/opengraph-image-qnehfz` | `/[locale]/tracking-knowledge/[slug]/opengraph-image-qnehfz` | new |
| `/[locale]/tracking-knowledge/feed.xml` | `/[locale]/tracking-knowledge/feed.xml` | renamed from `/[locale]/blog/feed.xml` |
| `/[locale]/tracking-knowledge/opengraph-image-1vcy9h` | `/[locale]/tracking-knowledge/opengraph-image-1vcy9h` | new |
| `/[locale]/two-factor` | `/[locale]/two-factor` | redesigned (same URL, route group) |
| `/[locale]/verify-email` | `/[locale]/verify-email` | redesigned (same URL, route group) |

Removed public routes: none. Blog routes (`/[locale]/blog`, `/[locale]/blog/[slug]`, `/[locale]/blog/feed.xml`) are answered by permanent redirects only (see the redirect matrix).

### 4.2 Dashboard routes

| URL | Change vs before |
| --- | --- |
| `/app` | kept |
| `/app/ai-setup` | new |
| `/app/audiences` | removed (308 → new module, see `next.config.ts`) |
| `/app/billing` | kept |
| `/app/billing/usage` | new |
| `/app/consent` | kept |
| `/app/consent/simulator` | new |
| `/app/data-quality` | kept |
| `/app/data-quality/revenue-leaks` | new |
| `/app/debugger` | removed (308 → new module, see `next.config.ts`) |
| `/app/destinations` | kept |
| `/app/events` | kept |
| `/app/events/explorer` | new |
| `/app/events/matrix` | new |
| `/app/events/test-lab` | new |
| `/app/insights` | new |
| `/app/insights/attribution` | new |
| `/app/insights/audiences` | new |
| `/app/oauth/[provider]/start` | kept |
| `/app/onboarding` | kept |
| `/app/onboarding/organization` | kept |
| `/app/releases` | new |
| `/app/releases/[versionId]` | new |
| `/app/settings` | kept |
| `/app/settings/alerts` | new |
| `/app/sites` | kept |
| `/app/sites/[siteId]` | kept |
| `/app/sites/[siteId]/destinations` | kept |
| `/app/sites/[siteId]/destinations/[integrationId]` | kept |
| `/app/sites/[siteId]/destinations/new` | kept |
| `/app/sites/[siteId]/setup` | kept |
| `/app/sites/[siteId]/shop` | kept |
| `/app/team` | kept |
| `/app/team/audit` | new |
| `/apple-icon.png` | new |

### 4.3 API, metadata and other routes

| Route | Change vs before |
| --- | --- |
| `/_global-error` | kept |
| `/_not-found` | kept |
| `/api/ai/chat` | kept |
| `/api/ai/confirm` | kept |
| `/api/ai/credential` | kept |
| `/api/ai/dev-fixture` | new |
| `/api/ai/health` | kept |
| `/api/ai/wizard` | kept |
| `/api/app/events/explorer` | new |
| `/api/app/events/test-lab/[runId]` | new |
| `/api/auth/[...all]` | kept |
| `/api/health` | kept |
| `/api/knowledge/feedback` | new |
| `/api/oauth/[provider]/callback` | kept |
| `/api/privacy/dsar/[id]` | kept |
| `/api/stripe/webhook` | kept |
| `/cdn/v1/c/[...path]` | kept |
| `/icon.svg` | kept |
| `/manifest.webmanifest` | new |
| `/robots.txt` | kept |
| `/sitemap.xml` | kept |
| `/sitemaps/[name]` | new |

## 5. Every changed file (committed, by area)

### web · Tracking Knowledge articles + learning paths ×6 (186)

- R (from `apps/web/content/blog/de/ad-blockers-itp-measurement.mdx`) `apps/web/content/knowledge/de/ad-blockers-itp-measurement.mdx` +13 −1
- R (from `apps/web/content/blog/de/affiliate-postbacks-s2s.mdx`) `apps/web/content/knowledge/de/affiliate-postbacks-s2s.mdx` +15 −3
- R (from `apps/web/content/blog/de/ai-assistant-tag-management-safety.mdx`) `apps/web/content/knowledge/de/ai-assistant-tag-management-safety.mdx` +13 −1
- R (from `apps/web/content/blog/de/click-ids-attribution-windows.mdx`) `apps/web/content/knowledge/de/click-ids-attribution-windows.mdx` +13 −1
- R (from `apps/web/content/blog/de/consent-mode-v2-guide.mdx`) `apps/web/content/knowledge/de/consent-mode-v2-guide.mdx` +14 −2
- R (from `apps/web/content/blog/de/data-retention-policy-tracking.mdx`) `apps/web/content/knowledge/de/data-retention-policy-tracking.mdx` +13 −1
- R (from `apps/web/content/blog/de/dedup-event-id-order-id.mdx`) `apps/web/content/knowledge/de/dedup-event-id-order-id.mdx` +14 −2
- R (from `apps/web/content/blog/de/dsar-deletion-tracking-data.mdx`) `apps/web/content/knowledge/de/dsar-deletion-tracking-data.mdx` +16 −4
- R (from `apps/web/content/blog/de/event-taxonomy-standard-events.mdx`) `apps/web/content/knowledge/de/event-taxonomy-standard-events.mdx` +13 −1
- R (from `apps/web/content/blog/de/first-party-tracking-domains.mdx`) `apps/web/content/knowledge/de/first-party-tracking-domains.mdx` +14 −2
- R (from `apps/web/content/blog/de/ga4-measurement-protocol-eu.mdx`) `apps/web/content/knowledge/de/ga4-measurement-protocol-eu.mdx` +16 −4
- R (from `apps/web/content/blog/de/google-ads-enhanced-conversions.mdx`) `apps/web/content/knowledge/de/google-ads-enhanced-conversions.mdx` +14 −2
- R (from `apps/web/content/blog/de/kill-switch-incident-playbook.mdx`) `apps/web/content/knowledge/de/kill-switch-incident-playbook.mdx` +13 −1
- R (from `apps/web/content/blog/de/lead-gen-tracking-b2b.mdx`) `apps/web/content/knowledge/de/lead-gen-tracking-b2b.mdx` +12 −0
- R (from `apps/web/content/blog/de/linkedin-conversions-api-b2b.mdx`) `apps/web/content/knowledge/de/linkedin-conversions-api-b2b.mdx` +14 −2
- R (from `apps/web/content/blog/de/meta-conversions-api-deduplication.mdx`) `apps/web/content/knowledge/de/meta-conversions-api-deduplication.mdx` +17 −5
- R (from `apps/web/content/blog/de/microsoft-conversions-api-uet.mdx`) `apps/web/content/knowledge/de/microsoft-conversions-api-uet.mdx` +15 −3
- R (from `apps/web/content/blog/de/migrating-from-gtm.mdx`) `apps/web/content/knowledge/de/migrating-from-gtm.mdx` +19 −7
- R (from `apps/web/content/blog/de/offline-conversions-crm.mdx`) `apps/web/content/knowledge/de/offline-conversions-crm.mdx` +14 −2
- R (from `apps/web/content/blog/de/pii-in-tracking-data.mdx`) `apps/web/content/knowledge/de/pii-in-tracking-data.mdx` +13 −1
- R (from `apps/web/content/blog/de/reddit-pinterest-snapchat-capi.mdx`) `apps/web/content/knowledge/de/reddit-pinterest-snapchat-capi.mdx` +13 −1
- R (from `apps/web/content/blog/de/server-side-tracking-explained.mdx`) `apps/web/content/knowledge/de/server-side-tracking-explained.mdx` +14 −1
- R (from `apps/web/content/blog/de/shopify-server-side-purchases.mdx`) `apps/web/content/knowledge/de/shopify-server-side-purchases.mdx` +15 −3
- R (from `apps/web/content/blog/de/shopware-6-tracking.mdx`) `apps/web/content/knowledge/de/shopware-6-tracking.mdx` +17 −5
- R (from `apps/web/content/blog/de/signed-configuration-supply-chain.mdx`) `apps/web/content/knowledge/de/signed-configuration-supply-chain.mdx` +14 −2
- R (from `apps/web/content/blog/de/subscription-saas-events.mdx`) `apps/web/content/knowledge/de/subscription-saas-events.mdx` +12 −0
- R (from `apps/web/content/blog/de/tcf-2-2-gpp-gpc.mdx`) `apps/web/content/knowledge/de/tcf-2-2-gpp-gpc.mdx` +15 −3
- R (from `apps/web/content/blog/de/tiktok-events-api-setup.mdx`) `apps/web/content/knowledge/de/tiktok-events-api-setup.mdx` +14 −2
- R (from `apps/web/content/blog/de/tracking-health-score.mdx`) `apps/web/content/knowledge/de/tracking-health-score.mdx` +13 −1
- R (from `apps/web/content/blog/de/woocommerce-server-side-tracking.mdx`) `apps/web/content/knowledge/de/woocommerce-server-side-tracking.mdx` +15 −3
- R (from `apps/web/content/blog/en/ad-blockers-itp-measurement.mdx`) `apps/web/content/knowledge/en/ad-blockers-itp-measurement.mdx` +13 −1
- R (from `apps/web/content/blog/en/affiliate-postbacks-s2s.mdx`) `apps/web/content/knowledge/en/affiliate-postbacks-s2s.mdx` +15 −3
- R (from `apps/web/content/blog/en/ai-assistant-tag-management-safety.mdx`) `apps/web/content/knowledge/en/ai-assistant-tag-management-safety.mdx` +13 −1
- R (from `apps/web/content/blog/en/click-ids-attribution-windows.mdx`) `apps/web/content/knowledge/en/click-ids-attribution-windows.mdx` +13 −1
- R (from `apps/web/content/blog/en/consent-mode-v2-guide.mdx`) `apps/web/content/knowledge/en/consent-mode-v2-guide.mdx` +14 −2
- R (from `apps/web/content/blog/en/data-retention-policy-tracking.mdx`) `apps/web/content/knowledge/en/data-retention-policy-tracking.mdx` +13 −1
- R (from `apps/web/content/blog/en/dedup-event-id-order-id.mdx`) `apps/web/content/knowledge/en/dedup-event-id-order-id.mdx` +14 −2
- R (from `apps/web/content/blog/en/dsar-deletion-tracking-data.mdx`) `apps/web/content/knowledge/en/dsar-deletion-tracking-data.mdx` +16 −4
- R (from `apps/web/content/blog/en/event-taxonomy-standard-events.mdx`) `apps/web/content/knowledge/en/event-taxonomy-standard-events.mdx` +13 −1
- R (from `apps/web/content/blog/en/first-party-tracking-domains.mdx`) `apps/web/content/knowledge/en/first-party-tracking-domains.mdx` +14 −2
- R (from `apps/web/content/blog/en/ga4-measurement-protocol-eu.mdx`) `apps/web/content/knowledge/en/ga4-measurement-protocol-eu.mdx` +16 −4
- R (from `apps/web/content/blog/en/google-ads-enhanced-conversions.mdx`) `apps/web/content/knowledge/en/google-ads-enhanced-conversions.mdx` +14 −2
- R (from `apps/web/content/blog/en/kill-switch-incident-playbook.mdx`) `apps/web/content/knowledge/en/kill-switch-incident-playbook.mdx` +13 −1
- R (from `apps/web/content/blog/en/lead-gen-tracking-b2b.mdx`) `apps/web/content/knowledge/en/lead-gen-tracking-b2b.mdx` +12 −0
- R (from `apps/web/content/blog/en/linkedin-conversions-api-b2b.mdx`) `apps/web/content/knowledge/en/linkedin-conversions-api-b2b.mdx` +14 −2
- R (from `apps/web/content/blog/en/meta-conversions-api-deduplication.mdx`) `apps/web/content/knowledge/en/meta-conversions-api-deduplication.mdx` +17 −5
- R (from `apps/web/content/blog/en/microsoft-conversions-api-uet.mdx`) `apps/web/content/knowledge/en/microsoft-conversions-api-uet.mdx` +15 −3
- R (from `apps/web/content/blog/en/migrating-from-gtm.mdx`) `apps/web/content/knowledge/en/migrating-from-gtm.mdx` +19 −7
- R (from `apps/web/content/blog/en/offline-conversions-crm.mdx`) `apps/web/content/knowledge/en/offline-conversions-crm.mdx` +14 −2
- R (from `apps/web/content/blog/en/pii-in-tracking-data.mdx`) `apps/web/content/knowledge/en/pii-in-tracking-data.mdx` +13 −1
- R (from `apps/web/content/blog/en/reddit-pinterest-snapchat-capi.mdx`) `apps/web/content/knowledge/en/reddit-pinterest-snapchat-capi.mdx` +13 −1
- R (from `apps/web/content/blog/en/server-side-tracking-explained.mdx`) `apps/web/content/knowledge/en/server-side-tracking-explained.mdx` +14 −1
- R (from `apps/web/content/blog/en/shopify-server-side-purchases.mdx`) `apps/web/content/knowledge/en/shopify-server-side-purchases.mdx` +15 −3
- R (from `apps/web/content/blog/en/shopware-6-tracking.mdx`) `apps/web/content/knowledge/en/shopware-6-tracking.mdx` +17 −5
- R (from `apps/web/content/blog/en/signed-configuration-supply-chain.mdx`) `apps/web/content/knowledge/en/signed-configuration-supply-chain.mdx` +14 −2
- R (from `apps/web/content/blog/en/subscription-saas-events.mdx`) `apps/web/content/knowledge/en/subscription-saas-events.mdx` +12 −0
- R (from `apps/web/content/blog/en/tcf-2-2-gpp-gpc.mdx`) `apps/web/content/knowledge/en/tcf-2-2-gpp-gpc.mdx` +15 −3
- R (from `apps/web/content/blog/en/tiktok-events-api-setup.mdx`) `apps/web/content/knowledge/en/tiktok-events-api-setup.mdx` +14 −2
- R (from `apps/web/content/blog/en/tracking-health-score.mdx`) `apps/web/content/knowledge/en/tracking-health-score.mdx` +13 −1
- R (from `apps/web/content/blog/en/woocommerce-server-side-tracking.mdx`) `apps/web/content/knowledge/en/woocommerce-server-side-tracking.mdx` +15 −3
- A `apps/web/content/knowledge/es/ad-blockers-itp-measurement.mdx` +67 −0
- A `apps/web/content/knowledge/es/affiliate-postbacks-s2s.mdx` +74 −0
- A `apps/web/content/knowledge/es/ai-assistant-tag-management-safety.mdx` +74 −0
- A `apps/web/content/knowledge/es/click-ids-attribution-windows.mdx` +87 −0
- A `apps/web/content/knowledge/es/consent-mode-v2-guide.mdx` +86 −0
- A `apps/web/content/knowledge/es/data-retention-policy-tracking.mdx` +71 −0
- A `apps/web/content/knowledge/es/dedup-event-id-order-id.mdx` +82 −0
- A `apps/web/content/knowledge/es/dsar-deletion-tracking-data.mdx` +77 −0
- A `apps/web/content/knowledge/es/event-taxonomy-standard-events.mdx` +80 −0
- A `apps/web/content/knowledge/es/first-party-tracking-domains.mdx` +75 −0
- A `apps/web/content/knowledge/es/ga4-measurement-protocol-eu.mdx` +83 −0
- A `apps/web/content/knowledge/es/google-ads-enhanced-conversions.mdx` +97 −0
- A `apps/web/content/knowledge/es/kill-switch-incident-playbook.mdx` +77 −0
- A `apps/web/content/knowledge/es/lead-gen-tracking-b2b.mdx` +80 −0
- A `apps/web/content/knowledge/es/linkedin-conversions-api-b2b.mdx` +88 −0
- A `apps/web/content/knowledge/es/meta-conversions-api-deduplication.mdx` +94 −0
- A `apps/web/content/knowledge/es/microsoft-conversions-api-uet.mdx` +86 −0
- A `apps/web/content/knowledge/es/migrating-from-gtm.mdx` +84 −0
- A `apps/web/content/knowledge/es/offline-conversions-crm.mdx` +79 −0
- A `apps/web/content/knowledge/es/pii-in-tracking-data.mdx` +75 −0
- A `apps/web/content/knowledge/es/reddit-pinterest-snapchat-capi.mdx` +71 −0
- A `apps/web/content/knowledge/es/server-side-tracking-explained.mdx` +104 −0
- A `apps/web/content/knowledge/es/shopify-server-side-purchases.mdx` +70 −0
- A `apps/web/content/knowledge/es/shopware-6-tracking.mdx` +70 −0
- A `apps/web/content/knowledge/es/signed-configuration-supply-chain.mdx` +70 −0
- A `apps/web/content/knowledge/es/subscription-saas-events.mdx` +73 −0
- A `apps/web/content/knowledge/es/tcf-2-2-gpp-gpc.mdx` +70 −0
- A `apps/web/content/knowledge/es/tiktok-events-api-setup.mdx` +89 −0
- A `apps/web/content/knowledge/es/tracking-health-score.mdx` +67 −0
- A `apps/web/content/knowledge/es/woocommerce-server-side-tracking.mdx` +74 −0
- A `apps/web/content/knowledge/fr/ad-blockers-itp-measurement.mdx` +67 −0
- A `apps/web/content/knowledge/fr/affiliate-postbacks-s2s.mdx` +74 −0
- A `apps/web/content/knowledge/fr/ai-assistant-tag-management-safety.mdx` +74 −0
- A `apps/web/content/knowledge/fr/click-ids-attribution-windows.mdx` +87 −0
- A `apps/web/content/knowledge/fr/consent-mode-v2-guide.mdx` +86 −0
- A `apps/web/content/knowledge/fr/data-retention-policy-tracking.mdx` +71 −0
- A `apps/web/content/knowledge/fr/dedup-event-id-order-id.mdx` +82 −0
- A `apps/web/content/knowledge/fr/dsar-deletion-tracking-data.mdx` +78 −0
- A `apps/web/content/knowledge/fr/event-taxonomy-standard-events.mdx` +80 −0
- A `apps/web/content/knowledge/fr/first-party-tracking-domains.mdx` +75 −0
- A `apps/web/content/knowledge/fr/ga4-measurement-protocol-eu.mdx` +83 −0
- A `apps/web/content/knowledge/fr/google-ads-enhanced-conversions.mdx` +97 −0
- A `apps/web/content/knowledge/fr/kill-switch-incident-playbook.mdx` +77 −0
- A `apps/web/content/knowledge/fr/lead-gen-tracking-b2b.mdx` +80 −0
- A `apps/web/content/knowledge/fr/linkedin-conversions-api-b2b.mdx` +88 −0
- A `apps/web/content/knowledge/fr/meta-conversions-api-deduplication.mdx` +94 −0
- A `apps/web/content/knowledge/fr/microsoft-conversions-api-uet.mdx` +86 −0
- A `apps/web/content/knowledge/fr/migrating-from-gtm.mdx` +84 −0
- A `apps/web/content/knowledge/fr/offline-conversions-crm.mdx` +79 −0
- A `apps/web/content/knowledge/fr/pii-in-tracking-data.mdx` +75 −0
- A `apps/web/content/knowledge/fr/reddit-pinterest-snapchat-capi.mdx` +71 −0
- A `apps/web/content/knowledge/fr/server-side-tracking-explained.mdx` +104 −0
- A `apps/web/content/knowledge/fr/shopify-server-side-purchases.mdx` +70 −0
- A `apps/web/content/knowledge/fr/shopware-6-tracking.mdx` +70 −0
- A `apps/web/content/knowledge/fr/signed-configuration-supply-chain.mdx` +70 −0
- A `apps/web/content/knowledge/fr/subscription-saas-events.mdx` +73 −0
- A `apps/web/content/knowledge/fr/tcf-2-2-gpp-gpc.mdx` +70 −0
- A `apps/web/content/knowledge/fr/tiktok-events-api-setup.mdx` +89 −0
- A `apps/web/content/knowledge/fr/tracking-health-score.mdx` +67 −0
- A `apps/web/content/knowledge/fr/woocommerce-server-side-tracking.mdx` +74 −0
- A `apps/web/content/knowledge/it/ad-blockers-itp-measurement.mdx` +67 −0
- A `apps/web/content/knowledge/it/affiliate-postbacks-s2s.mdx` +74 −0
- A `apps/web/content/knowledge/it/ai-assistant-tag-management-safety.mdx` +74 −0
- A `apps/web/content/knowledge/it/click-ids-attribution-windows.mdx` +87 −0
- A `apps/web/content/knowledge/it/consent-mode-v2-guide.mdx` +86 −0
- A `apps/web/content/knowledge/it/data-retention-policy-tracking.mdx` +71 −0
- A `apps/web/content/knowledge/it/dedup-event-id-order-id.mdx` +82 −0
- A `apps/web/content/knowledge/it/dsar-deletion-tracking-data.mdx` +78 −0
- A `apps/web/content/knowledge/it/event-taxonomy-standard-events.mdx` +80 −0
- A `apps/web/content/knowledge/it/first-party-tracking-domains.mdx` +75 −0
- A `apps/web/content/knowledge/it/ga4-measurement-protocol-eu.mdx` +83 −0
- A `apps/web/content/knowledge/it/google-ads-enhanced-conversions.mdx` +97 −0
- A `apps/web/content/knowledge/it/kill-switch-incident-playbook.mdx` +77 −0
- A `apps/web/content/knowledge/it/lead-gen-tracking-b2b.mdx` +80 −0
- A `apps/web/content/knowledge/it/linkedin-conversions-api-b2b.mdx` +88 −0
- A `apps/web/content/knowledge/it/meta-conversions-api-deduplication.mdx` +94 −0
- A `apps/web/content/knowledge/it/microsoft-conversions-api-uet.mdx` +86 −0
- A `apps/web/content/knowledge/it/migrating-from-gtm.mdx` +84 −0
- A `apps/web/content/knowledge/it/offline-conversions-crm.mdx` +79 −0
- A `apps/web/content/knowledge/it/pii-in-tracking-data.mdx` +75 −0
- A `apps/web/content/knowledge/it/reddit-pinterest-snapchat-capi.mdx` +71 −0
- A `apps/web/content/knowledge/it/server-side-tracking-explained.mdx` +104 −0
- A `apps/web/content/knowledge/it/shopify-server-side-purchases.mdx` +70 −0
- A `apps/web/content/knowledge/it/shopware-6-tracking.mdx` +70 −0
- A `apps/web/content/knowledge/it/signed-configuration-supply-chain.mdx` +70 −0
- A `apps/web/content/knowledge/it/subscription-saas-events.mdx` +73 −0
- A `apps/web/content/knowledge/it/tcf-2-2-gpp-gpc.mdx` +70 −0
- A `apps/web/content/knowledge/it/tiktok-events-api-setup.mdx` +89 −0
- A `apps/web/content/knowledge/it/tracking-health-score.mdx` +67 −0
- A `apps/web/content/knowledge/it/woocommerce-server-side-tracking.mdx` +74 −0
- A `apps/web/content/knowledge/nl/ad-blockers-itp-measurement.mdx` +67 −0
- A `apps/web/content/knowledge/nl/affiliate-postbacks-s2s.mdx` +74 −0
- A `apps/web/content/knowledge/nl/ai-assistant-tag-management-safety.mdx` +74 −0
- A `apps/web/content/knowledge/nl/click-ids-attribution-windows.mdx` +87 −0
- A `apps/web/content/knowledge/nl/consent-mode-v2-guide.mdx` +86 −0
- A `apps/web/content/knowledge/nl/data-retention-policy-tracking.mdx` +71 −0
- A `apps/web/content/knowledge/nl/dedup-event-id-order-id.mdx` +82 −0
- A `apps/web/content/knowledge/nl/dsar-deletion-tracking-data.mdx` +77 −0
- A `apps/web/content/knowledge/nl/event-taxonomy-standard-events.mdx` +80 −0
- A `apps/web/content/knowledge/nl/first-party-tracking-domains.mdx` +75 −0
- A `apps/web/content/knowledge/nl/ga4-measurement-protocol-eu.mdx` +83 −0
- A `apps/web/content/knowledge/nl/google-ads-enhanced-conversions.mdx` +97 −0
- A `apps/web/content/knowledge/nl/kill-switch-incident-playbook.mdx` +77 −0
- A `apps/web/content/knowledge/nl/lead-gen-tracking-b2b.mdx` +80 −0
- A `apps/web/content/knowledge/nl/linkedin-conversions-api-b2b.mdx` +88 −0
- A `apps/web/content/knowledge/nl/meta-conversions-api-deduplication.mdx` +94 −0
- A `apps/web/content/knowledge/nl/microsoft-conversions-api-uet.mdx` +86 −0
- A `apps/web/content/knowledge/nl/migrating-from-gtm.mdx` +84 −0
- A `apps/web/content/knowledge/nl/offline-conversions-crm.mdx` +79 −0
- A `apps/web/content/knowledge/nl/pii-in-tracking-data.mdx` +75 −0
- A `apps/web/content/knowledge/nl/reddit-pinterest-snapchat-capi.mdx` +71 −0
- A `apps/web/content/knowledge/nl/server-side-tracking-explained.mdx` +104 −0
- A `apps/web/content/knowledge/nl/shopify-server-side-purchases.mdx` +70 −0
- A `apps/web/content/knowledge/nl/shopware-6-tracking.mdx` +70 −0
- A `apps/web/content/knowledge/nl/signed-configuration-supply-chain.mdx` +70 −0
- A `apps/web/content/knowledge/nl/subscription-saas-events.mdx` +73 −0
- A `apps/web/content/knowledge/nl/tcf-2-2-gpp-gpc.mdx` +70 −0
- A `apps/web/content/knowledge/nl/tiktok-events-api-setup.mdx` +89 −0
- A `apps/web/content/knowledge/nl/tracking-health-score.mdx` +67 −0
- A `apps/web/content/knowledge/nl/woocommerce-server-side-tracking.mdx` +74 −0
- A `apps/web/content/knowledge/paths.de.json` +56 −0
- A `apps/web/content/knowledge/paths.en.json` +56 −0
- A `apps/web/content/knowledge/paths.es.json` +56 −0
- A `apps/web/content/knowledge/paths.fr.json` +56 −0
- A `apps/web/content/knowledge/paths.it.json` +56 −0
- A `apps/web/content/knowledge/paths.nl.json` +56 −0

### web · UI message catalogs ×6 (100)

- A `apps/web/messages/de/alerts.json` +391 −0
- M `apps/web/messages/de/app.json` +38 −28
- A `apps/web/messages/de/assistant.json` +193 −0
- M `apps/web/messages/de/auth.json` +17 −5
- A `apps/web/messages/de/billing-usage.json` +245 −0
- A `apps/web/messages/de/command-center.json` +381 −0
- M `apps/web/messages/de/common.json` +7 −5
- A `apps/web/messages/de/consent.json` +379 −0
- A `apps/web/messages/de/data-quality.json` +326 −0
- A `apps/web/messages/de/destinations-health.json` +239 −0
- M `apps/web/messages/de/destinations.json` +1 −1
- A `apps/web/messages/de/events.json` +556 −0
- A `apps/web/messages/de/insights.json` +334 −0
- A `apps/web/messages/de/releases.json` +442 −0
- A `apps/web/messages/de/shell.json` +196 −0
- A `apps/web/messages/de/team.json` +363 −0
- A `apps/web/messages/en/alerts.json` +391 −0
- M `apps/web/messages/en/app.json` +38 −28
- A `apps/web/messages/en/assistant.json` +193 −0
- M `apps/web/messages/en/auth.json` +17 −5
- A `apps/web/messages/en/billing-usage.json` +245 −0
- A `apps/web/messages/en/command-center.json` +381 −0
- M `apps/web/messages/en/common.json` +7 −5
- A `apps/web/messages/en/consent.json` +379 −0
- A `apps/web/messages/en/data-quality.json` +326 −0
- A `apps/web/messages/en/destinations-health.json` +239 −0
- M `apps/web/messages/en/destinations.json` +1 −1
- A `apps/web/messages/en/events.json` +556 −0
- A `apps/web/messages/en/insights.json` +334 −0
- A `apps/web/messages/en/releases.json` +442 −0
- A `apps/web/messages/en/shell.json` +196 −0
- A `apps/web/messages/en/team.json` +363 −0
- A `apps/web/messages/es/alerts.json` +391 −0
- A `apps/web/messages/es/app.json` +402 −0
- A `apps/web/messages/es/assistant.json` +193 −0
- A `apps/web/messages/es/auth.json` +91 −0
- A `apps/web/messages/es/billing-usage.json` +245 −0
- A `apps/web/messages/es/chat.json` +70 −0
- A `apps/web/messages/es/command-center.json` +381 −0
- A `apps/web/messages/es/common.json` +119 −0
- A `apps/web/messages/es/consent.json` +379 −0
- A `apps/web/messages/es/data-quality.json` +326 −0
- A `apps/web/messages/es/destinations-health.json` +239 −0
- A `apps/web/messages/es/destinations.json` +129 −0
- A `apps/web/messages/es/events.json` +556 −0
- A `apps/web/messages/es/insights.json` +334 −0
- A `apps/web/messages/es/releases.json` +442 −0
- A `apps/web/messages/es/shell.json` +196 −0
- A `apps/web/messages/es/team.json` +363 −0
- A `apps/web/messages/fr/alerts.json` +391 −0
- A `apps/web/messages/fr/app.json` +402 −0
- A `apps/web/messages/fr/assistant.json` +193 −0
- A `apps/web/messages/fr/auth.json` +91 −0
- A `apps/web/messages/fr/billing-usage.json` +245 −0
- A `apps/web/messages/fr/chat.json` +70 −0
- A `apps/web/messages/fr/command-center.json` +381 −0
- A `apps/web/messages/fr/common.json` +119 −0
- A `apps/web/messages/fr/consent.json` +379 −0
- A `apps/web/messages/fr/data-quality.json` +326 −0
- A `apps/web/messages/fr/destinations-health.json` +239 −0
- A `apps/web/messages/fr/destinations.json` +129 −0
- A `apps/web/messages/fr/events.json` +556 −0
- A `apps/web/messages/fr/insights.json` +334 −0
- A `apps/web/messages/fr/releases.json` +442 −0
- A `apps/web/messages/fr/shell.json` +196 −0
- A `apps/web/messages/fr/team.json` +363 −0
- A `apps/web/messages/it/alerts.json` +395 −0
- A `apps/web/messages/it/app.json` +402 −0
- A `apps/web/messages/it/assistant.json` +193 −0
- A `apps/web/messages/it/auth.json` +91 −0
- A `apps/web/messages/it/billing-usage.json` +245 −0
- A `apps/web/messages/it/chat.json` +70 −0
- A `apps/web/messages/it/command-center.json` +381 −0
- A `apps/web/messages/it/common.json` +119 −0
- A `apps/web/messages/it/consent.json` +379 −0
- A `apps/web/messages/it/data-quality.json` +326 −0
- A `apps/web/messages/it/destinations-health.json` +239 −0
- A `apps/web/messages/it/destinations.json` +129 −0
- A `apps/web/messages/it/events.json` +556 −0
- A `apps/web/messages/it/insights.json` +334 −0
- A `apps/web/messages/it/releases.json` +442 −0
- A `apps/web/messages/it/shell.json` +196 −0
- A `apps/web/messages/it/team.json` +363 −0
- A `apps/web/messages/nl/alerts.json` +391 −0
- A `apps/web/messages/nl/app.json` +402 −0
- A `apps/web/messages/nl/assistant.json` +193 −0
- A `apps/web/messages/nl/auth.json` +91 −0
- A `apps/web/messages/nl/billing-usage.json` +245 −0
- A `apps/web/messages/nl/chat.json` +70 −0
- A `apps/web/messages/nl/command-center.json` +381 −0
- A `apps/web/messages/nl/common.json` +119 −0
- A `apps/web/messages/nl/consent.json` +379 −0
- A `apps/web/messages/nl/data-quality.json` +326 −0
- A `apps/web/messages/nl/destinations-health.json` +239 −0
- A `apps/web/messages/nl/destinations.json` +129 −0
- A `apps/web/messages/nl/events.json` +556 −0
- A `apps/web/messages/nl/insights.json` +334 −0
- A `apps/web/messages/nl/releases.json` +442 −0
- A `apps/web/messages/nl/shell.json` +196 −0
- A `apps/web/messages/nl/team.json` +363 −0

### web · marketing copy modules ×6 (93)

- A `apps/web/src/lib/marketing-copy/auth/de.ts` +39 −0
- A `apps/web/src/lib/marketing-copy/auth/en.ts` +39 −0
- A `apps/web/src/lib/marketing-copy/auth/es.ts` +39 −0
- A `apps/web/src/lib/marketing-copy/auth/fr.ts` +39 −0
- A `apps/web/src/lib/marketing-copy/auth/index.ts` +23 −0
- A `apps/web/src/lib/marketing-copy/auth/it.ts` +39 −0
- A `apps/web/src/lib/marketing-copy/auth/nl.ts` +39 −0
- A `apps/web/src/lib/marketing-copy/features/de.ts` +451 −0
- A `apps/web/src/lib/marketing-copy/features/en.ts` +451 −0
- A `apps/web/src/lib/marketing-copy/features/es.ts` +451 −0
- A `apps/web/src/lib/marketing-copy/features/fr.ts` +451 −0
- A `apps/web/src/lib/marketing-copy/features/index.ts` +27 −0
- A `apps/web/src/lib/marketing-copy/features/it.ts` +451 −0
- A `apps/web/src/lib/marketing-copy/features/nl.ts` +451 −0
- A `apps/web/src/lib/marketing-copy/features/samples.ts` +14 −0
- A `apps/web/src/lib/marketing-copy/home/de.ts` +226 −0
- A `apps/web/src/lib/marketing-copy/home/en.ts` +233 −0
- A `apps/web/src/lib/marketing-copy/home/es.ts` +226 −0
- A `apps/web/src/lib/marketing-copy/home/fr.ts` +226 −0
- A `apps/web/src/lib/marketing-copy/home/index.ts` +16 −0
- A `apps/web/src/lib/marketing-copy/home/it.ts` +226 −0
- A `apps/web/src/lib/marketing-copy/home/nl.ts` +226 −0
- A `apps/web/src/lib/marketing-copy/how-it-works/de.ts` +97 −0
- A `apps/web/src/lib/marketing-copy/how-it-works/en.ts` +97 −0
- A `apps/web/src/lib/marketing-copy/how-it-works/es.ts` +97 −0
- A `apps/web/src/lib/marketing-copy/how-it-works/fr.ts` +97 −0
- A `apps/web/src/lib/marketing-copy/how-it-works/index.ts` +17 −0
- A `apps/web/src/lib/marketing-copy/how-it-works/it.ts` +97 −0
- A `apps/web/src/lib/marketing-copy/how-it-works/nl.ts` +97 −0
- A `apps/web/src/lib/marketing-copy/how-it-works/samples.ts` +7 −0
- A `apps/web/src/lib/marketing-copy/index.ts` +46 −0
- A `apps/web/src/lib/marketing-copy/integration-catalog/de.ts` +5 −0
- A `apps/web/src/lib/marketing-copy/integration-catalog/en.ts` +5 −0
- A `apps/web/src/lib/marketing-copy/integration-catalog/es.ts` +135 −0
- A `apps/web/src/lib/marketing-copy/integration-catalog/fr.ts` +135 −0
- A `apps/web/src/lib/marketing-copy/integration-catalog/from-catalog.ts` +19 −0
- A `apps/web/src/lib/marketing-copy/integration-catalog/index.ts` +24 −0
- A `apps/web/src/lib/marketing-copy/integration-catalog/it.ts` +135 −0
- A `apps/web/src/lib/marketing-copy/integration-catalog/nl.ts` +135 −0
- A `apps/web/src/lib/marketing-copy/integrations/de.ts` +233 −0
- A `apps/web/src/lib/marketing-copy/integrations/en.ts` +233 −0
- A `apps/web/src/lib/marketing-copy/integrations/es.ts` +234 −0
- A `apps/web/src/lib/marketing-copy/integrations/fr.ts` +234 −0
- A `apps/web/src/lib/marketing-copy/integrations/index.ts` +17 −0
- A `apps/web/src/lib/marketing-copy/integrations/it.ts` +235 −0
- A `apps/web/src/lib/marketing-copy/integrations/nl.ts` +234 −0
- A `apps/web/src/lib/marketing-copy/knowledge-article/de.ts` +36 −0
- A `apps/web/src/lib/marketing-copy/knowledge-article/en.ts` +36 −0
- A `apps/web/src/lib/marketing-copy/knowledge-article/es.ts` +37 −0
- A `apps/web/src/lib/marketing-copy/knowledge-article/fr.ts` +37 −0
- A `apps/web/src/lib/marketing-copy/knowledge-article/index.ts` +18 −0
- A `apps/web/src/lib/marketing-copy/knowledge-article/it.ts` +37 −0
- A `apps/web/src/lib/marketing-copy/knowledge-article/nl.ts` +37 −0
- A `apps/web/src/lib/marketing-copy/knowledge-labels/de.ts` +31 −0
- A `apps/web/src/lib/marketing-copy/knowledge-labels/en.ts` +31 −0
- A `apps/web/src/lib/marketing-copy/knowledge-labels/es.ts` +31 −0
- A `apps/web/src/lib/marketing-copy/knowledge-labels/fr.ts` +31 −0
- A `apps/web/src/lib/marketing-copy/knowledge-labels/index.ts` +17 −0
- A `apps/web/src/lib/marketing-copy/knowledge-labels/it.ts` +31 −0
- A `apps/web/src/lib/marketing-copy/knowledge-labels/nl.ts` +31 −0
- A `apps/web/src/lib/marketing-copy/knowledge/de.ts` +120 −0
- A `apps/web/src/lib/marketing-copy/knowledge/en.ts` +120 −0
- A `apps/web/src/lib/marketing-copy/knowledge/es.ts` +121 −0
- A `apps/web/src/lib/marketing-copy/knowledge/fr.ts` +121 −0
- A `apps/web/src/lib/marketing-copy/knowledge/index.ts` +25 −0
- A `apps/web/src/lib/marketing-copy/knowledge/it.ts` +122 −0
- A `apps/web/src/lib/marketing-copy/knowledge/nl.ts` +121 −0
- A `apps/web/src/lib/marketing-copy/parity.ts` +53 −0
- A `apps/web/src/lib/marketing-copy/pick.test.ts` +99 −0
- A `apps/web/src/lib/marketing-copy/pick.ts` +34 −0
- A `apps/web/src/lib/marketing-copy/pricing/de.ts` +189 −0
- A `apps/web/src/lib/marketing-copy/pricing/en.ts` +189 −0
- A `apps/web/src/lib/marketing-copy/pricing/es.ts` +191 −0
- A `apps/web/src/lib/marketing-copy/pricing/fr.ts` +190 −0
- A `apps/web/src/lib/marketing-copy/pricing/index.ts` +20 −0
- A `apps/web/src/lib/marketing-copy/pricing/it.ts` +191 −0
- A `apps/web/src/lib/marketing-copy/pricing/nl.ts` +190 −0
- A `apps/web/src/lib/marketing-copy/secondary/de.ts` +183 −0
- A `apps/web/src/lib/marketing-copy/secondary/en.ts` +183 −0
- A `apps/web/src/lib/marketing-copy/secondary/es.ts` +185 −0
- A `apps/web/src/lib/marketing-copy/secondary/fr.ts` +184 −0
- A `apps/web/src/lib/marketing-copy/secondary/index.ts` +22 −0
- A `apps/web/src/lib/marketing-copy/secondary/it.ts` +186 −0
- A `apps/web/src/lib/marketing-copy/secondary/nl.ts` +184 −0
- A `apps/web/src/lib/marketing-copy/secondary/samples.ts` +12 −0
- A `apps/web/src/lib/marketing-copy/shared/de.ts` +202 −0
- A `apps/web/src/lib/marketing-copy/shared/en.ts` +202 −0
- A `apps/web/src/lib/marketing-copy/shared/es.ts` +202 −0
- A `apps/web/src/lib/marketing-copy/shared/fr.ts` +202 −0
- A `apps/web/src/lib/marketing-copy/shared/index.ts` +33 −0
- A `apps/web/src/lib/marketing-copy/shared/it.ts` +202 −0
- A `apps/web/src/lib/marketing-copy/shared/nl.ts` +202 −0
- A `apps/web/src/lib/marketing-copy/types.ts` +1115 −0

### web · dashboard modules (components) (90)

- A `apps/web/src/components/app/alerts/channel-form.tsx` +182 −0
- A `apps/web/src/components/app/alerts/channels.tsx` +333 −0
- A `apps/web/src/components/app/alerts/format.ts` +32 −0
- A `apps/web/src/components/app/alerts/history.tsx` +366 −0
- A `apps/web/src/components/app/alerts/incident-mode.tsx` +390 −0
- A `apps/web/src/components/app/alerts/labels.ts` +53 −0
- A `apps/web/src/components/app/alerts/resolve-button.tsx` +51 −0
- A `apps/web/src/components/app/alerts/rule-form.tsx` +277 −0
- A `apps/web/src/components/app/alerts/rules.tsx` +266 −0
- A `apps/web/src/components/app/alerts/threshold.test.ts` +107 −0
- A `apps/web/src/components/app/alerts/threshold.ts` +93 −0
- M `apps/web/src/components/app/billing.tsx` +54 −19
- A `apps/web/src/components/app/billing/cost-comparison.tsx` +91 −0
- A `apps/web/src/components/app/billing/daily-chart.tsx` +111 −0
- A `apps/web/src/components/app/billing/format.ts` +20 −0
- A `apps/web/src/components/app/billing/overage-policy-form.tsx` +182 −0
- A `apps/web/src/components/app/billing/page-header.tsx` +24 −0
- A `apps/web/src/components/app/billing/subnav.tsx` +37 −0
- A `apps/web/src/components/app/billing/usage-meter.tsx` +86 −0
- A `apps/web/src/components/app/command-center/chart-section.tsx` +106 −0
- A `apps/web/src/components/app/command-center/charts.tsx` +83 −0
- A `apps/web/src/components/app/command-center/command-center.tsx` +36 −0
- A `apps/web/src/components/app/command-center/format.ts` +60 −0
- A `apps/web/src/components/app/command-center/index.ts` +3 −0
- A `apps/web/src/components/app/command-center/page-header.tsx` +20 −0
- A `apps/web/src/components/app/command-center/priority.tsx` +175 −0
- A `apps/web/src/components/app/command-center/recent-events.tsx` +118 −0
- A `apps/web/src/components/app/command-center/skeleton.tsx` +28 −0
- A `apps/web/src/components/app/command-center/status-strip.tsx` +232 −0
- A `apps/web/src/components/app/consent/coverage-panel.tsx` +112 −0
- A `apps/web/src/components/app/consent/draft-editor.tsx` +175 −0
- A `apps/web/src/components/app/consent/labels.ts` +53 −0
- A `apps/web/src/components/app/consent/page-header.tsx` +18 −0
- A `apps/web/src/components/app/consent/policy-actions.tsx` +113 −0
- A `apps/web/src/components/app/consent/policy-panel.tsx` +165 −0
- R (from `apps/web/src/components/app/privacy.tsx`) `apps/web/src/components/app/consent/privacy.tsx` +39 −23
- A `apps/web/src/components/app/consent/share-link.tsx` +53 −0
- A `apps/web/src/components/app/consent/simulation-results.tsx` +268 −0
- A `apps/web/src/components/app/consent/simulator-form.tsx` +210 −0
- A `apps/web/src/components/app/data-quality/format.ts` +24 −0
- A `apps/web/src/components/app/data-quality/inbox.tsx` +251 −0
- A `apps/web/src/components/app/data-quality/issue-actions.tsx` +226 −0
- A `apps/web/src/components/app/data-quality/page-header.tsx` +47 −0
- A `apps/web/src/components/app/data-quality/revenue-leaks.tsx` +308 −0
- A `apps/web/src/components/app/destinations-health/format.ts` +54 −0
- A `apps/web/src/components/app/destinations-health/health-center.tsx` +493 −0
- A `apps/web/src/components/app/destinations-health/row-actions.tsx` +149 −0
- A `apps/web/src/components/app/events/coverage-table.tsx` +123 −0
- A `apps/web/src/components/app/events/events-nav.tsx` +42 −0
- A `apps/web/src/components/app/events/explorer.tsx` +499 −0
- A `apps/web/src/components/app/events/filters.ts` +17 −0
- A `apps/web/src/components/app/events/format.ts` +29 −0
- A `apps/web/src/components/app/events/test-lab.tsx` +434 −0
- A `apps/web/src/components/app/events/timeline.tsx` +119 −0
- A `apps/web/src/components/app/events/tones.ts` +8 −0
- A `apps/web/src/components/app/insights/attribution-facts.tsx` +229 −0
- A `apps/web/src/components/app/insights/attribution-tables.tsx` +366 −0
- A `apps/web/src/components/app/insights/evidence.tsx` +58 −0
- A `apps/web/src/components/app/insights/format.ts` +36 −0
- A `apps/web/src/components/app/insights/page-header.tsx` +101 −0
- A `apps/web/src/components/app/insights/subnav.tsx` +45 −0
- D `apps/web/src/components/app/quality.tsx` +0 −48
- A `apps/web/src/components/app/releases/diff-list.tsx` +60 −0
- A `apps/web/src/components/app/releases/draft-actions.tsx` +271 −0
- A `apps/web/src/components/app/releases/draft-panel.tsx` +220 −0
- A `apps/web/src/components/app/releases/environment-strip.tsx` +100 −0
- A `apps/web/src/components/app/releases/evidence.tsx` +58 −0
- A `apps/web/src/components/app/releases/format.ts` +34 −0
- A `apps/web/src/components/app/releases/impact-preview.tsx` +246 −0
- A `apps/web/src/components/app/releases/labels.ts` +86 −0
- A `apps/web/src/components/app/releases/page-header.tsx` +24 −0
- A `apps/web/src/components/app/releases/version-actions.tsx` +53 −0
- A `apps/web/src/components/app/releases/versions-table.tsx` +73 −0
- M `apps/web/src/components/app/settings.tsx` +6 −2
- A `apps/web/src/components/app/settings/motion-form.tsx` +52 −0
- A `apps/web/src/components/app/settings/subnav.tsx` +45 −0
- M `apps/web/src/components/app/shell.tsx` +6 −100
- D `apps/web/src/components/app/team.tsx` +0 −109
- A `apps/web/src/components/app/team/approval-policy-form.tsx` +151 −0
- A `apps/web/src/components/app/team/approval-requests.tsx` +176 −0
- A `apps/web/src/components/app/team/audit-filters.tsx` +80 −0
- A `apps/web/src/components/app/team/audit-pagination.tsx` +18 −0
- A `apps/web/src/components/app/team/audit-table.tsx` +125 −0
- A `apps/web/src/components/app/team/format.ts` +7 −0
- A `apps/web/src/components/app/team/labels.ts` +38 −0
- A `apps/web/src/components/app/team/members.tsx` +239 −0
- A `apps/web/src/components/app/team/page-header.tsx` +14 −0
- A `apps/web/src/components/app/team/permissions-sheet.tsx` +48 −0
- A `apps/web/src/components/app/team/roles-matrix.tsx` +80 −0
- A `apps/web/src/components/app/team/team-nav.tsx` +40 −0

### web · public routes (marketing, knowledge, auth, metadata) under `/[locale]` (57)

- M `apps/web/src/app/[locale]/(auth)/accept-invitation/[id]/page.tsx` +3 −3
- A `apps/web/src/app/[locale]/(auth)/error.tsx` +7 −0
- M `apps/web/src/app/[locale]/(auth)/forgot-password/page.tsx` +5 −4
- A `apps/web/src/app/[locale]/(auth)/layout.tsx` +10 −0
- M `apps/web/src/app/[locale]/(auth)/login/page.tsx` +8 −6
- M `apps/web/src/app/[locale]/(auth)/reset-password/page.tsx` +3 −3
- M `apps/web/src/app/[locale]/(auth)/signup/page.tsx` +31 −11
- M `apps/web/src/app/[locale]/(auth)/two-factor/page.tsx` +3 −3
- M `apps/web/src/app/[locale]/(auth)/verify-email/page.tsx` +19 −8
- A `apps/web/src/app/[locale]/(marketing)/contact/page.tsx` +54 −0
- R (from `apps/web/src/app/[locale]/data-processing/page.tsx`) `apps/web/src/app/[locale]/(marketing)/data-processing/page.tsx` +2 −2
- A `apps/web/src/app/[locale]/(marketing)/demo/page.tsx` +53 −0
- A `apps/web/src/app/[locale]/(marketing)/docs/page.tsx` +119 −0
- R (from `apps/web/src/app/[locale]/error.tsx`) `apps/web/src/app/[locale]/(marketing)/error.tsx` +0 −0
- A `apps/web/src/app/[locale]/(marketing)/features/[slug]/page.tsx` +139 −0
- A `apps/web/src/app/[locale]/(marketing)/features/page.tsx` +107 −0
- A `apps/web/src/app/[locale]/(marketing)/how-it-works/page.tsx` +144 −0
- A `apps/web/src/app/[locale]/(marketing)/imprint/page.tsx` +45 −0
- A `apps/web/src/app/[locale]/(marketing)/integrations/[slug]/page.tsx` +223 −0
- A `apps/web/src/app/[locale]/(marketing)/integrations/page.tsx` +115 −0
- A `apps/web/src/app/[locale]/(marketing)/layout.tsx` +29 −0
- R (from `apps/web/src/app/[locale]/not-found.tsx`) `apps/web/src/app/[locale]/(marketing)/not-found.tsx` +4 −3
- A `apps/web/src/app/[locale]/(marketing)/page.tsx` +50 −0
- A `apps/web/src/app/[locale]/(marketing)/pricing/page.tsx` +142 −0
- R (from `apps/web/src/app/[locale]/privacy/page.tsx`) `apps/web/src/app/[locale]/(marketing)/privacy/page.tsx` +2 −2
- A `apps/web/src/app/[locale]/(marketing)/security/page.tsx` +127 −0
- A `apps/web/src/app/[locale]/(marketing)/status/page.tsx` +112 −0
- A `apps/web/src/app/[locale]/(marketing)/subprocessors/page.tsx` +79 −0
- A `apps/web/src/app/[locale]/(marketing)/support/page.tsx` +46 −0
- R (from `apps/web/src/app/[locale]/terms/page.tsx`) `apps/web/src/app/[locale]/(marketing)/terms/page.tsx` +2 −2
- A `apps/web/src/app/[locale]/(marketing)/tracking-knowledge/[slug]/opengraph-image.tsx` +31 −0
- A `apps/web/src/app/[locale]/(marketing)/tracking-knowledge/[slug]/page.tsx` +142 −0
- A `apps/web/src/app/[locale]/(marketing)/tracking-knowledge/copy.ts` +23 −0
- A `apps/web/src/app/[locale]/(marketing)/tracking-knowledge/feed.xml/route.ts` +26 −0
- A `apps/web/src/app/[locale]/(marketing)/tracking-knowledge/opengraph-image.tsx` +28 −0
- A `apps/web/src/app/[locale]/(marketing)/tracking-knowledge/page.tsx` +88 −0
- A `apps/web/src/app/[locale]/(marketing)/tracking-knowledge/social-card.tsx` +85 −0
- D `apps/web/src/app/[locale]/blog/[slug]/page.tsx` +0 −111
- D `apps/web/src/app/[locale]/blog/feed.xml/route.ts` +0 −21
- D `apps/web/src/app/[locale]/blog/page.tsx` +0 −74
- D `apps/web/src/app/[locale]/contact/page.tsx` +0 −40
- D `apps/web/src/app/[locale]/demo/page.tsx` +0 −45
- D `apps/web/src/app/[locale]/docs/page.tsx` +0 −105
- D `apps/web/src/app/[locale]/features/[slug]/page.tsx` +0 −63
- D `apps/web/src/app/[locale]/features/page.tsx` +0 −35
- D `apps/web/src/app/[locale]/how-it-works/page.tsx` +0 −38
- D `apps/web/src/app/[locale]/imprint/page.tsx` +0 −37
- D `apps/web/src/app/[locale]/integrations/[slug]/page.tsx` +0 −136
- D `apps/web/src/app/[locale]/integrations/page.tsx` +0 −62
- M `apps/web/src/app/[locale]/layout.tsx` +34 −19
- A `apps/web/src/app/[locale]/opengraph-image.tsx` +43 −0
- D `apps/web/src/app/[locale]/page.tsx` +0 −212
- D `apps/web/src/app/[locale]/pricing/page.tsx` +0 −172
- D `apps/web/src/app/[locale]/security/page.tsx` +0 −34
- D `apps/web/src/app/[locale]/status/page.tsx` +0 −82
- D `apps/web/src/app/[locale]/subprocessors/page.tsx` +0 −66
- D `apps/web/src/app/[locale]/support/page.tsx` +0 −46

### web · server (data access, actions, auth, billing, entitlements) (57)

- A `apps/web/src/server/actions/alerts.ts` +690 −0
- M `apps/web/src/server/actions/billing.ts` +18 −5
- A `apps/web/src/server/actions/consent.ts` +165 −0
- M `apps/web/src/server/actions/contact.ts` +4 −2
- A `apps/web/src/server/actions/data-quality.ts` +139 −0
- A `apps/web/src/server/actions/destinations-health.ts` +100 −0
- D `apps/web/src/server/actions/quality.ts` +0 −20
- A `apps/web/src/server/actions/releases.ts` +333 −0
- M `apps/web/src/server/actions/settings.ts` +182 −24
- M `apps/web/src/server/actions/team.ts` +262 −32
- A `apps/web/src/server/actions/usage.ts` +97 −0
- M `apps/web/src/server/ai/turn.ts` +4 −1
- A `apps/web/src/server/alerts.test.ts` +163 −0
- A `apps/web/src/server/alerts.ts` +832 −0
- M `apps/web/src/server/auth.ts` +14 −6
- M `apps/web/src/server/billing.ts` +60 −22
- A `apps/web/src/server/command-center.test.ts` +163 −0
- A `apps/web/src/server/command-center.ts` +811 −0
- A `apps/web/src/server/consent-coverage.test.ts` +39 −0
- A `apps/web/src/server/consent-coverage.ts` +117 −0
- A `apps/web/src/server/consent-policy.test.ts` +42 −0
- A `apps/web/src/server/consent-policy.ts` +160 −0
- A `apps/web/src/server/consent-simulator.test.ts` +144 −0
- A `apps/web/src/server/consent-simulator.ts` +498 −0
- A `apps/web/src/server/consent.ts` +180 −0
- A `apps/web/src/server/data-quality.test.ts` +155 −0
- A `apps/web/src/server/data-quality.ts` +384 −0
- A `apps/web/src/server/destination-health.test.ts` +151 −0
- A `apps/web/src/server/destination-health.ts` +659 −0
- M `apps/web/src/server/entitlements.ts` +11 −5
- A `apps/web/src/server/events-actions.ts` +158 −0
- A `apps/web/src/server/events-lineage.test.ts` +144 −0
- A `apps/web/src/server/events-lineage.ts` +348 −0
- A `apps/web/src/server/events.ts` +835 −0
- A `apps/web/src/server/insights-actions.ts` +19 −0
- A `apps/web/src/server/insights-attribution.test.ts` +345 −0
- A `apps/web/src/server/insights-attribution.ts` +383 −0
- A `apps/web/src/server/insights-audiences.ts` +61 −0
- A `apps/web/src/server/insights-legacy.test.ts` +32 −0
- A `apps/web/src/server/insights-legacy.ts` +28 −0
- A `apps/web/src/server/insights.ts` +307 −0
- M `apps/web/src/server/mail.ts` +1 −1
- A `apps/web/src/server/preferences.ts` +63 −0
- M `apps/web/src/server/pricing.ts` +200 −40
- A `apps/web/src/server/release-rules.ts` +20 −0
- A `apps/web/src/server/releases.test.ts` +290 −0
- A `apps/web/src/server/releases.ts` +1029 −0
- A `apps/web/src/server/revenue-leaks.test.ts` +91 −0
- A `apps/web/src/server/revenue-leaks.ts` +201 −0
- M `apps/web/src/server/session.ts` +23 −0
- M `apps/web/src/server/stats.ts` +70 −1
- A `apps/web/src/server/team.test.ts` +193 −0
- A `apps/web/src/server/team.ts` +661 −0
- A `apps/web/src/server/usage.integration.test.ts` +101 −0
- A `apps/web/src/server/usage.test.ts` +198 −0
- A `apps/web/src/server/usage.ts` +512 −0
- A `apps/web/src/server/workspace.ts` +132 −0

### web · marketing components (header, footer, home, features, integrations, auth shell) (47)

- A `apps/web/src/components/marketing/consent-dialog.tsx` +97 −0
- M `apps/web/src/components/marketing/contact-form.tsx` +31 −25
- M `apps/web/src/components/marketing/domain-start-form.tsx` +45 −12
- A `apps/web/src/components/marketing/features/checks.tsx` +41 −0
- A `apps/web/src/components/marketing/features/comparison.tsx` +59 −0
- A `apps/web/src/components/marketing/features/copy.test.ts` +70 −0
- A `apps/web/src/components/marketing/features/faq.tsx` +20 −0
- A `apps/web/src/components/marketing/features/feature-index.tsx` +56 −0
- A `apps/web/src/components/marketing/features/feature-view.tsx` +135 −0
- A `apps/web/src/components/marketing/features/flow-diagram.tsx` +317 −0
- A `apps/web/src/components/marketing/features/milestones.tsx` +42 −0
- A `apps/web/src/components/marketing/features/product-views.tsx` +394 −0
- A `apps/web/src/components/marketing/features/section.tsx` +14 −0
- M `apps/web/src/components/marketing/footer.tsx` +51 −34
- M `apps/web/src/components/marketing/header.tsx` +376 −61
- A `apps/web/src/components/marketing/home/ai-setup.tsx` +71 −0
- A `apps/web/src/components/marketing/home/final-cta.tsx` +27 −0
- A `apps/web/src/components/marketing/home/flow-diagram.tsx` +100 −0
- A `apps/web/src/components/marketing/home/flow.tsx` +43 −0
- A `apps/web/src/components/marketing/home/hero.tsx` +45 −0
- A `apps/web/src/components/marketing/home/knowledge.tsx` +50 −0
- A `apps/web/src/components/marketing/home/outcomes.tsx` +25 −0
- A `apps/web/src/components/marketing/home/platforms.tsx` +51 −0
- A `apps/web/src/components/marketing/home/pricing-teaser.tsx` +68 −0
- A `apps/web/src/components/marketing/home/section.tsx` +29 −0
- A `apps/web/src/components/marketing/home/trust.tsx` +50 −0
- A `apps/web/src/components/marketing/home/use-cases.tsx` +34 −0
- M `apps/web/src/components/marketing/integration-grid.tsx` +14 −8
- A `apps/web/src/components/marketing/integrations/catalog.test.ts` +192 −0
- A `apps/web/src/components/marketing/integrations/catalog.ts` +193 −0
- A `apps/web/src/components/marketing/integrations/diagrams.tsx` +93 −0
- A `apps/web/src/components/marketing/integrations/explorer.tsx` +195 −0
- A `apps/web/src/components/marketing/integrations/glyph.tsx` +47 −0
- A `apps/web/src/components/marketing/integrations/sections.tsx` +110 −0
- A `apps/web/src/components/marketing/integrations/text.ts` +25 −0
- M `apps/web/src/components/marketing/legal-page.tsx` +80 −46
- M `apps/web/src/components/marketing/locale-switcher.tsx` +164 −24
- A `apps/web/src/components/marketing/localized-paths.test.ts` +20 −0
- A `apps/web/src/components/marketing/localized-paths.ts` +61 −0
- M `apps/web/src/components/marketing/page-shell.tsx` +253 −72
- A `apps/web/src/components/marketing/render-smoke.test.tsx` +174 −0
- A `apps/web/src/components/marketing/secondary/anchor.ts` +19 −0
- A `apps/web/src/components/marketing/secondary/copy.test.ts` +49 −0
- A `apps/web/src/components/marketing/secondary/diagrams.tsx` +260 −0
- A `apps/web/src/components/marketing/secondary/timeline.tsx` +38 −0
- A `apps/web/src/components/marketing/secondary/toc.tsx` +49 −0
- A `apps/web/src/components/marketing/ui-client-boundary.test.ts` +49 −0

### web · dashboard routes `/app/**` (44)

- A `apps/web/src/app/app/ai-setup/page.tsx` +59 −0
- D `apps/web/src/app/app/audiences/page.tsx` +0 −86
- M `apps/web/src/app/app/billing/page.tsx` +143 −40
- A `apps/web/src/app/app/billing/usage/page.tsx` +250 −0
- M `apps/web/src/app/app/consent/page.tsx` +125 −62
- A `apps/web/src/app/app/consent/simulator/page.tsx` +121 −0
- A `apps/web/src/app/app/data-quality/loading.tsx` +29 −0
- M `apps/web/src/app/app/data-quality/page.tsx` +68 −89
- A `apps/web/src/app/app/data-quality/revenue-leaks/loading.tsx` +25 −0
- A `apps/web/src/app/app/data-quality/revenue-leaks/page.tsx` +59 −0
- D `apps/web/src/app/app/debugger/page.tsx` +0 −198
- A `apps/web/src/app/app/destinations/loading.tsx` +22 −0
- M `apps/web/src/app/app/destinations/page.tsx` +78 −82
- A `apps/web/src/app/app/error.tsx` +28 −0
- A `apps/web/src/app/app/events/explorer/page.tsx` +52 −0
- A `apps/web/src/app/app/events/layout.tsx` +46 −0
- A `apps/web/src/app/app/events/matrix/page.tsx` +62 −0
- M `apps/web/src/app/app/events/page.tsx` +211 −107
- A `apps/web/src/app/app/events/test-lab/page.tsx` +36 −0
- A `apps/web/src/app/app/insights/attribution/page.tsx` +88 −0
- A `apps/web/src/app/app/insights/audiences/page.tsx` +167 −0
- A `apps/web/src/app/app/insights/layout.tsx` +17 −0
- A `apps/web/src/app/app/insights/loading.tsx` +25 −0
- A `apps/web/src/app/app/insights/page.tsx` +171 −0
- M `apps/web/src/app/app/layout.tsx` +109 −12
- A `apps/web/src/app/app/not-found.tsx` +22 −0
- M `apps/web/src/app/app/onboarding/organization/page.tsx` +13 −4
- M `apps/web/src/app/app/onboarding/page.tsx` +13 −3
- M `apps/web/src/app/app/page.tsx` +72 −64
- A `apps/web/src/app/app/releases/[versionId]/loading.tsx` +25 −0
- A `apps/web/src/app/app/releases/[versionId]/page.tsx` +227 −0
- A `apps/web/src/app/app/releases/loading.tsx` +28 −0
- A `apps/web/src/app/app/releases/page.tsx` +143 −0
- A `apps/web/src/app/app/settings/alerts/page.tsx` +90 −0
- M `apps/web/src/app/app/settings/page.tsx` +111 −12
- M `apps/web/src/app/app/sites/[siteId]/destinations/page.tsx` +4 −5
- M `apps/web/src/app/app/sites/[siteId]/page.tsx` +12 −16
- M `apps/web/src/app/app/sites/[siteId]/shop/page.tsx` +4 −5
- M `apps/web/src/app/app/sites/page.tsx` +6 −6
- A `apps/web/src/app/app/team/audit/loading.tsx` +20 −0
- A `apps/web/src/app/app/team/audit/page.tsx` +57 −0
- A `apps/web/src/app/app/team/layout.tsx` +12 −0
- A `apps/web/src/app/app/team/loading.tsx` +26 −0
- M `apps/web/src/app/app/team/page.tsx` +121 −61

### web · dashboard shell (viewport-fixed layout, Track AI panel, Living AI Core, palette) (28)

- A `apps/web/src/components/app/shell/actions.ts` +100 −0
- A `apps/web/src/components/app/shell/app-shell.tsx` +144 −0
- A `apps/web/src/components/app/shell/assistant-host.tsx` +243 −0
- A `apps/web/src/components/app/shell/assistant-panel.test.tsx` +320 −0
- A `apps/web/src/components/app/shell/assistant-panel.tsx` +79 −0
- A `apps/web/src/components/app/shell/command-palette.tsx` +203 −0
- A `apps/web/src/components/app/shell/environment-indicator.tsx` +85 −0
- A `apps/web/src/components/app/shell/living-ai-core/assistant-ambient.tsx` +29 −0
- A `apps/web/src/components/app/shell/living-ai-core/blobs.test.ts` +90 −0
- A `apps/web/src/components/app/shell/living-ai-core/blobs.ts` +101 −0
- A `apps/web/src/components/app/shell/living-ai-core/index.ts` +9 −0
- A `apps/web/src/components/app/shell/living-ai-core/living-ai-core.dom.test.tsx` +504 −0
- A `apps/web/src/components/app/shell/living-ai-core/living-ai-core.ssr.test.tsx` +69 −0
- A `apps/web/src/components/app/shell/living-ai-core/living-ai-core.tsx` +228 −0
- A `apps/web/src/components/app/shell/living-ai-core/motion-control.tsx` +66 −0
- A `apps/web/src/components/app/shell/living-ai-core/preference.ts` +67 −0
- A `apps/web/src/components/app/shell/living-ai-core/state-machine.test.ts` +274 −0
- A `apps/web/src/components/app/shell/living-ai-core/state-machine.ts` +213 −0
- A `apps/web/src/components/app/shell/living-ai-core/tier.test.ts` +78 −0
- A `apps/web/src/components/app/shell/living-ai-core/tier.ts` +102 −0
- A `apps/web/src/components/app/shell/living-ai-core/types.ts` +51 −0
- A `apps/web/src/components/app/shell/living-ai-core/webgl-renderer.ts` +266 −0
- A `apps/web/src/components/app/shell/menu.tsx` +219 −0
- A `apps/web/src/components/app/shell/modules.ts` +17 −0
- A `apps/web/src/components/app/shell/nav.tsx` +112 −0
- A `apps/web/src/components/app/shell/types.ts` +33 −0
- A `apps/web/src/components/app/shell/user-menu.tsx` +44 −0
- A `apps/web/src/components/app/shell/workspace-switcher.tsx` +139 −0

### packages/db (schema, migrations 0004–0013, repositories, seed) (28)

- A `packages/db/drizzle/0004_catalog_pro_plan.sql` +31 −0
- A `packages/db/drizzle/0005_knowledge_feedback.sql` +15 −0
- A `packages/db/drizzle/0006_workspace_preferences.sql` +45 −0
- A `packages/db/drizzle/0007_event_lineage.sql` +125 −0
- A `packages/db/drizzle/0008_destination_health.sql` +59 −0
- A `packages/db/drizzle/0009_revenue_reconciliation.sql` +115 −0
- A `packages/db/drizzle/0010_release_approvals.sql` +79 −0
- A `packages/db/drizzle/0012_team_policies.sql` +58 −0
- A `packages/db/drizzle/0013_alerts.sql` +156 −0
- M `packages/db/drizzle/meta/_journal.json` +63 −0
- M `packages/db/package.json` +2 −0
- A `packages/db/src/cli/schema-check.ts` +82 −0
- M `packages/db/src/cli/seed.ts` +12 −45
- A `packages/db/src/repositories/alerts.ts` +194 −0
- M `packages/db/src/repositories/config.ts` +293 −27
- M `packages/db/src/repositories/index.ts` +1 −0
- A `packages/db/src/schema/alerts.ts` +192 −0
- M `packages/db/src/schema/billing.ts` +11 −11
- M `packages/db/src/schema/commerce.ts` +78 −2
- M `packages/db/src/schema/config.ts` +86 −1
- M `packages/db/src/schema/delivery.ts` +52 −2
- M `packages/db/src/schema/index.ts` +0 −1
- M `packages/db/src/schema/kit.ts` +6 −1
- A `packages/db/src/schema/knowledge.ts` +29 −0
- A `packages/db/src/schema/lineage.ts` +100 −0
- M `packages/db/src/schema/quality.ts` +50 −2
- M `packages/db/src/schema/tenancy.ts` +62 −1
- A `packages/db/src/schema/workspace.ts` +30 −0

### packages/ui (design system tokens, primitives, brand) (24)

- M `packages/ui/package.json` +0 −1
- A `packages/ui/README.md` +52 −0
- M `packages/ui/src/brand.tsx` +93 −18
- A `packages/ui/src/diagram.tsx` +314 −0
- M `packages/ui/src/index.ts` +2 −1
- D `packages/ui/src/primitives.tsx` +0 −151
- A `packages/ui/src/primitives/button-variants.tsx` +72 −0
- A `packages/ui/src/primitives/button.tsx` +56 −0
- A `packages/ui/src/primitives/card.tsx` +43 −0
- A `packages/ui/src/primitives/code-block.tsx` +70 −0
- A `packages/ui/src/primitives/dialog.tsx` +185 −0
- A `packages/ui/src/primitives/feedback.tsx` +85 −0
- A `packages/ui/src/primitives/field.tsx` +223 −0
- A `packages/ui/src/primitives/index.ts` +16 −0
- A `packages/ui/src/primitives/layout.tsx` +86 −0
- A `packages/ui/src/primitives/navigation.tsx` +51 −0
- A `packages/ui/src/primitives/pagination.tsx` +83 −0
- A `packages/ui/src/primitives/scroll-region.tsx` +47 −0
- A `packages/ui/src/primitives/search.tsx` +107 −0
- A `packages/ui/src/primitives/status.tsx` +49 −0
- A `packages/ui/src/primitives/table.tsx` +51 −0
- A `packages/ui/src/primitives/tabs.tsx` +162 −0
- A `packages/ui/src/primitives/tooltip.tsx` +77 −0
- M `packages/ui/src/styles/tokens.css` +337 −13

### web · Track AI chat (store, reducer, virtual list, workspace moves) (23)

- A `apps/web/src/components/chat/assistant-chat.test.tsx` +268 −0
- A `apps/web/src/components/chat/assistant-chat.tsx` +653 −0
- A `apps/web/src/components/chat/assistant-store.tsx` +294 −0
- A `apps/web/src/components/chat/assistant-ui-state.test.ts` +151 −0
- A `apps/web/src/components/chat/assistant-ui-state.ts` +187 −0
- M `apps/web/src/components/chat/cards.tsx` +14 −10
- A `apps/web/src/components/chat/chat-reducer.test.ts` +97 −0
- A `apps/web/src/components/chat/chat-reducer.ts` +132 −0
- A `apps/web/src/components/chat/focus-target.ts` +36 −0
- M `apps/web/src/components/chat/inputs.tsx` +100 −40
- A `apps/web/src/components/chat/next-action.test.ts` +39 −0
- A `apps/web/src/components/chat/next-action.ts` +37 −0
- M `apps/web/src/components/chat/setup-chat.tsx` +81 −240
- M `apps/web/src/components/chat/types.ts` +65 −14
- A `apps/web/src/components/chat/ui-events.test.ts` +38 −0
- A `apps/web/src/components/chat/ui-events.ts` +52 −0
- A `apps/web/src/components/chat/use-workspace-moves.ts` +68 −0
- A `apps/web/src/components/chat/viewer-preferences.ts` +57 −0
- A `apps/web/src/components/chat/virtual-list.test.ts` +49 −0
- A `apps/web/src/components/chat/virtual-list.ts` +64 −0
- M `apps/web/src/components/chat/wizard.tsx` +13 −10
- A `apps/web/src/components/chat/workspace-moves.test.ts` +83 −0
- A `apps/web/src/components/chat/workspace-moves.ts` +85 −0

### web · Tracking Knowledge components (21)

- A `apps/web/src/components/marketing/knowledge/article/blocks.tsx` +99 −0
- A `apps/web/src/components/marketing/knowledge/article/callout.tsx` +31 −0
- A `apps/web/src/components/marketing/knowledge/article/code.tsx` +40 −0
- A `apps/web/src/components/marketing/knowledge/article/feedback.tsx` +71 −0
- A `apps/web/src/components/marketing/knowledge/article/header.tsx` +60 −0
- A `apps/web/src/components/marketing/knowledge/article/mdx-components.test.tsx` +38 −0
- A `apps/web/src/components/marketing/knowledge/article/mdx-components.tsx` +110 −0
- A `apps/web/src/components/marketing/knowledge/article/reading-progress.tsx` +55 −0
- A `apps/web/src/components/marketing/knowledge/article/related.tsx` +42 −0
- A `apps/web/src/components/marketing/knowledge/article/steps.tsx` +19 −0
- A `apps/web/src/components/marketing/knowledge/article/toc.tsx` +46 −0
- A `apps/web/src/components/marketing/knowledge/cover.tsx` +656 −0
- A `apps/web/src/components/marketing/knowledge/hub/actions.ts` +19 −0
- A `apps/web/src/components/marketing/knowledge/hub/directory.tsx` +175 −0
- A `apps/web/src/components/marketing/knowledge/hub/editorial.tsx` +15 −0
- A `apps/web/src/components/marketing/knowledge/hub/provider.tsx` +162 −0
- A `apps/web/src/components/marketing/knowledge/hub/search-box.tsx` +54 −0
- A `apps/web/src/components/marketing/knowledge/hub/sections.tsx` +311 −0
- A `apps/web/src/components/marketing/knowledge/hub/server.ts` +157 −0
- A `apps/web/src/components/marketing/knowledge/hub/text.ts` +22 −0
- A `apps/web/src/components/marketing/knowledge/hub/types.ts` +54 −0

### packages/ai (UI event contract, scope gate, evals) (20)

- M `packages/ai/src/agent.test.ts` +98 −2
- M `packages/ai/src/agent.ts` +88 −25
- M `packages/ai/src/ai.test.ts` +4 −1
- M `packages/ai/src/dlp.ts` +11 −3
- A `packages/ai/src/evals/explain.ts` +6 −0
- A `packages/ai/src/evals/fake-client.ts` +80 −0
- A `packages/ai/src/evals/injection.eval.test.ts` +298 −0
- M `packages/ai/src/index.ts` +4 −0
- M `packages/ai/src/prompts.ts` +4 −3
- A `packages/ai/src/scope-copy.ts` +88 −0
- A `packages/ai/src/scope.test.ts` +176 −0
- A `packages/ai/src/scope.ts` +342 −0
- M `packages/ai/src/tools/destinations.ts` +4 −1
- M `packages/ai/src/tools/draft.ts` +2 −2
- M `packages/ai/src/tools/read.ts` +4 −0
- M `packages/ai/src/tools/registry.ts` +24 −0
- A `packages/ai/src/turn-registry.test.ts` +126 −0
- A `packages/ai/src/turn-registry.ts` +123 −0
- A `packages/ai/src/ui-events.test.ts` +208 −0
- A `packages/ai/src/ui-events.ts` +338 −0

### web · interactive hero demo (19)

- A `apps/web/src/components/marketing/demo/clock.ts` +60 −0
- A `apps/web/src/components/marketing/demo/demo-frame.tsx` +96 −0
- A `apps/web/src/components/marketing/demo/fixtures.ts` +92 −0
- A `apps/web/src/components/marketing/demo/model.ts` +37 −0
- A `apps/web/src/components/marketing/demo/parts.tsx` +144 −0
- A `apps/web/src/components/marketing/demo/platform-mark.tsx` +39 −0
- A `apps/web/src/components/marketing/demo/player.test.ts` +78 −0
- A `apps/web/src/components/marketing/demo/player.ts` +40 −0
- A `apps/web/src/components/marketing/demo/product-demo-lazy.tsx` +34 −0
- A `apps/web/src/components/marketing/demo/product-demo-static.tsx` +25 −0
- A `apps/web/src/components/marketing/demo/product-demo.tsx` +125 −0
- A `apps/web/src/components/marketing/demo/state.test.ts` +192 −0
- A `apps/web/src/components/marketing/demo/state.ts` +324 −0
- A `apps/web/src/components/marketing/demo/text.ts` +21 −0
- A `apps/web/src/components/marketing/demo/views/ai-setup.tsx` +63 −0
- A `apps/web/src/components/marketing/demo/views/attribution.tsx` +65 −0
- A `apps/web/src/components/marketing/demo/views/destinations.tsx` +86 −0
- A `apps/web/src/components/marketing/demo/views/live-events.tsx` +82 −0
- A `apps/web/src/components/marketing/demo/views/overview.tsx` +64 −0

### web · lib (knowledge loader, routes, seo, format, brand guard) (18)

- D `apps/web/src/lib/blog.ts` +0 −111
- A `apps/web/src/lib/brand-guard.test.ts` +106 −0
- A `apps/web/src/lib/format.test.ts` +50 −0
- A `apps/web/src/lib/format.ts` +62 −0
- M `apps/web/src/lib/integrations-catalog.ts` +893 −29
- A `apps/web/src/lib/knowledge-article.test.ts` +155 −0
- A `apps/web/src/lib/knowledge-article.ts` +234 −0
- A `apps/web/src/lib/knowledge-search.test.ts` +246 −0
- A `apps/web/src/lib/knowledge-search.ts` +446 −0
- A `apps/web/src/lib/knowledge.test.ts` +173 −0
- A `apps/web/src/lib/knowledge.ts` +537 −0
- D `apps/web/src/lib/legal-copy.ts` +0 −152
- D `apps/web/src/lib/marketing-copy.ts` +0 −243
- M `apps/web/src/lib/routes.ts` +64 −2
- M `apps/web/src/lib/seo-text.ts` +1 −1
- A `apps/web/src/lib/seo.test.ts` +119 −0
- M `apps/web/src/lib/seo.ts` +159 −12
- M `apps/web/src/lib/validation/auth.ts` +18 −0

### web · pricing components (17)

- A `apps/web/src/components/marketing/pricing/comparison-matrix.tsx` +188 −0
- A `apps/web/src/components/marketing/pricing/enterprise-panel.tsx` +62 −0
- A `apps/web/src/components/marketing/pricing/event-definition.tsx` +52 −0
- A `apps/web/src/components/marketing/pricing/included-strip.tsx` +18 −0
- A `apps/web/src/components/marketing/pricing/interval.tsx` +75 −0
- A `apps/web/src/components/marketing/pricing/overage-section.tsx` +81 −0
- A `apps/web/src/components/marketing/pricing/plan-cards.tsx` +114 −0
- A `apps/web/src/components/marketing/pricing/plan-cta.tsx` +29 −0
- A `apps/web/src/components/marketing/pricing/plan-selection.test.ts` +106 −0
- A `apps/web/src/components/marketing/pricing/plan-selection.ts` +95 −0
- A `apps/web/src/components/marketing/pricing/pricing-faq.tsx` +19 −0
- A `apps/web/src/components/marketing/pricing/pricing-helpers.test.ts` +182 −0
- A `apps/web/src/components/marketing/pricing/pricing-helpers.ts` +196 −0
- A `apps/web/src/components/marketing/pricing/pricing-tools.tsx` +271 −0
- A `apps/web/src/components/marketing/pricing/section.tsx` +24 −0
- A `apps/web/src/components/marketing/pricing/trial-note.tsx` +38 −0
- A `apps/web/src/components/marketing/pricing/use-stored-plan-selection.ts` +17 −0

### worker (16)

- M `apps/worker/package.json` +5 −2
- M `apps/worker/src/env.ts` +6 −0
- A `apps/worker/src/jobs/alerts-mail.ts` +83 −0
- A `apps/worker/src/jobs/alerts-text.ts` +453 −0
- A `apps/worker/src/jobs/alerts.test.ts` +471 −0
- A `apps/worker/src/jobs/alerts.ts` +749 −0
- A `apps/worker/src/jobs/destination-health.ts` +133 −0
- M `apps/worker/src/jobs/index.ts` +92 −10
- A `apps/worker/src/jobs/reconciliation.ts` +776 −0
- A `apps/worker/src/jobs/scheduled-publish.ts` +168 −0
- M `apps/worker/src/jobs/usage.ts` +74 −16
- M `apps/worker/src/main.ts` +10 −2
- M `apps/worker/src/pipeline.integration.test.ts` +2 −1
- M `apps/worker/src/stages/deliver.ts` +48 −2
- M `apps/worker/src/stages/ingest.ts` +98 −14
- A `apps/worker/src/stages/lineage.ts` +80 −0

### web · other components (15)

- M `apps/web/src/components/auth/accept-invitation.tsx` +20 −14
- D `apps/web/src/components/auth/auth-card.tsx` +0 −19
- A `apps/web/src/components/auth/auth-frame.tsx` +54 −0
- A `apps/web/src/components/auth/auth-preview.tsx` +48 −0
- A `apps/web/src/components/auth/auth-shell.tsx` +72 −0
- A `apps/web/src/components/auth/auth-signals.tsx` +31 −0
- A `apps/web/src/components/auth/domain.test.ts` +35 −0
- A `apps/web/src/components/auth/domain.ts` +42 −0
- M `apps/web/src/components/auth/login-form.tsx` +30 −16
- M `apps/web/src/components/auth/password-forms.tsx` +34 −30
- A `apps/web/src/components/auth/password-input.tsx` +30 −0
- M `apps/web/src/components/auth/resend-verification.tsx` +8 −3
- M `apps/web/src/components/auth/signup-form.tsx` +69 −40
- M `apps/web/src/components/auth/two-factor-form.tsx` +40 −18
- A `apps/web/src/components/theme-script.tsx` +10 −0

### web · API routes (13)

- A `apps/web/src/app/api/ai/chat/route.test.ts` +155 −0
- M `apps/web/src/app/api/ai/chat/route.ts` +78 −19
- A `apps/web/src/app/api/ai/confirm/route.test.ts` +131 −0
- M `apps/web/src/app/api/ai/confirm/route.ts` +34 −6
- A `apps/web/src/app/api/ai/dev-fixture/fixtures.test.ts` +32 −0
- A `apps/web/src/app/api/ai/dev-fixture/fixtures.ts` +36 −0
- A `apps/web/src/app/api/ai/dev-fixture/route.test.ts` +60 −0
- A `apps/web/src/app/api/ai/dev-fixture/route.ts` +27 −0
- M `apps/web/src/app/api/ai/wizard/route.test.ts` +16 −0
- A `apps/web/src/app/api/app/events/explorer/route.ts` +27 −0
- A `apps/web/src/app/api/app/events/test-lab/[runId]/route.ts` +21 −0
- M `apps/web/src/app/api/health/route.ts` +16 −9
- A `apps/web/src/app/api/knowledge/feedback/route.ts` +54 −0

### packages/catalog (tariff catalogue, new) (13)

- A `packages/catalog/eslint.config.mjs` +1 −0
- A `packages/catalog/package.json` +11 −0
- A `packages/catalog/src/calculators.ts` +129 −0
- A `packages/catalog/src/catalog.test.ts` +270 −0
- A `packages/catalog/src/features.ts` +111 −0
- A `packages/catalog/src/index.ts` +7 −0
- A `packages/catalog/src/overage.ts` +118 −0
- A `packages/catalog/src/plans.ts` +255 −0
- A `packages/catalog/src/records.ts` +67 −0
- A `packages/catalog/src/stripe.ts` +76 −0
- A `packages/catalog/src/types.ts` +68 −0
- A `packages/catalog/tsconfig.json` +5 −0
- A `packages/catalog/vitest.config.ts` +2 −0

### web · root app files (layout, fonts, globals, icons, manifest, robots, sitemaps) (12)

- A `apps/web/src/app/apple-icon.png` (binary)
- A `apps/web/src/app/fonts.ts` +16 −0
- A `apps/web/src/app/global-not-found.tsx` +37 −0
- M `apps/web/src/app/globals.css` +396 −0
- M `apps/web/src/app/icon.svg` +10 −6
- D `apps/web/src/app/layout.tsx` +0 −32
- A `apps/web/src/app/manifest.ts` +24 −0
- D `apps/web/src/app/not-found.tsx` +0 −19
- M `apps/web/src/app/robots.ts` +4 −2
- D `apps/web/src/app/sitemap.ts` +0 −35
- A `apps/web/src/app/sitemap.xml/route.ts` +8 −0
- A `apps/web/src/app/sitemaps/[name]/route.ts` +41 −0

### docs (12)

- M `docs/01-target-architecture.md` +1 −1
- M `docs/06-local-development.md` +2 −1
- M `docs/07-deployment-runbook.md` +25 −4
- M `docs/08-ai-and-secrets.md` +41 −0
- M `docs/11-track-redesign-program.md` +11 −11
- A `docs/13-knowledge-authoring.md` +133 −0
- A `docs/14-knowledge-content-rules.md` +85 −0
- A `docs/14-localization.md` +286 −0
- A `docs/15-living-ai-core.md` +98 −0
- A `docs/i18n-parity-report.json` +797 −0
- A `docs/i18n-parity-report.md` +100 −0
- A `docs/redirects-blog-to-tracking-knowledge.md` +118 −0

### web · legal copy ×6 (8)

- A `apps/web/src/lib/legal-copy/de.ts` +64 −0
- A `apps/web/src/lib/legal-copy/en.ts` +64 −0
- A `apps/web/src/lib/legal-copy/es.ts` +66 −0
- A `apps/web/src/lib/legal-copy/fr.ts` +66 −0
- A `apps/web/src/lib/legal-copy/index.ts` +55 −0
- A `apps/web/src/lib/legal-copy/it.ts` +67 −0
- A `apps/web/src/lib/legal-copy/legal-copy.test.ts` +25 −0
- A `apps/web/src/lib/legal-copy/nl.ts` +65 −0

### web · mail templates ×6 (8)

- A `apps/web/src/server/mail/templates/de.ts` +21 −0
- A `apps/web/src/server/mail/templates/en.ts` +21 −0
- A `apps/web/src/server/mail/templates/es.ts` +21 −0
- A `apps/web/src/server/mail/templates/fr.ts` +21 −0
- A `apps/web/src/server/mail/templates/index.ts` +45 −0
- A `apps/web/src/server/mail/templates/it.ts` +21 −0
- A `apps/web/src/server/mail/templates/nl.ts` +21 −0
- A `apps/web/src/server/mail/templates/templates.test.ts` +44 −0

### root (workspace, lockfile, env example, status, gitignore, scripts) (6)

- M `.env.example` +7 −3
- M `.gitignore` +1 −0
- M `IMPLEMENTATION_STATUS.md` +11 −6
- M `pnpm-lock.yaml` +519 −1743
- M `pnpm-workspace.yaml` +1 −0
- M `scripts/local-postgres.mjs` +42 −4

### web · public assets (brand) (6)

- A `apps/web/public/brand/icon-192.png` (binary)
- A `apps/web/public/brand/icon-512.png` (binary)
- A `apps/web/public/brand/logo-dark.svg` +14 −0
- A `apps/web/public/brand/logo.svg` +14 −0
- A `apps/web/public/brand/mark-dark.svg` +13 −0
- A `apps/web/public/brand/mark.svg` +13 −0

### web · scripts (parity, redirects, knowledge tooling, QA) (6)

- A `apps/web/scripts/i18n-parity.mjs` +376 −0
- A `apps/web/scripts/migrate-knowledge-frontmatter.mjs` +153 −0
- A `apps/web/scripts/rebrand-knowledge-content.mjs` +82 −0
- A `apps/web/scripts/redirect-matrix.mjs` +127 −0
- M `apps/web/scripts/seo-check.ts` +153 −41
- A `apps/web/scripts/validate-knowledge-content.mjs` +265 −0

### web · i18n routing and namespaces (5)

- A `apps/web/src/i18n/namespaces.test.ts` +85 −0
- A `apps/web/src/i18n/namespaces.ts` +41 −0
- M `apps/web/src/i18n/request.ts` +3 −3
- A `apps/web/src/i18n/routing.test.ts` +119 −0
- M `apps/web/src/i18n/routing.ts` +56 −8

### web · e2e (Playwright specs, visual baselines) (4)

- M `apps/web/e2e/app.spec.ts` +391 −16
- A `apps/web/e2e/auth-file.ts` +5 −0
- A `apps/web/e2e/auth.setup.ts` +20 −0
- M `apps/web/e2e/marketing.spec.ts` +128 −13

### web · config (next.config, playwright, package, vitest, tsconfig) (4)

- M `apps/web/next.config.ts` +67 −3
- M `apps/web/package.json` +3 −0
- M `apps/web/playwright.config.ts` +7 −2
- M `apps/web/vitest.config.ts` +11 −1

### web · other src (3)

- M `apps/web/src/env.ts` +7 −2
- A `apps/web/src/proxy.test.ts` +73 −0
- M `apps/web/src/proxy.ts` +43 −5

### collector (2)

- M `apps/collector/package.json` +1 −1
- M `apps/collector/src/shop-inbound.ts` +3 −3

### CI (1)

- M `.github/workflows/ci.yml` +2 −0

### web · destination wizard (1)

- M `apps/web/src/components/destinations/wizard.tsx` +2 −2

### packages · other (1)

- M `packages/connectors/src/webhook.ts` +1 −1

