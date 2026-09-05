# 15 - Living AI Core

The ambient layer of the Track AI panel (owner supplement §9 "Living AI Core", "Technische Progressive-Enhancement-Architektur", "Kontrolle, Barrierefreiheit und Lesbarkeit", "Verbindliche Abnahmekriterien"). Code: `apps/web/src/components/app/shell/living-ai-core/**`, styles: the `.lac-*` block in `apps/web/src/app/globals.css`, wiring: `assistant-panel.tsx` (ambient slot + header control).

The layer is decorative. It only conveys **that** Track AI waits, listens, works, streams, needs an approval, finished or is blocked; the localized activity sentences, cards and error texts remain the authoritative status. Nothing in it is derived from chain-of-thought, reasoning tokens, token counts or invented progress, and it never produces analytics, fingerprinting data or requests.

## 1. Architecture

| Piece | File | Responsibility |
| --- | --- | --- |
| `LivingAICore` | `living-ai-core.tsx` | The swappable component. Props are exactly `{ state, motion, mode, now? }`. Renders the static markup on the server, resolves the tier on the client, lazily loads the WebGL renderer, owns the frame loop and every observer/listener, releases everything on unmount. No React state per frame. |
| State machine | `state-machine.ts` | Pure, clock-injected: priority resolution, 400–700 ms interpolation, one-shot success wave, integrated breathing phase, the state → parameter table. No hold of its own — hysteresis belongs to the state source (below). |
| Shapes | `blobs.ts` | Pure layout of the 5 shapes (position, radius, colour) from a machine sample: rise, drift, merge (working), lean (listening), contract (blocked). |
| Tier logic | `tier.ts` | `effectiveMotion`, `selectTier`, the frame-budget monitor, frame interval and render scale. |
| Renderer | `webgl-renderer.ts` | WebGL2 metaball fragment shader, full-screen triangle, uniforms only; `null` when WebGL2 is unavailable or a major performance caveat exists; handles `webglcontextlost`; `dispose()` releases program, shaders, VAO and the context. Loaded with `import()` after idle. |
| Preferences | `preference.ts` | External stores (`useSyncExternalStore`) for `<html data-ai-motion>` (per-user setting) and `prefers-reduced-motion`; `useHydrated`; coarse-pointer detection. |
| State source | `assistant-ambient.tsx` → `useAssistantUiState()` (`components/chat/assistant-ui-state.ts`) | The panel has **one** motion state source. `useAssistantUiState` derives the state from the assistant store's `ChatState` (status `idle` / `sending` / `working` / `streaming` / `reconnecting`, approval, error, the activities of the turn with their latest phase, the verified outcome, draft, composer focus) with the fixed priority, a 500 ms minimum hold per state (`UiStateDebouncer`, latest target after the hold wins) and the 900 ms success hold, all on an injectable clock. `AssistantHost` writes the same value to `data-ai-state` on the panel container; `AssistantAmbient` (the panel's default ambient content) passes it to `<LivingAICore state>` together with the user's motion preference — so `data-ai-state` and the core's `data-state` are always the same value and an e2e/visual test may bind to either. |
| Control | `motion-control.tsx` | Header button "Pause AI motion" / "Turn AI motion on" (state carried by the accessible name and icon, deliberately no `aria-pressed` alongside a changing label). Writes `off` / `system` optimistically to `data-ai-motion` and persists it through `updateAiMotionAction` (audited); a failed save reverts and is announced in a live region. Labels: `shell.assistant.motion.*` ×6. |

The panel's ambient slot is `absolute inset-0 -z-10 overflow-hidden`, `aria-hidden`, `pointer-events-none`. The core itself is `position: absolute; inset: 0; contain: strict; isolation: isolate; transform: translateZ(0)`; the animated region (`.lac-core`) is the top 14 rem (24 rem in `onboarding` mode) with a static mask that fades to transparent towards the message area, plus a thin static edge accent over the full panel height. Changing state or tier only changes data attributes, custom properties, `transform` and `opacity` — never width, height, margins, padding, scroll position, focus or hit areas. The unit test `living-ai-core.dom.test.tsx` ("geometry invariants") checks that the element tree, class names and inline styles are identical across all states and tiers.

## 2. Tiers

