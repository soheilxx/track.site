# Lighthouse summary — 2026-09-05

Generated 2026-09-05T10:13:24.683Z from the `*.report.json` files in this directory (Lighthouse 13.4.1). Scores are `categories.<id>.score × 100`, metrics are `audits.<id>.numericValue`; the median is taken per value over the runs of a page (for 3 runs: the middle value; for 1 run: that run). "TBT" stands in for INP: Lighthouse lab runs contain no user interaction, so `interaction-to-next-paint` has no value and Total Blocking Time is the closest lab proxy. The representative run named per page is the run whose performance score is closest to the median; its opportunities and failing audits are listed.

Targets: accessibility ≥ 95, best practices ≥ 95, SEO ≥ 95, performance as close to 95 as realistic (reported against 95), LCP ≤ 2.50 s, CLS ≤ 0.1. Mobile runs use Lighthouse's default mobile emulation with simulated throttling (Moto G Power class, 4× CPU slowdown, 150 ms RTT / 1.6 Mbps); desktop runs use `--preset=desktop`.

## Medians per page

| Page | Preset | Runs | Perf (runs) | A11y (runs) | BP (runs) | SEO (runs) | LCP | TBT | CLS | Speed Index | Targets |
| --- | --- | ---: | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| app-overview (`/app`) | mobile | 1 | **72** (72) | **100** (100) | **100** (100) | **54** (54) | 4.82 s | 397 ms | 0.000 | 2.91 s | a11y pass, BP pass, SEO FAIL, perf FAIL, LCP FAIL, CLS pass |
| home (`/en`) | desktop | 1 | **99** (99) | **100** (100) | **96** (96) | **100** (100) | 836 ms | 35 ms | 0.001 | 611 ms | a11y pass, BP pass, SEO pass, perf pass, LCP pass, CLS pass |
| home (`/en`) | mobile | 3 | **77** (77/70/83) | **100** (100/100/100) | **96** (96/96/96) | **100** (100/100/100) | 4.73 s | 162 ms | 0.000 | 2.96 s | a11y pass, BP pass, SEO pass, perf FAIL, LCP FAIL, CLS pass |
| home-de (`/de`) | mobile | 3 | **73** (76/72/73) | **100** (100/100/100) | **96** (96/96/96) | **100** (100/100/100) | 4.93 s | 317 ms | 0.000 | 3.73 s | a11y pass, BP pass, SEO pass, perf FAIL, LCP FAIL, CLS pass |
| integrations (`/en/integrations`) | mobile | 3 | **76** (78/76/75) | **100** (100/100/100) | **96** (96/96/96) | **100** (100/100/100) | 4.53 s | 229 ms | 0.000 | 3.81 s | a11y pass, BP pass, SEO pass, perf FAIL, LCP FAIL, CLS pass |
| knowledge-article-consent-mode-v2-guide (`/en/tracking-knowledge/consent-mode-v2-guide`) | mobile | 3 | **83** (82/83/83) | **100** (100/100/100) | **100** (100/100/100) | **100** (100/100/100) | 4.45 s | 107 ms | 0.000 | 2.28 s | a11y pass, BP pass, SEO pass, perf FAIL, LCP FAIL, CLS pass |
| knowledge-hub (`/en/tracking-knowledge`) | mobile | 3 | **80** (78/83/80) | **100** (100/100/100) | **96** (96/96/96) | **100** (100/100/100) | 4.61 s | 135 ms | 0.000 | 3.86 s | a11y pass, BP pass, SEO pass, perf FAIL, LCP FAIL, CLS pass |
| login (`/en/login`) | mobile | 3 | **79** (79/70/79) | **100** (100/100/100) | **92** (92/92/92) | **63** (63/63/63) | 4.74 s | 237 ms | 0.000 | 2.26 s | a11y pass, BP FAIL, SEO FAIL, perf FAIL, LCP FAIL, CLS pass |
| pricing (`/en/pricing`) | desktop | 1 | **99** (99) | **100** (100) | **96** (96) | **100** (100) | 919 ms | 7 ms | 0.000 | 733 ms | a11y pass, BP pass, SEO pass, perf pass, LCP pass, CLS pass |
| pricing (`/en/pricing`) | mobile | 3 | **75** (67/84/75) | **100** (100/100/100) | **96** (96/96/96) | **100** (100/100/100) | 4.58 s | 310 ms | 0.000 | 2.04 s | a11y pass, BP pass, SEO pass, perf FAIL, LCP FAIL, CLS pass |

