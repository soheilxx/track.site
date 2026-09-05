# Living AI Core — budget evidence (docs/15 §4, supplement §9 acceptance criteria)

Generated 2026-09-05T16:48:40.196Z by `apps/web/scripts/qa/living-core-report.mjs` from the artifacts in this directory; the analysis at the end is `summary-notes.md`, appended verbatim. Every number in the generated sections comes from the named JSON/CSV file. Browser for every check: the chromium headless shell of Playwright's `chromium` project (path in each JSON's `shell`), stored owner session `apps/web/e2e/.auth/owner.json`, production build served on port 3016 (`server-3016.log`).

## 0. Which tier the headless shell can run (`webgl-probe.json`)

not run
## (a) Idle long tasks with the panel open on /app, WebGL tier (`longtasks-<label>.json`)

`PerformanceObserver({ type: "longtask", buffered: true })` installed before any application script; a long task is an entry > 50 ms. Attribution: the entry's own `attribution` (Chrome only names the container) plus the child events of every main-thread task ≥ 50 ms in a Chrome trace recorded during the same window (`devtools.timeline`, `v8.execute`), and the core's own frame cost from a `requestAnimationFrame` wrapper that times every callback.

| Run | GL backend | Tier | Phase | Window | rAF callbacks (per s) | Callback p50 / p95 / p99 / max | Callbacks > 16 ms / > 50 ms | Long tasks > 50 ms | Longest |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| d3d11 | d3d11 | webgl → webgl | idle, no input | 120 s | 7201 (60) | 0.10 / 0.30 / 0.30 / 0.40 ms | 0 / 0 | **0** | — |
| d3d11 | d3d11 | webgl → webgl | scrolling the main area (253 wheel events) | 60.1 s | 3605 (60) | 0.10 / 0.30 / 0.30 / 0.40 ms | 0 / 0 | **0** | — |
| d3d11 | d3d11 | webgl → webgl | typing in the composer (1280 chars) | 60.6 s | 3639 (60) | 0.10 / 0.30 / 0.30 / 0.60 ms | 0 / 0 | **0** | — |

### d3d11: every long task > 50 ms (`longtasks-d3d11.json`)

- none (PerformanceObserver recorded no `longtask` entry in either window)

Chrome trace (341.2 MB, 1632974 events, kept outside the pack — see notes): main-thread tasks ≥ 50 ms with their child events:

- none

rAF callers during the last interaction phase (wrapper caller key → callbacks requested): `<anonymous> < http://localhost:3016/_next/static/chunks/1awk81wa18bb5.js < <anonymous>` 3639.

State/tier transitions during the run: panel.data-ai-state=idle@3.1s, core.data-state=idle@3.1s, core.data-tier=webgl@3.1s, core.data-state=listening@188.4s, panel.data-ai-state=listening@188.4s.

## (b) 30-minute soak with state changes every 20 s (`soak.json`, `soak-samples.csv`)

Run: 2026-09-05T16:13:55.901Z → 2026-09-05T16:44:06.391Z, 30 min (planned 30), GL backend d3d11, tier after load `webgl`, tiers seen during the run: `webgl`. Interactions: 89 steps (0 failed), provider stub answered 44 turns (29 success streams, 15 failed runs). Motion states entered (`data-ai-state` writes): idle ×16, listening ×45, working ×44, streaming ×29, success ×29, blocked ×15. Transcript 26 → 99 messages. Long tasks > 50 ms during the whole soak: 1.

Samples (CDP `Performance.getMetrics` + `Runtime.getHeapUsage`, in-page counters); `gc` rows follow a `HeapProfiler.collectGarbage`. Full series every 60 s in `soak-samples.csv`; the table lists the start, every 5th minute, the GC rows and the end.

