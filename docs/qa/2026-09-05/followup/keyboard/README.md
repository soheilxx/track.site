# Mobile on-screen keyboard vs. composer and last message (task E3, defect D16)

Owner supplement §9: "Die Bildschirmtastatur darf weder Composer noch letzte Nachricht verdecken"; §9 acceptance criteria for the Living AI Core: "verursacht `CLS = 0`, verändert keine Scrollposition und verdeckt weder Composer noch letzte Nachricht bei geöffneter Bildschirmtastatur"; docs/16 §9 D16 and §10 "Mobile on-screen keyboard does not cover the composer — not run". Every number below is read from a file in this directory.

## Method

Permanent e2e test `apps/web/e2e/app.spec.ts` → `mobile on-screen keyboard › the sheet follows the visual viewport: composer and last message stay visible above the keyboard, nothing shifts` (Playwright `chromium` project = Chromium headless shell 1234, stored owner session, `AI_DEV_FIXTURES=1` server):

1. Touch device 375 × 812 (`isMobile`, `hasTouch`), `/app?ai_fixture=long-conversation` (250 synthetic messages), tap the launcher → bottom sheet (`role="dialog"`, `100dvh`), tap the composer → focused, last message `fixture-249` visible.
2. `PerformanceObserver({ type: "layout-shift" })` installed, then the keyboard is emulated by shrinking the viewport to 375 × 430 (`page.setViewportSize`). Both mechanisms of the sheet resolve to the same 430 px in this emulation: `h-dvh` and the `visualViewport` `resize` listener in `assistant-host.tsx` (`height = visualViewport.height`, `translateY(offsetTop)`).
3. Geometry is read before and after (`keyboard-metrics.json`: visual viewport, sheet, context line, transcript region with `scrollTop` / `clientHeight`, last message, composer, focus), the layout-shift entries of the resize window (500 ms) and of a 1.5 s idle window with the keyboard "open" and the Living AI Core animating are recorded, screenshots are taken before and after; then the viewport is restored to 812 px and the last message and the focused composer are checked again.

Why a viewport resize and not a visual-viewport-only override: `cdp-viewport-probe.mjs` (`cdp-viewport-probe.log`, Chromium 151.0.7922.34) shows that neither `Emulation.setDeviceMetricsOverride` with a `viewport` override (`{x: 0, y: 382, width: 375, height: 430, scale: 1}`) nor `Emulation.setVisibleSize 375x430` changes `window.visualViewport.height` (stays 812, `innerHeight` 812, sheet 812) in headless Chromium; only `page.setViewportSize` yields `visualViewport.height` 430 (with `innerHeight` 430). The behaviour of a real Android Chrome ≥ 108 / iOS Safari keyboard (visual viewport shrinks, layout viewport stays) is therefore not reproducible in this lab; the sheet's `visualViewport` listener is exercised through the same event (`resize`) with the same resulting height. A device-lab run stays owed (see "Not covered").

## Result

| Measure (after the resize to 375 × 430) | before the fix (`before-fix/keyboard-metrics.json`, build `JkuZkqiqEn0HgN4FIDCyT` of `apps/web/.next`) | after the fix (`after-fix/keyboard-metrics.json`, build `.next-e3` = `2p2BhUEe9szAqx7yJQBwy`, `../state/build-next-e3.log`) |
| --- | --- | --- |
| `visualViewport` | 375 × 430, offsetTop 0 | 375 × 430, offsetTop 0 |
| sheet (`[data-testid="assistant-panel"]`) | top 0, height 430 | top 0, height 430 |
| document height ≤ viewport | true | true |
| transcript region | top 123, bottom 341, clientHeight 600 → 218, `scrollTop` 21 352 (unchanged) | top 123, bottom 341, clientHeight 218, `scrollTop` 21 352 → 21 734 |
| last message `fixture-249` | **top 631, bottom 707 — below the 430 px viewport, hidden "behind the keyboard"** | top 249, bottom 325 — inside the transcript region, above the composer |
| composer | top 354, bottom 418, focused | top 354, bottom 418, focused |
| layout shifts during the resize | 1 entry, value 0.1839, `hadRecentInput: true` (Chromium attributes shifts of a viewport resize to input; excluded from CLS) | 1 entry, value 0.1839, `hadRecentInput: true` |
| layout shifts in the 1.5 s idle window (keyboard open, core animating) | none | none |
| e2e | **failed**: `expect(after.lastMessage.bottom).toBeLessThanOrEqual(after.list.bottom + 1)` — expected ≤ 342, received 707 (`e2e-keyboard-before-fix.log`) | **passed** (`e2e-keyboard-after-fix.log`) |

Screenshots: `before-fix/keyboard-before.webp` (812 px, before the resize), `before-fix/keyboard-after.webp` (430 px: composer visible, transcript shows messages #245/#246 and the last message is cut off below), `after-fix/keyboard-before.webp`, `after-fix/keyboard-after.webp` (430 px: last message #250 directly above the composer). All WebP ≤ 150 KB (`webp.mjs`).

## Root cause and fix

The sheet itself followed the keyboard (height and `translateY` from `visualViewport`), and the composer at the bottom of the sheet stayed visible — but the transcript is a scroll container whose `scrollTop` the browser keeps when its height shrinks: with the reader at the end (`scrollTop` = `scrollHeight` − 600), a `clientHeight` of 218 leaves the last 382 px of the conversation, i.e. the last message, below the visible part of the list. Nothing in `AssistantMessages` re-anchored the end of the list after a container resize (the autoscroll effect reacts to messages, activities, heights and turn state only, and the `ResizeObserver` of the windowed list only re-measures the viewport).

Fix (`apps/web/src/components/chat/assistant-chat.tsx`, `AssistantMessages`): one `ResizeObserver` on the scroll container; when its `clientHeight` changes and the reader is at the end (`atBottom.current`), `scrollTop = scrollHeight` (DOM only, no React state per resize) and the windowing viewport is synced. A reader who scrolled up keeps the position (`atBottom` false), so the "Show new messages" behaviour is unchanged. The unit tests of the panel and the chat (`assistant-chat.test.tsx`, `assistant-panel.test.tsx`: 15 passed) run without `ResizeObserver` (jsdom), where the effect is a no-op.

## Not covered

- A real on-screen keyboard on a device (Android Chrome / iOS Safari resize only the visual viewport; the emulation resizes the layout viewport, so `100dvh` and the `visualViewport` listener are not distinguished). Owed: device-lab or an emulator with a virtual keyboard.
- Firefox / WebKit: not run here (the task runs the `chromium` project; the stored-session setup and the spec target Chromium).
