# Cross-browser matrix — Track redesign follow-up, task E2 (2026-09-05)

Owed evidence D10 of `docs/16-release-report.md` §9 ("no Firefox / WebKit run anywhere in the pack") and the cross-browser row of the Living AI Core budget (`docs/15-living-ai-core.md` §4, owner supplement §9 "Verbindliche Abnahmekriterien": Safari/iOS, Chrome/Android, Safari, Chrome, Firefox, Edge). Every number below is copied from a file in this directory (`matrix.mjs` renders the result tables of §6 from the raw logs and JSON records); a check that could not run says so with the reason. Real iOS and Android devices, Safari on macOS and a working Firefox are **not available on this machine** (§1).

| | |
| --- | --- |
| Build under test | `apps/web/.next`, `BUILD_ID` `JkuZkqiqEn0HgN4FIDCyT` (the "after" production build of the perf follow-up; not rebuilt here) |
| Server | `AI_DEV_FIXTURES=1 HOST_MARKETING=http://localhost:3013 HOST_APP=http://localhost:3013/app pnpm --filter @track-site/web start -p 3013` (`server-3013-production-headers.log` for the first runs, `server-3013.log` for the matrix; §3 B1 explains the restart) |
| Tree | `feat/ai-tag-manager-platform` at `3da47f5` + working tree; the functional/visual specs of the matrix are the **committed** files (`git show HEAD:apps/web/e2e/{marketing,app,visual}.spec.ts`), see §2 |
| Engines | `@playwright/test` 1.62.1: Chromium 151.0.7922.34 (`chrome-headless-shell`, the only Chromium that starts here), WebKit 26.5 (`webkit-2336`), Firefox `firefox-1538` present but **cannot start** (§1); device emulation "iPhone 14" (WebKit, 390 × 664 CSS px @3×) and "Pixel 7" (Chromium, 412 × 839 @2.625×) |
| Session | stored owner session `apps/web/e2e/.auth/owner.json` (`ts.session_token` valid to 2026-09-19), refreshed by the `setup` project on the trusted origin :3013; works unchanged in WebKit |
| Environment | Windows 11 10.0.26200.9168, Node 24.18.0, pnpm 11.21.0 (`environment.txt`) |
| Concurrency | two other follow-up tasks ran against the same database and the same `apps/web/e2e` directory during this run (servers on :3012 and :3014); the effects on this matrix are listed in §3 B7 |

## 0. Matrix — engine × page × result

"pass" = the existing spec(s) for that page passed on that engine; "n/a" = the engine cannot start on this machine (§1). The mobile columns are the device-emulation checks of §5 (no horizontal scroll, composer visible with the bottom sheet open, axe wcag2a/wcag2aa/wcag22aa without serious or critical violations).

| Page / check | Chromium 151 (desktop) | WebKit 26.5 (desktop) | Firefox 1538 | iPhone 14 (WebKit) | Pixel 7 (Chromium) |
| --- | --- | --- | --- | --- | --- |
| `/en` … `/nl` home: `lang`, one `h1`, canonical, 7 × hreflang, axe (6 tests) | pass | pass | n/a | `/en`: pass (scrollWidth 390 = clientWidth, 0 wide elements, axe 0 violations, 0 console errors) | `/en`: pass (412 = 412, axe 0, 0 console errors) |
| Responsive layout `/fr` @320, `/en` @1024 / @1280, `/nl` @1024, `/fr/pricing` @320, `/de/pricing` @768, `/nl/pricing` @1024 (7 tests) | pass | pass | n/a | — | — |
| `/en/pricing`: prices, language switcher en → de → fr | pass | pass | n/a | pass (390 = 390, axe 0, 0 console errors) | pass (412 = 412, axe 0, 0 console errors) |
| `/en/tracking-knowledge` + article template, JSON-LD, `card.png`, `/de` link | pass | pass | n/a | — | — |
| `/en/imprint`, sitemap index, unprefixed / old-blog redirects (request-level) | pass | pass | pass (no browser needed) | — | — |
| `/en/login` → sign-in → `/app/sites/<id>/shop` | pass | **fail** — hydration race of the spec, not of the app (B4) | n/a | — | — |
| `/app` shell: viewport-fixed document, navigation, workspace switcher, docked panel 380–440 px, minimise / launcher, route change, Ctrl+K palette, mobile launcher + bottom sheet, responsive header @320/375/768, drawer palette, header focus rings (11 tests) | pass | pass | n/a | sheet 664 = innerHeight, composer bottom 652 ≤ 664, axe 0; one console error (B3) | sheet 839 = innerHeight, composer bottom 827 ≤ 839, axe 0, 0 console errors |
| `/app` Track AI panel: 250-message transcript stays viewport-high, motion `off` → static tier, `prefers-reduced-motion` → static tier from SSR, live region + setup targets (4 tests) | pass | pass | n/a | — | — |
| `/app/settings/alerts`: channels + rules round trip, motion preference persisted (3 tests) | pass | pass | n/a | — | — |
| Dashboard module pages (11 routes, one `h1` each), renamed-path redirects | pass | pass | n/a | — | — |
| Visual regression, 12 snapshots vs the committed Chromium baselines | 12 / 12 pass | 9 / 12 pass; `home-375`, `article-consent-mode-v2-guide-375`, `app-overview-1440` differ by ratio 0.02 (B5) | n/a | — | — |
| Living AI Core: WebGL2 available → `webgl`; reduced motion → `static`; WebGL2 unavailable → `css`; context loss → `css`; dark theme (5 cases, §4) | all 5 as specified, ≤ 30 fps (54 draws / 2 s), 0 console errors | all 5 as specified (37 draws / 2 s, DPR 2 capped to 1.5×); every case logs one WebKit console error about the viewport meta (B3) | n/a | — | — |

