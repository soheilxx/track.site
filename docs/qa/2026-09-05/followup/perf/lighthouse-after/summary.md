# Lighthouse summary — perf

Generated 2026-09-05T14:12:00.513Z from the `*.report.json` files in this directory (Lighthouse 13.4.1). Scores are `categories.<id>.score × 100`, metrics are `audits.<id>.numericValue`; the median is taken per value over the runs of a page (for 3 runs: the middle value; for 1 run: that run). "TBT" stands in for INP: Lighthouse lab runs contain no user interaction, so `interaction-to-next-paint` has no value and Total Blocking Time is the closest lab proxy. The representative run named per page is the run whose performance score is closest to the median; its opportunities and failing audits are listed.

Targets: accessibility ≥ 95, best practices ≥ 95, SEO ≥ 95, performance as close to 95 as realistic (reported against 95), LCP ≤ 2.50 s, CLS ≤ 0.1. Mobile runs use Lighthouse's default mobile emulation with simulated throttling (Moto G Power class, 4× CPU slowdown, 150 ms RTT / 1.6 Mbps); desktop runs use `--preset=desktop`.

## Medians per page

| Page | Preset | Runs | Perf (runs) | A11y (runs) | BP (runs) | SEO (runs) | LCP | TBT | CLS | Speed Index | Targets |
| --- | --- | ---: | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| home (`/en`) | mobile | 3 | **91** (91/91/91) | **100** (100/100/100) | **100** (100/100/100) | **100** (100/100/100) | 3.45 s | 57 ms | 0.000 | 2.35 s | a11y pass, BP pass, SEO pass, perf FAIL, LCP FAIL, CLS pass |
| knowledge-article-consent-mode-v2-guide (`/en/tracking-knowledge/consent-mode-v2-guide`) | mobile | 3 | **92** (92/92/91) | **100** (100/100/100) | **100** (100/100/100) | **100** (100/100/100) | 3.35 s | 42 ms | 0.019 | 1.37 s | a11y pass, BP pass, SEO pass, perf FAIL, LCP FAIL, CLS pass |
| knowledge-hub (`/en/tracking-knowledge`) | mobile | 3 | **95** (95/91/95) | **100** (100/100/100) | **100** (100/100/100) | **100** (100/100/100) | 2.86 s | 44 ms | 0.000 | 1.51 s | a11y pass, BP pass, SEO pass, perf pass, LCP FAIL, CLS pass |
| pricing (`/en/pricing`) | mobile | 3 | **91** (91/90/95) | **100** (100/100/100) | **100** (100/100/100) | **100** (100/100/100) | 3.50 s | 48 ms | 0.029 | 1.51 s | a11y pass, BP pass, SEO pass, perf FAIL, LCP FAIL, CLS pass |

## Per-run values

| Report | Perf | A11y | BP | SEO | LCP | TBT | CLS | SI | FCP | Warnings |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `home--mobile--run1.report.json` | 91 | 100 | 100 | 100 | 3.45 s | 60 ms | 0.000 | 2.39 s | 1.37 s |  |
| `home--mobile--run2.report.json` | 91 | 100 | 100 | 100 | 3.44 s | 38 ms | 0.000 | 1.36 s | 1.36 s |  |
| `home--mobile--run3.report.json` | 91 | 100 | 100 | 100 | 3.48 s | 57 ms | 0.000 | 2.35 s | 1.37 s |  |
| `knowledge-article-consent-mode-v2-guide--mobile--run1.report.json` | 92 | 100 | 100 | 100 | 3.35 s | 42 ms | 0.000 | 2.20 s | 1.37 s |  |
| `knowledge-article-consent-mode-v2-guide--mobile--run2.report.json` | 92 | 100 | 100 | 100 | 3.29 s | 38 ms | 0.019 | 1.37 s | 1.37 s |  |
| `knowledge-article-consent-mode-v2-guide--mobile--run3.report.json` | 91 | 100 | 100 | 100 | 3.45 s | 43 ms | 0.019 | 1.37 s | 1.37 s |  |
| `knowledge-hub--mobile--run1.report.json` | 95 | 100 | 100 | 100 | 2.86 s | 48 ms | 0.000 | 1.51 s | 1.51 s |  |
| `knowledge-hub--mobile--run2.report.json` | 91 | 100 | 100 | 100 | 3.50 s | 42 ms | 0.000 | 1.51 s | 1.51 s |  |
| `knowledge-hub--mobile--run3.report.json` | 95 | 100 | 100 | 100 | 2.86 s | 44 ms | 0.000 | 1.51 s | 1.51 s |  |
| `pricing--mobile--run1.report.json` | 91 | 100 | 100 | 100 | 3.50 s | 48 ms | 0.029 | 1.52 s | 1.52 s |  |
| `pricing--mobile--run2.report.json` | 90 | 100 | 100 | 100 | 3.52 s | 56 ms | 0.029 | 1.51 s | 1.51 s |  |
| `pricing--mobile--run3.report.json` | 95 | 100 | 100 | 100 | 2.86 s | 45 ms | 0.029 | 1.51 s | 1.51 s |  |

## Top opportunities per page (representative run)

### home — mobile (`home--mobile--run1.report.json`)

- **Reduce unused JavaScript** (`unused-javascript`, score 0, Est savings of 26 KiB; est. savings LCP 450 ms)
  - http://localhost:3011/_next/static/chunks/0x8kzgkz_i9l-.js (71.8 KB, wasted 25.6 KB)
- **Render-blocking requests** (`render-blocking-insight`, score 0, Est savings of 310 ms; est. savings FCP 300 ms, LCP 300 ms)
  - http://localhost:3011/_next/static/chunks/0w4di3m3amg58.css (19.5 KB, wasted 458 ms)
  - http://localhost:3011/_next/static/chunks/2h5nwbhdnm461.css (2.1 KB, wasted 158 ms)
