# Before/after screenshots — Track redesign (2026-09-05)

Supplement §11 "Abschlussbelege" 2: full-page captures of the pre-redesign build (**before**) and the redesign build (**after**) at 375, 768, 1440 and 1920 px. Every image was taken from a running production build (`next start`) with Playwright Chromium 1.62 (`deviceScaleFactor: 1`, `fullPage: true`, `animations: "disabled"`, default motion preference, locale en-US, time zone Europe/Berlin) after one scroll sweep to mount lazy sections, then converted to WebP with sharp; every file is ≤ 150 KB (largest 150 KB, verified by decoding every file). Pages whose full-page WebP did not fit 150 KB at quality ≥ 45 (or exceeded the WebP height limit of 16 383 px) are stored as vertical parts `…-part1`, `…-part2`, … in reading order. Machine-readable details per capture (URL, HTTP status, final URL, page height, viewport, captured width, file sizes, WebP quality, `horizontalOverflow` = `scrollWidth > clientWidth` of the document) are in [`capture.json`](./capture.json); the route pairing is in [`mapping.json`](./mapping.json).

| Baseline | Tree | Commit | Server |
| --- | --- | --- | --- |
| before | `C:/Users/Soheil/Downloads/track-site-before` (git worktree, detached HEAD) | `0f0f5b5` | `http://localhost:3004` (`pnpm --filter @track-site/web start -p 3004` in the worktree; `apps/web/.next` BUILD_ID `sb9bxPyxbPMYA9tK0DYEV`) |
| after | `C:/Users/Soheil/Downloads/track.site` (branch `feat/ai-tag-manager-platform`) | `85fe3b7` | `http://localhost:3005` (`AI_DEV_FIXTURES=1 pnpm --filter @track-site/web start -p 3005`; `apps/web/.next` BUILD_ID `rCAJOqYs841hSlnLSc99W`) |

Captured 2026-09-05 between 11:43 and 12:25 local time (capture.json `generatedAt` 2026-09-05T10:21:23.824Z is the time of the last manifest write). Dashboard pages use the stored session of the seeded owner (`apps/web/e2e/.auth/owner.json`, `owner@acme.test`) on both servers; both builds read the same local database (`tracksite_dev`, migrated to the after schema). File layout: `<page>/{before,after}-<width>[-partN].webp`.

## Limitations of the before build

- `/pricing` and `/de/pricing` return HTTP 500 in the before build: `TypeError: Cannot read properties of null (reading 'toLocaleString')` in the plan `limits` renderer (server log of port 3004, digests 557298358 and 4007629679). The before tree reads the shared database, which was migrated to the after schema (`0013_alerts.sql`); the old columns the before pricing page reads from `plans` are null there. The `before-*.webp` files of both pricing pages show the rendered error state ("Something went wrong … Try again") inside the old header and footer.
- `/app` and `/app/debugger` of the before build render (h1 "Overview" and "Event debugger" recorded in capture.json), but at 1440 and 1920 px `page.goto(…, waitUntil: "networkidle")` timed out after 45 s (a request keeps polling); the capture continued after the timeout, so `status` is null for those four records although the screenshot shows the rendered page.
- `/app/releases` does not exist in the before build (HTTP 404 on port 3004) and the locales fr, es, it and nl do not exist there (the before build serves only `/` and `/de`): these pages have `after` captures only.
- Both builds use the same local database, so the before dashboard pages show the seeded organisation (Acme Demo / Acme Shop) with the after schema. The Track AI panel of the after build shows the persisted transcript of the seeded owner, including messages sent by other e2e runs on the same database (for example the scope tests of `apps/web/e2e/app.spec.ts`).
- Captures use the default motion preference; the after home page therefore shows the interactive demo at whatever stream step it had reached when the screenshot was taken (the visual-regression baselines in `apps/web/e2e/__screenshots__` use reduced motion instead).

## Horizontal overflow observed

A full-page capture is as wide as the document's scrollable width. Every capture wider than its viewport is listed here (supplement §10: no horizontal page scroll). `document flag` is `scrollWidth > clientWidth` measured on the page before the screenshot.

| Page | Side | Viewport | Captured width | Document flag |
| --- | --- | --- | --- | --- |
| `home-en` | before | 768 px | 845 px | yes |
| `home-de` | before | 768 px | 978 px | yes |
| `pricing-en` | before | 768 px | 845 px | yes |
| `pricing-de` | before | 768 px | 978 px | yes |
| `pricing-de` | after | 768 px | 820 px | yes |
| `pricing-nl` | after | 768 px | 781 px | yes |
| `knowledge-en` | before | 768 px | 845 px | yes |
| `knowledge-de` | before | 768 px | 978 px | yes |
| `article-consent-mode-v2-guide-en` | before | 375 px | 601 px | yes |
| `article-consent-mode-v2-guide-en` | before | 768 px | 845 px | yes |
| `article-consent-mode-v2-guide-de` | before | 375 px | 611 px | yes |
| `article-consent-mode-v2-guide-de` | before | 768 px | 978 px | yes |
| `features-en` | before | 768 px | 845 px | yes |
| `integrations-en` | before | 768 px | 845 px | yes |
| `login-en` | before | 768 px | 845 px | yes |
| `login-de` | before | 768 px | 978 px | yes |
| `signup-en` | before | 768 px | 845 px | yes |
| `signup-de` | before | 768 px | 978 px | yes |
| `app-overview` | after | 375 px | 461 px | no |
| `app-overview` | after | 768 px | 1104 px | no |
| `app-events-explorer` | after | 375 px | 461 px | no |
| `app-events-explorer` | after | 768 px | 1104 px | no |
| `app-releases` | after | 375 px | 461 px | no |
| `app-releases` | after | 768 px | 1104 px | no |

## Pages

### Home (English) (`home-en`)

before: `/` on :3004 · after: `/en` on :3005

| | 375 | 768 | 1440 | 1920 |
| --- | --- | --- | --- | --- |
| before | [before-375-part1](./home-en/before-375-part1.webp) (146 KB)<br>[before-375-part2](./home-en/before-375-part2.webp) (112 KB)<br><sub>7943 px tall</sub> | [before-768-part1](./home-en/before-768-part1.webp) (136 KB)<br>[before-768-part2](./home-en/before-768-part2.webp) (127 KB)<br><sub>4834 px tall, 845 px wide (horizontal overflow)</sub> | [before-1440-part1](./home-en/before-1440-part1.webp) (136 KB)<br>[before-1440-part2](./home-en/before-1440-part2.webp) (130 KB)<br><sub>4032 px tall</sub> | [before-1920-part1](./home-en/before-1920-part1.webp) (138 KB)<br>[before-1920-part2](./home-en/before-1920-part2.webp) (132 KB)<br><sub>4032 px tall</sub> |
| after | [after-375-part1](./home-en/after-375-part1.webp) (138 KB)<br>[after-375-part2](./home-en/after-375-part2.webp) (142 KB)<br>[after-375-part3](./home-en/after-375-part3.webp) (130 KB)<br><sub>15092 px tall</sub> | [after-768-part1](./home-en/after-768-part1.webp) (127 KB)<br>[after-768-part2](./home-en/after-768-part2.webp) (131 KB)<br>[after-768-part3](./home-en/after-768-part3.webp) (129 KB)<br>[after-768-part4](./home-en/after-768-part4.webp) (129 KB)<br><sub>10389 px tall</sub> | [after-1440-part1](./home-en/after-1440-part1.webp) (122 KB)<br>[after-1440-part2](./home-en/after-1440-part2.webp) (145 KB)<br>[after-1440-part3](./home-en/after-1440-part3.webp) (124 KB)<br>[after-1440-part4](./home-en/after-1440-part4.webp) (123 KB)<br><sub>8028 px tall</sub> | [after-1920-part1](./home-en/after-1920-part1.webp) (124 KB)<br>[after-1920-part2](./home-en/after-1920-part2.webp) (147 KB)<br>[after-1920-part3](./home-en/after-1920-part3.webp) (124 KB)<br>[after-1920-part4](./home-en/after-1920-part4.webp) (124 KB)<br><sub>8028 px tall</sub> |

Change: Brand `track.site` becomes `Track`; the header gets dropdown navigation (Product, Integrations, Resources, Pricing) and a six-language switcher instead of an English/German select; the static hero preview card (tracking health 92/100, four rows) is replaced by an interactive demo (Overview / Live Events / Destinations / AI Setup / Attribution tabs, health score 70/100, event list with browser/server origin and delivery state, recommendation, pause/next/reset); the section sequence changes from text intro → four how-it-works cards → six feature cards → 25-card destination grid → privacy list + CTA card to platforms and shop systems → three outcomes → dark "Snippet → Track → Platforms" flow with the snippet code → guided setup with a Track AI conversation panel → use cases → consent/security/EU data columns → three knowledge articles → pricing teaser (19 €, 90 € recommended, 180 €, Enterprise custom) → dark CTA band; page height at 1440 px 4 032 → 8 028 px.

### Home (German) (`home-de`)

before: `/de` on :3004 · after: `/de` on :3005

