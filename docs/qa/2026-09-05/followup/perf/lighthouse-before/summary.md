# Lighthouse summary — perf

Generated 2026-09-05T12:19:08.627Z from the `*.report.json` files in this directory (Lighthouse 13.4.1). Scores are `categories.<id>.score × 100`, metrics are `audits.<id>.numericValue`; the median is taken per value over the runs of a page (for 3 runs: the middle value; for 1 run: that run). "TBT" stands in for INP: Lighthouse lab runs contain no user interaction, so `interaction-to-next-paint` has no value and Total Blocking Time is the closest lab proxy. The representative run named per page is the run whose performance score is closest to the median; its opportunities and failing audits are listed.

Targets: accessibility ≥ 95, best practices ≥ 95, SEO ≥ 95, performance as close to 95 as realistic (reported against 95), LCP ≤ 2.50 s, CLS ≤ 0.1. Mobile runs use Lighthouse's default mobile emulation with simulated throttling (Moto G Power class, 4× CPU slowdown, 150 ms RTT / 1.6 Mbps); desktop runs use `--preset=desktop`.

## Medians per page

| Page | Preset | Runs | Perf (runs) | A11y (runs) | BP (runs) | SEO (runs) | LCP | TBT | CLS | Speed Index | Targets |
| --- | --- | ---: | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| home (`/en`) | mobile | 3 | **89** (94/89/89) | **100** (100/100/100) | **100** (100/100/100) | **100** (100/100/100) | 3.63 s | 38 ms | 0.000 | 1.66 s | a11y pass, BP pass, SEO pass, perf FAIL, LCP FAIL, CLS pass |
| knowledge-article-consent-mode-v2-guide (`/en/tracking-knowledge/consent-mode-v2-guide`) | mobile | 3 | **94** (94/96/89) | **100** (100/100/100) | **100** (100/100/100) | **100** (100/100/100) | 3.02 s | 36 ms | 0.019 | 1.66 s | a11y pass, BP pass, SEO pass, perf FAIL, LCP FAIL, CLS pass |
| knowledge-hub (`/en/tracking-knowledge`) | mobile | 3 | **92** (87/92/92) | **100** (100/100/100) | **100** (100/100/100) | **100** (100/100/100) | 3.17 s | 39 ms | 0.000 | 1.81 s | a11y pass, BP pass, SEO pass, perf FAIL, LCP FAIL, CLS pass |
| pricing (`/en/pricing`) | mobile | 3 | **89** (89/85/89) | **100** (100/100/100) | **100** (100/100/100) | **100** (100/100/100) | 3.64 s | 41 ms | 0.029 | 2.65 s | a11y pass, BP pass, SEO pass, perf FAIL, LCP FAIL, CLS pass |

## Per-run values

| Report | Perf | A11y | BP | SEO | LCP | TBT | CLS | SI | FCP | Warnings |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `home--mobile--run1.report.json` | 94 | 100 | 100 | 100 | 2.94 s | 38 ms | 0.000 | 1.67 s | 1.67 s |  |
| `home--mobile--run2.report.json` | 89 | 100 | 100 | 100 | 3.74 s | 40 ms | 0.000 | 1.66 s | 1.66 s |  |
| `home--mobile--run3.report.json` | 89 | 100 | 100 | 100 | 3.63 s | 36 ms | 0.000 | 1.66 s | 1.66 s |  |
| `knowledge-article-consent-mode-v2-guide--mobile--run1.report.json` | 94 | 100 | 100 | 100 | 3.02 s | 36 ms | 0.019 | 1.67 s | 1.67 s |  |
| `knowledge-article-consent-mode-v2-guide--mobile--run2.report.json` | 96 | 100 | 100 | 100 | 2.71 s | 79 ms | 0.019 | 1.51 s | 1.51 s |  |
| `knowledge-article-consent-mode-v2-guide--mobile--run3.report.json` | 89 | 100 | 100 | 100 | 3.73 s | 35 ms | 0.019 | 1.66 s | 1.66 s |  |
| `knowledge-hub--mobile--run1.report.json` | 87 | 100 | 100 | 100 | 3.79 s | 38 ms | 0.000 | 2.69 s | 1.81 s |  |
| `knowledge-hub--mobile--run2.report.json` | 92 | 100 | 100 | 100 | 3.17 s | 48 ms | 0.000 | 1.81 s | 1.81 s |  |
| `knowledge-hub--mobile--run3.report.json` | 92 | 100 | 100 | 100 | 3.17 s | 39 ms | 0.000 | 1.81 s | 1.81 s |  |
| `pricing--mobile--run1.report.json` | 89 | 100 | 100 | 100 | 3.64 s | 39 ms | 0.000 | 2.65 s | 1.82 s |  |
| `pricing--mobile--run2.report.json` | 85 | 100 | 100 | 100 | 3.81 s | 101 ms | 0.029 | 3.07 s | 2.32 s |  |
| `pricing--mobile--run3.report.json` | 89 | 100 | 100 | 100 | 3.64 s | 41 ms | 0.029 | 1.66 s | 1.66 s |  |

## Top opportunities per page (representative run)

### home — mobile (`home--mobile--run2.report.json`)

- **Reduce unused JavaScript** (`unused-javascript`, score 0, Est savings of 23 KiB; est. savings LCP 400 ms)
  - http://localhost:3011/_next/static/chunks/0x8kzgkz_i9l-.js (71.8 KB, wasted 22.5 KB)
- **Render-blocking requests** (`render-blocking-insight`, score 0, Est savings of 420 ms; est. savings FCP 400 ms, LCP 400 ms)
  - http://localhost:3011/_next/static/chunks/0wwcefl2yorq9.css (21.3 KB, wasted 455 ms)
  - http://localhost:3011/_next/static/chunks/2h5nwbhdnm461.css (2.1 KB, wasted 155 ms)
