# QA evidence pack — Track redesign, 2026-09-05

Evidence for phase 7 of the redesign programme (`docs/11-track-redesign-program.md` §5, phase 7) against the owner supplement §10 (responsive QA, accessibility, performance) and §11 (binding tests, definition of done, "Abschlussbelege" 1–8). Gates: `docs/12-design-system.md` §6 (WCAG 2.2 AA, Lighthouse ≥ 95 for accessibility / best practices / SEO, LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1, viewports 320–1920 px without horizontal scroll).

Rules for everything in this directory:

- Every number or claim in a report points to a file in this directory (raw tool output) or to a quoted command output. Scores are copied from the raw JSON of the tool that produced them, never typed from memory or estimated.
- A check that could not run is listed as "not run" with the reason (missing tool, missing credential, environment limit). It is never reported as passed.
- Screenshots are WebP, ≤ 150 KB each (see "Screenshots" below). Reports are Markdown or JSON.
- Nothing in this pack is produced from mock-ups, static images of the dashboard or hand-edited HTML; every screenshot comes from a running production build (`next start`) of the tree named in "Baselines".

## Baselines

| Baseline | Tree | Commit | Build |
| --- | --- | --- | --- |
| **after** (redesign) | `C:/Users/Soheil/Downloads/track.site` (branch `feat/ai-tag-manager-platform`) | `85fe3b7` — `web: destinations wizard takes the published version from the review instead of parsing localized text` (working tree clean, `git status --short` empty after the build) | `apps/web/.next`, `BUILD_ID` `rCAJOqYs841hSlnLSc99W`, built 2026-09-05 11:30 |
| **before** (pre-redesign) | git worktree `C:/Users/Soheil/Downloads/track-site-before` (detached HEAD) | `0f0f5b5` — `docs: design system reference for the Track redesign`, the last commit before the phase 1–6 implementation commits (22 commits between `0f0f5b5` and `41a0287`) | `apps/web/.next` inside the worktree, `BUILD_ID` `sb9bxPyxbPMYA9tK0DYEV`, built 2026-09-05 11:33 |

Build results of this run (P0):

| Step | Command (from the tree root) | Result | Log |
| --- | --- | --- | --- |
| after: production build | `pnpm --filter @track-site/web build` | exit 0; Next.js 16.3.4 (Turbopack); compiled in 4.5 s, TypeScript 10.8 s; **715/715 static pages** generated in 30.2 s (7 workers); 452 prerendered `.html` files under `apps/web/.next/server/app` | `C:/Users/Soheil/Downloads/track-site-before/qa-logs/build-current.log` (copy to `build-current.log` in this directory when the pack is assembled) |
| before: worktree | `git worktree add ../track-site-before 0f0f5b5` | created; `.env` copied from the repo root (byte-identical, `cmp` exit 0). `apps/web/.env` does not exist in the repo (the root `.env` is loaded by `apps/web/next.config.ts` via `../../.env`), so nothing was copied there | — |
| before: install | `pnpm install --offline --frozen-lockfile` | exit 0 without online fallback; "Lockfile is up to date", 930 packages resolved, 927 reused from the store, 0 downloaded, done in 35.8 s; native builds present (`sharp@0.35.4`, `@tailwindcss/oxide@4.3.3`, `@swc/core@1.16.1`, `esbuild`) | `C:/Users/Soheil/Downloads/track-site-before/qa-logs/install-before-offline.log` |
| before: production build | `pnpm --filter @track-site/web build` (in the worktree) | exit 0; Next.js 16.3.4 (Turbopack); compiled in 27.9 s, TypeScript 22.6 s; **173/173 static pages** generated in 5.2 s; 152 prerendered `.html` files | `C:/Users/Soheil/Downloads/track-site-before/qa-logs/build-before.log` |

Known warning in both build logs (pre-existing, not a build failure): `warning: no CONFIG_SIGNING_PUBLIC_KEY set; the built tracker will reject every config (fail closed)`. `packages/sdk/scripts/build.ts` reads `process.env` only and does not load the root `.env`, so a tracker built from a plain shell embeds no signing key. This affects only checks that run the real tracker snippet in a browser (Live Test Lab with a real site); marketing, knowledge, auth and dashboard pages are unaffected. To build a tracker that verifies configs, export the `CONFIG_SIGNING_*` values from `.env` into the shell before `pnpm --filter @track-site/web build` (do not rebuild while other tasks serve from `apps/web/.next`).