| | 375 | 768 | 1440 | 1920 |
| --- | --- | --- | --- | --- |
| before | [before-375-part1](./home-de/before-375-part1.webp) (131 KB)<br>[before-375-part2](./home-de/before-375-part2.webp) (119 KB)<br><sub>8215 px tall</sub> | [before-768-part1](./home-de/before-768-part1.webp) (146 KB)<br>[before-768-part2](./home-de/before-768-part2.webp) (143 KB)<br><sub>5058 px tall, 978 px wide (horizontal overflow)</sub> | [before-1440-part1](./home-de/before-1440-part1.webp) (123 KB)<br>[before-1440-part2](./home-de/before-1440-part2.webp) (141 KB)<br><sub>4196 px tall</sub> | [before-1920-part1](./home-de/before-1920-part1.webp) (125 KB)<br>[before-1920-part2](./home-de/before-1920-part2.webp) (142 KB)<br><sub>4196 px tall</sub> |
| after | [after-375-part1](./home-de/after-375-part1.webp) (143 KB)<br>[after-375-part2](./home-de/after-375-part2.webp) (145 KB)<br>[after-375-part3](./home-de/after-375-part3.webp) (143 KB)<br><sub>15723 px tall</sub> | [after-768-part1](./home-de/after-768-part1.webp) (138 KB)<br>[after-768-part2](./home-de/after-768-part2.webp) (146 KB)<br>[after-768-part3](./home-de/after-768-part3.webp) (145 KB)<br>[after-768-part4](./home-de/after-768-part4.webp) (145 KB)<br><sub>10674 px tall</sub> | [after-1440-part1](./home-de/after-1440-part1.webp) (131 KB)<br>[after-1440-part2](./home-de/after-1440-part2.webp) (147 KB)<br>[after-1440-part3](./home-de/after-1440-part3.webp) (127 KB)<br>[after-1440-part4](./home-de/after-1440-part4.webp) (147 KB)<br><sub>8384 px tall</sub> | [after-1920-part1](./home-de/after-1920-part1.webp) (133 KB)<br>[after-1920-part2](./home-de/after-1920-part2.webp) (148 KB)<br>[after-1920-part3](./home-de/after-1920-part3.webp) (128 KB)<br>[after-1920-part4](./home-de/after-1920-part4.webp) (149 KB)<br><sub>8384 px tall</sub> |

Change: Same structural change as the English home page with German copy (h1 "Ein Snippet. Jede Plattform. Consent eingebaut." → "Ein Snippet. Jede Plattform. Jede Conversion genau einmal gezählt."); "Blog" in header and footer becomes "Tracking Knowledge"; the footer language switcher lists English, Deutsch, Français, Español, Italiano, Nederlands; page height at 1440 px 4 196 → 8 384 px.

### Home (French) (`home-fr`)

before: none (locale fr did not exist in the before build) · after: `/fr` on :3005

| | 375 | 768 | 1440 | 1920 |
| --- | --- | --- | --- | --- |
| before | — | — | — | — |
| after | [after-375-part1](./home-fr/after-375-part1.webp) (116 KB)<br>[after-375-part2](./home-fr/after-375-part2.webp) (126 KB)<br>[after-375-part3](./home-fr/after-375-part3.webp) (104 KB)<br>[after-375-part4](./home-fr/after-375-part4.webp) (106 KB)<br>[after-375-part5](./home-fr/after-375-part5.webp) (128 KB)<br>[after-375-part6](./home-fr/after-375-part6.webp) (70 KB)<br><sub>16503 px tall</sub> | [after-768-part1](./home-fr/after-768-part1.webp) (125 KB)<br>[after-768-part2](./home-fr/after-768-part2.webp) (139 KB)<br>[after-768-part3](./home-fr/after-768-part3.webp) (145 KB)<br>[after-768-part4](./home-fr/after-768-part4.webp) (135 KB)<br><sub>11219 px tall</sub> | [after-1440-part1](./home-fr/after-1440-part1.webp) (142 KB)<br>[after-1440-part2](./home-fr/after-1440-part2.webp) (146 KB)<br>[after-1440-part3](./home-fr/after-1440-part3.webp) (149 KB)<br>[after-1440-part4](./home-fr/after-1440-part4.webp) (145 KB)<br><sub>8815 px tall</sub> | [after-1920-part1](./home-fr/after-1920-part1.webp) (145 KB)<br>[after-1920-part2](./home-fr/after-1920-part2.webp) (147 KB)<br>[after-1920-part3](./home-fr/after-1920-part3.webp) (126 KB)<br>[after-1920-part4](./home-fr/after-1920-part4.webp) (147 KB)<br><sub>8815 px tall</sub> |

Change: After only: French home page with the same section order as `/en` (h1 "Un snippet. Toutes les plateformes. Chaque conversion comptée une seule fois."); the before build has no French route.

### Home (Spanish) (`home-es`)

before: none (locale es did not exist in the before build) · after: `/es` on :3005

| | 375 | 768 | 1440 | 1920 |
| --- | --- | --- | --- | --- |
| before | — | — | — | — |
| after | [after-375-part1](./home-es/after-375-part1.webp) (115 KB)<br>[after-375-part2](./home-es/after-375-part2.webp) (122 KB)<br>[after-375-part3](./home-es/after-375-part3.webp) (93 KB)<br>[after-375-part4](./home-es/after-375-part4.webp) (99 KB)<br>[after-375-part5](./home-es/after-375-part5.webp) (124 KB)<br>[after-375-part6](./home-es/after-375-part6.webp) (63 KB)<br><sub>16125 px tall</sub> | [after-768-part1](./home-es/after-768-part1.webp) (121 KB)<br>[after-768-part2](./home-es/after-768-part2.webp) (139 KB)<br>[after-768-part3](./home-es/after-768-part3.webp) (144 KB)<br>[after-768-part4](./home-es/after-768-part4.webp) (131 KB)<br><sub>10986 px tall</sub> | [after-1440-part1](./home-es/after-1440-part1.webp) (147 KB)<br>[after-1440-part2](./home-es/after-1440-part2.webp) (145 KB)<br>[after-1440-part3](./home-es/after-1440-part3.webp) (149 KB)<br>[after-1440-part4](./home-es/after-1440-part4.webp) (129 KB)<br><sub>8389 px tall</sub> | [after-1920-part1](./home-es/after-1920-part1.webp) (148 KB)<br>[after-1920-part2](./home-es/after-1920-part2.webp) (146 KB)<br>[after-1920-part3](./home-es/after-1920-part3.webp) (126 KB)<br>[after-1920-part4](./home-es/after-1920-part4.webp) (130 KB)<br><sub>8389 px tall</sub> |

Change: After only: Spanish home page with the same section order as `/en` (h1 "Un snippet. Todas las plataformas. Cada conversión contada una sola vez."); the before build has no Spanish route.

### Home (Italian) (`home-it`)

before: none (locale it did not exist in the before build) · after: `/it` on :3005

| | 375 | 768 | 1440 | 1920 |
| --- | --- | --- | --- | --- |
| before | — | — | — | — |
| after | [after-375-part1](./home-it/after-375-part1.webp) (150 KB)<br>[after-375-part2](./home-it/after-375-part2.webp) (139 KB)<br>[after-375-part3](./home-it/after-375-part3.webp) (140 KB)<br><sub>15671 px tall</sub> | [after-768-part1](./home-it/after-768-part1.webp) (139 KB)<br>[after-768-part2](./home-it/after-768-part2.webp) (143 KB)<br>[after-768-part3](./home-it/after-768-part3.webp) (135 KB)<br>[after-768-part4](./home-it/after-768-part4.webp) (146 KB)<br><sub>10673 px tall</sub> | [after-1440-part1](./home-it/after-1440-part1.webp) (135 KB)<br>[after-1440-part2](./home-it/after-1440-part2.webp) (144 KB)<br>[after-1440-part3](./home-it/after-1440-part3.webp) (124 KB)<br>[after-1440-part4](./home-it/after-1440-part4.webp) (142 KB)<br><sub>8303 px tall</sub> | [after-1920-part1](./home-it/after-1920-part1.webp) (137 KB)<br>[after-1920-part2](./home-it/after-1920-part2.webp) (146 KB)<br>[after-1920-part3](./home-it/after-1920-part3.webp) (125 KB)<br>[after-1920-part4](./home-it/after-1920-part4.webp) (144 KB)<br><sub>8303 px tall</sub> |

Change: After only: Italian home page with the same section order as `/en` (h1 "Uno snippet. Ogni piattaforma. Ogni conversione contata una sola volta."); the before build has no Italian route.

### Home (Dutch) (`home-nl`)

before: none (locale nl did not exist in the before build) · after: `/nl` on :3005

| | 375 | 768 | 1440 | 1920 |
| --- | --- | --- | --- | --- |
| before | — | — | — | — |
| after | [after-375-part1](./home-nl/after-375-part1.webp) (149 KB)<br>[after-375-part2](./home-nl/after-375-part2.webp) (142 KB)<br>[after-375-part3](./home-nl/after-375-part3.webp) (141 KB)<br><sub>15604 px tall</sub> | [after-768-part1](./home-nl/after-768-part1.webp) (136 KB)<br>[after-768-part2](./home-nl/after-768-part2.webp) (142 KB)<br>[after-768-part3](./home-nl/after-768-part3.webp) (139 KB)<br>[after-768-part4](./home-nl/after-768-part4.webp) (143 KB)<br><sub>10705 px tall</sub> | [after-1440-part1](./home-nl/after-1440-part1.webp) (131 KB)<br>[after-1440-part2](./home-nl/after-1440-part2.webp) (144 KB)<br>[after-1440-part3](./home-nl/after-1440-part3.webp) (124 KB)<br>[after-1440-part4](./home-nl/after-1440-part4.webp) (148 KB)<br><sub>8235 px tall</sub> | [after-1920-part1](./home-nl/after-1920-part1.webp) (133 KB)<br>[after-1920-part2](./home-nl/after-1920-part2.webp) (146 KB)<br>[after-1920-part3](./home-nl/after-1920-part3.webp) (126 KB)<br>[after-1920-part4](./home-nl/after-1920-part4.webp) (122 KB)<br><sub>8235 px tall</sub> |

