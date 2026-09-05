# Responsive + accessibility sweep — findings (task S1, 2026-09-05)

Server: production build `apps/web/.next` (`BUILD_ID` per `docs/qa/2026-09-05/README.md`), `AI_DEV_FIXTURES=1 pnpm --filter @track-site/web start -p 3001`. Tooling: `apps/web/scripts/qa/responsive-a11y-sweep.mjs` (Playwright chromium 1234, axe-core via `@axe-core/playwright` 4.13, sharp for WebP). Raw data: `screenshots/responsive-sweep.jsonl` (one record per route × width, last record per key wins), merged into `screenshots/responsive-sweep.json`; generated reports `screenshots/responsive-sweep.md`, `axe/summary.md` + `axe/summary.json`, `axe/keyboard-summary.md` + `axe/keyboard/<slug>.json`. Every number below is taken from those files.

## Scope actually covered

- 56 routes × 6 widths = 336 route/width runs, 0 errors, every dashboard run on the stored owner session (`sessionOk` true in all 108 dashboard records).
  - Public (en + de): home, pricing, features, features/server-side-tracking, how-it-works, integrations, integrations/meta (first catalogue slug; `meta-conversions-api` does not exist), tracking-knowledge, tracking-knowledge/consent-mode-v2-guide, docs, contact, security, privacy, login, signup. Home and pricing additionally in fr, es, it, nl.
  - Dashboard: /app, /app/ai-setup, /app/events, /app/events/matrix, /app/events/explorer, /app/events/test-lab, /app/destinations, /app/data-quality, /app/data-quality/revenue-leaks, /app/consent, /app/consent/simulator, /app/insights/attribution, /app/releases, /app/billing, /app/billing/usage, /app/team, /app/settings, /app/settings/alerts.
- Widths 320 and 375 with mobile emulation (`isMobile`, `hasTouch`), 768/1024/1440/1920 desktop, height 900, `deviceScaleFactor` 1, light scheme.
- Screenshots: 633 WebP files under `screenshots/<route-slug>/<width>[--partN].webp` (full page at 375/768/1440/1920 capped at 6000 px and split into ≤ 150 KB segments at native width; viewport at 320/1024; the viewport-fixed dashboard shell additionally captured per scroll segment of the main region), plus 120 keyboard crops under `screenshots/keyboard/` and 8 targeted evidence shots (listed below). All 761 files are ≤ 150 KB (`find screenshots -name '*.webp' -size +150k` → 0). Quality: 346 files q70, 282 q60, 5 q50 (segments of very long pages that stayed above 150 KB at q60).
- axe: 96 runs (public en/de × {375, 1440} = 60, dashboard × {375, 1440} = 36), tags wcag2a + wcag2aa + wcag22aa, all impacts. Raw JSON per run: `axe/<slug>--<width>.json`.
- Keyboard: 40 × Tab on /en, /en/pricing, /app at 1440 with transitions disabled; focused vs blurred computed styles compared (an outline counts only with `outline-style ≠ none`, a box-shadow only with a non-transparent layer).

## Findings

Severity follows the task rubric (hidden primary action = critical, horizontal scroll = serious, clipped heading/button text = serious, axe as reported).

### F1 — critical — dashboard shell is wider than the viewport on every /app route at 320, 375 and 768 px; header actions and page content are cut off

