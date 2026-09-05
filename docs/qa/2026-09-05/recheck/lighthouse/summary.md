# Lighthouse summary — recheck

Generated 2026-09-05T11:17:32.106Z from the `*.report.json` files in this directory (Lighthouse 13.4.1). Scores are `categories.<id>.score × 100`, metrics are `audits.<id>.numericValue`; the median is taken per value over the runs of a page (for 3 runs: the middle value; for 1 run: that run). "TBT" stands in for INP: Lighthouse lab runs contain no user interaction, so `interaction-to-next-paint` has no value and Total Blocking Time is the closest lab proxy. The representative run named per page is the run whose performance score is closest to the median; its opportunities and failing audits are listed.

Targets: accessibility ≥ 95, best practices ≥ 95, SEO ≥ 95, performance as close to 95 as realistic (reported against 95), LCP ≤ 2.50 s, CLS ≤ 0.1. Mobile runs use Lighthouse's default mobile emulation with simulated throttling (Moto G Power class, 4× CPU slowdown, 150 ms RTT / 1.6 Mbps); desktop runs use `--preset=desktop`.

## Medians per page

| Page | Preset | Runs | Perf (runs) | A11y (runs) | BP (runs) | SEO (runs) | LCP | TBT | CLS | Speed Index | Targets |
| --- | --- | ---: | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| app-overview (`/app`) | mobile | 1 | **89** (89) | **100** (100) | **100** (100) | **54** (54) | 3.77 s | 57 ms | 0.000 | 1.97 s | a11y pass, BP pass, SEO FAIL, perf FAIL, LCP FAIL, CLS pass |
| home (`/en`) | mobile | 1 | **87** (87) | **100** (100) | **100** (100) | **100** (100) | 3.99 s | 58 ms | 0.000 | 2.33 s | a11y pass, BP pass, SEO pass, perf FAIL, LCP FAIL, CLS pass |
| home-de (`/de`) | mobile | 1 | **87** (87) | **100** (100) | **100** (100) | **100** (100) | 3.96 s | 67 ms | 0.000 | 2.52 s | a11y pass, BP pass, SEO pass, perf FAIL, LCP FAIL, CLS pass |
| integrations (`/en/integrations`) | mobile | 1 | **94** (94) | **100** (100) | **100** (100) | **100** (100) | 2.92 s | 38 ms | 0.000 | 1.66 s | a11y pass, BP pass, SEO pass, perf FAIL, LCP FAIL, CLS pass |
| knowledge-article-consent-mode-v2-guide (`/en/tracking-knowledge/consent-mode-v2-guide`) | mobile | 1 | **94** (94) | **100** (100) | **100** (100) | **100** (100) | 3.01 s | 33 ms | 0.019 | 1.66 s | a11y pass, BP pass, SEO pass, perf FAIL, LCP FAIL, CLS pass |
| knowledge-hub (`/en/tracking-knowledge`) | mobile | 1 | **87** (87) | **100** (100) | **100** (100) | **100** (100) | 3.82 s | 48 ms | 0.000 | 3.04 s | a11y pass, BP pass, SEO pass, perf FAIL, LCP FAIL, CLS pass |
| login (`/en/login`) | mobile | 1 | **89** (89) | **100** (100) | **96** (96) | **63** (63) | 3.62 s | 79 ms | 0.000 | 1.51 s | a11y pass, BP pass, SEO FAIL, perf FAIL, LCP FAIL, CLS pass |
| pricing (`/en/pricing`) | mobile | 1 | **93** (93) | **100** (100) | **100** (100) | **100** (100) | 3.09 s | 38 ms | 0.029 | 1.66 s | a11y pass, BP pass, SEO pass, perf FAIL, LCP FAIL, CLS pass |

## Per-run values

| Report | Perf | A11y | BP | SEO | LCP | TBT | CLS | SI | FCP | Warnings |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `app-overview--mobile--run1.report.json` | 89 | 100 | 100 | 54 | 3.77 s | 57 ms | 0.000 | 1.97 s | 1.51 s |  |
| `home--mobile--run1.report.json` | 87 | 100 | 100 | 100 | 3.99 s | 58 ms | 0.000 | 2.33 s | 1.68 s |  |
| `home-de--mobile--run1.report.json` | 87 | 100 | 100 | 100 | 3.96 s | 67 ms | 0.000 | 2.52 s | 1.67 s |  |
| `integrations--mobile--run1.report.json` | 94 | 100 | 100 | 100 | 2.92 s | 38 ms | 0.000 | 1.66 s | 1.66 s |  |
| `knowledge-article-consent-mode-v2-guide--mobile--run1.report.json` | 94 | 100 | 100 | 100 | 3.01 s | 33 ms | 0.019 | 1.66 s | 1.66 s |  |
| `knowledge-hub--mobile--run1.report.json` | 87 | 100 | 100 | 100 | 3.82 s | 48 ms | 0.000 | 3.04 s | 1.81 s |  |
| `login--mobile--run1.report.json` | 89 | 100 | 96 | 63 | 3.62 s | 79 ms | 0.000 | 1.51 s | 1.51 s |  |
| `pricing--mobile--run1.report.json` | 93 | 100 | 100 | 100 | 3.09 s | 38 ms | 0.029 | 1.66 s | 1.66 s |  |