Route shape of the two baselines (needed for the before/after pairing):

| Page | before (`0f0f5b5`, next-intl `as-needed`) | after (six locales, `always`) |
| --- | --- | --- |
| Home | `/` (English, unprefixed), `/de` | `/en`, `/de`, `/fr`, `/es`, `/it`, `/nl` (`/` → 301 `/en`) |
| Pricing | `/pricing`, `/de/pricing` | `/<locale>/pricing` |
| Knowledge hub | `/blog`, `/de/blog` | `/<locale>/tracking-knowledge` |
| Article | `/blog/<slug>`, `/de/blog/<slug>` | `/<locale>/tracking-knowledge/<slug>` (old URLs 301, see `docs/redirects-blog-to-tracking-knowledge.md`) |
| Features / integrations / how-it-works / legal | `/features`, `/integrations`, `/how-it-works`, `/privacy` … (+ `/de/…`) | `/<locale>/…` |
| Auth | `/login`, `/signup` (+ `/de/…`) | `/<locale>/login`, `/<locale>/signup` |
| Dashboard | `/app`, `/app/sites/<siteId>/setup`, `/app/events`, `/app/debugger`, `/app/destinations`, `/app/data-quality`, `/app/consent`, `/app/audiences`, `/app/team`, `/app/billing`, `/app/settings` | `/app`, `/app/ai-setup`, `/app/events` (+ `/explorer`, `/matrix`, `/test-lab`), `/app/destinations`, `/app/data-quality` (+ `/revenue-leaks`), `/app/consent` (+ `/simulator`), `/app/insights` (+ `/attribution`, `/audiences`), `/app/releases`, `/app/team` (+ `/audit`), `/app/billing` (+ `/usage`), `/app/settings` (+ `/alerts`) |

## Directory layout

```
docs/qa/2026-09-05/
├── README.md                 this file: baselines, layout, reproduction
├── screenshots/              responsive pass of the AFTER build (supplement §10 "Responsive QA")
│   └── <locale>-<route-id>--<width>[--<state>].webp      e.g. en-home--375.webp, en-app-events--1440--dark.webp
├── lighthouse/               raw Lighthouse results of the AFTER build
│   ├── <route-id>--<mobile|desktop>.json                   full LHR JSON as written by Lighthouse
│   └── summary.json / summary.md                           scores extracted from the JSON files (categories.*.score × 100), CWV lab values (LCP, CLS, TBT/INP)
├── axe/                      axe-core results (WCAG 2.x A/AA tags) of the AFTER build
│   ├── <locale>-<route-id>[--<state>].json                 raw AxeBuilder.analyze() result (violations, incomplete, passes count)
│   └── summary.json / summary.md                           violations per route, impact, rule ids; "0 violations" only when the raw file shows an empty array
├── seo/                      SEO gate and localization evidence of the AFTER build
│   ├── seo-check.txt                                       stdout/stderr + exit code of `pnpm seo:check`
│   ├── redirect-matrix.md                                  regenerated Blog → Tracking Knowledge matrix (copy of docs/redirects-blog-to-tracking-knowledge.md)
│   ├── i18n-parity-report.json / .md                       output of `node apps/web/scripts/i18n-parity.mjs --strict`
│   ├── knowledge-validate.txt                              output of `pnpm --filter @track-site/web knowledge:validate`
│   └── head-<locale>-<route-id>.html                       optional: saved <head> of a page (lang, canonical, hreflang, og:image, JSON-LD) when a finding needs the raw markup
├── before-after/             supplement §11 "Abschlussbelege" 2: 375, 768, 1440, 1920 px
│   ├── mapping.json                                        route-id → { before: URL on the BEFORE server, after: URL on the AFTER server }
│   ├── before/<route-id>--<width>.webp                     BEFORE build (worktree 0f0f5b5)
│   └── after/<route-id>--<width>.webp                      AFTER build, identical file names for pairing
└── reports (top-level files in this directory)
    ├── build-current.log, build-before.log, install-before.log   build/install output (P0)
    ├── lint.log, typecheck.log, unit-tests.log, integration-tests.log, contract-tests.log, e2e.log
    ├── changed-files.md                                    "Abschlussbelege" 1: files and routes changed by the programme
    ├── pricing-entitlement-matrix.md                       "Abschlussbelege" 5: plan × entitlement matrix with the test files that assert it
    ├── responsive-report.md                                per viewport × route: horizontal scroll (document.scrollWidth vs clientWidth), clipped text, hidden mandatory actions
    ├── summary.md / summary.json                           index of the pack: every gate with pass/fail/not-run and the file that proves it
    └── open-points.md                                      only real external blockers (credentials, legal texts, third-party decisions), per §11
```