Change: After only: Dutch home page with the same section order as `/en` (h1 "Eén snippet. Elk platform. Elke conversie één keer geteld."); the before build has no Dutch route.

### Pricing (English) (`pricing-en`)

before: `/pricing` on :3004 · after: `/en/pricing` on :3005

| | 375 | 768 | 1440 | 1920 |
| --- | --- | --- | --- | --- |
| before | [before-375](./pricing-en/before-375.webp) (30 KB)<br><sub>1683 px tall HTTP 500</sub> | [before-768](./pricing-en/before-768.webp) (35 KB)<br><sub>1024 px tall, 845 px wide (horizontal overflow) HTTP 500</sub> | [before-1440](./pricing-en/before-1440.webp) (36 KB)<br><sub>900 px tall HTTP 500</sub> | [before-1920](./pricing-en/before-1920.webp) (37 KB)<br><sub>1080 px tall HTTP 500</sub> |
| after | [after-375-part1](./pricing-en/after-375-part1.webp) (142 KB)<br>[after-375-part2](./pricing-en/after-375-part2.webp) (132 KB)<br>[after-375-part3](./pricing-en/after-375-part3.webp) (138 KB)<br><sub>14849 px tall</sub> | [after-768-part1](./pricing-en/after-768-part1.webp) (111 KB)<br>[after-768-part2](./pricing-en/after-768-part2.webp) (131 KB)<br>[after-768-part3](./pricing-en/after-768-part3.webp) (96 KB)<br>[after-768-part4](./pricing-en/after-768-part4.webp) (66 KB)<br>[after-768-part5](./pricing-en/after-768-part5.webp) (97 KB)<br>[after-768-part6](./pricing-en/after-768-part6.webp) (74 KB)<br><sub>14173 px tall</sub> | [after-1440-part1](./pricing-en/after-1440-part1.webp) (144 KB)<br>[after-1440-part2](./pricing-en/after-1440-part2.webp) (149 KB)<br>[after-1440-part3](./pricing-en/after-1440-part3.webp) (94 KB)<br>[after-1440-part4](./pricing-en/after-1440-part4.webp) (133 KB)<br><sub>9951 px tall</sub> | [after-1920-part1](./pricing-en/after-1920-part1.webp) (146 KB)<br>[after-1920-part2](./pricing-en/after-1920-part2.webp) (123 KB)<br>[after-1920-part3](./pricing-en/after-1920-part3.webp) (96 KB)<br>[after-1920-part4](./pricing-en/after-1920-part4.webp) (135 KB)<br><sub>9951 px tall</sub> |

Change: Before: HTTP 500 error state ("Something went wrong. The error has been recorded. Please try again.", digest 557298358, "Try again" button) between the old header and footer — see limitations. After: intro with three trust notes, monthly/yearly toggle, three plan cards Starter 19 €, Growth 90 € ("Recommended", highlighted) and Pro 180 € with limits and a short feature list each, a dark Enterprise panel (Custom) with two CTAs, an "included in every plan" list, a plan finder (websites, events, team, retention → recommendation) next to a cost estimate with an event-volume slider, a full comparison matrix, a "what counts as an event" section with a Website → Track → destinations diagram, an overage table per plan, a 14-day Growth trial box, an FAQ accordion and a dark CTA band.

### Pricing (German) (`pricing-de`)

before: `/de/pricing` on :3004 · after: `/de/pricing` on :3005

| | 375 | 768 | 1440 | 1920 |
| --- | --- | --- | --- | --- |
| before | [before-375](./pricing-de/before-375.webp) (34 KB)<br><sub>1715 px tall HTTP 500</sub> | [before-768](./pricing-de/before-768.webp) (40 KB)<br><sub>1024 px tall, 978 px wide (horizontal overflow) HTTP 500</sub> | [before-1440](./pricing-de/before-1440.webp) (41 KB)<br><sub>900 px tall HTTP 500</sub> | [before-1920](./pricing-de/before-1920.webp) (42 KB)<br><sub>1080 px tall HTTP 500</sub> |
| after | [after-375-part1](./pricing-de/after-375-part1.webp) (143 KB)<br>[after-375-part2](./pricing-de/after-375-part2.webp) (140 KB)<br>[after-375-part3](./pricing-de/after-375-part3.webp) (127 KB)<br><sub>15575 px tall</sub> | [after-768-part1](./pricing-de/after-768-part1.webp) (108 KB)<br>[after-768-part2](./pricing-de/after-768-part2.webp) (119 KB)<br>[after-768-part3](./pricing-de/after-768-part3.webp) (83 KB)<br>[after-768-part4](./pricing-de/after-768-part4.webp) (62 KB)<br>[after-768-part5](./pricing-de/after-768-part5.webp) (91 KB)<br>[after-768-part6](./pricing-de/after-768-part6.webp) (73 KB)<br><sub>14069 px tall, 820 px wide (horizontal overflow)</sub> | [after-1440-part1](./pricing-de/after-1440-part1.webp) (96 KB)<br>[after-1440-part2](./pricing-de/after-1440-part2.webp) (140 KB)<br>[after-1440-part3](./pricing-de/after-1440-part3.webp) (96 KB)<br>[after-1440-part4](./pricing-de/after-1440-part4.webp) (66 KB)<br>[after-1440-part5](./pricing-de/after-1440-part5.webp) (46 KB)<br>[after-1440-part6](./pricing-de/after-1440-part6.webp) (59 KB)<br>[after-1440-part7](./pricing-de/after-1440-part7.webp) (94 KB)<br>[after-1440-part8](./pricing-de/after-1440-part8.webp) (61 KB)<br><sub>10235 px tall</sub> | [after-1920-part1](./pricing-de/after-1920-part1.webp) (97 KB)<br>[after-1920-part2](./pricing-de/after-1920-part2.webp) (143 KB)<br>[after-1920-part3](./pricing-de/after-1920-part3.webp) (97 KB)<br>[after-1920-part4](./pricing-de/after-1920-part4.webp) (67 KB)<br>[after-1920-part5](./pricing-de/after-1920-part5.webp) (47 KB)<br>[after-1920-part6](./pricing-de/after-1920-part6.webp) (61 KB)<br>[after-1920-part7](./pricing-de/after-1920-part7.webp) (95 KB)<br>[after-1920-part8](./pricing-de/after-1920-part8.webp) (62 KB)<br><sub>10235 px tall</sub> |

Change: Before: the same HTTP 500 error state as the English pricing page (digest 4007629679) in the German header/footer. After: the German pricing page with the same structure as `/en/pricing` (Starter 19 €, Growth 90 € empfohlen, Pro 180 €, Enterprise individuell, Plan-Finder, Kostenrechner, Vergleichsmatrix, FAQ).

### Pricing (French) (`pricing-fr`)

before: none (locale fr did not exist in the before build) · after: `/fr/pricing` on :3005

| | 375 | 768 | 1440 | 1920 |
| --- | --- | --- | --- | --- |
| before | — | — | — | — |
| after | [after-375-part1](./pricing-fr/after-375-part1.webp) (149 KB)<br>[after-375-part2](./pricing-fr/after-375-part2.webp) (140 KB)<br>[after-375-part3](./pricing-fr/after-375-part3.webp) (139 KB)<br><sub>16187 px tall</sub> | [after-768-part1](./pricing-fr/after-768-part1.webp) (123 KB)<br>[after-768-part2](./pricing-fr/after-768-part2.webp) (146 KB)<br>[after-768-part3](./pricing-fr/after-768-part3.webp) (82 KB)<br>[after-768-part4](./pricing-fr/after-768-part4.webp) (56 KB)<br>[after-768-part5](./pricing-fr/after-768-part5.webp) (96 KB)<br>[after-768-part6](./pricing-fr/after-768-part6.webp) (88 KB)<br><sub>15571 px tall</sub> | [after-1440-part1](./pricing-fr/after-1440-part1.webp) (98 KB)<br>[after-1440-part2](./pricing-fr/after-1440-part2.webp) (129 KB)<br>[after-1440-part3](./pricing-fr/after-1440-part3.webp) (109 KB)<br>[after-1440-part4](./pricing-fr/after-1440-part4.webp) (69 KB)<br>[after-1440-part5](./pricing-fr/after-1440-part5.webp) (51 KB)<br>[after-1440-part6](./pricing-fr/after-1440-part6.webp) (63 KB)<br>[after-1440-part7](./pricing-fr/after-1440-part7.webp) (100 KB)<br>[after-1440-part8](./pricing-fr/after-1440-part8.webp) (73 KB)<br><sub>10455 px tall</sub> | [after-1920-part1](./pricing-fr/after-1920-part1.webp) (98 KB)<br>[after-1920-part2](./pricing-fr/after-1920-part2.webp) (129 KB)<br>[after-1920-part3](./pricing-fr/after-1920-part3.webp) (110 KB)<br>[after-1920-part4](./pricing-fr/after-1920-part4.webp) (70 KB)<br>[after-1920-part5](./pricing-fr/after-1920-part5.webp) (52 KB)<br>[after-1920-part6](./pricing-fr/after-1920-part6.webp) (64 KB)<br>[after-1920-part7](./pricing-fr/after-1920-part7.webp) (101 KB)<br>[after-1920-part8](./pricing-fr/after-1920-part8.webp) (73 KB)<br><sub>10455 px tall</sub> |