- Evidence: `responsive-sweep.json` → every dashboard record at 320/375 lists `header` and the shell grid `div` at 469 px (`appMain.clientWidth` 469); at 768 the header is 1104 px and `app-main` 1083 px. `html`/`body` carry `overflow: hidden`, so there is no scrollbar and `documentElement.scrollWidth` stays at the viewport width — the overflow is simply invisible. Primary-action check: the account menu (`header > div:last-child button[aria-haspopup='menu']`, 397–461 px at 320/375, 1024–1088 px at 768) is "outside-viewport-hidden-overflow" on all 18 routes at each of the three widths (54 runs); the Track AI header launcher sits at 353–393 px (cut at 375, fully outside at 320; 913–1016 px at 768) and is only reachable through the floating mobile FAB; at 768 the page-level primary button of /app ("Open AI Setup", 712–832 px) is cut as well.
- Screenshots: `screenshots/app-overview/375.webp` (469 px wide capture — everything right of 375 px is invisible on a phone), `screenshots/app-overview/375--viewport-only.webp`, `screenshots/app-overview/768.webp` (1104 px capture), `screenshots/app-overview/768--viewport-only.webp`, `screenshots/app-alerts/320.webp` (text cut mid-word on every line).
- Root cause (`apps/web/src/components/app/shell/app-shell.tsx`): the shell is `grid h-dvh grid-rows-[auto_minmax(0,1fr)]` without a column definition, so the implicit `auto` column grows to the header's min-content width. The header row is a flex row whose children are `shrink-0` / `whitespace-nowrap` buttons (workspace switcher with organisation + site, environment indicator at ≥ sm, palette button with label + kbd at ≥ md, Track AI launcher with label at ≥ sm, user menu); their sum is 469 px below sm and 1104 px at 768. `main` gets the same track width.
- Suggested fix: constrain the shell column (`grid-cols-[minmax(0,1fr)]` or `min-w-0 max-w-full overflow-x-clip` on the header), let the header groups shrink (`min-w-0`, truncate the switcher labels, collapse the palette label below lg and the launcher label below md), and add an e2e assertion `header.getBoundingClientRect().right <= innerWidth` at 320/375/768.

### F2 — serious — home hero demo breaks at 1024 px (all six locales)