## Per-run values

| Report | Perf | A11y | BP | SEO | LCP | TBT | CLS | SI | FCP | Warnings |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `app-overview--mobile--run1.report.json` | 72 | 100 | 100 | 54 | 4.82 s | 397 ms | 0.000 | 2.91 s | 1.53 s |  |
| `home--desktop--run1.report.json` | 99 | 100 | 96 | 100 | 836 ms | 35 ms | 0.001 | 611 ms | 470 ms |  |
| `home--mobile--run1.report.json` | 77 | 100 | 96 | 100 | 5.13 s | 162 ms | 0.000 | 3.70 s | 1.52 s |  |
| `home--mobile--run2.report.json` | 70 | 100 | 96 | 100 | 4.73 s | 438 ms | 0.000 | 2.96 s | 2.04 s |  |
| `home--mobile--run3.report.json` | 83 | 100 | 96 | 100 | 4.61 s | 91 ms | 0.000 | 2.25 s | 1.51 s |  |
| `home-de--mobile--run1.report.json` | 76 | 100 | 96 | 100 | 4.91 s | 239 ms | 0.000 | 3.73 s | 1.52 s |  |
| `home-de--mobile--run2.report.json` | 72 | 100 | 96 | 100 | 5.22 s | 317 ms | 0.000 | 3.77 s | 1.52 s |  |
| `home-de--mobile--run3.report.json` | 73 | 100 | 96 | 100 | 4.93 s | 324 ms | 0.000 | 3.72 s | 1.52 s |  |
| `integrations--mobile--run1.report.json` | 78 | 100 | 96 | 100 | 4.42 s | 207 ms | 0.000 | 4.11 s | 1.79 s |  |
| `integrations--mobile--run2.report.json` | 76 | 100 | 96 | 100 | 4.87 s | 229 ms | 0.000 | 3.72 s | 1.52 s |  |
| `integrations--mobile--run3.report.json` | 75 | 100 | 96 | 100 | 4.53 s | 327 ms | 0.000 | 3.81 s | 1.53 s |  |
| `knowledge-article-consent-mode-v2-guide--mobile--run1.report.json` | 82 | 100 | 100 | 100 | 4.03 s | 218 ms | 0.000 | 2.71 s | 1.88 s |  |
| `knowledge-article-consent-mode-v2-guide--mobile--run2.report.json` | 83 | 100 | 100 | 100 | 4.45 s | 94 ms | 0.000 | 2.26 s | 1.51 s |  |
| `knowledge-article-consent-mode-v2-guide--mobile--run3.report.json` | 83 | 100 | 100 | 100 | 4.54 s | 107 ms | 0.000 | 2.28 s | 1.52 s |  |
| `knowledge-hub--mobile--run1.report.json` | 78 | 100 | 96 | 100 | 4.81 s | 146 ms | 0.000 | 3.92 s | 1.70 s |  |
| `knowledge-hub--mobile--run2.report.json` | 83 | 100 | 96 | 100 | 4.55 s | 57 ms | 0.000 | 2.45 s | 1.67 s |  |
| `knowledge-hub--mobile--run3.report.json` | 80 | 100 | 96 | 100 | 4.61 s | 135 ms | 0.000 | 3.86 s | 1.67 s |  |
| `login--mobile--run1.report.json` | 79 | 100 | 92 | 63 | 4.74 s | 237 ms | 0.000 | 2.23 s | 1.36 s |  |
| `login--mobile--run2.report.json` | 70 | 100 | 92 | 63 | 4.40 s | 535 ms | 0.000 | 2.75 s | 1.69 s |  |
| `login--mobile--run3.report.json` | 79 | 100 | 92 | 63 | 4.75 s | 201 ms | 0.000 | 2.26 s | 1.36 s |  |
| `pricing--desktop--run1.report.json` | 99 | 100 | 96 | 100 | 919 ms | 7 ms | 0.000 | 733 ms | 566 ms |  |
| `pricing--mobile--run1.report.json` | 67 | 100 | 96 | 100 | 4.71 s | 376 ms | 0.000 | 4.79 s | 2.57 s |  |
| `pricing--mobile--run2.report.json` | 84 | 100 | 96 | 100 | 3.84 s | 227 ms | 0.000 | 1.53 s | 1.53 s |  |
| `pricing--mobile--run3.report.json` | 75 | 100 | 96 | 100 | 4.58 s | 310 ms | 0.000 | 2.04 s | 2.04 s |  |

