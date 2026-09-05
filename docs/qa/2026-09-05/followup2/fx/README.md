# Task FX — D17 + D18 + D20 + D21 (2026-09-05, follow-up 2)

Fixes in the working tree (no commit), gates run from `apps/web` on Windows 11 / Node 24.18.0 / pnpm. No server was started in this task (no port assigned), so nothing here is a browser measurement; the Lighthouse re-run for D17 and the WebKit e2e re-run for D18/D20/D21 are owed to the tasks that own a port.

| Artifact | What it is | Result |
| --- | --- | --- |
| `typecheck.log` | `pnpm exec tsc --noEmit` | exit 0 |
| `eslint.log` | `pnpm exec eslint <13 changed files>` | exit 0, 0 problems (a first pass flagged `react-hooks/set-state-in-effect` in `living-ai-core.tsx`; fixed by moving the reset to the render-time "adjust state on a prop change" pattern) |
| `vitest.log` | `pnpm --filter @track-site/web test` | exit 0 — 60 files, 532 tests passed (15.4 s) |
| `build.log` | `pnpm --filter @track-site/web build` (sdk build + sync + `next build`) | exit 0, `BUILD_ID` `9ZJAGzR3pMhmuGkmeGTk8` (`.next` rebuilt) |
| `routes-manifest-csp.txt` | the `Content-Security-Policy` value baked into `.next/routes-manifest.json` of this build (`HOST_MARKETING=http://localhost…` from the root `.env`) | no `upgrade-insecure-requests`; the other 11 directives and the 5 other headers (incl. HSTS) unchanged (D18) |
| `d21-build-check.txt` | grep of `.next/server` for the viewport key and the runtime script | the dashboard layout chunk carries the inline script (`"virtualKeyboard" in navigator` → appends `interactive-widget=resizes-content`); the only `interactiveWidget` left is Next's generic viewport resolver — the server-rendered meta no longer contains the key (D21) |
| `d21-inline-script-probe.txt` | the inline script parsed with `new Function` and run in jsdom | Chromium-like navigator: key appended before/after a late meta, idempotent; WebKit-like navigator: meta untouched |
| `d20-hydration-probe.txt` | temporary vitest/jsdom probe (deleted after the run): React 19 `hydrateRoot(document)` inside `startTransition` with a react-hook-form input | `__reactProps$…` appears on `<html>` and the form only after the hydration commit; a value typed before it is reset to `""` by the form's registration, a value typed after it survives — the mechanism `waitForLoginHydration` in `e2e/auth.setup.ts` / `e2e/app.spec.ts` relies on |

Unit tests added / changed for D17: `living-ai-core/upgrade-gate.test.ts` (6, new), `tier.test.ts` (+3 groups: `isConstrainedDevice` matrix, `webglPermitted`, constrained `selectTier`), `living-ai-core.dom.test.tsx` (harness on fake timers + device / readyState stubs; new groups "upgrade timing gate (D17)", "constrained devices", extra cleanup cases). For D18: `src/next.config.test.ts` (5, new — pure builder + the exported config's `headers()` under `HOST_MARKETING=http://localhost:3015` vs `https://track.site`).

Owed: `node apps/web/scripts/qa/living-core-lighthouse.mjs --runs 3 --variants docked` on the new build to confirm the ≤ 3-point criterion (D17); a WebKit e2e run without the header-strip hook (D18 / D20 / D21 console check).