Route ids (use the same id in every folder): `home`, `features`, `feature-<slug>`, `how-it-works`, `integrations`, `integration-<slug>`, `pricing`, `knowledge-hub`, `knowledge-article-<slug>`, `docs`, `support`, `contact`, `demo`, `status`, `security`, `privacy`, `terms`, `data-processing`, `subprocessors`, `imprint`, `login`, `signup`, `forgot-password`, `app-overview`, `app-ai-setup`, `app-events`, `app-events-explorer`, `app-events-matrix`, `app-events-test-lab`, `app-destinations`, `app-data-quality`, `app-revenue-leaks`, `app-consent`, `app-consent-simulator`, `app-insights`, `app-attribution`, `app-audiences`, `app-releases`, `app-team`, `app-billing`, `app-usage`, `app-settings`, `app-alerts`. States: `dark`, `reduced-motion`, `zoom200`, `menu-open`, `palette-open`, `sheet-open`, `keyboard-focus`.

Viewports: `320`, `375`, `768`, `1024`, `1440`, `1920` for `screenshots/` (supplement §10); `375`, `768`, `1440`, `1920` for `before-after/` (supplement §11).

## Actual layout of the assembled pack (2026-09-05)

The tasks that produced the evidence used the file names below; where they differ from the plan above, the plan is superseded (route ids are unchanged, so a rename would be mechanical). Index of everything: `docs/16-release-report.md`.

```
docs/qa/2026-09-05/
├── README.md                          baselines, rules, planned layout, reproduction (this file)
├── changed-files.mjs / changed-files.md          Abschlussbelege 1: files by area, commits, working tree, route tables from both build manifests
├── pricing-matrix.mjs / pricing-matrix.md        Abschlussbelege 5: generated from @track-site/catalog + test evidence
├── screenshots/                       S1 responsive sweep of build rCAJOqYs841hSlnLSc99W (56 routes × 6 widths)
│   ├── <route-slug>/<width>[--partN].webp        e.g. en-home/375.webp, app-overview/768.webp (633 files) + targeted --<state> shots
│   ├── keyboard/<slug>/tab-NN.webp               120 focus crops
│   └── responsive-sweep.{md,json,jsonl}, responsive-findings.md (F1–F10)
├── axe/                               S1 axe results: <slug>--<width>.json (96), summary.{md,json}, keyboard/<slug>.json, keyboard-summary.md
├── lighthouse/                        S2: <page>--<mobile|desktop>--runN.report.{json,html} (24), summary.{md,json}, run.log, diagnostics/ (LCP probes, CDP throttling, Chrome 152 cross-check)
├── seo/                               S3: crawl.json + summary.md (498 pages, links, JSON-LD, redirect matrix, sitemaps, feeds), seo-check.txt,
│                                      redirect-matrix.md (2-locale copy of docs/redirects-…), redirect-matrix-six-locales.{mjs,md} (224 rows),
│                                      i18n-parity-report.{md,json} (copy), knowledge-validate.txt
├── before-after/                      S4 (Abschlussbelege 2): <page>/{before,after}-<width>[-partN].webp (511), index.md, capture.json, mapping.json
├── recheck/                           F1 re-check on build UANQbZ2DkEqCtTt7EriZY: README.md (finding → root cause → fix → evidence), build.log,
│                                      e2e-new-specs.log, sweep*.log, screenshots/, axe/, lighthouse/
└── reports/                           Abschlussbelege 7 (this report's gate run, HEAD 85fe3b7 + working tree): run-gates.sh, _gates.log,
                                       typecheck.txt, lint.txt, lint-excluding-qa-scripts.txt, test.txt, test-integration-run1-parallel.txt,
                                       test-integration.txt (serial), test-contract.txt, build.txt (BUILD_ID 8k-9hBUufCX88fLKrM1Yp),
                                       health-www-track-site.json, e2e/ (e2e-run{1..4}.log, visual-update-final.log, visual-verify-final-{1..4}.log)
    └── final/                         closing verification after F1 (docs/16 §11, build WYwzaImZB_f2TD_I3NFt- on :3007): typecheck.txt, lint-before-fix.txt,
                                       lint.txt, test.txt, build.txt, e2e-run1-before-baseline-update.log, visual-update-snapshots.log, e2e-run2.log,
                                       visual-verify-run3.log, server-3007.log, check-links.mjs + check-links.txt (docs/16 reference check, pack size)
```

