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