Change: After only: French pricing page with the same structure as `/en/pricing`; the before build has no French route.

### Pricing (Spanish) (`pricing-es`)

before: none (locale es did not exist in the before build) · after: `/es/pricing` on :3005

| | 375 | 768 | 1440 | 1920 |
| --- | --- | --- | --- | --- |
| before | — | — | — | — |
| after | [after-375-part1](./pricing-es/after-375-part1.webp) (149 KB)<br>[after-375-part2](./pricing-es/after-375-part2.webp) (141 KB)<br>[after-375-part3](./pricing-es/after-375-part3.webp) (130 KB)<br><sub>15795 px tall</sub> | [after-768-part1](./pricing-es/after-768-part1.webp) (125 KB)<br>[after-768-part2](./pricing-es/after-768-part2.webp) (127 KB)<br>[after-768-part3](./pricing-es/after-768-part3.webp) (107 KB)<br>[after-768-part4](./pricing-es/after-768-part4.webp) (74 KB)<br>[after-768-part5](./pricing-es/after-768-part5.webp) (106 KB)<br>[after-768-part6](./pricing-es/after-768-part6.webp) (91 KB)<br><sub>14802 px tall</sub> | [after-1440-part1](./pricing-es/after-1440-part1.webp) (95 KB)<br>[after-1440-part2](./pricing-es/after-1440-part2.webp) (144 KB)<br>[after-1440-part3](./pricing-es/after-1440-part3.webp) (102 KB)<br>[after-1440-part4](./pricing-es/after-1440-part4.webp) (67 KB)<br>[after-1440-part5](./pricing-es/after-1440-part5.webp) (53 KB)<br>[after-1440-part6](./pricing-es/after-1440-part6.webp) (57 KB)<br>[after-1440-part7](./pricing-es/after-1440-part7.webp) (94 KB)<br>[after-1440-part8](./pricing-es/after-1440-part8.webp) (62 KB)<br><sub>10315 px tall</sub> | [after-1920-part1](./pricing-es/after-1920-part1.webp) (96 KB)<br>[after-1920-part2](./pricing-es/after-1920-part2.webp) (145 KB)<br>[after-1920-part3](./pricing-es/after-1920-part3.webp) (103 KB)<br>[after-1920-part4](./pricing-es/after-1920-part4.webp) (68 KB)<br>[after-1920-part5](./pricing-es/after-1920-part5.webp) (54 KB)<br>[after-1920-part6](./pricing-es/after-1920-part6.webp) (58 KB)<br>[after-1920-part7](./pricing-es/after-1920-part7.webp) (95 KB)<br>[after-1920-part8](./pricing-es/after-1920-part8.webp) (63 KB)<br><sub>10315 px tall</sub> |

Change: After only: Spanish pricing page with the same structure as `/en/pricing`; the before build has no Spanish route.

### Pricing (Italian) (`pricing-it`)

before: none (locale it did not exist in the before build) · after: `/it/pricing` on :3005

| | 375 | 768 | 1440 | 1920 |
| --- | --- | --- | --- | --- |
| before | — | — | — | — |
| after | [after-375-part1](./pricing-it/after-375-part1.webp) (141 KB)<br>[after-375-part2](./pricing-it/after-375-part2.webp) (147 KB)<br>[after-375-part3](./pricing-it/after-375-part3.webp) (125 KB)<br><sub>15522 px tall</sub> | [after-768-part1](./pricing-it/after-768-part1.webp) (105 KB)<br>[after-768-part2](./pricing-it/after-768-part2.webp) (130 KB)<br>[after-768-part3](./pricing-it/after-768-part3.webp) (79 KB)<br>[after-768-part4](./pricing-it/after-768-part4.webp) (56 KB)<br>[after-768-part5](./pricing-it/after-768-part5.webp) (86 KB)<br>[after-768-part6](./pricing-it/after-768-part6.webp) (76 KB)<br><sub>14968 px tall</sub> | [after-1440-part1](./pricing-it/after-1440-part1.webp) (147 KB)<br>[after-1440-part2](./pricing-it/after-1440-part2.webp) (130 KB)<br>[after-1440-part3](./pricing-it/after-1440-part3.webp) (103 KB)<br>[after-1440-part4](./pricing-it/after-1440-part4.webp) (147 KB)<br><sub>10135 px tall</sub> | [after-1920-part1](./pricing-it/after-1920-part1.webp) (148 KB)<br>[after-1920-part2](./pricing-it/after-1920-part2.webp) (132 KB)<br>[after-1920-part3](./pricing-it/after-1920-part3.webp) (105 KB)<br>[after-1920-part4](./pricing-it/after-1920-part4.webp) (150 KB)<br><sub>10135 px tall</sub> |

Change: After only: Italian pricing page with the same structure as `/en/pricing`; the before build has no Italian route.

### Pricing (Dutch) (`pricing-nl`)

before: none (locale nl did not exist in the before build) · after: `/nl/pricing` on :3005

| | 375 | 768 | 1440 | 1920 |
| --- | --- | --- | --- | --- |
| before | — | — | — | — |
| after | [after-375-part1](./pricing-nl/after-375-part1.webp) (148 KB)<br>[after-375-part2](./pricing-nl/after-375-part2.webp) (140 KB)<br>[after-375-part3](./pricing-nl/after-375-part3.webp) (130 KB)<br><sub>15540 px tall</sub> | [after-768-part1](./pricing-nl/after-768-part1.webp) (112 KB)<br>[after-768-part2](./pricing-nl/after-768-part2.webp) (116 KB)<br>[after-768-part3](./pricing-nl/after-768-part3.webp) (87 KB)<br>[after-768-part4](./pricing-nl/after-768-part4.webp) (60 KB)<br>[after-768-part5](./pricing-nl/after-768-part5.webp) (92 KB)<br>[after-768-part6](./pricing-nl/after-768-part6.webp) (75 KB)<br><sub>14203 px tall, 781 px wide (horizontal overflow)</sub> | [after-1440-part1](./pricing-nl/after-1440-part1.webp) (94 KB)<br>[after-1440-part2](./pricing-nl/after-1440-part2.webp) (141 KB)<br>[after-1440-part3](./pricing-nl/after-1440-part3.webp) (96 KB)<br>[after-1440-part4](./pricing-nl/after-1440-part4.webp) (66 KB)<br>[after-1440-part5](./pricing-nl/after-1440-part5.webp) (48 KB)<br>[after-1440-part6](./pricing-nl/after-1440-part6.webp) (58 KB)<br>[after-1440-part7](./pricing-nl/after-1440-part7.webp) (95 KB)<br>[after-1440-part8](./pricing-nl/after-1440-part8.webp) (62 KB)<br><sub>10299 px tall</sub> | [after-1920-part1](./pricing-nl/after-1920-part1.webp) (95 KB)<br>[after-1920-part2](./pricing-nl/after-1920-part2.webp) (144 KB)<br>[after-1920-part3](./pricing-nl/after-1920-part3.webp) (97 KB)<br>[after-1920-part4](./pricing-nl/after-1920-part4.webp) (67 KB)<br>[after-1920-part5](./pricing-nl/after-1920-part5.webp) (49 KB)<br>[after-1920-part6](./pricing-nl/after-1920-part6.webp) (59 KB)<br>[after-1920-part7](./pricing-nl/after-1920-part7.webp) (96 KB)<br>[after-1920-part8](./pricing-nl/after-1920-part8.webp) (63 KB)<br><sub>10299 px tall</sub> |

Change: After only: Dutch pricing page with the same structure as `/en/pricing`; the before build has no Dutch route.

### Knowledge hub (English) — before `/blog`, after `/en/tracking-knowledge` (`knowledge-en`)

before: `/blog` on :3004 · after: `/en/tracking-knowledge` on :3005

