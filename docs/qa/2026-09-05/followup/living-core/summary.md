# Living AI Core — budget evidence (docs/15 §4, supplement §9 acceptance criteria)

Generated 2026-09-05T14:39:52.292Z by `apps/web/scripts/qa/living-core-report.mjs` from the artifacts in this directory; the analysis at the end is `summary-notes.md`, appended verbatim. Every number in the generated sections comes from the named JSON/CSV file. Browser for every check: the chromium headless shell of Playwright's `chromium` project (path in each JSON's `shell`), stored owner session `apps/web/e2e/.auth/owner.json`, production build served on port 3012 (`server-3012.log`).

## 0. Which tier the headless shell can run (`webgl-probe.json`)

`createWebglRenderer` refuses a software-only context (`failIfMajorPerformanceCaveat: true`); the probe creates a WebGL2 context with the core's own attributes under several Chrome flag sets and reports the renderer string the browser exposes (QA record only, the app never reads it).

| Chrome flags | Strict WebGL2 context (core attributes) | Renderer |
| --- | --- | --- |
| `(none)` | yes | ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) |
| `--use-angle=d3d11` | yes | ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11) |
| `--use-angle=d3d11 --ignore-gpu-blocklist` | yes | ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11) |
| `--use-angle=gl` | yes | ANGLE (Intel, Intel(R) Iris(R) Xe Graphics, OpenGL 4.5.0) |
| `--enable-gpu-rasterization --ignore-gpu-blocklist` | yes | ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) |
| `--enable-unsafe-swiftshader` | yes | ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) |

## Tier selection under viewport emulation (`tier-*.json`)

| Label | Viewport (CSS px @ DPR) | Mobile/touch emulation | Panel mounted | Tier | Pref | Canvas | Coarse pointer |
| --- | --- | --- | --- | --- | --- | --- | --- |
| smoke-1440 | 1440×900 @ 1 | no | yes | webgl | system | yes | no |

## (a) Idle long tasks with the panel open on /app, WebGL tier (`longtasks-<label>.json`)

not run
## (b) 30-minute soak with state changes every 20 s (`soak.json`, `soak-samples.csv`)

not run
## (c) Lighthouse mobile: static panel vs. animated panel (`lighthouse/summary.md`, raw reports in `lighthouse/`)

| Variant | Setting | Tier verified under the same emulation | Perf median (runs) | LCP | TBT | CLS | Speed Index | Main-thread work | Script boot-up |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| docked | full | webgl (pref full, canvas yes) | **71** (76/71/70) | 5.00 s | 419 ms | 0.008 | 2.03 s | 2.17 s | 1.15 s |
| docked | off | static (pref off, canvas no) | **77** (75/79/77) | 4.91 s | 221 ms | 0.007 | 1.74 s | 1.70 s | 824 ms |
| docked | system | webgl (pref system, canvas yes) | **71** (70/71/71) | 4.99 s | 430 ms | 0.008 | 1.74 s | 2.15 s | 1.15 s |
| phone | off | core not mounted (panel closed) | **83** (83/84/83) | 4.23 s | 162 ms | 0.000 | 1.51 s | 1.22 s | 663 ms |
| phone | system | core not mounted (panel closed) | **83** (82/84/83) | 4.24 s | 148 ms | 0.000 | 1.52 s | 1.19 s | 627 ms |

| Comparison (median) | Perf points | LCP | TBT | CLS | Target ≤ 3 points worse |
| --- | ---: | ---: | ---: | ---: | --- |
| docked/system-vs-off | -6 | +81 ms | +209 ms | +0.001 | FAIL |
| docked/full-vs-off | -6 | +83 ms | +198 ms | +0.001 | FAIL |
| phone/system-vs-off | 0 | +13 ms | -14 ms | 0.000 | pass |

## (d) Reduced motion and setting `off`: no animation frames (`motion-off.json`)