## Top opportunities per page (representative run)

### app-overview — mobile (`app-overview--mobile--run1.report.json`)

- **Reduce initial server response time** (`server-response-time`, score 0, Root document took 1,280 ms; est. savings FCP 1200 ms, LCP 1200 ms)
  - http://localhost:3002/app
- **Document request latency** (`document-latency-insight`, score 0, Est savings of 1,180 ms; est. savings FCP 1200 ms, LCP 1200 ms)
- **Reduce unused JavaScript** (`unused-javascript`, score 0, Est savings of 129 KiB; est. savings LCP 750 ms)
  - http://localhost:3002/_next/static/chunks/39irnht9mexlf.js (103.7 KB, wasted 103.6 KB)
  - http://localhost:3002/_next/static/chunks/0x8kzgkz_i9l-.js (71.8 KB, wasted 25.4 KB)
- **Reduce JavaScript execution time** (`bootup-time`, score 0, 1.3 s; est. savings TBT 500 ms)
  - http://localhost:3002/_next/static/chunks/0x8kzgkz_i9l-.js
  - http://localhost:3002/app
  - http://localhost:3002/_next/static/chunks/42dfmdvax0djp.js
  - Unattributable
- **Minimize main-thread work** (`mainthread-work-breakdown`, score 0, 2.1 s; est. savings TBT 400 ms)

### home — desktop (`home--desktop--run1.report.json`)

- **Render-blocking requests** (`render-blocking-insight`, score 0, Est savings of 80 ms; est. savings FCP 100 ms, LCP 100 ms)
  - http://localhost:3002/_next/static/chunks/24r3va1wcpe5d.css (20.8 KB, wasted 131 ms)
  - http://localhost:3002/_next/static/chunks/37-grltg1q_wr.css (2.1 KB, wasted 51 ms)
- **Minimizes main-thread work** (`mainthread-work-breakdown`, score 1, 0.8 s; est. savings TBT 50 ms)
- **Avoid long main-thread tasks** (`long-tasks`, score 1, 2 long tasks found; est. savings TBT 50 ms)
  - http://localhost:3002/_next/static/chunks/42dfmdvax0djp.js (75 ms)
  - http://localhost:3002/_next/static/chunks/0x8kzgkz_i9l-.js (70 ms)
- **Reduce unused JavaScript** (`unused-javascript`, score 0, Est savings of 22 KiB; est. savings LCP 50 ms)
  - http://localhost:3002/_next/static/chunks/0x8kzgkz_i9l-.js (71.8 KB, wasted 22.4 KB)
- **Legacy JavaScript** (`legacy-javascript-insight`, score 0, Est savings of 14 KiB; est. savings LCP 50 ms)
  - http://localhost:3002/_next/static/chunks/0x8kzgkz_i9l-.js (wasted 13.6 KB)