| | 375 | 768 | 1440 | 1920 |
| --- | --- | --- | --- | --- |
| before | [before-375-part1](./knowledge-en/before-375-part1.webp) (130 KB)<br>[before-375-part2](./knowledge-en/before-375-part2.webp) (138 KB)<br>[before-375-part3](./knowledge-en/before-375-part3.webp) (139 KB)<br>[before-375-part4](./knowledge-en/before-375-part4.webp) (119 KB)<br><sub>11363 px tall</sub> | [before-768-part1](./knowledge-en/before-768-part1.webp) (144 KB)<br>[before-768-part2](./knowledge-en/before-768-part2.webp) (145 KB)<br>[before-768-part3](./knowledge-en/before-768-part3.webp) (134 KB)<br>[before-768-part4](./knowledge-en/before-768-part4.webp) (140 KB)<br><sub>5725 px tall, 845 px wide (horizontal overflow)</sub> | [before-1440-part1](./knowledge-en/before-1440-part1.webp) (134 KB)<br>[before-1440-part2](./knowledge-en/before-1440-part2.webp) (148 KB)<br>[before-1440-part3](./knowledge-en/before-1440-part3.webp) (150 KB)<br>[before-1440-part4](./knowledge-en/before-1440-part4.webp) (127 KB)<br><sub>4119 px tall</sub> | [before-1920-part1](./knowledge-en/before-1920-part1.webp) (134 KB)<br>[before-1920-part2](./knowledge-en/before-1920-part2.webp) (149 KB)<br>[before-1920-part3](./knowledge-en/before-1920-part3.webp) (150 KB)<br>[before-1920-part4](./knowledge-en/before-1920-part4.webp) (129 KB)<br><sub>4119 px tall</sub> |
| after | [after-375-part1](./knowledge-en/after-375-part1.webp) (90 KB)<br>[after-375-part2](./knowledge-en/after-375-part2.webp) (118 KB)<br>[after-375-part3](./knowledge-en/after-375-part3.webp) (145 KB)<br>[after-375-part4](./knowledge-en/after-375-part4.webp) (91 KB)<br>[after-375-part5](./knowledge-en/after-375-part5.webp) (85 KB)<br>[after-375-part6](./knowledge-en/after-375-part6.webp) (117 KB)<br>[after-375-part7](./knowledge-en/after-375-part7.webp) (118 KB)<br>[after-375-part8](./knowledge-en/after-375-part8.webp) (58 KB)<br><sub>20382 px tall</sub> | [after-768-part1](./knowledge-en/after-768-part1.webp) (60 KB)<br>[after-768-part2](./knowledge-en/after-768-part2.webp) (66 KB)<br>[after-768-part3](./knowledge-en/after-768-part3.webp) (110 KB)<br>[after-768-part4](./knowledge-en/after-768-part4.webp) (126 KB)<br>[after-768-part5](./knowledge-en/after-768-part5.webp) (68 KB)<br>[after-768-part6](./knowledge-en/after-768-part6.webp) (71 KB)<br>[after-768-part7](./knowledge-en/after-768-part7.webp) (125 KB)<br>[after-768-part8](./knowledge-en/after-768-part8.webp) (132 KB)<br>[after-768-part9](./knowledge-en/after-768-part9.webp) (127 KB)<br>[after-768-part10](./knowledge-en/after-768-part10.webp) (129 KB)<br>[after-768-part11](./knowledge-en/after-768-part11.webp) (137 KB)<br>[after-768-part12](./knowledge-en/after-768-part12.webp) (43 KB)<br><sub>17242 px tall</sub> | [after-1440-part1](./knowledge-en/after-1440-part1.webp) (68 KB)<br>[after-1440-part2](./knowledge-en/after-1440-part2.webp) (69 KB)<br>[after-1440-part3](./knowledge-en/after-1440-part3.webp) (136 KB)<br>[after-1440-part4](./knowledge-en/after-1440-part4.webp) (127 KB)<br>[after-1440-part5](./knowledge-en/after-1440-part5.webp) (73 KB)<br>[after-1440-part6](./knowledge-en/after-1440-part6.webp) (89 KB)<br>[after-1440-part7](./knowledge-en/after-1440-part7.webp) (100 KB)<br>[after-1440-part8](./knowledge-en/after-1440-part8.webp) (94 KB)<br>[after-1440-part9](./knowledge-en/after-1440-part9.webp) (83 KB)<br>[after-1440-part10](./knowledge-en/after-1440-part10.webp) (88 KB)<br>[after-1440-part11](./knowledge-en/after-1440-part11.webp) (90 KB)<br>[after-1440-part12](./knowledge-en/after-1440-part12.webp) (61 KB)<br><sub>13587 px tall</sub> | [after-1920-part1](./knowledge-en/after-1920-part1.webp) (69 KB)<br>[after-1920-part2](./knowledge-en/after-1920-part2.webp) (70 KB)<br>[after-1920-part3](./knowledge-en/after-1920-part3.webp) (136 KB)<br>[after-1920-part4](./knowledge-en/after-1920-part4.webp) (128 KB)<br>[after-1920-part5](./knowledge-en/after-1920-part5.webp) (74 KB)<br>[after-1920-part6](./knowledge-en/after-1920-part6.webp) (89 KB)<br>[after-1920-part7](./knowledge-en/after-1920-part7.webp) (101 KB)<br>[after-1920-part8](./knowledge-en/after-1920-part8.webp) (95 KB)<br>[after-1920-part9](./knowledge-en/after-1920-part9.webp) (84 KB)<br>[after-1920-part10](./knowledge-en/after-1920-part10.webp) (88 KB)<br>[after-1920-part11](./knowledge-en/after-1920-part11.webp) (90 KB)<br>[after-1920-part12](./knowledge-en/after-1920-part12.webp) (63 KB)<br><sub>13587 px tall</sub> |

Change: Before: "Blog" with an intro paragraph, five topic chips (integrations 11, guides 10, privacy 4, product 4, consent 1), an RSS link and 30 identical text cards in a three-column grid. After: "Tracking Knowledge" with breadcrumb, a search field with hint text, counts (30 articles, 9 topics, six languages), a featured story with a cover illustration, nine topic tiles with article counts, four learning paths listing their articles with total reading time, platform and shop-system guide chips, "Newly published" and "Recently updated" lists, a directory of all 30 articles with a filter sidebar (topic, platform, shop system, content type, level, recency) and cover thumbnails, category/level/reading-time metadata per entry, and a product CTA; the page is about three times as tall at every width (see the heights in the table).

### Knowledge hub (German) — before `/de/blog`, after `/de/tracking-knowledge` (`knowledge-de`)

before: `/de/blog` on :3004 · after: `/de/tracking-knowledge` on :3005

| | 375 | 768 | 1440 | 1920 |
| --- | --- | --- | --- | --- |
| before | [before-375-part1](./knowledge-de/before-375-part1.webp) (107 KB)<br>[before-375-part2](./knowledge-de/before-375-part2.webp) (126 KB)<br>[before-375-part3](./knowledge-de/before-375-part3.webp) (124 KB)<br>[before-375-part4](./knowledge-de/before-375-part4.webp) (126 KB)<br>[before-375-part5](./knowledge-de/before-375-part5.webp) (126 KB)<br>[before-375-part6](./knowledge-de/before-375-part6.webp) (71 KB)<br><sub>12023 px tall</sub> | [before-768-part1](./knowledge-de/before-768-part1.webp) (125 KB)<br>[before-768-part2](./knowledge-de/before-768-part2.webp) (145 KB)<br>[before-768-part3](./knowledge-de/before-768-part3.webp) (144 KB)<br>[before-768-part4](./knowledge-de/before-768-part4.webp) (130 KB)<br><sub>6133 px tall, 978 px wide (horizontal overflow)</sub> | [before-1440-part1](./knowledge-de/before-1440-part1.webp) (144 KB)<br>[before-1440-part2](./knowledge-de/before-1440-part2.webp) (148 KB)<br>[before-1440-part3](./knowledge-de/before-1440-part3.webp) (145 KB)<br>[before-1440-part4](./knowledge-de/before-1440-part4.webp) (146 KB)<br><sub>4327 px tall</sub> | [before-1920-part1](./knowledge-de/before-1920-part1.webp) (144 KB)<br>[before-1920-part2](./knowledge-de/before-1920-part2.webp) (147 KB)<br>[before-1920-part3](./knowledge-de/before-1920-part3.webp) (144 KB)<br>[before-1920-part4](./knowledge-de/before-1920-part4.webp) (147 KB)<br><sub>4327 px tall</sub> |
| after | [after-375-part1](./knowledge-de/after-375-part1.webp) (97 KB)<br>[after-375-part2](./knowledge-de/after-375-part2.webp) (132 KB)<br>[after-375-part3](./knowledge-de/after-375-part3.webp) (132 KB)<br>[after-375-part4](./knowledge-de/after-375-part4.webp) (97 KB)<br>[after-375-part5](./knowledge-de/after-375-part5.webp) (102 KB)<br>[after-375-part6](./knowledge-de/after-375-part6.webp) (124 KB)<br>[after-375-part7](./knowledge-de/after-375-part7.webp) (116 KB)<br>[after-375-part8](./knowledge-de/after-375-part8.webp) (70 KB)<br><sub>21608 px tall</sub> | [after-768-part1](./knowledge-de/after-768-part1.webp) (64 KB)<br>[after-768-part2](./knowledge-de/after-768-part2.webp) (71 KB)<br>[after-768-part3](./knowledge-de/after-768-part3.webp) (127 KB)<br>[after-768-part4](./knowledge-de/after-768-part4.webp) (140 KB)<br>[after-768-part5](./knowledge-de/after-768-part5.webp) (77 KB)<br>[after-768-part6](./knowledge-de/after-768-part6.webp) (73 KB)<br>[after-768-part7](./knowledge-de/after-768-part7.webp) (146 KB)<br>[after-768-part8](./knowledge-de/after-768-part8.webp) (143 KB)<br>[after-768-part9](./knowledge-de/after-768-part9.webp) (141 KB)<br>[after-768-part10](./knowledge-de/after-768-part10.webp) (142 KB)<br>[after-768-part11](./knowledge-de/after-768-part11.webp) (132 KB)<br>[after-768-part12](./knowledge-de/after-768-part12.webp) (48 KB)<br><sub>17844 px tall</sub> | [after-1440-part1](./knowledge-de/after-1440-part1.webp) (72 KB)<br>[after-1440-part2](./knowledge-de/after-1440-part2.webp) (74 KB)<br>[after-1440-part3](./knowledge-de/after-1440-part3.webp) (146 KB)<br>[after-1440-part4](./knowledge-de/after-1440-part4.webp) (138 KB)<br>[after-1440-part5](./knowledge-de/after-1440-part5.webp) (78 KB)<br>[after-1440-part6](./knowledge-de/after-1440-part6.webp) (102 KB)<br>[after-1440-part7](./knowledge-de/after-1440-part7.webp) (108 KB)<br>[after-1440-part8](./knowledge-de/after-1440-part8.webp) (100 KB)<br>[after-1440-part9](./knowledge-de/after-1440-part9.webp) (95 KB)<br>[after-1440-part10](./knowledge-de/after-1440-part10.webp) (97 KB)<br>[after-1440-part11](./knowledge-de/after-1440-part11.webp) (99 KB)<br>[after-1440-part12](./knowledge-de/after-1440-part12.webp) (70 KB)<br><sub>14023 px tall</sub> | [after-1920-part1](./knowledge-de/after-1920-part1.webp) (73 KB)<br>[after-1920-part2](./knowledge-de/after-1920-part2.webp) (75 KB)<br>[after-1920-part3](./knowledge-de/after-1920-part3.webp) (148 KB)<br>[after-1920-part4](./knowledge-de/after-1920-part4.webp) (139 KB)<br>[after-1920-part5](./knowledge-de/after-1920-part5.webp) (79 KB)<br>[after-1920-part6](./knowledge-de/after-1920-part6.webp) (102 KB)<br>[after-1920-part7](./knowledge-de/after-1920-part7.webp) (109 KB)<br>[after-1920-part8](./knowledge-de/after-1920-part8.webp) (101 KB)<br>[after-1920-part9](./knowledge-de/after-1920-part9.webp) (95 KB)<br>[after-1920-part10](./knowledge-de/after-1920-part10.webp) (97 KB)<br>[after-1920-part11](./knowledge-de/after-1920-part11.webp) (99 KB)<br>[after-1920-part12](./knowledge-de/after-1920-part12.webp) (71 KB)<br><sub>14023 px tall</sub> |