- Evidence: `screenshots/{en,de,fr,es,it,nl}-home/1024.webp`: metric tiles show truncated labels ("ACCEPT", "DELIVE", "DUPLIC REMOV", "BLOCKED BY CONSENT" over the flow diagram), the "Latest events" outcome chips are cut at the panel edge ("Dupli", "Held", "Deliv", "Block"), the "Attribution" tab is cut, and the recommendation card wraps one word per line with the "Open AI Setup" button painted over the text. `responsive-sweep.json` lists the outcome chips (`span.inline-flex … text-micro`, 78–127 px wide, right edge 1026–1055 px) as wider than the viewport for de/fr/es/it/nl at 1024 (clipped by the panel's `overflow-hidden`; the en chips are within the 1 px tolerance but visibly cut in the screenshot).
- Root cause: `apps/web/src/components/marketing/home/hero.tsx` switches to two columns at lg (`lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]`), which gives the demo ≈ 500 px at 1024, while `components/marketing/demo/views/overview.tsx` keeps its md layout (`md:grid-cols-[1.05fr_1fr]`, 4 metric tiles). 768 (`screenshots/en-home/768.webp`) and 1440 are fine.
- Suggested fix: keep the demo full-width until xl, or use container queries on the demo frame so the compact (mobile) layout is used while the panel is narrower than ≈ 640 px.

### F3 — serious — horizontal page scroll on de/nl pricing at 768 px caused by sr-only spans in the comparison matrix

- Evidence: `responsive-sweep.json` de-pricing@768 `scrollWidth` 820 > `clientWidth` 768, nl-pricing@768 781 > 768; `absOffenders` lists 1 × 1 px `span.sr-only` ("Enthalten") at x = 819 with containing block "initial containing block". `screenshots/de-pricing/768--scrolled-right.webp` shows the page scrolled 52 px to the right (brand cut on the left, blank strip on the right).
- Root cause: the matrix table sits in the `ScrollRegion` wrapper (`overflow-x-auto`) but the wrapper is not positioned, so absolutely positioned sr-only spans inside the wide table escape the scroller and extend the page. The same mechanism produces `appMain.scrollWidth > clientWidth` on /app/destinations, /app/consent/simulator and /app/insights/attribution at 1024–1920 (sr-only "Actions" spans at x ≈ 1442, containing block `main`); there it is invisible because `main` uses `overflow-x: clip`.
- Suggested fix: add `relative` to `packages/ui/src/primitives/scroll-region.tsx` (and to the MDX table wrapper) so sr-only descendants stay inside the scroll container.

### F4 — serious — French home at 320 px: hero heading, copy, input and CTA cut off on the right

- Evidence: `screenshots/fr-home/320.webp` (h1 "Un snippet. Toutes les plateformes…" cut after "Toute", paragraph cut mid-word, input and "Commencer avec votre domaine" button cut); `responsive-sweep.json` fr-home@320 `div.max-w-xl` 320 px wide at 16–336 px (clipped by the section's `overflow-hidden`).
- Root cause: the `whitespace-nowrap` lg-size button "Commencer avec votre domaine" is 320 px wide and cannot shrink inside the `sm:flex-row` form, so the single implicit grid column of the hero grows to 320 px. en/de/es/it/nl fit at 320; fr fits from 375.
- Suggested fix: allow the hero CTA to wrap (`whitespace-normal`) or set `min-w-0` + `text-wrap: balance` for the domain form button, and add 320 px to the visual regression pass for all six locales.

### F5 — serious — French pricing at 320 px: horizontal page scroll (338 px) from the overage table and the Enterprise CTA

- Evidence: `responsive-sweep.json` fr-pricing@320 `scrollWidth` 338 > 320; wide elements `span.shrink-0.text-right` "18 € par 1 000 000 événements" (124–338 px, not clipped) and the Enterprise button "Contacter l'équipe commerciale" (290 px, 41–331 px, cut by the panel's `overflow-hidden`). Screenshots: `screenshots/fr-pricing/320--overage.webp`, `screenshots/fr-pricing/320--enterprise-cta.webp`.
- Suggested fix: let the overage price span wrap (`shrink` + `text-wrap: balance`) and the Enterprise CTA wrap (`whitespace-normal`) below sm.

### F6 — serious — every nl public page with the full footer scrolls horizontally at 1024 px

- Evidence: `responsive-sweep.json` nl-home@1024 and nl-pricing@1024 `scrollWidth` 1036 > 1024; wide element `a` "Verwerkersovereenkomst" (169 px, 867–1036 px, not clipped). `screenshots/nl-home/1024--footer.webp` (link cut at the viewport edge) and `screenshots/nl-home/1024--footer-scrolled-right.webp`.
- Root cause: `components/marketing/footer.tsx` uses six columns at lg (`lg:grid-cols-[minmax(0,1.4fr)_repeat(5,minmax(0,1fr))]`), ≈ 140 px per column at 1024, and the link is `inline-flex` (no wrapping for the single 169 px word).
- Suggested fix: `break-words`/`hyphens-auto` on footer links or five columns at lg and six at xl.

### F7 — serious — no visible keyboard focus on the workspace switcher and account menu triggers (/app)

- Evidence: `axe/keyboard/app-overview.json` steps 2, 3, 4, 7 (`Organization: Acme Demo`, `Site: Acme Shop A7K2Q9`, `Environment: Production`, `Account menu`): `visibleIndicator` false, computed `outline-style: none` with `outline-width: 2px`, `box-shadow: none`; crops `screenshots/keyboard/app-overview/tab-02.webp` … `tab-04.webp`, `tab-07.webp` show no ring. 36 of 40 tab stops on /app and 40/40 on /en and /en/pricing have a visible indicator (`axe/keyboard-summary.md`).
- Root cause: the shared `Menu` trigger (`apps/web/src/components/app/shell/menu.tsx` line 144, also the item class on line 54) combines Tailwind v4 `outline-none` (sets `--tw-outline-style: none`) with `focus-visible:outline-2` (`outline-style: var(--tw-outline-style)`), so the outline never renders. The same combination exists in `assistant-host.tsx` (line 143) and `command-palette.tsx` (line 77); `packages/ui/src/primitives/scroll-region.tsx` uses it too but rendered a solid outline in the pass (step 17 on /en).
- Suggested fix: replace `outline-none` with `outline-hidden` (Tailwind v4) or add `focus-visible:outline-solid`, then extend `app.spec.ts` with a focus-visible assertion on the switcher.

### F8 — serious (axe) — knowledge article tables are scrollable regions without keyboard access at 375 px

- Evidence: `axe/en-knowledge-article-consent-mode-v2-guide--375.json` and `axe/de-…--375.json`: `scrollable-region-focusable` (serious), node `<div class="my-6 w-full min-w-0 overflow-x-auto">`. These are the only axe violations in 96 runs (`axe/summary.md`).
- Root cause: `components/marketing/knowledge/article/mdx-components.tsx` `TableBlock` wraps MDX tables in a plain div instead of the `ScrollRegion` primitive (which adds `tabindex="0"` + `role="region"` only while the table overflows).
- Suggested fix: use `ScrollRegion` (with a localized label) in `TableBlock`.

### F9 — moderate — Consent Impact Simulator: "Run simulation" only reachable after scrolling to the end of a 9 000 px page; results table cut at 1440 px

- Evidence: `responsive-sweep.json` app-consent-simulator@{1024,1440,1920} primary check "not-scrollable-into-view" (button top 906 px after `scrollIntoView`); probe: the form card is `position: sticky` and 939 px tall inside an 844 px main region (`scrollHeight` 9033), the button becomes visible only at `scrollTop` ≈ 8189. `screenshots/app-consent-simulator/1440--sticky-form-mid-scroll.webp` shows the pinned form without its submit button and the third results column truncated ("Not fo…", "Destination r…").
- Suggested fix: make the sticky card `max-h-[calc(100dvh-…)] overflow-y-auto` or pin only the submit row; give the results table a horizontal scroll affordance or stacked layout when the AI panel is open.

### F10 — moderate — knowledge article and other long pages: `color-contrast` left "incomplete" by axe

- Evidence: 1 935 `incomplete` nodes for `color-contrast` across the 96 runs (`axe/summary.json` → `runs[].incomplete`), plus 2 × `th-has-data-cells`. axe could not compute the contrast (gradient/overlay backgrounds, e.g. the dark product stages and the Living AI Core panel); these are not violations but need a manual contrast check.

## Observations (not counted as defects)

- Full-page captures are capped at 6 000 px, so pages such as `en-home` at 375 (15 440 px) are only partially covered; 219 records were cut at the cap.
- The Track AI panel in the dashboard screenshots shows the dev-fixture transcript (`AI_DEV_FIXTURES=1`, off-topic prompts with repeated "Check whether my tracking snippet is installed" quick actions) — a consequence of the fixture route, not of the product UI.
- Dashboard full-page screenshots equal the viewport because the shell is viewport-fixed (`h-dvh`); the scrolling main region is captured as `--partN` segments instead.
- Heuristic limits: the "clipped text" check (`scrollWidth > clientWidth` on h1–h3/buttons/links) fired 0 times — the visible truncations in F1/F2/F4 come from ancestors clipping the element, which the "elements wider than the viewport" walk and the screenshots capture instead. Elements inside `overflow-x: auto` containers are treated as intended scrollers.

## Evidence index

| File | Content |
| --- | --- |
| `screenshots/responsive-sweep.md` | totals, per-check sections and the full route × width matrix |
| `screenshots/responsive-sweep.json` / `.jsonl` | raw records (measurements, primary-action attempts, screenshot files/sizes, axe counts) |
| `screenshots/<route-slug>/<width>[--partN].webp` | 633 route screenshots |
| `screenshots/app-overview/{375,768}--viewport-only.webp`, `screenshots/app-alerts/320.webp` | F1 |
| `screenshots/{en,nl}-home/1024.webp` | F2 |
| `screenshots/de-pricing/768--scrolled-right.webp` | F3 |
| `screenshots/fr-home/320.webp` | F4 |
| `screenshots/fr-pricing/320--overage.webp`, `320--enterprise-cta.webp` | F5 |
| `screenshots/nl-home/1024--footer.webp`, `1024--footer-scrolled-right.webp` | F6 |
| `axe/keyboard-summary.md`, `axe/keyboard/*.json`, `screenshots/keyboard/<slug>/tab-NN.webp` | F7 and the full focus order |
| `axe/summary.md`, `axe/summary.json`, `axe/<slug>--<width>.json` | F8, F10 |
| `screenshots/app-consent-simulator/1440--sticky-form-mid-scroll.webp` | F9 |
