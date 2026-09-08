# End-to-end tests (`apps/web/e2e`)

Playwright (Chromium) against a running web server. The base URL defaults to `http://localhost:3000`; override it with `E2E_BASE_URL`. Projects (see `playwright.config.ts`):

| Project | Files | Purpose |
| --- | --- | --- |
| `setup` | `auth.setup.ts` | Signs in once as the seeded owner (`owner@acme.test` / `Demo-Password-123!`, `SEED_DEMO=true pnpm db:seed`) and stores the session in `.auth/owner.json` (git-ignored). better-auth allows 3 sign-ins per 10 s, so every other project starts from this stored session instead of signing in. |
| `chromium` | `marketing.spec.ts`, `app.spec.ts`, `security.spec.ts` | Functional smoke tests (marketing with axe, dashboard, Track AI shell, two-factor enrolment). Ignores `visual.spec.ts` and `ops.spec.ts`. |
| `visual` | `visual.spec.ts` | Visual regression: `toHaveScreenshot` against the PNG baselines in `__screenshots__/`. |
| `ops` | `ops.spec.ts` | Track Operations console. Depends on `chromium`: its flows suspend the demo organisation for a while, so it runs after the tenant dashboard specs (a dashboard test that lands on the suspended organisation sees the suspension notice instead of the page). |

`ops.spec.ts` (Track Operations, docs/17) signs in the seeded platform admin (`ops@acme.test` / `Demo-Password-123!`) once through the auth API in its own `beforeAll` and stores that session in `.auth/ops.json`; the owner checks use the stored owner session. It needs the server to run with `OPS_REQUIRE_2FA=false` (the seeded operator has no two-factor enrolment) and on its trusted origin (see below). It covers the owner's 403 on `/ops`, every console page at 1440 and 375 px (one `h1`, no raw translation keys, viewport-fixed shell, axe serious/critical empty), a feature flag, an announcement and its dashboard banner, the break-glass round trip (request → single-admin self-approval → read-only tenant view with banner and refused mutation → leave → revoke), suspend/unsuspend of `acme-demo` with the owner's notice, and one audited CSV export. Its flows change the demo organisation for the duration of the run (a support banner, a temporary suspension, an active announcement), which is why the project runs after `chromium`; it can still collide with the `visual` project's `app-overview-*` capture when both run in the same invocation (if that capture ever diffs, run `--project=visual` on its own). The list pages stream in behind their `loading.tsx` skeletons (`aria-busy`), and React reveals the boundary after the load event: the detail-page test waits for the skeleton to disappear before it reads the links. Left behind on purpose: one feature flag per run (`e2e.smoke_<stamp>`, flags cannot be deleted) and the revoked announcement row.

`security.spec.ts` (two-factor enrolment, docs/17 §3) uses the dedicated account `security@acme.test` / `Demo-Password-123!` (ANALYST of the demo organisation, seeded by `SEED_DEMO=true pnpm db:seed`; override with `E2E_SECURITY_EMAIL` / `E2E_SECURITY_PASSWORD`) and signs in on its own: the enrolment rotates the session token and, while two-factor is on, every password sign-in of that account lands on the two-factor page, so the seeded owner and its stored session are never touched. The test ends by disabling two-factor through the page; `afterAll` repeats that through the auth API only when the test did not get that far (one sign-in less against the shared 3-per-10-s limit on a green run). A run that crashed before either is repaired by the next `db:seed`, which removes the account's secret and backup codes and switches the flag off. Because `setup`, `app.spec.ts` and this spec all sign in within the first seconds of a run, both form sign-in helpers retry after the rate-limit window when better-auth answers "Too many attempts".

```bash
cd apps/web
pnpm build && pnpm start -p 3000                       # or `pnpm dev` (production build recommended for stable screenshots)
E2E_BASE_URL=http://localhost:3000 pnpm test:e2e        # all projects
E2E_BASE_URL=http://localhost:3000 pnpm exec playwright test --project=chromium   # functional only
E2E_BASE_URL=http://localhost:3000 pnpm exec playwright test --project=visual     # visual only
```

The `setup` sign-in only works when the server runs on the origin better-auth trusts (`HOST_APP` / `HOST_MARKETING` in `.env`, `http://localhost:3000` locally; `apps/web/src/server/auth.ts` → `trustedOrigins`). Against a server on another port the form login is rejected (`ERROR [Better Auth]: Invalid origin`) and `setup` times out, but an existing `.auth/owner.json` (written by a previous run on the trusted port) stays valid on any port of the same host: run the dependent projects with `--no-deps`, e.g. `E2E_BASE_URL=http://localhost:3005 pnpm exec playwright test --project=visual --no-deps`. Alternatively start the server with the trusted origin on that port so the whole suite (including `setup`) runs there: `HOST_MARKETING=http://localhost:3007 HOST_APP=http://localhost:3007/app pnpm --filter @track-site/web start -p 3007` (the shell environment wins over `.env`; the prerendered pages keep the build-time origin in absolute URLs, which is why the specs fetch assets by pathname).