Change: Same change as the English hub with German copy; the section name "Tracking Knowledge" stays untranslated (h1), the surrounding labels, topics, learning paths and directory entries are German.

### Article "Consent Mode v2" (English) — before `/blog/consent-mode-v2-guide`, after `/en/tracking-knowledge/consent-mode-v2-guide` (`article-consent-mode-v2-guide-en`)

before: `/blog/consent-mode-v2-guide` on :3004 · after: `/en/tracking-knowledge/consent-mode-v2-guide` on :3005

| | 375 | 768 | 1440 | 1920 |
| --- | --- | --- | --- | --- |
| before | [before-375-part1](./article-consent-mode-v2-guide-en/before-375-part1.webp) (147 KB)<br>[before-375-part2](./article-consent-mode-v2-guide-en/before-375-part2.webp) (136 KB)<br><sub>7058 px tall, 601 px wide (horizontal overflow)</sub> | [before-768-part1](./article-consent-mode-v2-guide-en/before-768-part1.webp) (138 KB)<br>[before-768-part2](./article-consent-mode-v2-guide-en/before-768-part2.webp) (148 KB)<br><sub>4231 px tall, 845 px wide (horizontal overflow)</sub> | [before-1440-part1](./article-consent-mode-v2-guide-en/before-1440-part1.webp) (139 KB)<br>[before-1440-part2](./article-consent-mode-v2-guide-en/before-1440-part2.webp) (123 KB)<br><sub>4232 px tall</sub> | [before-1920-part1](./article-consent-mode-v2-guide-en/before-1920-part1.webp) (140 KB)<br>[before-1920-part2](./article-consent-mode-v2-guide-en/before-1920-part2.webp) (125 KB)<br><sub>4232 px tall</sub> |
| after | [after-375-part1](./article-consent-mode-v2-guide-en/after-375-part1.webp) (122 KB)<br>[after-375-part2](./article-consent-mode-v2-guide-en/after-375-part2.webp) (134 KB)<br>[after-375-part3](./article-consent-mode-v2-guide-en/after-375-part3.webp) (104 KB)<br>[after-375-part4](./article-consent-mode-v2-guide-en/after-375-part4.webp) (64 KB)<br><sub>9250 px tall</sub> | [after-768-part1](./article-consent-mode-v2-guide-en/after-768-part1.webp) (129 KB)<br>[after-768-part2](./article-consent-mode-v2-guide-en/after-768-part2.webp) (147 KB)<br>[after-768-part3](./article-consent-mode-v2-guide-en/after-768-part3.webp) (79 KB)<br>[after-768-part4](./article-consent-mode-v2-guide-en/after-768-part4.webp) (75 KB)<br><sub>6151 px tall</sub> | [after-1440-part1](./article-consent-mode-v2-guide-en/after-1440-part1.webp) (130 KB)<br>[after-1440-part2](./article-consent-mode-v2-guide-en/after-1440-part2.webp) (131 KB)<br>[after-1440-part3](./article-consent-mode-v2-guide-en/after-1440-part3.webp) (89 KB)<br>[after-1440-part4](./article-consent-mode-v2-guide-en/after-1440-part4.webp) (98 KB)<br><sub>5444 px tall</sub> | [after-1920-part1](./article-consent-mode-v2-guide-en/after-1920-part1.webp) (130 KB)<br>[after-1920-part2](./article-consent-mode-v2-guide-en/after-1920-part2.webp) (132 KB)<br>[after-1920-part3](./article-consent-mode-v2-guide-en/after-1920-part3.webp) (89 KB)<br>[after-1920-part4](./article-consent-mode-v2-guide-en/after-1920-part4.webp) (98 KB)<br><sub>5444 px tall</sub> |

Change: Before: single-column article under the marketing header with breadcrumb "Blog / consent", author line "By track.site editorial team", raw tag chips (consent-mode, google, purposes, cmp), blue underlined H2 headings, sources list, editorial-team box, three related-article cards and the full marketing footer. After: breadcrumb Track › Tracking Knowledge › Consent & Privacy › title, category / content-type / level chips, published and last-reviewed dates with reading time, a key-takeaways box, a sticky table of contents in the right column (collapsible on 375 px), plain H2 headings, the same body text, tables and lists, a "Primary sources" block with domains, a "Was this article helpful?" Yes/No block, a product CTA box, a "Responsible editor" block, related articles as three list rows and the footer with the six-language switcher; the reading-progress bar is at the top.

### Article "Consent Mode v2" (German) — before `/de/blog/consent-mode-v2-guide`, after `/de/tracking-knowledge/consent-mode-v2-guide` (`article-consent-mode-v2-guide-de`)

before: `/de/blog/consent-mode-v2-guide` on :3004 · after: `/de/tracking-knowledge/consent-mode-v2-guide` on :3005

| | 375 | 768 | 1440 | 1920 |
| --- | --- | --- | --- | --- |
| before | [before-375-part1](./article-consent-mode-v2-guide-de/before-375-part1.webp) (149 KB)<br>[before-375-part2](./article-consent-mode-v2-guide-de/before-375-part2.webp) (124 KB)<br><sub>7531 px tall, 611 px wide (horizontal overflow)</sub> | [before-768-part1](./article-consent-mode-v2-guide-de/before-768-part1.webp) (150 KB)<br>[before-768-part2](./article-consent-mode-v2-guide-de/before-768-part2.webp) (140 KB)<br><sub>4391 px tall, 978 px wide (horizontal overflow)</sub> | [before-1440-part1](./article-consent-mode-v2-guide-de/before-1440-part1.webp) (147 KB)<br>[before-1440-part2](./article-consent-mode-v2-guide-de/before-1440-part2.webp) (142 KB)<br><sub>4368 px tall</sub> | [before-1920-part1](./article-consent-mode-v2-guide-de/before-1920-part1.webp) (149 KB)<br>[before-1920-part2](./article-consent-mode-v2-guide-de/before-1920-part2.webp) (144 KB)<br><sub>4368 px tall</sub> |
| after | [after-375-part1](./article-consent-mode-v2-guide-de/after-375-part1.webp) (132 KB)<br>[after-375-part2](./article-consent-mode-v2-guide-de/after-375-part2.webp) (150 KB)<br>[after-375-part3](./article-consent-mode-v2-guide-de/after-375-part3.webp) (118 KB)<br>[after-375-part4](./article-consent-mode-v2-guide-de/after-375-part4.webp) (76 KB)<br><sub>9838 px tall</sub> | [after-768-part1](./article-consent-mode-v2-guide-de/after-768-part1.webp) (137 KB)<br>[after-768-part2](./article-consent-mode-v2-guide-de/after-768-part2.webp) (132 KB)<br>[after-768-part3](./article-consent-mode-v2-guide-de/after-768-part3.webp) (95 KB)<br>[after-768-part4](./article-consent-mode-v2-guide-de/after-768-part4.webp) (89 KB)<br><sub>6443 px tall</sub> | [after-1440-part1](./article-consent-mode-v2-guide-de/after-1440-part1.webp) (141 KB)<br>[after-1440-part2](./article-consent-mode-v2-guide-de/after-1440-part2.webp) (146 KB)<br>[after-1440-part3](./article-consent-mode-v2-guide-de/after-1440-part3.webp) (106 KB)<br>[after-1440-part4](./article-consent-mode-v2-guide-de/after-1440-part4.webp) (111 KB)<br><sub>5720 px tall</sub> | [after-1920-part1](./article-consent-mode-v2-guide-de/after-1920-part1.webp) (141 KB)<br>[after-1920-part2](./article-consent-mode-v2-guide-de/after-1920-part2.webp) (145 KB)<br>[after-1920-part3](./article-consent-mode-v2-guide-de/after-1920-part3.webp) (106 KB)<br>[after-1920-part4](./article-consent-mode-v2-guide-de/after-1920-part4.webp) (112 KB)<br><sub>5720 px tall</sub> |