### home — mobile (`home--mobile--run1.report.json`)

- **Reduce unused JavaScript** (`unused-javascript`, score 0, Est savings of 23 KiB; est. savings LCP 250 ms)
  - http://localhost:3002/_next/static/chunks/0x8kzgkz_i9l-.js (71.8 KB, wasted 22.5 KB)
- **Legacy JavaScript** (`legacy-javascript-insight`, score 0, Est savings of 14 KiB; est. savings LCP 250 ms)
  - http://localhost:3002/_next/static/chunks/0x8kzgkz_i9l-.js (wasted 13.6 KB)
- **Render-blocking requests** (`render-blocking-insight`, score 0, Est savings of 220 ms; est. savings FCP 200 ms, LCP 200 ms)
  - http://localhost:3002/_next/static/chunks/24r3va1wcpe5d.css (20.8 KB, wasted 460 ms)
  - http://localhost:3002/_next/static/chunks/37-grltg1q_wr.css (2.1 KB, wasted 160 ms)
- **Minimizes main-thread work** (`mainthread-work-breakdown`, score 1, 1.7 s; est. savings TBT 150 ms)
- **JavaScript execution time** (`bootup-time`, score 1, 0.8 s; est. savings TBT 150 ms)
  - http://localhost:3002/en
  - http://localhost:3002/_next/static/chunks/0x8kzgkz_i9l-.js
  - Unattributable
  - http://localhost:3002/_next/static/chunks/42dfmdvax0djp.js

### home-de — mobile (`home-de--mobile--run3.report.json`)

- **Legacy JavaScript** (`legacy-javascript-insight`, score 0, Est savings of 14 KiB; est. savings LCP 450 ms)
  - http://localhost:3002/_next/static/chunks/0x8kzgkz_i9l-.js (wasted 13.6 KB)
- **Reduce unused JavaScript** (`unused-javascript`, score 0, Est savings of 23 KiB; est. savings LCP 400 ms)
  - http://localhost:3002/_next/static/chunks/0x8kzgkz_i9l-.js (71.8 KB, wasted 22.5 KB)
- **Minimize main-thread work** (`mainthread-work-breakdown`, score 0, 2.1 s; est. savings TBT 300 ms)
- **JavaScript execution time** (`bootup-time`, score 1, 1.0 s; est. savings TBT 300 ms)
  - http://localhost:3002/de
  - http://localhost:3002/_next/static/chunks/0x8kzgkz_i9l-.js
  - Unattributable
  - http://localhost:3002/_next/static/chunks/42dfmdvax0djp.js
- **Avoid long main-thread tasks** (`long-tasks`, score 1, 7 long tasks found; est. savings TBT 300 ms)
  - http://localhost:3002/de (312 ms)
  - http://localhost:3002/_next/static/chunks/0x8kzgkz_i9l-.js (273 ms)
  - http://localhost:3002/_next/static/chunks/0x8kzgkz_i9l-.js (98 ms)
  - http://localhost:3002/_next/static/chunks/0x8kzgkz_i9l-.js (93 ms)

### integrations — mobile (`integrations--mobile--run2.report.json`)

- **Reduce unused JavaScript** (`unused-javascript`, score 0, Est savings of 29 KiB; est. savings LCP 350 ms)
  - http://localhost:3002/_next/static/chunks/0x8kzgkz_i9l-.js (71.8 KB, wasted 28.7 KB)
- **Minimizes main-thread work** (`mainthread-work-breakdown`, score 1, 1.5 s; est. savings TBT 250 ms)
- **JavaScript execution time** (`bootup-time`, score 1, 0.7 s; est. savings TBT 250 ms)
  - http://localhost:3002/en/integrations
  - http://localhost:3002/_next/static/chunks/0x8kzgkz_i9l-.js
  - Unattributable
  - http://localhost:3002/_next/static/chunks/42dfmdvax0djp.js