- **Legacy JavaScript** (`legacy-javascript-insight`, score 0, Est savings of 14 KiB; est. savings LCP 150 ms)
  - http://localhost:3011/_next/static/chunks/0x8kzgkz_i9l-.js (wasted 13.6 KB)
- **JavaScript execution time** (`bootup-time`, score 1, 0.5 s; est. savings TBT 100 ms)
  - http://localhost:3011/en
  - http://localhost:3011/_next/static/chunks/0x8kzgkz_i9l-.js
  - Unattributable
  - http://localhost:3011/_next/static/chunks/42dfmdvax0djp.js
- **Minimizes main-thread work** (`mainthread-work-breakdown`, score 1, 1.2 s; est. savings TBT 50 ms)

### knowledge-article-consent-mode-v2-guide — mobile (`knowledge-article-consent-mode-v2-guide--mobile--run1.report.json`)

- **Render-blocking requests** (`render-blocking-insight`, score 0, Est savings of 480 ms; est. savings FCP 500 ms, LCP 500 ms)
  - http://localhost:3011/_next/static/chunks/0wwcefl2yorq9.css (21.3 KB, wasted 456 ms)
  - http://localhost:3011/_next/static/chunks/2h5nwbhdnm461.css (2.1 KB, wasted 156 ms)
- **Minimizes main-thread work** (`mainthread-work-breakdown`, score 1, 1.0 s; est. savings TBT 50 ms)
- **JavaScript execution time** (`bootup-time`, score 1, 0.4 s; est. savings TBT 50 ms)
  - http://localhost:3011/en/tracking-knowledge/consent-mode-v2-guide
  - http://localhost:3011/_next/static/chunks/0x8kzgkz_i9l-.js
  - Unattributable
  - http://localhost:3011/_next/static/chunks/42dfmdvax0djp.js
- **Avoid long main-thread tasks** (`long-tasks`, score 1, 3 long tasks found; est. savings TBT 50 ms)
  - http://localhost:3011/en/tracking-knowledge/consent-mode-v2-guide (124 ms)
  - http://localhost:3011/_next/static/chunks/0x8kzgkz_i9l-.js (122 ms)
  - http://localhost:3011/en/tracking-knowledge/consent-mode-v2-guide (57 ms)
- **Avoid large layout shifts** (`layout-shifts`, score 1, 1 layout shift found; est. savings CLS 0.019)
  - div.border-b > div.container-page > div > p.mt-5 — <p class="mt-5 max-w-text text-lg text-ink-2"> (shift 0.019)

### knowledge-hub — mobile (`knowledge-hub--mobile--run2.report.json`)

- **Render-blocking requests** (`render-blocking-insight`, score 0, Est savings of 450 ms; est. savings FCP 450 ms, LCP 450 ms)
  - http://localhost:3011/_next/static/chunks/0wwcefl2yorq9.css (21.3 KB, wasted 454 ms)
  - http://localhost:3011/_next/static/chunks/2h5nwbhdnm461.css (2.1 KB, wasted 154 ms)
- **JavaScript execution time** (`bootup-time`, score 1, 0.5 s; est. savings TBT 100 ms)
  - http://localhost:3011/en/tracking-knowledge
  - http://localhost:3011/_next/static/chunks/0x8kzgkz_i9l-.js
  - Unattributable
  - http://localhost:3011/_next/static/chunks/42dfmdvax0djp.js
- **Minimizes main-thread work** (`mainthread-work-breakdown`, score 1, 1.2 s; est. savings TBT 50 ms)
- **Avoid long main-thread tasks** (`long-tasks`, score 1, 3 long tasks found; est. savings TBT 50 ms)
  - http://localhost:3011/en/tracking-knowledge (159 ms)
  - http://localhost:3011/_next/static/chunks/0x8kzgkz_i9l-.js (145 ms)
  - http://localhost:3011/en/tracking-knowledge (51 ms)
- **First Contentful Paint** (`first-contentful-paint`, score 0.89, 1.8 s)

### pricing — mobile (`pricing--mobile--run1.report.json`)

- **Render-blocking requests** (`render-blocking-insight`, score 0, Est savings of 500 ms; est. savings FCP 500 ms, LCP 500 ms)
  - http://localhost:3011/_next/static/chunks/0wwcefl2yorq9.css (21.3 KB, wasted 457 ms)
  - http://localhost:3011/_next/static/chunks/2h5nwbhdnm461.css (2.1 KB, wasted 157 ms)
- **Reduce unused JavaScript** (`unused-javascript`, score 0, Est savings of 29 KiB; est. savings LCP 300 ms)
  - http://localhost:3011/_next/static/chunks/0x8kzgkz_i9l-.js (71.8 KB, wasted 29.0 KB)
- **Legacy JavaScript** (`legacy-javascript-insight`, score 0, Est savings of 14 KiB; est. savings LCP 150 ms)
  - http://localhost:3011/_next/static/chunks/0x8kzgkz_i9l-.js (wasted 13.6 KB)
- **JavaScript execution time** (`bootup-time`, score 1, 0.5 s; est. savings TBT 100 ms)
  - http://localhost:3011/en/pricing
  - http://localhost:3011/_next/static/chunks/0x8kzgkz_i9l-.js
  - Unattributable
  - http://localhost:3011/_next/static/chunks/42dfmdvax0djp.js
- **Minimizes main-thread work** (`mainthread-work-breakdown`, score 1, 1.3 s; est. savings TBT 50 ms)

## Failing audits of categories below target (representative run)

No page has an accessibility, best-practices or SEO median below its target.