Change: Same template change as the English article with the German article text (breadcrumb, key takeaways, table of contents, sources, feedback block, related articles in German).

### Features (English) (`features-en`)

before: `/features` on :3004 · after: `/en/features` on :3005

| | 375 | 768 | 1440 | 1920 |
| --- | --- | --- | --- | --- |
| before | [before-375](./features-en/before-375.webp) (90 KB)<br><sub>3066 px tall</sub> | [before-768](./features-en/before-768.webp) (99 KB)<br><sub>1682 px tall, 845 px wide (horizontal overflow)</sub> | [before-1440](./features-en/before-1440.webp) (100 KB)<br><sub>1478 px tall</sub> | [before-1920](./features-en/before-1920.webp) (102 KB)<br><sub>1478 px tall</sub> |
| after | [after-375-part1](./features-en/after-375-part1.webp) (140 KB)<br>[after-375-part2](./features-en/after-375-part2.webp) (128 KB)<br>[after-375-part3](./features-en/after-375-part3.webp) (125 KB)<br><sub>16523 px tall</sub> | [after-768-part1](./features-en/after-768-part1.webp) (131 KB)<br>[after-768-part2](./features-en/after-768-part2.webp) (129 KB)<br>[after-768-part3](./features-en/after-768-part3.webp) (133 KB)<br>[after-768-part4](./features-en/after-768-part4.webp) (119 KB)<br><sub>10656 px tall</sub> | [after-1440-part1](./features-en/after-1440-part1.webp) (124 KB)<br>[after-1440-part2](./features-en/after-1440-part2.webp) (138 KB)<br>[after-1440-part3](./features-en/after-1440-part3.webp) (146 KB)<br>[after-1440-part4](./features-en/after-1440-part4.webp) (123 KB)<br><sub>8727 px tall</sub> | [after-1920-part1](./features-en/after-1920-part1.webp) (127 KB)<br>[after-1920-part2](./features-en/after-1920-part2.webp) (140 KB)<br>[after-1920-part3](./features-en/after-1920-part3.webp) (147 KB)<br>[after-1920-part4](./features-en/after-1920-part4.webp) (125 KB)<br><sub>8727 px tall</sub> |

Change: Before: heading, one paragraph, six short text cards (AI-guided setup, server-side event router, event debugger, data quality, consent, click ids) and a dark CTA band. After: intro with two CTAs, a dark data-flow stage (Website → Browser SDK / Server API → Track → consent gate → Meta, Google Ads, GA4, TikTok with delivery states), a "What happens to one purchase" scenario switch (consent granted / marketing withdrawn / unknown) with its own diagram, six capability sections that alternate text with product panels (guided-setup conversation, destination health table, live events table, tracking health score breakdown, consent signals table, click-id matrix), a "Tag container versus event layer" comparison table, a "Facts you can verify" list and a dark CTA band; roughly six times as tall at 1440 px.

### Integrations (English) (`integrations-en`)

before: `/integrations` on :3004 · after: `/en/integrations` on :3005

| | 375 | 768 | 1440 | 1920 |
| --- | --- | --- | --- | --- |
| before | [before-375](./integrations-en/before-375.webp) (143 KB)<br><sub>6683 px tall</sub> | [before-768](./integrations-en/before-768.webp) (150 KB)<br><sub>4077 px tall, 845 px wide (horizontal overflow)</sub> | [before-1440-part1](./integrations-en/before-1440-part1.webp) (131 KB)<br>[before-1440-part2](./integrations-en/before-1440-part2.webp) (101 KB)<br><sub>3355 px tall</sub> | [before-1920-part1](./integrations-en/before-1920-part1.webp) (133 KB)<br>[before-1920-part2](./integrations-en/before-1920-part2.webp) (101 KB)<br><sub>3355 px tall</sub> |
| after | [after-375-part1](./integrations-en/after-375-part1.webp) (143 KB)<br>[after-375-part2](./integrations-en/after-375-part2.webp) (143 KB)<br><sub>9108 px tall</sub> | [after-768-part1](./integrations-en/after-768-part1.webp) (145 KB)<br>[after-768-part2](./integrations-en/after-768-part2.webp) (129 KB)<br><sub>6712 px tall</sub> | [after-1440-part1](./integrations-en/after-1440-part1.webp) (138 KB)<br>[after-1440-part2](./integrations-en/after-1440-part2.webp) (138 KB)<br><sub>5858 px tall</sub> | [after-1920-part1](./integrations-en/after-1920-part1.webp) (140 KB)<br>[after-1920-part2](./integrations-en/after-1920-part2.webp) (141 KB)<br><sub>5858 px tall</sub> |

Change: Before: heading and paragraph, four sections of identical text cards (core advertising 9, reach and discovery 6, programmatic/retargeting/affiliate 7, shop platforms 3) with Browser / Server / Offline chips and orange caveat lines, and a CTA stating that the wizard takes "19 steps". After: intro with a data-flow diagram and three counts (22 destination types, 14 affiliate postback presets, 3 shop platforms), a search field, category chips (All, Ads 19, Analytics 1, Commerce 3, Affiliate 1, Own systems 1) and mode chips (All, Browser 23, Server 25, Offline 10), one list grouped by category with a monogram icon, description, mode chips and implementation status ("Implemented", "Requires vendor approval", "Vendor API in beta") per row and a detail-page arrow, a "Three delivery modes, one event" section and a CTA without the step count.

### Login (English) (`login-en`)

before: `/login` on :3004 · after: `/en/login` on :3005

| | 375 | 768 | 1440 | 1920 |
| --- | --- | --- | --- | --- |
| before | [before-375](./login-en/before-375.webp) (36 KB)<br><sub>1905 px tall</sub> | [before-768](./login-en/before-768.webp) (39 KB)<br><sub>1192 px tall, 845 px wide (horizontal overflow)</sub> | [before-1440](./login-en/before-1440.webp) (40 KB)<br><sub>1057 px tall</sub> | [before-1920](./login-en/before-1920.webp) (40 KB)<br><sub>1183 px tall</sub> |
| after | [after-375](./login-en/after-375.webp) (29 KB)<br><sub>1002 px tall</sub> | [after-768](./login-en/after-768.webp) (29 KB)<br><sub>1024 px tall</sub> | [after-1440](./login-en/after-1440.webp) (45 KB)<br><sub>951 px tall</sub> | [after-1920](./login-en/after-1920.webp) (51 KB)<br><sub>1080 px tall</sub> |

Change: Before: centered card ("Welcome back", e-mail, password, Log in, passkey) under the full marketing header with the `track.site` wordmark above the card and the full marketing footer below; page height at 1440 px 1 057 px. After: auth shell without marketing navigation — `Track` wordmark and language switcher only, the card on the left with a password visibility toggle, a dark panel on the right ("What you set up next", Website → Track → consent → Meta / Google Ads / GA4 illustration marked as example values, three trust items: passkeys and two-factor login, EU data region, consent decides delivery) and a footer reduced to Privacy, Terms, Security, Imprint; page height 951 px.

### Login (German) (`login-de`)

before: `/de/login` on :3004 · after: `/de/login` on :3005

| | 375 | 768 | 1440 | 1920 |
| --- | --- | --- | --- | --- |
| before | [before-375](./login-de/before-375.webp) (41 KB)<br><sub>1957 px tall</sub> | [before-768](./login-de/before-768.webp) (45 KB)<br><sub>1192 px tall, 978 px wide (horizontal overflow)</sub> | [before-1440](./login-de/before-1440.webp) (45 KB)<br><sub>1081 px tall</sub> | [before-1920](./login-de/before-1920.webp) (46 KB)<br><sub>1207 px tall</sub> |
| after | [after-375](./login-de/after-375.webp) (35 KB)<br><sub>1070 px tall</sub> | [after-768](./login-de/after-768.webp) (36 KB)<br><sub>1024 px tall</sub> | [after-1440](./login-de/after-1440.webp) (52 KB)<br><sub>971 px tall</sub> | [after-1920](./login-de/after-1920.webp) (57 KB)<br><sub>1080 px tall</sub> |