- **Avoid long main-thread tasks** (`long-tasks`, score 1, 5 long tasks found; est. savings TBT 250 ms)
  - http://localhost:3002/_next/static/chunks/0x8kzgkz_i9l-.js (279 ms)
  - http://localhost:3002/en/integrations (171 ms)
  - http://localhost:3002/en/integrations (54 ms)
  - Unattributable (50 ms)
- **Render-blocking requests** (`render-blocking-insight`, score 0, Est savings of 240 ms; est. savings FCP 250 ms, LCP 250 ms)
  - http://localhost:3002/_next/static/chunks/24r3va1wcpe5d.css (20.8 KB, wasted 459 ms)
  - http://localhost:3002/_next/static/chunks/37-grltg1q_wr.css (2.1 KB, wasted 159 ms)

### knowledge-article-consent-mode-v2-guide — mobile (`knowledge-article-consent-mode-v2-guide--mobile--run2.report.json`)

- **Reduce unused JavaScript** (`unused-javascript`, score 0, Est savings of 27 KiB; est. savings LCP 400 ms)
  - http://localhost:3002/_next/static/chunks/0x8kzgkz_i9l-.js (71.8 KB, wasted 27.3 KB)
- **Render-blocking requests** (`render-blocking-insight`, score 0, Est savings of 300 ms; est. savings FCP 300 ms, LCP 300 ms)
  - http://localhost:3002/_next/static/chunks/24r3va1wcpe5d.css (20.8 KB, wasted 457 ms)
  - http://localhost:3002/_next/static/chunks/37-grltg1q_wr.css (2.1 KB, wasted 157 ms)
- **JavaScript execution time** (`bootup-time`, score 1, 0.8 s; est. savings TBT 200 ms)
  - http://localhost:3002/_next/static/chunks/0x8kzgkz_i9l-.js
  - http://localhost:3002/en/tracking-knowledge/consent-mode-v2-guide
  - Unattributable
  - http://localhost:3002/_next/static/chunks/42dfmdvax0djp.js
- **Legacy JavaScript** (`legacy-javascript-insight`, score 0, Est savings of 14 KiB; est. savings LCP 150 ms)
  - http://localhost:3002/_next/static/chunks/0x8kzgkz_i9l-.js (wasted 13.6 KB)
- **Minimizes main-thread work** (`mainthread-work-breakdown`, score 1, 1.5 s; est. savings TBT 100 ms)

### knowledge-hub — mobile (`knowledge-hub--mobile--run3.report.json`)

- **Render-blocking requests** (`render-blocking-insight`, score 0, Est savings of 270 ms; est. savings FCP 250 ms, LCP 250 ms)
  - http://localhost:3002/_next/static/chunks/24r3va1wcpe5d.css (20.8 KB, wasted 459 ms)
  - http://localhost:3002/_next/static/chunks/37-grltg1q_wr.css (2.1 KB, wasted 159 ms)
- **Reduce unused JavaScript** (`unused-javascript`, score 0, Est savings of 29 KiB; est. savings LCP 200 ms)
  - http://localhost:3002/_next/static/chunks/0x8kzgkz_i9l-.js (71.8 KB, wasted 28.6 KB)
- **Minimizes main-thread work** (`mainthread-work-breakdown`, score 1, 1.4 s; est. savings TBT 150 ms)
- **JavaScript execution time** (`bootup-time`, score 1, 0.7 s; est. savings TBT 150 ms)
  - http://localhost:3002/en/tracking-knowledge
  - http://localhost:3002/_next/static/chunks/0x8kzgkz_i9l-.js
  - Unattributable
  - http://localhost:3002/_next/static/chunks/42dfmdvax0djp.js
- **Avoid long main-thread tasks** (`long-tasks`, score 1, 5 long tasks found; est. savings TBT 150 ms)
  - http://localhost:3002/_next/static/chunks/0x8kzgkz_i9l-.js (185 ms)
  - http://localhost:3002/en/tracking-knowledge (105 ms)
  - http://localhost:3002/en/tracking-knowledge (91 ms)
  - http://localhost:3002/en/tracking-knowledge (78 ms)