## Top opportunities per page (representative run)

### app-overview — mobile (`app-overview--mobile--run1.report.json`)

- **Reduce initial server response time** (`server-response-time`, score 0, Root document took 850 ms; est. savings FCP 750 ms, LCP 750 ms)
  - http://localhost:3006/app
- **Document request latency** (`document-latency-insight`, score 0, Est savings of 750 ms; est. savings FCP 750 ms, LCP 750 ms)
- **Reduce unused JavaScript** (`unused-javascript`, score 0, Est savings of 129 KiB; est. savings LCP 600 ms)
  - http://localhost:3006/_next/static/chunks/39irnht9mexlf.js (103.7 KB, wasted 103.6 KB)
  - http://localhost:3006/_next/static/chunks/0x8kzgkz_i9l-.js (71.8 KB, wasted 25.4 KB)
- **Render-blocking requests** (`render-blocking-insight`, score 0, Est savings of 360 ms; est. savings FCP 350 ms, LCP 350 ms)
  - http://localhost:3006/_next/static/chunks/0wwcefl2yorq9.css (21.3 KB, wasted 456 ms)
  - http://localhost:3006/_next/static/chunks/2h5nwbhdnm461.css (2.1 KB, wasted 156 ms)
- **JavaScript execution time** (`bootup-time`, score 1, 0.5 s; est. savings TBT 100 ms)
  - http://localhost:3006/_next/static/chunks/0x8kzgkz_i9l-.js
  - http://localhost:3006/app
  - Unattributable
  - http://localhost:3006/_next/static/chunks/42dfmdvax0djp.js

### home — mobile (`home--mobile--run1.report.json`)

- **Reduce unused JavaScript** (`unused-javascript`, score 0, Est savings of 23 KiB; est. savings LCP 450 ms)
  - http://localhost:3006/_next/static/chunks/0x8kzgkz_i9l-.js (71.8 KB, wasted 22.5 KB)
- **Render-blocking requests** (`render-blocking-insight`, score 0, Est savings of 390 ms; est. savings FCP 400 ms, LCP 400 ms)
  - http://localhost:3006/_next/static/chunks/0wwcefl2yorq9.css (21.3 KB, wasted 459 ms)
  - http://localhost:3006/_next/static/chunks/2h5nwbhdnm461.css (2.1 KB, wasted 159 ms)
- **Legacy JavaScript** (`legacy-javascript-insight`, score 0, Est savings of 14 KiB; est. savings LCP 150 ms)
  - http://localhost:3006/_next/static/chunks/0x8kzgkz_i9l-.js (wasted 13.6 KB)
- **JavaScript execution time** (`bootup-time`, score 1, 0.6 s; est. savings TBT 100 ms)
  - http://localhost:3006/en
  - http://localhost:3006/_next/static/chunks/0x8kzgkz_i9l-.js
  - Unattributable
  - http://localhost:3006/_next/static/chunks/42dfmdvax0djp.js
- **Minimizes main-thread work** (`mainthread-work-breakdown`, score 1, 1.5 s; est. savings TBT 50 ms)

### home-de — mobile (`home-de--mobile--run1.report.json`)

- **Reduce unused JavaScript** (`unused-javascript`, score 0, Est savings of 23 KiB; est. savings LCP 450 ms)
  - http://localhost:3006/_next/static/chunks/0x8kzgkz_i9l-.js (71.8 KB, wasted 22.5 KB)
- **Render-blocking requests** (`render-blocking-insight`, score 0, Est savings of 320 ms; est. savings FCP 300 ms, LCP 300 ms)
  - http://localhost:3006/_next/static/chunks/0wwcefl2yorq9.css (21.3 KB, wasted 457 ms)
  - http://localhost:3006/_next/static/chunks/2h5nwbhdnm461.css (2.1 KB, wasted 157 ms)
- **Legacy JavaScript** (`legacy-javascript-insight`, score 0, Est savings of 14 KiB; est. savings LCP 150 ms)
  - http://localhost:3006/_next/static/chunks/0x8kzgkz_i9l-.js (wasted 13.6 KB)
