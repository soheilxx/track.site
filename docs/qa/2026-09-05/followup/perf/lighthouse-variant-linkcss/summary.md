# Lighthouse summary — perf

Generated 2026-09-05T12:53:40.221Z from the `*.report.json` files in this directory (Lighthouse 13.4.1). Scores are `categories.<id>.score × 100`, metrics are `audits.<id>.numericValue`; the median is taken per value over the runs of a page (for 3 runs: the middle value; for 1 run: that run). "TBT" stands in for INP: Lighthouse lab runs contain no user interaction, so `interaction-to-next-paint` has no value and Total Blocking Time is the closest lab proxy. The representative run named per page is the run whose performance score is closest to the median; its opportunities and failing audits are listed.

Targets: accessibility ≥ 95, best practices ≥ 95, SEO ≥ 95, performance as close to 95 as realistic (reported against 95), LCP ≤ 2.50 s, CLS ≤ 0.1. Mobile runs use Lighthouse's default mobile emulation with simulated throttling (Moto G Power class, 4× CPU slowdown, 150 ms RTT / 1.6 Mbps); desktop runs use `--preset=desktop`.

## Medians per page

| Page | Preset | Runs | Perf (runs) | A11y (runs) | BP (runs) | SEO (runs) | LCP | TBT | CLS | Speed Index | Targets |
| --- | --- | ---: | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| home (`/en`) | mobile | 1 | **91** (91) | **100** (100) | **100** (100) | **100** (100) | 3.44 s | 36 ms | 0.000 | 2.27 s | a11y pass, BP pass, SEO pass, perf FAIL, LCP FAIL, CLS pass |
| knowledge-article-consent-mode-v2-guide (`/en/tracking-knowledge/consent-mode-v2-guide`) | mobile | 1 | **91** (91) | **100** (100) | **100** (100) | **100** (100) | 3.44 s | 40 ms | 0.019 | 1.36 s | a11y pass, BP pass, SEO pass, perf FAIL, LCP FAIL, CLS pass |
| knowledge-hub (`/en/tracking-knowledge`) | mobile | 1 | **95** (95) | **100** (100) | **100** (100) | **100** (100) | 2.86 s | 32 ms | 0.000 | 1.51 s | a11y pass, BP pass, SEO pass, perf pass, LCP FAIL, CLS pass |
| pricing (`/en/pricing`) | mobile | 1 | **91** (91) | **100** (100) | **100** (100) | **100** (100) | 3.48 s | 39 ms | 0.029 | 1.51 s | a11y pass, BP pass, SEO pass, perf FAIL, LCP FAIL, CLS pass |

## Per-run values

| Report | Perf | A11y | BP | SEO | LCP | TBT | CLS | SI | FCP | Warnings |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `home--mobile--run1.report.json` | 91 | 100 | 100 | 100 | 3.44 s | 36 ms | 0.000 | 2.27 s | 1.37 s |  |
| `knowledge-article-consent-mode-v2-guide--mobile--run1.report.json` | 91 | 100 | 100 | 100 | 3.44 s | 40 ms | 0.019 | 1.36 s | 1.36 s |  |
| `knowledge-hub--mobile--run1.report.json` | 95 | 100 | 100 | 100 | 2.86 s | 32 ms | 0.000 | 1.51 s | 1.51 s |  |
| `pricing--mobile--run1.report.json` | 91 | 100 | 100 | 100 | 3.48 s | 39 ms | 0.029 | 1.51 s | 1.51 s |  |

## Top opportunities per page (representative run)

### home — mobile (`home--mobile--run1.report.json`)

- **Reduce unused JavaScript** (`unused-javascript`, score 0, Est savings of 26 KiB; est. savings LCP 450 ms)
  - http://localhost:3011/_next/static/chunks/2fmyaebvb8imw.js (71.8 KB, wasted 25.6 KB)
- **Render-blocking requests** (`render-blocking-insight`, score 0, Est savings of 320 ms; est. savings FCP 300 ms, LCP 300 ms)
  - http://localhost:3011/_next/static/chunks/3mqthzx2trr5y.css (20.3 KB, wasted 455 ms)
  - http://localhost:3011/_next/static/chunks/0uvnfdbr8xzj8.css (2.2 KB, wasted 155 ms)
- **Legacy JavaScript** (`legacy-javascript-insight`, score 0, Est savings of 14 KiB; est. savings LCP 150 ms)
  - http://localhost:3011/_next/static/chunks/2fmyaebvb8imw.js (wasted 13.6 KB)
- **Minimizes main-thread work** (`mainthread-work-breakdown`, score 1, 1.3 s; est. savings TBT 50 ms)
- **JavaScript execution time** (`bootup-time`, score 1, 0.4 s; est. savings TBT 50 ms)
  - http://localhost:3011/en
  - http://localhost:3011/_next/static/chunks/2fmyaebvb8imw.js
  - http://localhost:3011/_next/static/chunks/1j1xnjxtauii4.js
  - Unattributable

