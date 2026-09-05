# Chat state across route changes and site switches (task E3, defect D16)

Owner supplement §9: "Chat, Setup-State, laufende Jobs und Scrollposition bleiben beim Routenwechsel erhalten" and "Site-/Tenantwechsel bestätigt den neuen Kontext sichtbar und darf niemals Daten vermischen"; docs/16 §10 "Chat and job state survive route changes — not tested end-to-end (D16)". Every number below is read from a file in this directory.

## Tests (permanent, `apps/web/e2e/app.spec.ts` → `Track AI state across routes and sites`, chromium project, stored owner session, `AI_DEV_FIXTURES=1`)

### 1. `the transcript, the scroll position, the draft and the panel geometry survive a route change`

Desktop 1440 × 900, docked panel. `/app?ai_fixture=long-conversation` loads the 250-message fixture into the store; the transcript is scrolled to the middle (`scrollTop = (scrollHeight − clientHeight) / 2`, 400 ms for the debounced save), the composer gets the draft `Draft kept across routes`; then Events → Command Center through the dashboard navigation (client-side transitions of the dashboard layout, the URL loses the fixture parameter). Assertions: URL `/app`, `data-total` 250, `scrollTop` within ± 50 px, draft unchanged, panel rect unchanged.

| | before the route change | after Events → Command Center |
| --- | --- | --- |
| URL | `/app?ai_fixture=long-conversation` | `/app` (no fixture: what is shown comes from the store, a reload would have fetched the real transcript) |
| transcript `data-total` | 250 | 250 |
| `scrollTop` / first visible message | 10 616 / `fixture-120` | 10 616 / `fixture-120` (Δ 0 px) |
| draft | `Draft kept across routes` | `Draft kept across routes` |
| panel rect (left, top, width, height) | 1040, 56, 400, 844 | 1040, 56, 400, 844 |

Source: `after-fix/route-change.json` (identical values in `before-fix/route-change.json` on the previous build — this behaviour needed no fix; the tests are the owed evidence).

### 2. `a site switch confirms the new context visibly and never shows the other site's transcript`

Same start (250 fixture messages, fixture parameter dropped through Events → Command Center), then the header's site menu switches to a second site and back:

| Step | Assertion (all passed) | Evidence |
| --- | --- | --- |
| switch to `E2E switch site` | panel context line `role="status"` (polite live region) reads `Track AI now works on E2E switch site.`; context line shows `Site: E2E switch site`; header announcement (`workspace-switcher` `role="status"`) reads `Workspace switched to E2E switch site.`; site trigger label `Site: E2E switch site …` | `e2e-state-after-fix.log` |
| transcript of the new site | `aria-busy` cleared, `data-total` **0**, no element with `data-message-id^="fixture-"` — none of the 250 messages of Acme Shop | `after-fix/site-switch.json` → `switched.total: "0"`, `firstVisibleMessage: null` |
| switch back to `Acme Shop` | `Track AI now works on Acme Shop.`; `data-total` **250** again — the transcript was kept in the layout-level store per site (the URL carries no fixture, so a refetch would have returned the real conversation instead) | `after-fix/site-switch.json` → `restored.total: "250"` |
| cleanup | the seeded site is always left active (`finally`), the second site is soft-deleted | spec |

Second site: the seed has one site (`Acme Shop`) and the demo organization has no subscription, so `planLimits` falls back to the starter plan with `limits.sites = 1` (`apps/web/src/server/entitlements.ts`) — `createSiteAction` refuses a second site (`limit`), and the product has no site deletion. The spec therefore writes the site directly to the local database the way `SEED_DEMO=true pnpm db:seed` does (`pg` from `apps/web`, `DATABASE_URL` from the environment or the root `.env` that next.config.ts loads): `sites` row `E2E switch site` / `e2e-switch.acme.test` with a fresh 6-character tracking id plus the two default environments, revived from an earlier run when a soft-deleted row exists (no tracking id is burnt per run), and soft-deleted afterwards exactly like `softDeleteSite` (`status = 'deleted'`, `deleted_at`, `kill_switch`). `listSites` filters `deleted_at IS NULL`, so the row is invisible in the product between runs. Residue in the dev database: one soft-deleted site row.

## Not covered

- **Job state**: no real tool run or job can be started in this lab (no AI provider / vendor credentials in the e2e environment) and the fixture carries no activities, so a turn in flight across a route change is not exercised. The store keeps `activities`, `pending`, `approval`, `credential`, `status` and `turnId` in the same per-site `ChatState` as the messages (`apps/web/src/components/chat/assistant-store.tsx`), and the running turn's SSE loop lives in the provider, not in a page — the same mechanism the route-change test proves for messages, scroll position and draft — but this remains contract, not e2e evidence.
- The mobile presentations (drawer, sheet) across route changes: the sheet closes on navigation by design (modal overlay); the state itself is the same provider state.

## Runs and files

| File | Content |
| --- | --- |
| `e2e-state-before-fix.log` | first run on the previous build (`apps/web/.next`, `JkuZkqiqEn0HgN4FIDCyT`): route change passed; the site-switch spec failed on a spec bug (root `.env` resolved to `apps/.env`), fixed in the spec |
| `e2e-site-switch-before-fix.log` | site-switch spec passed on the previous build after the spec fix |
| `before-fix/route-change.json`, `before-fix/site-switch.json` | metrics of those runs |
| `e2e-state-after-fix.log`, `after-fix/*.json` | both specs on the `.next-e3` build (numbers above) |
| `e2e-chromium-app-marketing.log` | regression run of `app.spec.ts` + `marketing.spec.ts` (chromium project, `--no-deps`, stored session) on the `.next-e3` build |
| `e2e-visual.log` | the `visual` project against the committed baselines on the `.next-e3` build (token and diagram changes of the contrast review) |
| `build-next-e3.log` | `NEXT_DIST_DIR=.next-e3 pnpm --filter @track-site/web exec next build` — a separate `distDir` (`next.config.ts` honours `NEXT_DIST_DIR`), because `apps/web/.next` (`JkuZkqiqEn0HgN4FIDCyT`) is served by the other tasks and must not be rebuilt by this one: "Compiled successfully in 6.7s", "Generating static pages using 7 workers (715/715) in 11.4s"; `BUILD_ID` `2p2BhUEe9szAqx7yJQBwy` (read from `.next-e3/BUILD_ID` before the directory was deleted at the end of the task; `GET /_next/static/2p2BhUEe9szAqx7yJQBwy/_buildManifest.js` on port 3014 answered 200, the old id 404). The server was started with `NEXT_DIST_DIR=.next-e3` as well (`server-3014-next-e3.log`) |
| `server-3014.log`, `server-3014-next-e3.log` | `pnpm --filter @track-site/web start -p 3014` with `HOST_MARKETING` / `HOST_APP` on port 3014 and `AI_DEV_FIXTURES=1`, first from `apps/web/.next`, then from `.next-e3` |
