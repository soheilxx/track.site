# Lighthouse summary — perf

Generated 2026-09-05T12:57:38.403Z from the `*.report.json` files in this directory (Lighthouse 13.4.1). Scores are `categories.<id>.score × 100`, metrics are `audits.<id>.numericValue`; the median is taken per value over the runs of a page (for 3 runs: the middle value; for 1 run: that run). "TBT" stands in for INP: Lighthouse lab runs contain no user interaction, so `interaction-to-next-paint` has no value and Total Blocking Time is the closest lab proxy. The representative run named per page is the run whose performance score is closest to the median; its opportunities and failing audits are listed.

Targets: accessibility ≥ 95, best practices ≥ 95, SEO ≥ 95, performance as close to 95 as realistic (reported against 95), LCP ≤ 2.50 s, CLS ≤ 0.1. Mobile runs use Lighthouse's default mobile emulation with simulated throttling (Moto G Power class, 4× CPU slowdown, 150 ms RTT / 1.6 Mbps); desktop runs use `--preset=desktop`.

## Medians per page

| Page | Preset | Runs | Perf (runs) | A11y (runs) | BP (runs) | SEO (runs) | LCP | TBT | CLS | Speed Index | Targets |
| --- | --- | ---: | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| home (`/en`) | mobile | 1 | **86** (86) | **100** (100) | **100** (100) | **100** (100) | 3.80 s | 109 ms | 0.000 | 3.86 s | a11y pass, BP pass, SEO pass, perf FAIL, LCP FAIL, CLS pass |
| knowledge-article-consent-mode-v2-guide (`/en/tracking-knowledge/consent-mode-v2-guide`) | mobile | 1 | **92** (92) | **100** (100) | **100** (100) | **100** (100) | 3.29 s | 41 ms | 0.019 | 1.21 s | a11y pass, BP pass, SEO pass, perf FAIL, LCP FAIL, CLS pass |
| knowledge-hub (`/en/tracking-knowledge`) | mobile | 1 | **91** (91) | **100** (100) | **100** (100) | **100** (100) | 3.50 s | 44 ms | 0.000 | 2.53 s | a11y pass, BP pass, SEO pass, perf FAIL, LCP FAIL, CLS pass |
| pricing (`/en/pricing`) | mobile | 1 | **91** (91) | **100** (100) | **100** (100) | **100** (100) | 3.48 s | 53 ms | 0.000 | 2.29 s | a11y pass, BP pass, SEO pass, perf FAIL, LCP FAIL, CLS pass |

## Per-run values

| Report | Perf | A11y | BP | SEO | LCP | TBT | CLS | SI | FCP | Warnings |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `home--mobile--run1.report.json` | 86 | 100 | 100 | 100 | 3.80 s | 109 ms | 0.000 | 3.86 s | 1.36 s |  |
| `knowledge-article-consent-mode-v2-guide--mobile--run1.report.json` | 92 | 100 | 100 | 100 | 3.29 s | 41 ms | 0.019 | 1.21 s | 1.21 s |  |
| `knowledge-hub--mobile--run1.report.json` | 91 | 100 | 100 | 100 | 3.50 s | 44 ms | 0.000 | 2.53 s | 1.36 s |  |
| `pricing--mobile--run1.report.json` | 91 | 100 | 100 | 100 | 3.48 s | 53 ms | 0.000 | 2.29 s | 1.36 s |  |

## Top opportunities per page (representative run)

### home — mobile (`home--mobile--run1.report.json`)

- **Reduce unused JavaScript** (`unused-javascript`, score 0, Est savings of 26 KiB; est. savings LCP 250 ms)
  - http://localhost:3011/_next/static/chunks/2fmyaebvb8imw.js (71.8 KB, wasted 25.6 KB)
- **Legacy JavaScript** (`legacy-javascript-insight`, score 0, Est savings of 14 KiB; est. savings LCP 250 ms)
  - http://localhost:3011/_next/static/chunks/2fmyaebvb8imw.js (wasted 13.6 KB)
- **Minimizes main-thread work** (`mainthread-work-breakdown`, score 1, 1.4 s; est. savings TBT 100 ms)
- **JavaScript execution time** (`bootup-time`, score 1, 0.5 s; est. savings TBT 100 ms)
  - http://localhost:3011/en
  - http://localhost:3011/_next/static/chunks/2fmyaebvb8imw.js
  - Unattributable
  - http://localhost:3011/_next/static/chunks/1j1xnjxtauii4.js