### knowledge-article-consent-mode-v2-guide — mobile (`knowledge-article-consent-mode-v2-guide--mobile--run1.report.json`)

- **Reduce unused JavaScript** (`unused-javascript`, score 0, Est savings of 27 KiB; est. savings LCP 550 ms)
  - http://localhost:3011/_next/static/chunks/2fmyaebvb8imw.js (71.8 KB, wasted 27.2 KB)
- **Render-blocking requests** (`render-blocking-insight`, score 0, Est savings of 500 ms; est. savings FCP 500 ms, LCP 500 ms)
  - http://localhost:3011/_next/static/chunks/3mqthzx2trr5y.css (20.3 KB, wasted 454 ms)
  - http://localhost:3011/_next/static/chunks/0uvnfdbr8xzj8.css (2.2 KB, wasted 154 ms)
- **Legacy JavaScript** (`legacy-javascript-insight`, score 0, Est savings of 14 KiB; est. savings LCP 150 ms)
  - http://localhost:3011/_next/static/chunks/2fmyaebvb8imw.js (wasted 13.6 KB)
- **JavaScript execution time** (`bootup-time`, score 1, 0.4 s; est. savings TBT 100 ms)
  - http://localhost:3011/en/tracking-knowledge/consent-mode-v2-guide
  - http://localhost:3011/_next/static/chunks/2fmyaebvb8imw.js
  - Unattributable
  - http://localhost:3011/_next/static/chunks/1j1xnjxtauii4.js
- **Minimizes main-thread work** (`mainthread-work-breakdown`, score 1, 0.9 s; est. savings TBT 50 ms)

### knowledge-hub — mobile (`knowledge-hub--mobile--run1.report.json`)

- **Render-blocking requests** (`render-blocking-insight`, score 0, Est savings of 430 ms; est. savings FCP 450 ms, LCP 450 ms)
  - http://localhost:3011/_next/static/chunks/3mqthzx2trr5y.css (20.3 KB, wasted 455 ms)
  - http://localhost:3011/_next/static/chunks/0uvnfdbr8xzj8.css (2.2 KB, wasted 155 ms)
- **Minimizes main-thread work** (`mainthread-work-breakdown`, score 1, 1.1 s; est. savings TBT 50 ms)
- **JavaScript execution time** (`bootup-time`, score 1, 0.4 s; est. savings TBT 50 ms)
  - http://localhost:3011/en/tracking-knowledge
  - http://localhost:3011/_next/static/chunks/2fmyaebvb8imw.js
  - Unattributable
  - http://localhost:3011/_next/static/chunks/1j1xnjxtauii4.js
- **Avoid long main-thread tasks** (`long-tasks`, score 1, 3 long tasks found; est. savings TBT 50 ms)
  - http://localhost:3011/en/tracking-knowledge (173 ms)
  - http://localhost:3011/_next/static/chunks/2fmyaebvb8imw.js (113 ms)
  - http://localhost:3011/en/tracking-knowledge (59 ms)
- **Largest Contentful Paint** (`largest-contentful-paint`, score 0.81, 2.9 s)

### pricing — mobile (`pricing--mobile--run1.report.json`)

- **Reduce unused JavaScript** (`unused-javascript`, score 0, Est savings of 29 KiB; est. savings LCP 450 ms)
  - http://localhost:3011/_next/static/chunks/2fmyaebvb8imw.js (71.8 KB, wasted 29.1 KB)
- **Render-blocking requests** (`render-blocking-insight`, score 0, Est savings of 440 ms; est. savings FCP 450 ms, LCP 450 ms)
  - http://localhost:3011/_next/static/chunks/3mqthzx2trr5y.css (20.3 KB, wasted 454 ms)
  - http://localhost:3011/_next/static/chunks/0uvnfdbr8xzj8.css (2.2 KB, wasted 154 ms)
- **Legacy JavaScript** (`legacy-javascript-insight`, score 0, Est savings of 14 KiB; est. savings LCP 150 ms)
  - http://localhost:3011/_next/static/chunks/2fmyaebvb8imw.js (wasted 13.6 KB)
- **JavaScript execution time** (`bootup-time`, score 1, 0.4 s; est. savings TBT 100 ms)
  - http://localhost:3011/en/pricing
  - http://localhost:3011/_next/static/chunks/2fmyaebvb8imw.js
  - Unattributable
  - http://localhost:3011/_next/static/chunks/1j1xnjxtauii4.js
- **Avoid large layout shifts** (`layout-shifts`, score 1, 1 layout shift found; est. savings CLS 0.029)
  - section.relative > div.container-page > div.max-w-text > p.mt-5 — <p class="mt-5 text-lg text-ink-2"> (shift 0.029)

## Failing audits of categories below target (representative run)

No page has an accessibility, best-practices or SEO median below its target.