| # | Tier | When | What renders |
| --- | --- | --- | --- |
| 1 | `static` | SSR / before hydration; `prefers-reduced-motion: reduce` with setting `system`; settings `reduced` and `off` | `.lac-base`: three radial gradients from the theme tokens (`--color-primary-soft`, `--color-violet-soft`, `--color-cyan-soft`), so light and dark are correct before any script runs. States are static colour accents (`.lac-edge`, `.lac-halo`, base opacity). `reduced` keeps 600 ms opacity cross-fades between states; `off` disables every transition (`[data-pref="off"]`). No keyframes, no `requestAnimationFrame`, no canvas. |
| 2 | `css` | Hydrated and motion allowed while WebGL is not ready, unavailable, failed, lost or downgraded | Three radial-gradient shapes (`.lac-blob`) whose inner element runs `lac-drift-a/b/c` keyframes (16 / 17.5 / 14.5 s) and whose wrapper takes state offsets — transform and opacity only. Approval and blocked pause the keyframes; success runs the one-shot `lac-wave` (800 ms). |
| 3 | `webgl` | Hydrated, motion allowed, `requestIdleCallback` fired, `createWebglRenderer` succeeded | 5 metaballs in cobalt, violet and cyan (light/dark variants) with breathing, rise, merge, lean, contract, halo, outline, edge and the success ring, drawn from the machine sample every frame. The canvas fades in over the CSS shapes (`.lac-gl` opacity transition) and out again on a downgrade. |

Motion setting → effective behaviour (`effectiveMotion`): `off` → static, `reduced` → static, `system` → follows the OS, `full` → animated (explicit user choice, even under an OS `reduce`). The elements carry `data-motion="essential"` so the global reduced-motion rule of the design system does not override the component's own resolution.

Fallbacks are silent: `selectTier` returns `css` whenever WebGL is `unknown`, `loading`, `unavailable`, `failed` or the frame budget was missed persistently; the chat is never affected.

## 3. State table

Priority when facts compete: `blocked > approval_required > working > streaming > success > listening > idle` (`CORE_STATE_PRIORITY`).

| State | Source (real UI/backend fact) | Parameters (`STATE_PARAMS`) | Visible behaviour |
| --- | --- | --- | --- |
| `idle` | no active turn, no approval | period 16 s, amplitude 0.35, speed 1 | very slow breathing (14–18 s per cycle), low amplitude, calm open shapes |
| `listening` | focus in the composer or a started draft | lean 1, halo 0.7 | one shape leans towards the composer, subtle cyan halo; no per-keystroke change |
| `working` | chat status `sending` (request in flight), `working` (`activity.started`, `job.progress`) or `reconnecting` (the same turn is resumed) | period 11 s, speed 1.6, merge 1, glow 0.35 | two to three shapes merge into a calm directed flow towards the activity line; more energy, no fake progress |
| `streaming` | released assistant output being transferred | speed 1.1, merge 0.3, glow 0.6 | minimal light flow at the core; never a change per token (repeated identical requests are no-ops) |
| `approval_required` | pending approval card (`ui.approval` / `approval.required`) | speed 0.06, amplitude 0.1, outline 1, contract 0.1 | motion almost stops; calm amber outline; no blinking |
| `success` | verified success outcome (`ui.final` without error, also from a confirmed action) while the turn is at rest (`idle`), no error, no failed tool run; held 900 ms from the outcome's timestamp by the state source | wave 0 → 1 over 800 ms | one restrained emerald expansion wave, then a soft return to idle |
| `blocked` | chat error (`error` event, failed request, lost stream) / a tool run of the turn that ended in `activity.failed` or `activity.blocked` / a verified blocked outcome of the final answer. A block that only asks for a confirmation (`CONFIRMATION_REQUIRED`) belongs to `approval_required`, never here | speed 0.12, amplitude 0.08, contract 0.7, edge 1 | shapes contract and become almost static; muted amber/red edge; never shaking or strobing |

Hysteresis lives in the state source only: `useAssistantUiState` holds every state for at least 500 ms and applies the latest target once the hold has elapsed, so bursts of backend events never flicker and per-keystroke store updates (an unchanged target) never restart anything. The machine adds no second hold — a requested state is committed at the next sample (frame) — which keeps the host's `data-ai-state` and the core in step. After a commit every parameter interpolates from its *current* value to the target over 550 ms with an ease-in-out curve (window 400–700 ms); an interrupted transition continues from where it is. `success` is a one-shot that always completes: a state requested while the 800 ms wave runs is committed on the sample that ends the wave (the source may release `success` after its 500 ms minimum hold), and on the CSS tier `.lac-wave` retracts through a transition instead of popping away when the state leaves early. The breathing phase is integrated with the state's speed, so slowing down never snaps a shape.

## 4. Performance budget