### login — mobile (`login--mobile--run1.report.json`)

- **Reduce unused JavaScript** (`unused-javascript`, score 0, Est savings of 94 KiB; est. savings LCP 600 ms)
  - http://localhost:3002/_next/static/chunks/3q02uj3y4r8r8.js (77.8 KB, wasted 67.4 KB)
  - http://localhost:3002/_next/static/chunks/0x8kzgkz_i9l-.js (71.8 KB, wasted 27.1 KB)
- **Render-blocking requests** (`render-blocking-insight`, score 0, Est savings of 390 ms; est. savings FCP 400 ms, LCP 400 ms)
  - http://localhost:3002/_next/static/chunks/24r3va1wcpe5d.css (20.8 KB, wasted 456 ms)
  - http://localhost:3002/_next/static/chunks/37-grltg1q_wr.css (2.1 KB, wasted 156 ms)
- **Minimizes main-thread work** (`mainthread-work-breakdown`, score 1, 1.3 s; est. savings TBT 250 ms)
- **JavaScript execution time** (`bootup-time`, score 1, 0.8 s; est. savings TBT 250 ms)
  - http://localhost:3002/_next/static/chunks/0x8kzgkz_i9l-.js
  - http://localhost:3002/en/login
  - http://localhost:3002/_next/static/chunks/42dfmdvax0djp.js
  - Unattributable
- **Avoid long main-thread tasks** (`long-tasks`, score 1, 6 long tasks found; est. savings TBT 250 ms)
  - http://localhost:3002/_next/static/chunks/0x8kzgkz_i9l-.js (199 ms)
  - http://localhost:3002/_next/static/chunks/0x8kzgkz_i9l-.js (134 ms)
  - http://localhost:3002/en/login (64 ms)
  - http://localhost:3002/_next/static/chunks/0x8kzgkz_i9l-.js (55 ms)

### pricing — desktop (`pricing--desktop--run1.report.json`)

- **Reduce unused JavaScript** (`unused-javascript`, score 0, Est savings of 29 KiB; est. savings FCP 50 ms, LCP 100 ms)
  - http://localhost:3002/_next/static/chunks/0x8kzgkz_i9l-.js (71.8 KB, wasted 29.0 KB)
- **Render-blocking requests** (`render-blocking-insight`, score 0, Est savings of 120 ms; est. savings FCP 100 ms, LCP 100 ms)
  - http://localhost:3002/_next/static/chunks/24r3va1wcpe5d.css (20.8 KB, wasted 132 ms)
  - http://localhost:3002/_next/static/chunks/37-grltg1q_wr.css (2.1 KB, wasted 52 ms)
- **Legacy JavaScript** (`legacy-javascript-insight`, score 0, Est savings of 14 KiB; est. savings FCP 50 ms, LCP 50 ms)
  - http://localhost:3002/_next/static/chunks/0x8kzgkz_i9l-.js (wasted 13.6 KB)
- **Network dependency tree** (`network-dependency-tree-insight`, score 0)

### pricing — mobile (`pricing--mobile--run3.report.json`)

- **Reduce unused JavaScript** (`unused-javascript`, score 0, Est savings of 29 KiB; est. savings LCP 450 ms)
  - http://localhost:3002/_next/static/chunks/0x8kzgkz_i9l-.js (71.8 KB, wasted 29.0 KB)
- **Minimize main-thread work** (`mainthread-work-breakdown`, score 0, 3.6 s; est. savings TBT 300 ms)
- **JavaScript execution time** (`bootup-time`, score 1, 1.1 s; est. savings TBT 300 ms)
  - http://localhost:3002/en/pricing
  - http://localhost:3002/_next/static/chunks/0x8kzgkz_i9l-.js
  - Unattributable
  - http://localhost:3002/_next/static/chunks/42dfmdvax0djp.js