| Sample | t | State | Tier | Msgs | JS heap used (Chrome) MB | JS heap used (Runtime) MB | Heap total MB | Nodes (Chrome) | DOM nodes (page) | JSEventListeners (Chrome) | Listeners net (page ledger) | Docs / Frames | Canvas els | WebGL2 ctx created / lost | IO / RO / MO created−disconnected | rAF fired | rAF p95 / max ms |
| --- | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | --- | --- | ---: | --- |
| start | 0 s | idle | webgl | 26 | 8.27 | 8.27 | 13.75 | 1094 | 792 | 457 | 314 | 4 / 4 | 1 | 1 / 0 | 2 / 2 / 3 | 313 | 0.30 / 1.00 |
| start-gc | 0 s | idle | webgl | 26 | 6.04 | 6.04 | 7.3 | 1017 | 792 | 380 | 314 | 1 / 1 | 1 | 1 / 0 | 2 / 2 / 3 | 316 | 0.30 / 1.00 |
| m5 | 302 s | working | webgl | 37 | 9.11 | 9.52 | 16.54 | 1150 | 866 | 1192 | 327 | 1 / 1 | 1 | 1 / 0 | 2 / 2 / 4 | 18448 | 0.30 / 1.00 |
| m5-gc | 302 s | working | webgl | 37 | 7.58 | 7.58 | 8.54 | 1126 | 866 | 390 | 327 | 1 / 1 | 1 | 1 / 0 | 2 / 2 / 4 | 18451 | 0.30 / 1.00 |
| m10-gc | 610 s | listening | webgl | 51 | 8.39 | 8.39 | 9.5 | 1250 | 961 | 390 | 327 | 1 / 1 | 1 | 1 / 0 | 2 / 2 / 4 | 36929 | 0.30 / 2.10 |
| m15 | 902 s | working | webgl | 62 | 9.85 | 10.33 | 17.2 | 1359 | 1031 | 856 | 327 | 1 / 1 | 1 | 1 / 0 | 2 / 2 / 4 | 54441 | 0.30 / 2.10 |
| m20-gc | 1210 s | listening | webgl | 76 | 8.78 | 8.78 | 9.95 | 1453 | 1126 | 390 | 327 | 1 / 1 | 1 | 1 / 0 | 2 / 2 / 4 | 72932 | 0.30 / 2.10 |
| m25 | 1502 s | working | webgl | 87 | 12.68 | 13.23 | 17.73 | 1552 | 1196 | 955 | 327 | 1 / 1 | 1 | 1 / 0 | 2 / 2 / 4 | 90444 | 0.30 / 2.10 |
| end | 1802 s | blocked | webgl | 99 | 9.87 | 9.87 | 12.23 | 1630 | 1279 | 391 | 327 | 1 / 1 | 1 | 1 / 0 | 2 / 2 / 4 | 108441 | 0.30 / 3.50 |
| end-gc | 1802 s | blocked | webgl | 99 | 9.21 | 9.21 | 10.48 | 1630 | 1279 | 391 | 327 | 1 / 1 | 1 | 1 / 0 | 2 / 2 / 4 | 108446 | 0.30 / 3.50 |

GC'd heap start-gc → end-gc: 6.04 → 9.21 MB (+3.17 MB, +52.5 %); Chrome nodes 1017 → 1630 (+613); JSEventListeners 380 → 391 (+11); page listener ledger net 314 → 327; canvas elements 1 → 1; WebGL2 contexts created 1 → 1, lost 0 → 0; transcript 26 → 99 messages.

GC'd samples in order: start-gc 6.04 MB / 1017 nodes / 380 listeners / 26 msgs; m5-gc 7.58 MB / 1126 nodes / 390 listeners / 37 msgs; m10-gc 8.39 MB / 1250 nodes / 390 listeners / 51 msgs; m20-gc 8.78 MB / 1453 nodes / 390 listeners / 76 msgs; end-gc 9.21 MB / 1630 nodes / 391 listeners / 99 msgs.

Listener ledger by event type, start → end (only types that changed): `auxclick` 4 → 5, `click` 4 → 5, `contextmenu` 4 → 5, `mousedown` 4 → 5, `mousemove` 4 → 5, `mouseup` 4 → 5, `pointerdown` 4 → 5, `pointerup` 4 → 5, `touchcancel` 4 → 5, `touchend` 4 → 5, `touchstart` 4 → 5, `dblclick` 4 → 5, `__playwright_global_listeners_check__` 0 → 1.