- **Avoid long main-thread tasks** (`long-tasks`, score 1, 3 long tasks found; est. savings TBT 100 ms)
  - http://localhost:3011/en (242 ms)
  - http://localhost:3011/_next/static/chunks/2fmyaebvb8imw.js (141 ms)
  - http://localhost:3011/_next/static/chunks/1j1xnjxtauii4.js (60 ms)

### knowledge-article-consent-mode-v2-guide — mobile (`knowledge-article-consent-mode-v2-guide--mobile--run1.report.json`)

- **Reduce unused JavaScript** (`unused-javascript`, score 0, Est savings of 27 KiB; est. savings LCP 300 ms)
  - http://localhost:3011/_next/static/chunks/2fmyaebvb8imw.js (71.8 KB, wasted 27.2 KB)
- **Legacy JavaScript** (`legacy-javascript-insight`, score 0, Est savings of 14 KiB; est. savings LCP 150 ms)
  - http://localhost:3011/_next/static/chunks/2fmyaebvb8imw.js (wasted 13.6 KB)
- **JavaScript execution time** (`bootup-time`, score 1, 0.4 s; est. savings TBT 100 ms)
  - http://localhost:3011/en/tracking-knowledge/consent-mode-v2-guide
  - http://localhost:3011/_next/static/chunks/2fmyaebvb8imw.js
  - Unattributable
  - http://localhost:3011/_next/static/chunks/1j1xnjxtauii4.js
- **Minimizes main-thread work** (`mainthread-work-breakdown`, score 1, 1.0 s; est. savings TBT 50 ms)
- **Avoid long main-thread tasks** (`long-tasks`, score 1, 3 long tasks found; est. savings TBT 50 ms)
  - http://localhost:3011/_next/static/chunks/2fmyaebvb8imw.js (131 ms)
  - http://localhost:3011/en/tracking-knowledge/consent-mode-v2-guide (118 ms)
  - http://localhost:3011/en/tracking-knowledge/consent-mode-v2-guide (108 ms)

### knowledge-hub — mobile (`knowledge-hub--mobile--run1.report.json`)

- **Reduce unused JavaScript** (`unused-javascript`, score 0, Est savings of 29 KiB; est. savings LCP 450 ms)
  - http://localhost:3011/_next/static/chunks/2fmyaebvb8imw.js (71.8 KB, wasted 28.8 KB)
- **Initial server response time was short** (`server-response-time`, score 1, Root document took 240 ms; est. savings FCP 150 ms, LCP 150 ms)
  - http://localhost:3011/en/tracking-knowledge
- **Legacy JavaScript** (`legacy-javascript-insight`, score 0, Est savings of 14 KiB; est. savings LCP 150 ms)
  - http://localhost:3011/_next/static/chunks/2fmyaebvb8imw.js (wasted 13.6 KB)
- **JavaScript execution time** (`bootup-time`, score 1, 0.5 s; est. savings TBT 100 ms)
  - http://localhost:3011/en/tracking-knowledge
  - http://localhost:3011/_next/static/chunks/2fmyaebvb8imw.js
  - Unattributable
  - http://localhost:3011/_next/static/chunks/1j1xnjxtauii4.js
- **Minimizes main-thread work** (`mainthread-work-breakdown`, score 1, 1.2 s; est. savings TBT 50 ms)

### pricing — mobile (`pricing--mobile--run1.report.json`)

- **Reduce unused JavaScript** (`unused-javascript`, score 0, Est savings of 29 KiB; est. savings LCP 450 ms)
  - http://localhost:3011/_next/static/chunks/2fmyaebvb8imw.js (71.8 KB, wasted 29.1 KB)
- **Legacy JavaScript** (`legacy-javascript-insight`, score 0, Est savings of 14 KiB; est. savings LCP 150 ms)
  - http://localhost:3011/_next/static/chunks/2fmyaebvb8imw.js (wasted 13.6 KB)
- **Minimizes main-thread work** (`mainthread-work-breakdown`, score 1, 1.2 s; est. savings TBT 50 ms)
- **JavaScript execution time** (`bootup-time`, score 1, 0.5 s; est. savings TBT 50 ms)
  - http://localhost:3011/en/pricing
  - http://localhost:3011/_next/static/chunks/2fmyaebvb8imw.js
  - Unattributable
  - http://localhost:3011/_next/static/chunks/1j1xnjxtauii4.js
- **Avoid long main-thread tasks** (`long-tasks`, score 1, 3 long tasks found; est. savings TBT 50 ms)
  - http://localhost:3011/en/pricing (201 ms)
  - http://localhost:3011/_next/static/chunks/2fmyaebvb8imw.js (121 ms)
  - http://localhost:3011/en/pricing (67 ms)

## Failing audits of categories below target (representative run)

No page has an accessibility, best-practices or SEO median below its target.