- Frame rate: ≤ 30 fps (`frameInterval`), ~22 fps on coarse-pointer devices. Frames are skipped by comparing the injected clock, never by frame counting.
- Resolution: canvas backing store = CSS size × min(DPR, 1.5) (1.25 on coarse pointers), upscaled by the browser.
- Work per frame: one `drawArrays` of a full-screen triangle, 5 shapes, 16 uniform writes into pre-allocated `Float32Array`s. No allocations, no React state, no DOM writes.
- Frame budget: `createFrameBudget` ignores 12 warm-up frames, then keeps a window of 30 rendered frames; when 40 % of the intervals exceed 2.5 × the target interval the renderer stops, the canvas fades out (700 ms) and the context is released — the CSS tier stays for the rest of the mount.
- Pausing: Page Visibility (`visibilitychange`), `IntersectionObserver` on the root (off-screen panel), unmount (minimised panel, closed drawer/sheet). A paused renderer produces no frames at all.
- Failure paths: `getContext` exceptions, `failIfMajorPerformanceCaveat`, shader compile/link errors → `null` → CSS; `webglcontextlost` → `failed` → CSS; import failure → CSS.
- Cleanup on unmount: the pending `requestAnimationFrame`, `requestIdleCallback` / timers, the `IntersectionObserver`, the `ResizeObserver`, the `visibilitychange` and `webglcontextlost` listeners, program, shaders, VAO and the context (`WEBGL_lose_context`).
- Not done on purpose: no `will-change` by default, no full-viewport blur, no SVG goo filters, no animated `backdrop-filter`, no renderer/GPU queries.

Acceptance evidence still owed by phase 7 (needs a browser): Lighthouse median on mobile within 3 points of the static panel, long-task check while idle, 30-minute soak for memory/listeners, the visual comparison ("ruhig, lebendig, hochwertig") and the cross-browser matrix.

## 5. Accessibility and control

- The core and everything inside it are `aria-hidden`, `pointer-events: none` and outside the tab order; the chat stays plain HTML.
- Text and controls keep WCAG 2.2 AA in both themes: the light tier alpha is ≤ 0.2 of the accent colours over `surface`, the dark tier ≤ 0.28, and the mask fades the layer out before the message area.
- `prefers-reduced-motion` is honoured without a flash: SSR paints the static tier, the client only enables keyframes after the effective motion resolved to `animated`; `reduced` and `off` never run keyframes or frames.
- The per-user setting (`workspace_preferences.ai_motion`, Settings → AI motion) has four values; the panel header adds a directly reachable pause / turn-on toggle that writes the same preference through the same audited action.
- No blinking, strobing, shaking, fast brightness changes or large zoom/parallax anywhere in the state table.

## 6. Testing with injected time

Every time-dependent piece takes a clock:

```ts
const clock = { t: 0, now: () => clock.t };
const machine = createCoreStateMachine({ now: clock.now });
machine.request("working");
const a = machine.sample();  // committed at once (no hold of its own): progress 0, params = idle
clock.t = 550;               // 550 ms later
const b = machine.sample();  // progress 1, params = working
```

`<LivingAICore now={clock.now} …/>` uses the same clock for frame pacing, the frame budget and the machine; tests drive `requestAnimationFrame` manually, so the picture for a given `(state, t)` is deterministic — the basis for visual-regression snapshots.

The state source takes a clock of the same kind: `useAssistantUiState({ clock, minHoldMs, successHoldMs })` compares `clock.now()` with the store's `outcome.at` (a `Date.now()` timestamp) and schedules the hold and the success expiry through `clock.setTimeout`, so both are exact in tests (`resolveUiState`, `inputsFromChat` and `UiStateDebouncer` are the pure parts, tested in `components/chat/assistant-ui-state.test.ts`). Tests of the wired panel run on Vitest's fake timers and advance them by `DEFAULT_MIN_HOLD_MS` after every store change before reading the core's `data-state`.

| Test file | Covers |
| --- | --- |
| `state-machine.test.ts` | priority for every pair, commit on the next sample without a hold of its own, withdrawn requests, 400–700 ms transitions, interrupted transitions, no restart on repeated requests, success one-shot that completes before a state requested meanwhile applies, breathing slow-down, determinism |
| `tier.test.ts` | effective motion, tier matrix (no WebGL → CSS, reduced/off → static, downgrade → CSS), frame budget, frame interval, render scale |
| `blobs.test.ts` | determinism, bounds, merge/lean/contract effects |
| `living-ai-core.ssr.test.tsx` | SSR output is deterministic, static, token-based, without canvas/script/inline geometry |
| `living-ai-core.dom.test.tsx` | tier selection in a DOM (no WebGL → CSS, reduced → static, WebGL → frames at ≤ 30 fps, budget miss → downgrade, context loss → CSS, hidden tab pause), lifecycle cleanup, geometry invariants |
| `assistant-panel.test.tsx` | ambient slot attributes, default ambient inside the provider driven through the store's public API on a fake clock (the single 500 ms hold, tool runs → working, confirmation + approval → approval_required, failed run → blocked, draft/focus → listening without restarts on typing, `ui.final` → success for the hold, then idle), header control (labels, no `aria-pressed`, optimistic write, persist, revert on failure) |
| `components/chat/assistant-ui-state.test.ts` (other slice) | the source itself: priority, `inputsFromChat` (store vocabulary → facts, confirmation blocks vs. failures, success only at rest), the debouncer's hold and determinism on an injected clock |

Run: `pnpm --filter @track-site/web test -- living-ai-core assistant-panel`.