- **JavaScript execution time** (`bootup-time`, score 1, 0.5 s; est. savings TBT 100 ms)
  - http://localhost:3006/de
  - http://localhost:3006/_next/static/chunks/0x8kzgkz_i9l-.js
  - Unattributable
  - http://localhost:3006/_next/static/chunks/42dfmdvax0djp.js
- **Minimizes main-thread work** (`mainthread-work-breakdown`, score 1, 1.5 s; est. savings TBT 50 ms)

### integrations — mobile (`integrations--mobile--run1.report.json`)

- **Render-blocking requests** (`render-blocking-insight`, score 0, Est savings of 450 ms; est. savings FCP 450 ms, LCP 450 ms)
  - http://localhost:3006/_next/static/chunks/0wwcefl2yorq9.css (21.3 KB, wasted 454 ms)
  - http://localhost:3006/_next/static/chunks/2h5nwbhdnm461.css (2.1 KB, wasted 154 ms)
- **JavaScript execution time** (`bootup-time`, score 1, 0.4 s; est. savings TBT 100 ms)
  - http://localhost:3006/en/integrations
  - http://localhost:3006/_next/static/chunks/0x8kzgkz_i9l-.js
  - Unattributable
  - http://localhost:3006/_next/static/chunks/42dfmdvax0djp.js
- **Minimizes main-thread work** (`mainthread-work-breakdown`, score 1, 1.0 s; est. savings TBT 50 ms)
- **Avoid long main-thread tasks** (`long-tasks`, score 1, 3 long tasks found; est. savings TBT 50 ms)
  - http://localhost:3006/en/integrations (155 ms)
  - http://localhost:3006/_next/static/chunks/0x8kzgkz_i9l-.js (126 ms)
  - http://localhost:3006/en/integrations (66 ms)
- **Largest Contentful Paint** (`largest-contentful-paint`, score 0.8, 2.9 s)

### knowledge-article-consent-mode-v2-guide — mobile (`knowledge-article-consent-mode-v2-guide--mobile--run1.report.json`)

- **Render-blocking requests** (`render-blocking-insight`, score 0, Est savings of 480 ms; est. savings FCP 500 ms, LCP 500 ms)
  - http://localhost:3006/_next/static/chunks/0wwcefl2yorq9.css (21.3 KB, wasted 455 ms)
  - http://localhost:3006/_next/static/chunks/2h5nwbhdnm461.css (2.1 KB, wasted 155 ms)
- **Minimizes main-thread work** (`mainthread-work-breakdown`, score 1, 1.0 s; est. savings TBT 50 ms)
- **JavaScript execution time** (`bootup-time`, score 1, 0.4 s; est. savings TBT 50 ms)
  - http://localhost:3006/en/tracking-knowledge/consent-mode-v2-guide
  - http://localhost:3006/_next/static/chunks/0x8kzgkz_i9l-.js
  - Unattributable
  - http://localhost:3006/_next/static/chunks/42dfmdvax0djp.js
- **Avoid long main-thread tasks** (`long-tasks`, score 1, 3 long tasks found; est. savings TBT 50 ms)
  - http://localhost:3006/en/tracking-knowledge/consent-mode-v2-guide (127 ms)
  - http://localhost:3006/_next/static/chunks/0x8kzgkz_i9l-.js (115 ms)
  - http://localhost:3006/en/tracking-knowledge/consent-mode-v2-guide (59 ms)
- **Avoid large layout shifts** (`layout-shifts`, score 1, 1 layout shift found; est. savings CLS 0.019)
  - div.border-b > div.container-page > div > p.mt-5 — <p class="mt-5 max-w-text text-lg text-ink-2"> (shift 0.019)

### knowledge-hub — mobile (`knowledge-hub--mobile--run1.report.json`)

- **Reduce unused JavaScript** (`unused-javascript`, score 0, Est savings of 29 KiB; est. savings LCP 450 ms)
  - http://localhost:3006/_next/static/chunks/0x8kzgkz_i9l-.js (71.8 KB, wasted 28.7 KB)
- **Render-blocking requests** (`render-blocking-insight`, score 0, Est savings of 410 ms; est. savings FCP 400 ms, LCP 400 ms)
  - http://localhost:3006/_next/static/chunks/0wwcefl2yorq9.css (21.3 KB, wasted 454 ms)
  - http://localhost:3006/_next/static/chunks/2h5nwbhdnm461.css (2.1 KB, wasted 154 ms)