Baseline note: the "after" tree was `85fe3b7` with a clean working tree for S1–S4; task F1 then fixed the sweep findings in the working tree (35 modified files, uncommitted at the time of the report) and rebuilt (`UANQbZ2DkEqCtTt7EriZY`); the gate run of the report rebuilt the same tree again (`8k-9hBUufCX88fLKrM1Yp`). `apps/web/.next` is shared by every task that serves it, so a rebuild changes what a running `next start` serves.

## Reproduction

Prerequisites (all verified on this machine on 2026-09-05): Node 24.18, pnpm 11.21, local PostgreSQL 18 on `127.0.0.1:54330` (`tracksite_dev`, `DATABASE_URL` in the root `.env`), Playwright browsers under `%LOCALAPPDATA%/ms-playwright` (`chromium-1234`), `sharp` in `apps/web` for WebP conversion. Lighthouse is **not** a repository dependency and is not in the pnpm dlx cache: the first `pnpm dlx lighthouse` run needs network access.

Windows notes: the Bash tool mangles commands longer than ~8 KB (write scripts to files); env variables are set with `$env:NAME='value'; command` in PowerShell and `NAME=value command` in bash; `pnpm --filter @track-site/web start -p <port>` takes `-p` directly (no `--` separator). `<port>` is always the port assigned to the task; two tasks never share a port.

### 1. Builds

```bash
# after (repo)
cd C:/Users/Soheil/Downloads/track.site
pnpm --filter @track-site/web build          # exit 0, "Generating static pages (715/715)"

# before (worktree of the pre-redesign commit)
cd C:/Users/Soheil/Downloads/track.site
git worktree add ../track-site-before 0f0f5b5   # reuse if it exists: git worktree list
cp .env ../track-site-before/.env               # apps/web/.env does not exist; next.config.ts loads ../../.env
cd ../track-site-before
pnpm install --offline --frozen-lockfile        # fall back to `pnpm install --frozen-lockfile` if the store misses a package
pnpm --filter @track-site/web build             # exit 0, "Generating static pages (173/173)"
```

Do not rebuild `apps/web/.next` while another task serves from it (`next start` reads the build directory live).

### 2. Database and demo data

```bash
cd C:/Users/Soheil/Downloads/track.site
pnpm db:migrate
SEED_DEMO=true pnpm db:seed        # demo organization; login owner@acme.test / Demo-Password-123! (docs/06-local-development.md)
```

The BEFORE worktree shares the same database (same `.env`). Its schema is older (`packages/db/drizzle` ends at `0003_shop_connections.sql` at `0f0f5b5`; the AFTER tree ends at `0013_alerts.sql`); do not run `db:migrate` from the worktree. BEFORE dashboard screenshots therefore only need the seeded organization; if a BEFORE dashboard page fails on a newer column, record it as "not run" with the error.

### 3. Servers (one port per task)

```bash
# after
cd C:/Users/Soheil/Downloads/track.site
AI_DEV_FIXTURES=1 pnpm --filter @track-site/web start -p <port>      # AI_DEV_FIXTURES=1 enables the dev-only /api/ai/dev-fixture route used by the 250-message e2e
# before
cd C:/Users/Soheil/Downloads/track-site-before
pnpm --filter @track-site/web start -p <port-before>
```

Stop every server you started before finishing (PowerShell; `next start` spawns a child `next-server`, so kill the tree by the listening PID):

```powershell
$pid = (Get-NetTCPConnection -LocalPort <port> -State Listen -ErrorAction SilentlyContinue).OwningProcess
if ($pid) { taskkill /PID $pid /T /F }
Get-NetTCPConnection -LocalPort <port> -State Listen -ErrorAction SilentlyContinue   # must print nothing
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'next start' } | Select-Object ProcessId, CommandLine
```

### 4. Tests and gates