Totals: Chromium 40 / 40 functional (setup + 39) + 12 / 12 visual + 5 / 5 core cases + 3 / 3 mobile; WebKit 38 / 39 functional (§2) + 9 / 12 visual + 5 / 5 core cases with the B3 console error + 2 / 3 mobile (the `/app` case fails only on B3); Firefox 0 browser tests (the 5 request-only tests pass).

## 1. Engines — install attempt and availability

- `pnpm --filter @track-site/web exec playwright install firefox webkit` → exit 0, no output (`playwright-install.log`): the registry `%LOCALAPPDATA%\ms-playwright` already holds `firefox-1538` and `webkit-2336`, the revisions `playwright-core/browsers.json` of 1.62.1 expects; no download was needed and none failed.
- Launch smoke test of the three engines (`engine-smoke.json`, `engine-smoke.log`): Chromium 151.0.7922.34 starts (headless shell), WebKit 26.5 starts, **Firefox fails with `browserType.launch: spawn UNKNOWN`**. Cause: Windows cannot build the Side-by-Side activation context of `firefox.exe` ("Die abhängige Assemblierung mozglue … konnte nicht gefunden werden", `firefox-sxs.txt` quotes the event-log text); the binaries are complete and carry their manifests, so this is the OS installation, not the download — the same class of failure that keeps the full Chromium (`chrome-win64`) from starting on this machine (docs/16 §6.3). Consequence: every Firefox project of this matrix fails at launch (`e2e-firefox.log`: 38 × spawn UNKNOWN; `runs/xb-visual-firefox`, `runs/xb-lac-firefox`).
- Not available here, stated explicitly: **real iOS and Android devices, Safari on macOS, Firefox**. Microsoft Edge (`msedge.exe`) and a system Firefox exist on the machine but were outside the task (Playwright cannot drive a stock Firefox; Edge would be a `channel: "msedge"` project — not run).
- WebGL2 probe on `about:blank` (`engine-smoke.json`): WebGL2 with `failIfMajorPerformanceCaveat` is available in Chromium (headless shell) and WebKit; `requestIdleCallback` exists in Chromium, **not in WebKit** (the core's `setTimeout(300)` fallback is what runs there).

## 2. Method

1. **Functional specs, permanent config.** `apps/web/playwright.config.ts` gained optional `firefox` and `webkit` projects (same shape as `chromium`: stored session, `setup` dependency, `visual.spec.ts` ignored). They are defined only when the engine's executable exists in Playwright's registry, and `E2E_ENGINES` (comma list, default `firefox,webkit`) narrows them; `pnpm --filter @track-site/web typecheck` passes (`typecheck-web.log`, exit 0). Runs: `E2E_BASE_URL=http://localhost:3013 pnpm exec playwright test --project=<engine>` → `e2e-chromium.log` (40 passed), `e2e-webkit-production-headers.log` (21 passed / 21 failed incl. one foreign probe, §3 B1), `e2e-firefox.log` (file-filtered to `marketing.spec.ts app.spec.ts`; 5 passed / 38 launch failures).
2. **WebKit needs a harness-side header fix (B1).** The production build sends `Content-Security-Policy: …; upgrade-insecure-requests` (+ HSTS) on every route; WebKit applies the directive to `http://localhost`, so no stylesheet, script, font, same-origin link or form post loads. The directive is baked into `.next/routes-manifest.json` at build time (`routes-manifest-headers.txt`; a `NODE_ENV=development next start` attempt changed nothing, `server-3013-node-env-development-attempt.log`), a rebuild is outside this task, and a proxy would need a second port. The matrix therefore runs the same tests as **temporary copies** (`apps/web/e2e/{marketing,app,visual}-xb.tmp.spec.ts`, generated by `make-tmp-specs.mjs` from the committed files at `3da47f5`, deleted afterwards) with one hook inserted after the imports: in WebKit only, a `context.route("**/*")` handler fetches each response over http, drops `strict-transport-security` and the `upgrade-insecure-requests` directive, and fulfils the request otherwise unchanged; Chromium and Firefox see unmodified responses. The hook text is in `make-tmp-specs.mjs`; the copies' tests are the originals. Control: `xb-func-chromium` 39 / 39 on the copies (`runs/xb-func-chromium`), identical to the unmodified Chromium run.
3. **Temporary config** `playwright.xbrowser.config.mjs` (this directory): projects `xb-func-{webkit,chromium}`, `xb-visual-{chromium,webkit,firefox}` (config-level `snapshotPathTemplate` pointing at the committed `…-visual-win32.png` baselines, run with `--update-snapshots=none`, so no baseline is written or updated; `xb-visual-chromium` is the control and passes 12 / 12), `xb-lac-{chromium,webkit,firefox}` (`xbrowser-lac.tmp.spec.ts.src`) and `xb-mobile-webkit-iphone14` / `xb-mobile-chromium-pixel7` (`xbrowser-mobile.tmp.spec.ts.src`). One worker, sequential projects (`run-xbrowser.sh`; logs `run-xbrowser.log`, `run-xbrowser-rerun.log`), traces and raw PNG diffs in a scratch directory; per project `runs/<project>/run.log` + `results.json` (+ `lac/`, `mobile/`, `diffs/` with JSON records and WebP ≤ 150 KB, `_conversion.json`).
4. The first `xb-func-webkit` / `xb-visual-webkit` runs used a hook without error handling; a Next.js route prefetch still in flight when a test ended made Playwright fail two otherwise passing tests ("route.fetch: Test ended"), and one visual test hit "Fetch response has been disposed". Both projects were re-run with the corrected hook (try/catch + `unrouteAll` in `afterEach`); the first runs are kept as `runs/*-run1-old-hook/` and are not used in the tables.

## 3. Findings

| # | Finding | Severity | Evidence | Fix hint |
| --- | --- | --- | --- | --- |
| B1 | **WebKit cannot load the local production build over plain http**: the build-time CSP directive `upgrade-insecure-requests` (`apps/web/next.config.ts` line 44, gated on `NODE_ENV === "production"`) makes WebKit upgrade every subresource, same-origin link and form post of `http://localhost:3013` to https ("SSL connect error", 19 failed requests per page), so pages render unstyled and never hydrate; Chromium and Firefox exempt `localhost` as a potentially trustworthy origin. `bypassCSP: true` and `127.0.0.1` do not help; stripping HSTS alone does not help, stripping the CSP directive does. On the real https origin the directive is a no-op, so this is a **QA-tooling defect**, not a production one — but every WebKit/Safari check of a local build (this matrix, Lighthouse in WebKit, screenshots) needs the hook of §2 until it is fixed | major (tooling; blocks Safari/WebKit evidence on local builds) | `webkit-csp-probe.json`, `webkit-header-strip-probe.json`, `routes-manifest-headers.txt`, `e2e-webkit-production-headers.log` (20 of the 39 committed tests fail: 6 responsive-layout, sign-in, language switcher, article navigation, 11 dashboard tests — all with assets missing), `server-3013-node-env-development-attempt.log` | gate `upgrade-insecure-requests` (and HSTS) on the configured origin scheme (`HOST_MARKETING` starting with `https://`) or set them at the edge instead of in `next.config.ts`; then a local `next start` is testable in every engine without a hook |
| B2 | **Firefox cannot start on this machine** (SxS activation context of `mozglue` fails; binaries intact) — no Firefox result anywhere in this matrix | blocking for the Firefox column (environment) | `firefox-sxs.txt`, `engine-smoke.json`, `e2e-firefox.log`, `runs/xb-*-firefox/run.log` | run the `firefox` project on another machine or on the Linux CI runner (defect D14); `E2E_ENGINES=webkit` keeps `pnpm test:e2e` green here |
| B3 | **WebKit logs a console error on every dashboard page**: `Viewport argument key "interactive-widget" not recognized and ignored.` — the `interactive-widget=resizes-content` key of the dashboard viewport meta (`apps/web/src/app/app/layout.tsx` line 24, committed in HEAD) is Chromium-only. Function is unaffected (the value is ignored), but the "no console errors" criterion of the Living AI Core matrix and of the mobile `/app` check fails in WebKit for this single message; marketing pages are clean | minor | `runs/xb-lac-webkit/lac/*.json` (`consoleErrors`, all 5 cases), `runs/xb-mobile-webkit-iphone14/mobile/xb-mobile-webkit-iphone14--app-*.json`; `/en`, `/en/pricing` in the same engine: `[]` | accept (Safari has no equivalent; the message is informational), or drop the key if console cleanliness in Safari is required — the on-screen-keyboard work (D16) decides |
| B4 | **`app.spec.ts` sign-in is a hydration race**: the spec fills the controlled e-mail / password inputs right after `page.goto("/en/login")` (load ≈ 355 ms); React hydrates ≈ 476 ms after navigation and resets the controlled inputs, the form then submits empty ("Enter a valid e-mail address.", field `[invalid]`) and `waitForURL(/\/app/)` times out. Chromium passes only because it hydrates before `fill()` completes; WebKit through the route hook does not. Signing in **works** in WebKit once hydration is awaited (navigates to `/app`) | minor (test robustness, D11-type) | `webkit-hydration-probe.json` (four variants), `runs/xb-func-webkit/run.log` failure 1 | wait for a hydration marker before `fill()` (a `data-hydrated` attribute on the form, or an enabled-state assertion driven by a client flag), or make the inputs uncontrolled with `defaultValue` |
| B5 | **Visual baselines are Chromium-specific**: WebKit renders 9 of 12 snapshots within the 1 % tolerance; `home-375` (9 975 px), `article-consent-mode-v2-guide-375` (13 209 px) and `app-overview-1440` (13 577 px) differ by ratio 0.02 — text rasterisation on every glyph edge plus 1–3 px vertical metric shifts (the Track AI quick actions / composer and the demo tabs appear doubled in the diff; the masks of the "Measured" line and of the transcript no longer align); no structural layout difference is visible in the diffs | info (expected engine variance) | `runs/xb-visual-webkit/run.log`, `runs/xb-visual-webkit/diffs/*-{expected,actual,diff}.webp` | keep per-engine baselines (as `apps/web/e2e/README.md` already prescribes per platform) if a WebKit visual gate is wanted; do not loosen `maxDiffPixelRatio` |
| B6 | **Living AI Core tiers behave as specified in both engines** (§4): WebGL2 → `webgl` tier with the canvas at opacity 1, ≤ 30 fps (Chromium 54 draws / 2 s at ~61 rAF/s; WebKit 37 draws / 2 s at ~26 rAF/s in headless), backing store capped at 1.5 × (WebKit descriptor DPR 2 → 599 × 336 px for 399 × 224 CSS px; Chromium DPR 1 → 1 : 1); reduced motion → `static` with zero running animations and no canvas; WebGL2 unavailable → `css` with the three `lac-drift-*` keyframes running and the composer still focusable and typable; `WEBGL_lose_context` → `css` within the 3 s poll, canvas released; dark theme → same tier; no console error except B3 in WebKit | pass | `runs/xb-lac-{chromium,webkit}/lac/*.json` + panel WebPs | — |
| B7 | **Concurrent tasks touched the shared test directory**: another task's `apps/web/e2e/e3-probe.tmp.spec.ts` was collected by the permanent config during the first WebKit run (+2 tests in its totals) and `app.spec.ts` gained three uncommitted tests ("mobile on-screen keyboard", "Track AI state across routes and sites") while this matrix ran, which is why the Firefox run counts 43 tests and why the copies were generated from `HEAD`. The shared seeded owner's motion preference was left at `off` by the broken first WebKit run and restored to `system` by the later passing runs (`data-ai-motion` = `system` in every core record) | process note | `e2e-webkit-production-headers.log`, `e2e-firefox.log`, `git diff --stat HEAD -- apps/web/e2e/app.spec.ts` at run time (243 lines), `make-tmp-specs.mjs` | one e2e directory per task, or file filters on every run (`playwright test marketing.spec.ts app.spec.ts`) |

Caveat on the permanent config: with Firefox present-but-broken (B2) and B1 unfixed, a plain `pnpm test:e2e` on this machine now also runs the `firefox` (38 launch failures) and `webkit` (20 failures) projects; `E2E_ENGINES=` (empty) or `E2E_ENGINES=webkit` selects. On a machine where all engines start, the three per-engine `sign-in` tests plus the `setup` sign-in can exceed better-auth's 3 sign-ins per 10 s when projects run in parallel — run engines with `--project` one at a time.

## 4. Living AI Core per engine (supplement §9 acceptance criteria, docs/15 §4)

Method (`xbrowser-lac.tmp.spec.ts.src`): `/app` at 1440 × 900 with the stored owner session; the tier is polled for up to 6 s; an init script counts `WebGL2RenderingContext.drawArrays` calls and `requestAnimationFrame` callbacks; console `error` and `pageerror` messages are collected from the first script on; per case a JSON record and a screenshot of the panel (`runs/xb-lac-<engine>/lac/`). Cases: default motion, `prefers-reduced-motion: reduce`, `getContext("webgl2")` returning `null`, `WEBGL_lose_context.loseContext()` on the live canvas, dark theme via the persisted `ts-theme`.

Criteria covered → status: "bei deaktiviertem, nicht verfügbarem oder verlorenem WebGL-Kontext erscheint automatisch der CSS- beziehungsweise statische Fallback; Chat bleibt funktionsfähig" → pass in Chromium and WebKit; "mit prefers-reduced-motion keine kontinuierlichen Animationsframes" → pass in both (0 draws, 0 running animations, no canvas); frame rate ≤ 30 fps and render scale ≤ 1.5 → pass in both (numbers in §6); light and dark mode → both tiers identical in dark; "Safari/iOS, Chrome/Android, Safari, Chrome, Firefox, Edge" → **Chromium and WebKit only** (desktop + emulation); Firefox n/a (B2), Edge not run, real devices not available. Still owed elsewhere: the static-panel Lighthouse comparison, the idle long-task check and the 30-minute soak (other follow-up tasks).

## 5. Mobile emulation (Playwright devices)

Method (`xbrowser-mobile.tmp.spec.ts.src`): `/en` and `/en/pricing` as an anonymous visitor (scroll sweep so lazy sections mount, `document.fonts.ready`), `/app` with the stored session, then the Track AI FAB opens the bottom sheet; measurements: `document.documentElement.scrollWidth` vs `clientWidth`, `visualViewport.scale`, every element whose box ends right of the viewport outside a scroll/clip container, the sheet's height vs `innerHeight`, the composer's bottom edge, axe-core (`@axe-core/playwright`, tags `wcag2a`, `wcag2aa`, `wcag22aa`), console errors; a viewport screenshot per state. Results (§6): **no horizontal scroll on any page in either device, the composer is visible inside the viewport with the sheet open (652 / 664 px on iPhone 14, 827 / 839 px on Pixel 7), axe reports 0 violations of any impact** (serious/critical empty on all 8 records); the only non-pass is the B3 console message on `/app` in WebKit. The on-screen keyboard itself is not emulated here (D16 / task E3); WebKit does not know the `interactive-widget` key, so the composer-above-keyboard behaviour on iOS cannot be inferred from this emulation.

## 6. Result tables (generated by `matrix.mjs` from the raw artifacts)

### Functional specs (marketing.spec.ts + app.spec.ts, `playwright.config.ts` projects)

| Engine | Project | Result | Duration | Log |
| --- | --- | --- | --- | --- |
| chromium | `chromium` | 40 passed, 0 failed, 0 skipped (exit 0) | 35.5s | `e2e-chromium.log` |
| webkit | `webkit` | 21 passed, 21 failed, 0 skipped (exit 1) | 3.5m | `e2e-webkit-production-headers.log` |
| firefox | `firefox` | 5 passed, 38 failed, 0 skipped (exit 1); 38 × `browserType.launch: spawn UNKNOWN` | 17.8s | `e2e-firefox.log` |

### Functional specs as temporary copies of the HEAD files (`xb-func-*`, WebKit with the header-strip hook)

| Project | Tests | Passed | Failed | Skipped | Duration | Failed tests (first error line) |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| xb-func-webkit | 39 | 38 | 1 | 0 | 167.9 s | app-xb.tmp.spec.ts:57 "signs in with the seeded owner, lists sites and opens the shop connect" — Test timeout of 60000ms exceeded. |
| xb-func-chromium | 39 | 39 | 0 | 0 | 53.3 s | — |

### Visual spec (visual.spec.ts) against the committed Chromium baselines (`--update-snapshots=none`)

| Snapshot | visual-chromium (control) | visual-webkit | visual-firefox |
| --- | --- | --- | --- |
| `home-375` | pass | mismatch 0.02 (9,975 px) | cannot launch |
| `home-1440` | pass | pass | cannot launch |
| `pricing-375` | pass | pass | cannot launch |
| `pricing-1440` | pass | pass | cannot launch |
| `knowledge-hub-375` | pass | pass | cannot launch |
| `knowledge-hub-1440` | pass | pass | cannot launch |
| `article-consent-mode-v2-guide-375` | pass | mismatch 0.02 (13,209 px) | cannot launch |
| `article-consent-mode-v2-guide-1440` | pass | pass | cannot launch |
| `login-375` | pass | pass | cannot launch |
| `login-1440` | pass | pass | cannot launch |
| `app-overview-375` | pass | pass | cannot launch |
| `app-overview-1440` | pass | mismatch 0.02 (13,577 px) | cannot launch |

### Living AI Core on /app (stored owner session, 1440 × 900)

| Engine | Case | WebGL2 strict / lenient | Tier | Canvas backing (CSS px) | Keyframes | Running anim. | Draws / rAF per 2 s | Console errors | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| chromium | default | true / true | webgl (pref system, state idle) | 399×224 (399×224, opacity 1) | none | 0 | 54 / 123 | 0 | passed |
| chromium | reduced-motion | true / true | static (pref system, state idle) | none | none | 0 | 0 / 1 (total) | 0 | passed |
| chromium | no-webgl2 | false / false | css (pref system, state idle) | none | lac-drift-a, lac-drift-b, lac-drift-c | 3 | 0 / 1 (total) | 0 | passed |
| chromium | context-lost | true / true | css (pref system, state idle) | none | lac-drift-a, lac-drift-b, lac-drift-c | 3 | 2 / 6 (total) | 0 | passed (tier after loss: css) |
| chromium | dark (theme dark) | true / true | webgl (pref system, state idle) | 399×224 (399×224, opacity 1) | none | 0 | 36 / 72 (total) | 0 | passed |
| webkit | default | true / true | webgl (pref system, state idle) | 599×336 (399×224, opacity 1) | none | 0 | 37 / 53 | 1: console.error: Viewport argument key "interactive-widget" not recogniz | failed |
| webkit | reduced-motion | true / true | static (pref system, state idle) | none | none | 0 | 0 / 2 (total) | 1: console.error: Viewport argument key "interactive-widget" not recogniz | failed |
| webkit | no-webgl2 | false / false | css (pref system, state idle) | none | lac-drift-a, lac-drift-b, lac-drift-c | 3 | 0 / 2 (total) | 1: console.error: Viewport argument key "interactive-widget" not recogniz | failed |
| webkit | context-lost | true / true | css (pref system, state idle) | none | lac-drift-a, lac-drift-b, lac-drift-c | 3 | 1 / 3 (total) | 1: console.error: Viewport argument key "interactive-widget" not recogniz | failed (tier after loss: css) |
| webkit | dark (theme dark) | true / true | webgl (pref system, state idle) | 599×336 (399×224, opacity 1) | none | 0 | 24 / 34 (total) | 1: console.error: Viewport argument key "interactive-widget" not recogniz | failed |
| firefox | default | — | — | — | — | — | — | — | failed (Error: browserType.launch: spawn UNKNOWN) |
| firefox | reduced-motion | — | — | — | — | — | — | — | failed (Error: browserType.launch: spawn UNKNOWN) |
| firefox | no-webgl2 | — | — | — | — | — | — | — | failed (Error: browserType.launch: spawn UNKNOWN) |
| firefox | context-lost | — | — | — | — | — | — | — | failed (Error: browserType.launch: spawn UNKNOWN) |
| firefox | dark | — | — | — | — | — | — | — | failed (Error: browserType.launch: spawn UNKNOWN) |

### Mobile emulation (Playwright devices)

| Device / engine | Page | innerWidth × innerHeight (DPR) | scrollWidth / clientWidth | Elements wider than the viewport | axe serious/critical | axe other (impact: rule (nodes)) | Composer bottom / sheet height vs innerHeight | Console errors | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| xb-mobile-webkit-iphone14 | home (/en) | 390 × 664 (3) | 390 / 390 | 0 | 0 | 0 | — | 0 | passed |
| xb-mobile-webkit-iphone14 | pricing (/en/pricing) | 390 × 664 (3) | 390 / 390 | 0 | 0 | 0 | — | 0 | passed |
| xb-mobile-webkit-iphone14 | app-closed (/app) | 390 × 664 (3) | 390 / 390 | 0 | 0 | 0 | — | 1: console.error: Viewport argument key "interactive-widget" not recogniz | failed |
| xb-mobile-webkit-iphone14 | app-sheet-open (/app) | 390 × 664 (3) | 390 / 390 | 0 | 0 | 0 | 652 / 664 vs 664 | 1: console.error: Viewport argument key "interactive-widget" not recogniz | failed |
| xb-mobile-chromium-pixel7 | home (/en) | 412 × 839 (2.625) | 412 / 412 | 0 | 0 | 0 | — | 0 | passed |
| xb-mobile-chromium-pixel7 | pricing (/en/pricing) | 412 × 839 (2.625) | 412 / 412 | 0 | 0 | 0 | — | 0 | passed |
| xb-mobile-chromium-pixel7 | app-closed (/app) | 412 × 839 (2.625) | 412 / 412 | 0 | 0 | 0 | — | 0 | passed |
| xb-mobile-chromium-pixel7 | app-sheet-open (/app) | 412 × 839 (2.625) | 412 / 412 | 0 | 0 | 0 | 827 / 839 vs 839 | 0 | passed |

## 7. Artifacts

| File | Content |
| --- | --- |
| `summary.md` | this report; `matrix-tables.md` = the tables of §6 as generated |
| `environment.txt`, `playwright-install.log`, `engine-smoke.{json,log}`, `firefox-sxs.txt` | environment, install attempt, engine launch + WebGL2 probe, Firefox diagnosis |
| `server-3013-production-headers.log`, `server-3013-node-env-development-attempt.log`, `server-3013.log` | the three server starts on port 3013 (all `BUILD_ID` `JkuZkqiqEn0HgN4FIDCyT`) |
| `e2e-chromium.log`, `e2e-webkit-production-headers.log`, `e2e-firefox.log` | permanent-config runs (`--project=chromium|webkit|firefox`) |
| `webkit-csp-probe.json`, `webkit-header-strip-probe.json`, `routes-manifest-headers.txt`, `webkit-hydration-probe.json` | root-cause probes for B1 and B4 |
| `playwright.xbrowser.config.mjs`, `make-tmp-specs.mjs`, `run-xbrowser.sh`, `xbrowser-lac.tmp.spec.ts.src`, `xbrowser-mobile.tmp.spec.ts.src`, `to-webp.mjs`, `matrix.mjs` | the matrix tooling (the temporary specs are generated into `apps/web/e2e` and deleted after the run) |
| `run-xbrowser.log`, `run-xbrowser-rerun.log`, `runs/<project>/{run.log,results.json}` | per-project runs; `runs/xb-lac-<engine>/lac/<project>--<case>.{json,webp}`, `runs/xb-mobile-*/mobile/<project>--<page>.{json,webp}`, `runs/xb-visual-webkit/diffs/*.webp` (expected / actual / diff of the three mismatches); `runs/*-run1-old-hook/` = first WebKit runs before the hook fix (not used) |
| `typecheck-web.log` | `pnpm --filter @track-site/web typecheck` after the `playwright.config.ts` change (exit 0) |

Changed repository files: `apps/web/playwright.config.ts` (optional `firefox` / `webkit` projects, `E2E_ENGINES`); the temporary `apps/web/e2e/*-xb.tmp.spec.ts` and `xbrowser-*.tmp.spec.ts` were removed at the end of the task (`make-tmp-specs.mjs --remove`). No commit, no rebuild; the server on port 3013 was stopped and the port confirmed free.