- **Legacy JavaScript** (`legacy-javascript-insight`, score 0, Est savings of 14 KiB; est. savings LCP 150 ms)
  - http://localhost:3011/_next/static/chunks/0x8kzgkz_i9l-.js (wasted 13.6 KB)
- **JavaScript execution time** (`bootup-time`, score 1, 0.6 s; est. savings TBT 100 ms)
  - http://localhost:3011/en
  - http://localhost:3011/_next/static/chunks/0x8kzgkz_i9l-.js
  - Unattributable
  - http://localhost:3011/_next/static/chunks/42dfmdvax0djp.js
- **Minimizes main-thread work** (`mainthread-work-breakdown`, score 1, 1.6 s; est. savings TBT 50 ms)

### knowledge-article-consent-mode-v2-guide — mobile (`knowledge-article-consent-mode-v2-guide--mobile--run1.report.json`)

- **Render-blocking requests** (`render-blocking-insight`, score 0, Est savings of 520 ms; est. savings FCP 500 ms, LCP 500 ms)
  - http://localhost:3011/_next/static/chunks/0w4di3m3amg58.css (19.5 KB, wasted 457 ms)
  - http://localhost:3011/_next/static/chunks/2h5nwbhdnm461.css (2.1 KB, wasted 157 ms)
- **Reduce unused JavaScript** (`unused-javascript`, score 0, Est savings of 27 KiB; est. savings LCP 450 ms)
  - http://localhost:3011/_next/static/chunks/0x8kzgkz_i9l-.js (71.8 KB, wasted 27.2 KB)
- **Legacy JavaScript** (`legacy-javascript-insight`, score 0, Est savings of 14 KiB; est. savings LCP 150 ms)
  - http://localhost:3011/_next/static/chunks/0x8kzgkz_i9l-.js (wasted 13.6 KB)
- **JavaScript execution time** (`bootup-time`, score 1, 0.4 s; est. savings TBT 100 ms)
  - http://localhost:3011/en/tracking-knowledge/consent-mode-v2-guide
  - http://localhost:3011/_next/static/chunks/0x8kzgkz_i9l-.js
  - Unattributable
  - http://localhost:3011/_next/static/chunks/42dfmdvax0djp.js
- **Minimizes main-thread work** (`mainthread-work-breakdown`, score 1, 1.1 s; est. savings TBT 50 ms)

### knowledge-hub — mobile (`knowledge-hub--mobile--run1.report.json`)

- **Render-blocking requests** (`render-blocking-insight`, score 0, Est savings of 420 ms; est. savings FCP 400 ms, LCP 400 ms)
  - http://localhost:3011/_next/static/chunks/0w4di3m3amg58.css (19.5 KB, wasted 453 ms)
  - http://localhost:3011/_next/static/chunks/2h5nwbhdnm461.css (2.1 KB, wasted 153 ms)
- **Initial server response time was short** (`server-response-time`, score 1, Root document took 370 ms; est. savings FCP 250 ms, LCP 250 ms)
  - http://localhost:3011/en/tracking-knowledge
- **JavaScript execution time** (`bootup-time`, score 1, 0.4 s; est. savings TBT 100 ms)
  - http://localhost:3011/en/tracking-knowledge
  - http://localhost:3011/_next/static/chunks/0x8kzgkz_i9l-.js
  - Unattributable
  - http://localhost:3011/_next/static/chunks/42dfmdvax0djp.js
- **Minimizes main-thread work** (`mainthread-work-breakdown`, score 1, 1.2 s; est. savings TBT 50 ms)
- **Avoid long main-thread tasks** (`long-tasks`, score 1, 2 long tasks found; est. savings TBT 50 ms)
  - http://localhost:3011/en/tracking-knowledge (181 ms)
  - http://localhost:3011/_next/static/chunks/0x8kzgkz_i9l-.js (145 ms)

### pricing — mobile (`pricing--mobile--run1.report.json`)

- **Reduce unused JavaScript** (`unused-javascript`, score 0, Est savings of 29 KiB; est. savings LCP 450 ms)
  - http://localhost:3011/_next/static/chunks/0x8kzgkz_i9l-.js (71.8 KB, wasted 29.0 KB)
- **Render-blocking requests** (`render-blocking-insight`, score 0, Est savings of 440 ms; est. savings FCP 450 ms, LCP 450 ms)
  - http://localhost:3011/_next/static/chunks/0w4di3m3amg58.css (19.5 KB, wasted 456 ms)
  - http://localhost:3011/_next/static/chunks/2h5nwbhdnm461.css (2.1 KB, wasted 156 ms)
- **Legacy JavaScript** (`legacy-javascript-insight`, score 0, Est savings of 14 KiB; est. savings LCP 150 ms)
  - http://localhost:3011/_next/static/chunks/0x8kzgkz_i9l-.js (wasted 13.6 KB)
- **JavaScript execution time** (`bootup-time`, score 1, 0.5 s; est. savings TBT 100 ms)
  - http://localhost:3011/en/pricing
  - http://localhost:3011/_next/static/chunks/0x8kzgkz_i9l-.js
  - Unattributable
  - http://localhost:3011/_next/static/chunks/42dfmdvax0djp.js
- **Avoid large layout shifts** (`layout-shifts`, score 1, 1 layout shift found; est. savings CLS 0.029)
  - section.relative > div.container-page > div.max-w-text > p.mt-5 — <p class="mt-5 text-lg text-ink-2"> (shift 0.029)

## Failing audits of categories below target (representative run)

No page has an accessibility, best-practices or SEO median below its target.