- **Legacy JavaScript** (`legacy-javascript-insight`, score 0, Est savings of 14 KiB; est. savings LCP 150 ms)
  - http://localhost:3006/_next/static/chunks/0x8kzgkz_i9l-.js (wasted 13.6 KB)
- **Initial server response time was short** (`server-response-time`, score 1, Root document took 220 ms; est. savings FCP 100 ms, LCP 100 ms)
  - http://localhost:3006/en/tracking-knowledge
- **JavaScript execution time** (`bootup-time`, score 1, 0.5 s; est. savings TBT 100 ms)
  - http://localhost:3006/en/tracking-knowledge
  - http://localhost:3006/_next/static/chunks/0x8kzgkz_i9l-.js
  - Unattributable
  - http://localhost:3006/_next/static/chunks/42dfmdvax0djp.js

### login — mobile (`login--mobile--run1.report.json`)

- **Render-blocking requests** (`render-blocking-insight`, score 0, Est savings of 520 ms; est. savings FCP 500 ms, LCP 500 ms)
  - http://localhost:3006/_next/static/chunks/0wwcefl2yorq9.css (21.3 KB, wasted 454 ms)
  - http://localhost:3006/_next/static/chunks/2h5nwbhdnm461.css (2.1 KB, wasted 154 ms)
- **Reduce unused JavaScript** (`unused-javascript`, score 0, Est savings of 94 KiB; est. savings LCP 450 ms)
  - http://localhost:3006/_next/static/chunks/3q02uj3y4r8r8.js (77.8 KB, wasted 67.4 KB)
  - http://localhost:3006/_next/static/chunks/0x8kzgkz_i9l-.js (71.8 KB, wasted 27.1 KB)
- **JavaScript execution time** (`bootup-time`, score 1, 0.6 s; est. savings TBT 150 ms)
  - http://localhost:3006/_next/static/chunks/0x8kzgkz_i9l-.js
  - http://localhost:3006/en/login
  - Unattributable
  - http://localhost:3006/_next/static/chunks/42dfmdvax0djp.js
- **Minimizes main-thread work** (`mainthread-work-breakdown`, score 1, 1.0 s; est. savings TBT 100 ms)
- **Avoid long main-thread tasks** (`long-tasks`, score 1, 3 long tasks found; est. savings TBT 100 ms)
  - http://localhost:3006/_next/static/chunks/0x8kzgkz_i9l-.js (135 ms)
  - http://localhost:3006/_next/static/chunks/0x8kzgkz_i9l-.js (94 ms)
  - http://localhost:3006/en/login (84 ms)

### pricing — mobile (`pricing--mobile--run1.report.json`)

- **Render-blocking requests** (`render-blocking-insight`, score 0, Est savings of 430 ms; est. savings FCP 450 ms, LCP 450 ms)
  - http://localhost:3006/_next/static/chunks/0wwcefl2yorq9.css (21.3 KB, wasted 455 ms)
  - http://localhost:3006/_next/static/chunks/2h5nwbhdnm461.css (2.1 KB, wasted 155 ms)
- **Avoid large layout shifts** (`layout-shifts`, score 1, 1 layout shift found; est. savings CLS 0.029)
  - section.relative > div.container-page > div.max-w-text > p.mt-5 — <p class="mt-5 text-lg text-ink-2"> (shift 0.029)
- **Minimizes main-thread work** (`mainthread-work-breakdown`, score 1, 1.2 s; est. savings TBT 50 ms)
- **JavaScript execution time** (`bootup-time`, score 1, 0.5 s; est. savings TBT 50 ms)
  - http://localhost:3006/en/pricing
  - http://localhost:3006/_next/static/chunks/0x8kzgkz_i9l-.js
  - Unattributable
  - http://localhost:3006/_next/static/chunks/42dfmdvax0djp.js
- **Avoid long main-thread tasks** (`long-tasks`, score 1, 4 long tasks found; est. savings TBT 50 ms)
  - http://localhost:3006/en/pricing (164 ms)
  - http://localhost:3006/_next/static/chunks/0x8kzgkz_i9l-.js (125 ms)
  - Unattributable (62 ms)
  - http://localhost:3006/en/pricing (51 ms)

## Failing audits of categories below target (representative run)

### app-overview — mobile — seo (median 54)

- **Page is blocked from indexing** (`is-crawlable`, weight 4.043478260869565, score 0)
  - http://localhost:3006/robots.txt:2
- **Document does not have a meta description** (`meta-description`, weight 1, score 0)

### login — mobile — seo (median 63)

- **Page is blocked from indexing** (`is-crawlable`, weight 4.043478260869565, score 0)
  - http://localhost:3006/robots.txt:5