| Configuration | Window | `data-tier` | `data-pref` | `html[data-ai-motion]` | rAF requested / fired | canvas.lac-gl | Running animations inside `.lac` | `.lac-blob > i` animation-name | SSR |
| --- | ---: | --- | --- | --- | ---: | --- | ---: | --- | --- |
| `prefers-reduced-motion: reduce`, setting `system` | 10015 ms | static | system | system | 0 / 0 | no | 0 | none, none, none | `data-tier="static"` in HTML: yes, `<canvas`: no, `data-ai-motion`: system |
| setting `off` (header control), same page | 10008 ms | static | off | off | 0 / 0 | no | 0 | none, none, none | webgl2 contexts created 1, `webglcontextlost` after release 1 |
| setting `off`, after reload (server-rendered preference) | 10005 ms | static | off | off | 0 / 0 | no | 0 | none, none, none | `data-tier="static"` in HTML: yes, `<canvas`: no, `data-ai-motion`: off |

Before the toggle the same page ran the `webgl` tier (canvas yes); the toggle switched it to `static` (transitions: data-state=idle@756ms, data-tier=webgl@756ms, data-pref=system@756ms, data-tier=static@807ms, data-pref=off@807ms). Restored at the end: `data-ai-motion`=system, tier webgl. rAF callers in the windows: reduced {}, off {}, off after reload {}.


## Analysis and status (hand-written)

**Run aborted by the orchestrator before completion.** The orchestrator forced the final answer while the Lighthouse comparison was still running (15 of 18 planned reports written: `off`, `system` and `full` complete on the docked variant, `off` and `system` on the phone variant; `full/phone` missing) and before the long-task check (a) and the 30-minute soak (b) had been started. The Lighthouse runner was stopped, the per-user motion preference was restored to `system` through the settings form (see the command output in the orchestrator transcript), the session-cookie header file was deleted, and the server on port 3012 was stopped.

- (a) idle long tasks: **not run** (no time slot after the Lighthouse run; the harness `apps/web/scripts/qa/living-core-budget.mjs --mode longtasks` is ready and smoke-tested in `tier` mode, `tier-smoke-1440.json`: webgl tier on the headless shell with `--use-angle=d3d11`).
- (b) 30-minute soak: **not run** (same reason; `--mode soak` implements the 20-s state cycle with the provider stubbed at the browser's `fetch` boundary and the 60-s CDP sampling).
- (c) Lighthouse static vs animated: **partial** — `off`, `system` and `full` (docked, 3 runs each), `off` and `system` (phone, 3 runs each); `full/phone` missing. Medians and deltas above are from the 15 reports in `lighthouse/`. On the docked variant (panel open, core on the WebGL tier as verified in `lighthouse/tier-checks.json`) the animated panel is **6 points below** the static panel for both `system` and `full` (median 77 → 71; delta table above; TBT +209 / +198 ms, LCP +81 / +83 ms, CLS +0.001) — a miss of the ≤ 3-point target — driven by TBT (main-thread work during load, 4× CPU simulation); on the phone variant (panel closed, core not mounted) the two settings are within noise, as expected.
- (d) reduced motion and `off`: **complete and passing** — zero rAF callbacks in 10 s windows for `prefers-reduced-motion: reduce` and for the persisted `off` setting (also after a reload), static tier attribute, no canvas, no running animation inside `.lac`, static tier in the SSR HTML; the WebGL context was released (`webglcontextlost` after the toggle) and the preference restored to `system`.
- Cross-browser matrix: not run (Firefox/WebKit outside this task's scope; only the chromium headless shell is usable on this machine).

Environment notes: server started with `HOST_MARKETING=http://localhost:3012 HOST_APP=http://localhost:3012/app AI_DEV_FIXTURES=1 OPENAI_API_KEY=sk-qa-stub-no-provider` (placeholder key: chat mode on, no provider call possible; no message was sent to the server in this run). WebGL on the headless shell: hardware ANGLE/D3D11 with `--use-angle=d3d11`, SwiftShader by default (`webgl-probe.json`); the core accepts both (`failIfMajorPerformanceCaveat` does not reject SwiftShader in this Chromium).