- **Avoid long main-thread tasks** (`long-tasks`, score 1, 6 long tasks found; est. savings TBT 300 ms)
  - http://localhost:3002/en/pricing (759 ms)
  - http://localhost:3002/_next/static/chunks/0x8kzgkz_i9l-.js (331 ms)
  - http://localhost:3002/en/pricing (212 ms)
  - http://localhost:3002/en/pricing (77 ms)
- **Legacy JavaScript** (`legacy-javascript-insight`, score 0, Est savings of 14 KiB; est. savings LCP 150 ms)
  - http://localhost:3002/_next/static/chunks/0x8kzgkz_i9l-.js (wasted 13.6 KB)

## Failing audits of categories below target (representative run)

### app-overview — mobile — seo (median 54)

- **Page is blocked from indexing** (`is-crawlable`, weight 4.043478260869565, score 0)
  - http://localhost:3002/robots.txt:2
- **Document does not have a meta description** (`meta-description`, weight 1, score 0)

### login — mobile — best-practices (median 92)

- **Browser errors were logged to the console** (`errors-in-console`, weight 1, score 0)
  - rendering
- **Issues were logged in the `Issues` panel in Chrome Devtools** (`inspector-issues`, weight 1, score 0)

### login — mobile — seo (median 63)

- **Page is blocked from indexing** (`is-crawlable`, weight 4.043478260869565, score 0)
  - http://localhost:3002/robots.txt:5



## Re-check (task F1, 2026-09-05, build `UANQbZ2DkEqCtTt7EriZY`)

Fixes: `apps/web/src/app/fonts.ts` preloads only the `latin` subset of Inter and no longer preloads Bricolage (font requests 4 → 2, transfer 197 929 B → 91 792 B on `/en`; the prerendered HTML carries one `<link rel="preload" as="font">` instead of four); the invalid SVG `height="auto"` attribute that logged a console error on every page with a diagram or cover is gone (`packages/ui/src/diagram.tsx`, `knowledge/cover.tsx`). One mobile run per previously failing page against the rebuilt server on port 3006 — raw reports and the regenerated tables in `docs/qa/2026-09-05/recheck/lighthouse/` (`summary.md`, `*.report.json`), method and remaining gaps in `docs/qa/2026-09-05/recheck/README.md` §1 (#10, #11) and §3.

| Page | Perf before → after | LCP before → after | BP | Notes |
| --- | --- | --- | --- | --- |
| `/en` | 77 → 87 | 4.73 s → 3.99 s | 96 → 100 | TBT 162 → 58 ms |
| `/de` | 73 → 87 | 4.93 s → 3.96 s | 96 → 100 | |
| `/en/pricing` | 75 → 93 | 4.58 s → 3.09 s | 96 → 100 | |
| `/en/tracking-knowledge` | 80 → 87 | 4.61 s → 3.82 s | 96 → 100 | |
| `/en/tracking-knowledge/consent-mode-v2-guide` | 83 → 94 | 4.45 s → 3.01 s | 100 → 100 | |
| `/en/integrations` | 76 → 94 | 4.53 s → 2.92 s | 96 → 100 | |
| `/en/login` | 79 → 89 | 4.74 s → 3.62 s | 92 → 96 | SEO 63 unchanged: `noindex` by design |
| `/app` (authenticated) | 72 → 89 | 4.82 s → 3.77 s | 100 → 100 | TBT 397 → 57 ms; SEO 54 unchanged: `noindex` |

"Before" values are the medians of this file; "after" values are single runs (`--runs 1`), so ±5 points of noise applies. LCP is still above 2.5 s and performance below 95 on every mobile page: the remaining cost is the hydration JavaScript (16 files, 217–231 KB gzip, of which 13.6 KB are Next.js's own unconditional `@next/polyfill-module` and 22–29 KB React/Next runtime) and the 94–107 KB HTML documents — see the recheck README §3 for what was not changed and why.