Sequence of motion states (from the panel's `data-ai-state`, first 40 writes): idle@3s → listening@28s → idle@48s → listening@68s → working@71s → streaming@77s → success@78s → listening@79s → working@110s → blocked@115s → working@130s → streaming@136s → success@137s → listening@138s → idle@168s → listening@188s → working@190s → streaming@197s → success@198s → listening@199s → working@230s → blocked@235s → working@250s → streaming@256s → success@257s → listening@258s → idle@288s → listening@308s → working@311s → streaming@317s → success@318s → listening@319s → working@350s → blocked@355s → working@370s → streaming@376s → success@377s → listening@378s → idle@408s → listening@428s → ….

## (c) Lighthouse mobile: static panel vs. animated panel (`lighthouse/summary.md`, raw reports in `lighthouse/`)

| Variant | Setting | Tier verified under the same emulation | Perf median (runs) | LCP | TBT | CLS | Speed Index | Main-thread work | Script boot-up |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| docked | full | webgl (pref full, canvas yes) | **80** (80/80/80) | 5.01 s | 95 ms | 0.008 | 1.86 s | 1.41 s | 638 ms |
| docked | off | static (pref off, canvas no) | **81** (82/79/81) | 4.69 s | 107 ms | 0.008 | 1.99 s | 1.45 s | 675 ms |
| docked | system | css (pref system, canvas no) | **80** (80/81/80) | 5.00 s | 99 ms | 0.008 | 1.88 s | 1.41 s | 664 ms |

| Comparison (median) | Perf points | LCP | TBT | CLS | Target ≤ 3 points worse |
| --- | ---: | ---: | ---: | ---: | --- |
| docked/system-vs-off | -1 | +315 ms | -8 ms | 0.000 | pass |
| docked/full-vs-off | -1 | +320 ms | -12 ms | 0.000 | pass |

## (d) Reduced motion and setting `off`: no animation frames (`motion-off.json`)

| Configuration | Window | `data-tier` | `data-pref` | `html[data-ai-motion]` | rAF requested / fired | canvas.lac-gl | Running animations inside `.lac` | `.lac-blob > i` animation-name | SSR |
| --- | ---: | --- | --- | --- | ---: | --- | ---: | --- | --- |
| `prefers-reduced-motion: reduce`, setting `system` | 10017 ms | static | system | system | 0 / 0 | no | 0 | none, none, none | `data-tier="static"` in HTML: yes, `<canvas`: no, `data-ai-motion`: system |
| setting `off` (header control), same page | 10013 ms | static | off | off | 0 / 0 | no | 0 | none, none, none | webgl2 contexts created 1, `webglcontextlost` after release 1 |
| setting `off`, after reload (server-rendered preference) | 10004 ms | static | off | off | 0 / 0 | no | 0 | none, none, none | `data-tier="static"` in HTML: yes, `<canvas`: no, `data-ai-motion`: off |

Before the toggle the same page ran the `webgl` tier (canvas yes); the toggle switched it to `static` (transitions: data-state=idle@3217ms, data-tier=webgl@3217ms, data-pref=system@3217ms, data-tier=static@3292ms, data-pref=off@3292ms). Restored at the end: `data-ai-motion`=system, tier webgl. rAF callers in the windows: reduced {}, off {}, off after reload {}.


## Analysis and status (hand-written, task MS 2026-09-05, follow-up 2)

**Scope.** Re-measurement of the Living AI Core budget on the rebuilt bundle `BUILD_ID 9ZJAGzR3pMhmuGkmeGTk8` (task FX: D17 upgrade gate, D18, D20, D21; `.next` was not rebuilt in this task). Server: `pnpm --filter @track-site/web start -p 3016` with `HOST_MARKETING=http://localhost:3016 HOST_APP=http://localhost:3016/app AI_DEV_FIXTURES=1 OPENAI_API_KEY=sk-qa-stub-no-provider` (`server-3016.log`; the served `/app` HTML references `/_next/static/9ZJAGzR3pMhmuGkmeGTk8/`). Stored owner session `apps/web/e2e/.auth/owner.json` (`ts.session_token` expires 2026-09-19; `GET /app` with the cookie → 200, without → 307 `/en/login?next=%2Fapp`, so the setup project was not needed). Browser for every check: chromium headless shell `chromium_headless_shell-1234` with `--use-angle=d3d11` (hardware ANGLE/D3D11, `../../followup/living-core/webgl-probe.json`); the shell reports `hardwareConcurrency` 8, `deviceMemory` 32, `saveData` false (`lighthouse/tier-checks.json` → `device`), so the D17 device rule classifies this machine as *not* constrained unless a coarse pointer is emulated.

### (c) Lighthouse static vs. animated — D17 re-measured: **pass, −1 point** (was −6)

Same method as the first follow-up (`living-core-lighthouse.mjs`: mobile preset, simulated 4× CPU / 1.6 Mbps, screen emulation widened to 1280 × 800 @ DPR 2 with touch kept so the Track AI panel is docked and open, stored-session cookie header, preference saved through the real settings form before each group and restored to `system` at the end — `lighthouse/run.log`), 3 runs per setting, docked variant only (as tasked; the phone variant is a control in which the core is not mounted).

| Setting (docked) | Tier under this emulation (`lighthouse/tier-checks.json`) | Perf runs → median | LCP | TBT | CLS |
| --- | --- | --- | ---: | ---: | ---: |
| `off` (static panel) | `static`, no canvas | 82 / 79 / 81 → **81** | 4.69 s | 107 ms | 0.008 |
| `system` | `css` — `(pointer: coarse)` matches under the mobile emulation, so the device rule keeps `system` on the CSS tier (final; no gate armed) | 80 / 81 / 80 → **80** | 5.00 s | 99 ms | 0.008 |
| `full` | `webgl` — upgrade observed 3105 ms after the load event (`webglAtMs`), i.e. after load + 3 s + idle callback; `css` before that | 80 / 80 / 80 → **80** | 5.01 s | 95 ms | 0.008 |

Delta animated − static (medians, `lighthouse/summary.json` → `deltas`): `system` **−1 point**, LCP +315 ms, TBT −8 ms, CLS 0.000; `full` **−1 point**, LCP +320 ms, TBT −12 ms, CLS 0.000. Target ≤ 3 points: **met for both**. Compared with the first follow-up on build `JkuZkqiqEn0HgN4FIDCyT` (`../../followup/living-core/lighthouse/summary.md`: `off` 77, `system` 71, `full` 71, TBT +209 / +198 ms) the TBT penalty of the animated panel is gone (the median TBT of the animated groups is now *below* the static one, main-thread work 1.41 s vs 1.45 s, script boot-up 638 / 664 ms vs 675 ms) — the renderer chunk and its first frames no longer run inside the load window. Note that the static baseline itself also moved (77 → 81; TBT 221 → 107 ms), so the absolute scores are not comparable across builds, only the deltas within one run are.

### (a) Idle long tasks with the panel docked on the WebGL tier — **pass, 0 long tasks in all three phases**

`living-core-budget.mjs --mode longtasks` (fixed in this task to run the phases the acceptance text names: 120 s idle without input, then 60 s of wheel scrolling over the main area, then 60 s of typing into the composer — previously one interleaved 120 s phase), desktop viewport 1440 × 900 @ DPR 1 without touch emulation, preference `system`. `longtasks-d3d11.json`, `longtasks.log`, `longtasks-stdout.log`:

- WebGL tier confirmed before the idle window started: `tierAfterLoad` = `webgl`, `core.idleStart.tier` = `webgl` (data attribute `data-tier` of `[data-testid="living-ai-core"]`, read as `webgl` 3.1 s after navigation — `core.data-tier=webgl@3111 ms`, the first 250 ms poll after the flip); the tier stayed `webgl` through the end of the typing phase (`core.typeEnd.tier`).
- Idle, 120.0 s: **0** `longtask` entries (`PerformanceObserver`, buffered, installed before any application script; `longTaskObserverError` null). 7201 `requestAnimationFrame` callbacks (60 / s — the frame loop asks for every vsync and skips draws by the clock to stay ≤ 30 fps), callback duration p50 0.1 ms / p95 0.3 ms / max 0.4 ms, 0 callbacks > 16 ms.
- Scrolling, 60.1 s, 253 wheel events: **0** long tasks; rAF callback p95 0.3 ms, max 0.4 ms.
- Typing, 60.6 s, 1280 characters (Ctrl+A / Backspace every 240 characters): **0** long tasks; rAF callback p95 0.3 ms, max 0.6 ms. The only state change of the whole run is the composer focus (`idle → listening` at 188.4 s).
- Chrome trace recorded over the same 241 s (`devtools.timeline`, `v8.execute`, `toplevel`; 1 632 974 events, 341 MB — kept outside the pack at the scratchpad path recorded in `longtasks-d3d11.json` → `traceFile`; the compact analysis is `longtasks-d3d11.trace-summary.json`): the renderer main thread (`CrRendererMain` 34784:43784) ran 158 971 top-level tasks, **none ≥ 32 ms** — histogram < 4 ms 156 146, 4–8 ms 1 769, 8–16 ms 1 050, 16–32 ms 6, ≥ 50 ms 0. The six 16–32 ms tasks all fall in the typing phase and are input handling, not the animation: the longest is 18.5 ms at 180.25 s (`EventDispatch focusin` 12.3 ms + microtasks when the composer was clicked), 17.6 ms at 187.9 s (React `Commit` 15.7 ms + `Paint` for the first keystrokes), 16.9 ms (`keypress` / `textInput`). Main thread busy 21.5 % of the 241 s window overall, dominated by the typing phase (`EventDispatch keypress` / `textInput` / `input`: mean 7.4 ms per keystroke, max 16.4 ms — the composer's per-keystroke React work, not the core); the animation's own per-frame main-thread cost is small: `FireAnimationFrame` mean 0.22 ms × 14 453, `Commit` mean 0.20 ms, `Paint` mean 0.67 ms × 3 884 (`topEventTypesByTotalMs`). Nested `RunTask` / `ThreadControllerImpl::RunTask` pairs make each of the longest tasks appear twice in `longestTasks`.

Verdict for the acceptance criterion "the idle animation causes no attributable long tasks > 50 ms; scrolling, typing and buttons stay smooth": met on this machine (hardware ANGLE/D3D11); real reference devices remain owed (D16 device lab).

### (d) Reduced motion and setting `off` on the rebuilt bundle — **pass, 0 animation frames**

`--mode motion` (`motion-off.json`, `motion.log`): `prefers-reduced-motion: reduce` with setting `system` → `data-tier="static"`, 0 rAF requested / 0 fired in a 10 017 ms window, no `canvas.lac-gl`, 0 running animations inside `.lac`, keyframes `none`, SSR HTML carries `data-tier="static"` and no `<canvas`. Setting `off` through the header toggle on a page that was on the `webgl` tier → `static` 75 ms after the click (`data-tier=webgl@3217 ms → static@3292 ms`), the WebGL2 context was released (`webglcontextlost` 1 for 1 context created), 0 / 0 rAF in 10 013 ms; after a reload with the persisted `off`: `static`, 0 / 0 rAF in 10 004 ms, SSR static without canvas. Restored at the end: `data-ai-motion="system"`, tier `webgl` again (the gate re-armed after the preference change, docs/15 §2 "Preference changes").

### (b) 30-minute soak with state changes every 20 s — **pass, growth bounded (tracks the transcript, not the core)**

`--mode soak --soak-min 30 --sample-s 60 --step-s 20` (`soak.json`, `soak-samples.csv`, `soak.log`, `soak-stdout.log`; the harness was fixed to take an additional forced-GC sample at minute 5, as the criterion "minute 5 vs minute 30 after a forced GC" requires). 2026-09-05 16:13:55 → 16:44:06 UTC, 30.0 min, desktop viewport, preference `system`, tier `webgl` from the first sample to the last (`tierValues` = `["webgl"]`). 89 interaction steps, 0 failed: composer focus / blur, 44 stubbed turns at the `fetch` boundary (29 success streams `activity.started → activity.completed → assistant.message → ui.final → done`, 15 failed runs `activity.started → activity.failed → done`; no request reached the server, `OPENAI_API_KEY` is a placeholder anyway). `data-ai-state` writes: idle 16, listening 45, working 44, streaming 29, success 29, blocked 15 — every state of the state table except `approval_required` was entered, each from a real composer interaction or a contract event applied by the real store. Transcript 26 → 99 messages (the stubbed turns stay in the client store for the life of the page).

GC'd samples (`HeapProfiler.collectGarbage` before `Performance.getMetrics` / `Runtime.getHeapUsage`):

| Sample | t | Msgs | JS heap used MB | Nodes (Chrome) | DOM elements (page) | JSEventListeners (Chrome) | Listener ledger net (page) | Canvas / `.lac-gl` | WebGL2 created / lost | IO / RO / MO net |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| start-gc | 0 s | 26 | 6.04 | 1017 | 792 | 380 | 314 | 1 / 1 | 1 / 0 | 2 / 2 / 3 |
| m5-gc | 302 s | 37 | 7.58 | 1126 | 866 | 390 | 327 | 1 / 1 | 1 / 0 | 2 / 2 / 4 |
| m10-gc | 610 s | 51 | 8.39 | 1250 | 961 | 390 | 327 | 1 / 1 | 1 / 0 | 2 / 2 / 4 |
| m20-gc | 1210 s | 76 | 8.78 | 1453 | 1126 | 390 | 327 | 1 / 1 | 1 / 0 | 2 / 2 / 4 |
| end-gc | 1802 s | 99 | 9.21 | 1630 | 1279 | 391 | 327 | 1 / 1 | 1 / 0 | 2 / 2 / 4 |

- **Minute 5 vs minute 30 (both after a forced GC):** JS heap 7.58 → 9.21 MB (**+1.63 MB, +21.5 %**) while the transcript grew by 62 messages (37 → 99) — 26 KB per message of retained message state + DOM, and the per-message increment falls over time (m5→m10 58 KB / message, m10→m20 16 KB, m20→end 19 KB). Chrome nodes 1126 → 1630 (+504 = 8.1 nodes per added message; the page's own element count 866 → 1279 grows in step). Both series are functions of the transcript length, not of elapsed time or of the number of state changes: the growth is bounded by what the chat keeps on screen. The un-GC'd heap oscillated between 8.26 and 12.68 MB (`soak-samples.csv`, sawtooth of young-generation garbage, always reclaimed).
- **Listeners:** Chrome's `JSEventListeners` after GC 380 → 390 → 390 → 390 → 391 (flat; the un-GC'd readings between 391 and 1951 are transient listeners of in-flight streams / React that every GC reclaims). The in-page `addEventListener` ledger: net 314 before the first turn, **327 from minute 5 to the end** (8069 added / 7742 removed over the run — every registration of the 44 turns was removed again). The only per-type changes between the first and the last sample are +1 on twelve pointer / mouse / touch types plus the `__playwright_global_listeners_check__` marker, i.e. Playwright's own actionability listeners, not the application's.
- **Canvas / WebGL / observers:** exactly 1 `<canvas>` (= 1 `canvas.lac-gl`), 1 WebGL2 context created over the whole run, 0 `webglcontextlost`; IntersectionObserver 2 and ResizeObserver 2 net throughout, MutationObserver net 3 → 4 after the first interaction and constant afterwards (the harness's own attribute observer is among them). No second renderer, no re-created context.
- **Frames:** 108 446 rAF callbacks in 1802 s (60.2 / s, unchanged rate), callback p95 0.3 ms, max 3.5 ms; all but two of them come from the renderer chunk's frame loop (`rafByCaller`: two single requests by the page's inline scripts at load).
- **Long tasks over the page's whole life:** exactly one `longtask` entry, **83 ms at 3.01 s after navigation** (PerformanceObserver attribution `unknown` / `window` — Chrome names only the container), i.e. during load and before the soak's first sample, coinciding with the WebGL upgrade (the harness read `data-tier="webgl"` 3.1–3.2 s after navigation in every run of this task — 3111 ms long-task run, 3217 ms motion run, 3237 ms soak, first 250 ms poll after the flip — and the Lighthouse tier check saw the flip 3105 ms after the load event). None during the 30 minutes of state changes. The upgrade is by design outside the load window (docs/15 §2) and outside every idle window measured here; the renderer import + shader compile + first frame is where its cost lands. Recorded as an observation, not as a failure of the "idle animation" criterion.

### Lighthouse LCP delta (+315 / +320 ms): what the reports say

`lighthouse/lcp-elements.json` (from the `lcp-breakdown-insight` audit of each report): the LCP element is the same text paragraph of the main area in all nine runs (`div.space-y-6 > section.grid > article > p.mt-2`, "No configuration version is active in the Production environment …"), so the delta is not a different element. The observed (unthrottled) subparts are *not* higher for the animated settings — TTFB 50–80 ms + element render delay 322–351 ms for `system` / `full` vs 74–436 ms + 310–383 ms for `off` — and FCP is identical (1.67–1.70 s in all runs); the +0.3 s exists only in the simulated (Lantern) LCP value, whose per-run spread in the first follow-up was 0.36 s inside the `off` group alone. The cause was not isolated in this task; it is recorded as an open observation ("LCP darf sich nicht materiell verschlechtern": +6.7 % simulated, 0 % observed), not as a failure.

### Status against the acceptance criteria (supplement §9) after this run

| Criterion | Status on build `9ZJAGzR3pMhmuGkmeGTk8` | Evidence |
| --- | --- | --- |
| Median of 3 mobile Lighthouse runs at most 3 points below the static chat version | **pass** — `system` −1, `full` −1 (docked, core mounted); D17 closed by measurement | `lighthouse/summary.md`, `summary.json`, `tier-checks.json`, 9 raw reports, `run.log` |
| Idle animation causes no attributable long tasks > 50 ms; scrolling, typing, buttons smooth | **pass** on this machine — 0 long tasks in 120 s idle / 60 s scroll / 60 s typing on the `webgl` tier; longest main-thread task in the trace 18.5 ms (input handling) | `longtasks-d3d11.json`, `longtasks-d3d11.trace-summary.json`, `longtasks.log` |
| ≥ 30-minute run with state changes: no continuous memory / listener / canvas / WebGL growth | **pass** — GC'd heap +1.63 MB minute 5 → 30 for +62 transcript messages, listeners flat (390 → 391 Chrome, ledger 327 constant), 1 canvas / 1 context / 0 lost throughout | `soak.json`, `soak-samples.csv`, `soak.log` |
| Reduced motion / setting `off`: no continuous animation frames | **pass** (re-confirmed on the rebuilt bundle) — 0 rAF in 3 × 10 s, static tier, SSR static, context released | `motion-off.json`, `motion.log` |
| Hidden tab, real devices (Safari/iOS, Chrome/Android, Edge), Firefox, 200 % zoom, visual comparison, INP | **not run** in this task (unchanged from docs/16 D10 / D16 / D19) | — |

### Harness fixes made in this task (`apps/web/scripts/qa/living-core-*.mjs`, allowed "fixes only")

- `living-core-budget.mjs`: the `longtasks` interaction phase is split into a wheel-only `scroll` phase and a keys-only `type` phase (`--scroll-s`, `--type-s`, default 60 s each; `--interact-s N` maps to N/2 each), matching the tasked sequence; the `soak` mode takes a forced-GC sample at minute 5 in addition to 10 / 20 / 30.
- `living-core-lighthouse.mjs`: `verifyTier` polls the tier for up to 15 s instead of reading it once at 6 s (the WebGL tier now appears only after load + 3 s + idle), records the 6-s reading, the time of the `webgl` flip and the device hints `navigator.hardwareConcurrency` / `deviceMemory` / `connection.saveData`.
- `living-core-report.mjs`: renders the new phases and takes the server port from the `server-<port>.log` file in the directory.

### Environment notes and limits

- One machine, one browser build (chromium headless shell 1234 with hardware ANGLE/D3D11); Lighthouse 13.4.1 with simulated throttling. The Lighthouse `system` group runs the **CSS** tier (mobile emulation → coarse pointer → constrained device rule), the `full` group the **WebGL** tier: on a real coarse-pointer device `system` never upgrades, so the two groups bracket both animated tiers.
- The long-task / soak / motion runs use a desktop viewport (1440 × 900, fine pointer) so that `system` upgrades to `webgl` (`hardwareConcurrency` 8 on this machine; a 4-core machine would stay on CSS by the D17 rule).
- The 341 MB Chrome trace of the long-task run is not part of the pack (size); its compact analysis and the path are in `longtasks-d3d11.trace-summary.json` / `longtasks-d3d11.json`. The trace analysis (3 s of CPU) ran at 16:15:21 UTC, during minute 2 of the soak, and a 10-minute wait loop of the orchestrating session ran throughout; neither affects the memory / listener series.
- Nothing was committed; the persisted `ai_motion` preference of the seeded owner was restored to `system` by both the Lighthouse runner and the motion check; the server on 3016 was stopped (0 listeners on the port, no headless-shell process left).