```bash
cd C:/Users/Soheil/Downloads/track.site
pnpm lint            > docs/qa/2026-09-05/lint.log 2>&1
pnpm typecheck       > docs/qa/2026-09-05/typecheck.log 2>&1
pnpm test            > docs/qa/2026-09-05/unit-tests.log 2>&1
pnpm test:integration > docs/qa/2026-09-05/integration-tests.log 2>&1     # needs TEST_DATABASE_URL
pnpm test:contract   > docs/qa/2026-09-05/contract-tests.log 2>&1

# Playwright (chromium): the `setup` project signs in once as the seeded owner and writes apps/web/e2e/.auth/owner.json
E2E_BASE_URL=http://localhost:<port> pnpm --filter @track-site/web test:e2e > docs/qa/2026-09-05/e2e.log 2>&1
# axe (wcag2a/wcag2aa) runs inside apps/web/e2e/marketing.spec.ts; per-route raw results for axe/ come from a
# Playwright script using `new AxeBuilder({ page }).withTags(["wcag2a","wcag2aa","wcag22aa"]).analyze()` written as JSON.

# SEO gate: every public route in all six locales (200, <html lang>, title, description, canonical, hreflang ×6 + x-default,
# one h1, JSON-LD, og:image on articles, redirects, robots, sitemap index, feeds)
SEO_BASE_URL=http://localhost:<port> pnpm seo:check > docs/qa/2026-09-05/seo/seo-check.txt 2>&1
node apps/web/scripts/redirect-matrix.mjs            # rewrites docs/redirects-blog-to-tracking-knowledge.md, exit 1 on drift
node apps/web/scripts/i18n-parity.mjs --strict       # writes docs/i18n-parity-report.{json,md}, exit 0 only with zero gaps
pnpm --filter @track-site/web knowledge:validate
```

### 5. Screenshots (WebP ≤ 150 KB)

Capture with Playwright (chromium, `deviceScaleFactor: 1`, `page.setViewportSize({ width, height })`, `page.screenshot({ fullPage: true })` to PNG, `reducedMotion: "reduce"` only for the `--reduced-motion` state, `colorScheme: "dark"` for `--dark`), then convert with sharp from `apps/web`:

```bash
cd C:/Users/Soheil/Downloads/track.site/apps/web
node -e "const s=require('sharp');s(process.argv[1]).webp({quality:80,effort:6}).toFile(process.argv[2]).then(i=>console.log(i.size))" in.png out.webp
```

If a file is above 150 KB: lower `quality` in steps (70, 60, 50); for very long full-page captures additionally cap the height (`page.screenshot({ clip })` in viewport-height segments named `--part1`, `--part2`, …) rather than scaling the image, so text stays legible. Record the final size per file in `responsive-report.md` (`ls -l` or `Get-ChildItem`).

Responsive checks per viewport (supplement §10): `document.documentElement.scrollWidth <= document.documentElement.clientWidth` (no horizontal page scroll), no clipped text (`overflow` on headings/labels), primary actions visible without horizontal scrolling; 200 % zoom via `page.setViewportSize` at half the width with `deviceScaleFactor: 2` or Chromium `--force-device-scale-factor=2`.

### 6. Lighthouse

```bash
# mobile (default preset) and desktop, JSON output; point Lighthouse at the Playwright Chromium if no Chrome is installed
CHROME_PATH="$LOCALAPPDATA/ms-playwright/chromium-1234/chrome-win/chrome.exe" \
pnpm dlx lighthouse@12 http://localhost:<port>/en --output=json --output-path=docs/qa/2026-09-05/lighthouse/home--mobile.json --chrome-flags="--headless=new"
CHROME_PATH=... pnpm dlx lighthouse@12 http://localhost:<port>/en --preset=desktop --output=json --output-path=docs/qa/2026-09-05/lighthouse/home--desktop.json --chrome-flags="--headless=new"
```

`summary.json` is generated from the JSON files (`categories.performance|accessibility|best-practices|seo.score`, `audits["largest-contentful-paint"].numericValue`, `audits["cumulative-layout-shift"].numericValue`, `audits["total-blocking-time"].numericValue`, `audits["interaction-to-next-paint"]` when present). If `pnpm dlx` cannot download Lighthouse (no network), the Lighthouse section of the pack is "not run: lighthouse not installed, no network" — never a typed score. Dashboard routes need the stored session: pass `--extra-headers` with the `better-auth` session cookie from `apps/web/e2e/.auth/owner.json`, or run Lighthouse through Playwright's Chromium with the storage state.

### 7. Before/after pack

`before-after/mapping.json` lists, per route id, the BEFORE URL (server of the worktree) and the AFTER URL (server of the repo) from the route table above. Capture both sides at 375, 768, 1440 and 1920 px with the same script and the same file names; where the BEFORE tree has no counterpart (new modules such as `/app/releases`, locales `fr/es/it/nl`), the `before` entry is `null` and only `after/` has a file.