Change: Same change as the English login page with German copy ("Willkommen zurück", Anmelden, Passkey); the language switcher shows "Deutsch".

### Signup (English) (`signup-en`)

before: `/signup` on :3004 · after: `/en/signup` on :3005

| | 375 | 768 | 1440 | 1920 |
| --- | --- | --- | --- | --- |
| before | [before-375](./signup-en/before-375.webp) (43 KB)<br><sub>2133 px tall</sub> | [before-768](./signup-en/before-768.webp) (48 KB)<br><sub>1257 px tall, 845 px wide (horizontal overflow)</sub> | [before-1440](./signup-en/before-1440.webp) (49 KB)<br><sub>1209 px tall</sub> | [before-1920](./signup-en/before-1920.webp) (50 KB)<br><sub>1209 px tall</sub> |
| after | [after-375](./signup-en/after-375.webp) (43 KB)<br><sub>1380 px tall</sub> | [after-768](./signup-en/after-768.webp) (45 KB)<br><sub>1153 px tall</sub> | [after-1440](./signup-en/after-1440.webp) (61 KB)<br><sub>1099 px tall</sub> | [after-1920](./signup-en/after-1920.webp) (62 KB)<br><sub>1099 px tall</sub> |

Change: Before: centered card ("Create your account": name, company or organization, e-mail, password, terms line, Create account) under the marketing header and footer. After: auth shell with a three-step indicator (Create account → Confirm e-mail → Add your website), fields name, e-mail, password (with visibility toggle), company or organization (optional) and "Your website" (optional, placeholder shop.example.com, prefilled from the home-page domain field) with a note that the tracking setup is prepared for that domain, the same dark side panel as the login page and the reduced footer.

### Signup (German) (`signup-de`)

before: `/de/signup` on :3004 · after: `/de/signup` on :3005

| | 375 | 768 | 1440 | 1920 |
| --- | --- | --- | --- | --- |
| before | [before-375](./signup-de/before-375.webp) (48 KB)<br><sub>2165 px tall</sub> | [before-768](./signup-de/before-768.webp) (53 KB)<br><sub>1277 px tall, 978 px wide (horizontal overflow)</sub> | [before-1440](./signup-de/before-1440.webp) (54 KB)<br><sub>1253 px tall</sub> | [before-1920](./signup-de/before-1920.webp) (55 KB)<br><sub>1253 px tall</sub> |
| after | [after-375](./signup-de/after-375.webp) (49 KB)<br><sub>1504 px tall</sub> | [after-768](./signup-de/after-768.webp) (50 KB)<br><sub>1173 px tall</sub> | [after-1440](./signup-de/after-1440.webp) (67 KB)<br><sub>1119 px tall</sub> | [after-1920](./signup-de/after-1920.webp) (69 KB)<br><sub>1119 px tall</sub> |

Change: Same change as the English signup page with German copy ("Konto erstellen", three-step indicator, optional company and website fields).

### Dashboard start — before `/app` (Overview), after `/app` (Command Center) (`app-overview`)

before: `/app` on :3004 · after: `/app` on :3005 · stored owner session

| | 375 | 768 | 1440 | 1920 |
| --- | --- | --- | --- | --- |
| before | [before-375](./app-overview/before-375.webp) (12 KB)<br><sub>812 px tall</sub> | [before-768](./app-overview/before-768.webp) (13 KB)<br><sub>1024 px tall</sub> | [before-1440](./app-overview/before-1440.webp) (24 KB)<br><sub>900 px tall (no HTTP status: networkidle timeout, page rendered)</sub> | [before-1920](./app-overview/before-1920.webp) (26 KB)<br><sub>1080 px tall (no HTTP status: networkidle timeout, page rendered)</sub> |
| after | [after-375](./app-overview/after-375.webp) (93 KB)<br><sub>3189 px tall, 461 px wide (horizontal overflow)</sub> | [after-768](./app-overview/after-768.webp) (96 KB)<br><sub>2430 px tall, 1104 px wide (horizontal overflow)</sub> | [after-1440](./app-overview/after-1440.webp) (138 KB)<br><sub>1797 px tall</sub> | [after-1920](./app-overview/after-1920.webp) (144 KB)<br><sub>1569 px tall</sub> |

Change: Before: page-scrolling layout with a left sidebar (Overview, AI Setup, Sites, Events, Event Debugger, Destinations, Data Quality, Consent & Privacy, Audiences, Team, Billing, Settings), "Overview — Welcome back, Olivia Owner", three KPI cards (Tracking health –, Accepted events 0, Delivered 0), a sites list with one site and a "Create site" button; the content ends above the fold. After: viewport-fixed shell with a top bar (organisation / site switcher with tracking id, Production environment indicator, "Search or jump to… Ctrl K", Track AI toggle, user menu), a task-oriented sidebar (Command Center, AI Setup, Events, Destinations, Data Quality, Consent & Privacy, Insights, Releases, Team & Access, Billing, Settings, Alerts & Incident Mode), "Command Center" with a next-action card (Critical: publish a configuration for Production, "Why this action"), a "Needs attention" list (warning: publish a consent policy; suggestion: verify shop.acme.test), a status strip with ten measured values and their states (no data yet / not published / no events yet / 0 of 1 connected / 0 of 500 000 events), event-flow and delivery-outcome charts with empty states, a "Last verified events" empty state, and a persistent Track AI panel (header with site and environment, transcript, quick actions, composer). Because the after shell scrolls inside `main`, the after captures were taken with the viewport extended to the content height (capture.json `viewportExtended`); at 375 px the after page is 3 189 px tall in that mode.

### Event explorer — before `/app/debugger`, after `/app/events/explorer` (`app-events-explorer`)

before: `/app/debugger` on :3004 · after: `/app/events/explorer` on :3005 · stored owner session

| | 375 | 768 | 1440 | 1920 |
| --- | --- | --- | --- | --- |
| before | [before-375](./app-events-explorer/before-375.webp) (21 KB)<br><sub>874 px tall</sub> | [before-768](./app-events-explorer/before-768.webp) (21 KB)<br><sub>1024 px tall</sub> | [before-1440](./app-events-explorer/before-1440.webp) (33 KB)<br><sub>900 px tall (no HTTP status: networkidle timeout, page rendered)</sub> | [before-1920](./app-events-explorer/before-1920.webp) (35 KB)<br><sub>1080 px tall (no HTTP status: networkidle timeout, page rendered)</sub> |
| after | [after-375](./app-events-explorer/after-375.webp) (41 KB)<br><sub>1420 px tall, 461 px wide (horizontal overflow)</sub> | [after-768](./app-events-explorer/after-768.webp) (46 KB)<br><sub>1092 px tall, 1104 px wide (horizontal overflow)</sub> | [after-1440](./app-events-explorer/after-1440.webp) (88 KB)<br><sub>900 px tall</sub> | [after-1920](./app-events-explorer/after-1920.webp) (98 KB)<br><sub>1080 px tall</sub> |

Change: Before: "Event debugger" with a filter row (site select, event, state, source, Filter button) and two empty panels ("Recent events (0)" and "Lineage"). After: "Live Event Explorer" under the Events sub-navigation (Overview, Coverage matrix, Live explorer, Test lab) inside the new shell, a filter row (event name, source, status, time window, Apply, Reset), an auto-refresh toggle with the last-updated time, an events list with an empty state that names the next steps, a "Rejected before storage" panel and a lineage placeholder on the right, plus the Track AI panel; the before page had no rejected-events panel and no auto-refresh.

### Releases — after `/app/releases` (no before counterpart) (`app-releases`)

before: none (route does not exist in the before build (404)) · after: `/app/releases` on :3005 · stored owner session

| | 375 | 768 | 1440 | 1920 |
| --- | --- | --- | --- | --- |
| before | — | — | — | — |
| after | [after-375](./app-releases/after-375.webp) (132 KB)<br><sub>4278 px tall, 461 px wide (horizontal overflow)</sub> | [after-768](./app-releases/after-768.webp) (139 KB)<br><sub>3272 px tall, 1104 px wide (horizontal overflow)</sub> | [after-1440-part1](./app-releases/after-1440-part1.webp) (147 KB)<br>[after-1440-part2](./app-releases/after-1440-part2.webp) (125 KB)<br><sub>3030 px tall</sub> | [after-1920-part1](./app-releases/after-1920-part1.webp) (145 KB)<br>[after-1920-part2](./app-releases/after-1920-part2.webp) (133 KB)<br><sub>2834 px tall</sub> |

Change: After only (the before build answers 404 for this route; the closest before feature was the setup chat under `/app/sites/<siteId>/setup`, which was not captured): "Releases" in the new shell with an environment strip (Production: nothing published yet, draft v1 with 6 changes; Staging · Test mode: v1 published), a "Draft for Production" card (v1, checks passed, prepared by Olivia Owner, four-eyes approval not required, buttons Publish now / Schedule / Request approval / Discard draft), a "Changes" diff list grouped by events, destinations, consent, settings, site and other, a "Test evidence" panel with a Live Test Lab link, a "Change Impact Preview" (affected events table, affected destinations, consent purposes before/after, estimated volume with "not measured" values, plan limits 500 000 events per month, expected data-quality effect) and a "Version history" empty state; the Track AI panel shows the persisted transcript.