## Visual regression (`visual.spec.ts`)

What is compared:

| Snapshot | Route | Session |
| --- | --- | --- |
| `home-375`, `home-1440` | `/en` | anonymous |
| `pricing-375`, `pricing-1440` | `/en/pricing` | anonymous |
| `knowledge-hub-375`, `knowledge-hub-1440` | `/en/tracking-knowledge` | anonymous |
| `article-consent-mode-v2-guide-375`, `-1440` | `/en/tracking-knowledge/consent-mode-v2-guide` | anonymous |
| `login-375`, `login-1440` | `/en/login` | anonymous |
| `app-overview-375`, `app-overview-1440` | `/app` (Command Center) | stored owner session |

How a capture is made (all in `visual.spec.ts` / the `visual` project):

- viewports 375 × 812 and 1440 × 900, `deviceScaleFactor: 1`, `reducedMotion: "reduce"` (the hero demo does not autoplay, the Living AI Core renders its static tier, no reveal animations), `timezoneId: "Europe/Berlin"`, `locale: "en-US"`;
- the page is scrolled once to the bottom and back (lazy sections mount), `document.fonts.ready` is awaited;
- `fullPage: true` clipped to the first 2 500 px (`CLIP_HEIGHT`) so the PNGs stay small; the dashboard shell is viewport-fixed, so its capture equals the viewport;
- `animations: "disabled"`, `caret: "hide"`, `maxDiffPixelRatio: 0.01`;
- masked (pink boxes in the baseline): every `<time>` element (relative and formatted timestamps), the Command Center lines starting with "Measured" (`Measured now · <date, time>`, `Measured at <date, time>` — plain text, not `<time>`), `[role="progressbar"]` (reading progress), `[data-testid="assistant-messages"]` (the Track AI transcript of the signed-in owner is persisted server-side and grows with every dashboard e2e run; the panel header, quick actions and composer stay compared). The Living AI Core of the Track AI panel is not masked: in reduced motion it renders its static tier (docs/15-living-ai-core.md), which is deterministic.

Baseline files: `__screenshots__/<snapshot>-visual-<platform>.png`, from `snapshotPathTemplate` in `playwright.config.ts` (`{testDir}/__screenshots__/{arg}-{projectName}-{platform}{ext}`). The committed baselines were generated on Windows (`-win32`) with the bundled Chromium of `@playwright/test` 1.62 against a production build (`next start`) of the redesign tree on 2026-09-05; `home-375`, `home-1440` and `app-overview-375` were regenerated the same day after the phase 7 layout fixes (font subset, hero demo container queries, dashboard header budget — docs/16 §11). Text rendering differs between operating systems, so a baseline from one platform is not compared on another: on a platform without baselines Playwright writes new files (`…-<platform>.png`) and fails that first run; review and commit them to add the platform.

### Updating the baselines

Update baselines only for an intended visual change, after reviewing the diff report (`playwright-report/` after a failing run, or `pnpm exec playwright show-report`).

```bash
cd apps/web
pnpm build && pnpm start -p 3000                                                  # fresh production build of the tree to baseline
E2E_BASE_URL=http://localhost:3000 pnpm exec playwright test --project=visual --update-snapshots   # rewrites changed baselines
E2E_BASE_URL=http://localhost:3000 pnpm exec playwright test --project=visual                      # must pass twice in a row
```

- `--update-snapshots` rewrites the baselines that differ; `--update-snapshots=all` rewrites every file; `--update-snapshots=missing` (the default without the flag) only creates absent ones.
- Update a single snapshot with `-g "pricing at 1440px"` (the test title is `<snapshot id> at <width>px matches the baseline`).
- The dashboard baseline (`app-overview-*`) reflects the seeded demo organization (`SEED_DEMO=true pnpm db:seed`): sites, events, destinations and release versions of that seed. Data created by other test runs (alert rules, test-lab runs, drafts) changes the Command Center and therefore the diff; reseed before updating this baseline.
- Content that ages (the "new"/"recently updated" badges of the knowledge hub are computed against the current date) is not masked; when such a badge disappears, the diff is expected and the baseline is updated.
- Keep PNGs small: never raise `CLIP_HEIGHT` above 2 500 px, never add a `deviceScaleFactor` > 1, and do not add every route — the responsive evidence pack (`docs/qa/<date>/screenshots`) covers the full route list.
