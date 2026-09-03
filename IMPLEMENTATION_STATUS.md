# IMPLEMENTATION_STATUS

States: `DONE` (implemented + tested), `PARTIAL` (usable, incomplete; see note), `BLOCKED` (needs external action), `NEXT` (next executable step). Updated 2026-09-03.

| Area | State | Evidence | Test command | Note |
| --- | --- | --- | --- | --- |
| Target repo audit + docs 00-10 + ADRs 0001-0008 | DONE | `docs/` | - | target `soheilxx/track.site`, branch `feat/ai-tag-manager-platform` pushed 2026-09-03, `main` created from it the same day (Vercel production branch), CI runs on push |
| Monorepo foundation (pnpm 11, turbo, TS 5.9, eslint flat, prettier) | DONE | root configs | `pnpm lint && pnpm typecheck` | apps/web lint pins React version for eslint-plugin-react |
| packages/core (env, logger, ids, crypto, PII, URL scrub, RBAC, result) | DONE | `packages/core` | `pnpm --filter @track-site/core test` | 32 tests |
| packages/db schema + migrations 0000-0003 + RLS + partitions | DONE | `packages/db` | `pnpm test:integration` | 0002 credential kinds, 0003 `shop_connections` (RLS tenant isolation) |
| Auth (better-auth, orgs, roles, invites, MFA, passkeys) | DONE | `apps/web/src/server/auth.ts` | browser walkthrough | signup → verification mail → org → site verified in browser |
| Site + 6-char tracking id + domain verification | DONE | `packages/core/src/ids`, `packages/db/src/repositories/sites.ts` | `pnpm --filter @track-site/core test` | site TI8R42 created in browser |
| SDK tracker.js + consent gate + signed config + vendor loaders (22 templates) + first-party click-id store | DONE | `packages/sdk` | `pnpm --filter @track-site/sdk test && pnpm --filter @track-site/sdk budget` | 36.7 KB raw / ~12 KB gzip of 30 KB budget; `_ts_cid` under marketing consent with bundle TTL; purchases mirror with `purchase:<order id>` |
| Collector + PgQueue + worker pipeline + event store + DLQ/replay | DONE | `apps/collector`, `apps/worker`, `packages/queue`, `packages/analytics` | `pnpm --filter @track-site/collector test`, `pnpm --filter @track-site/worker test:integration` | inbound affiliate postbacks (Digistore24 IPN); browser↔server order pairing (consent/click-id inheritance, verified record supersedes); shared vendor dedup id `vendorDedupId`; retention job honours org overrides |
| Config bundles (draft → lint → publish → rollback, Ed25519 signed) | DONE | `packages/config`, `packages/db/src/repositories/config.ts` | `pnpm --filter @track-site/config test` | version 1 published from the wizard in browser |
| Consent policy engine + Consent Mode v2 + click-id policy | DONE | `packages/policy` | `pnpm --filter @track-site/policy test` | 22 destination types in the matrix |
| AI setup (Responses API, typed tools, structured UI, approvals, DLP) | DONE | `packages/ai`, `apps/web/src/app/api/ai/*` | `pnpm --filter @track-site/ai test` (74 tests) | live-tested with production key 2026-09-03; tool-contract audit (50 confirmed findings) implemented, see docs/08 |
| Destination wizard (19 steps) + catalog + monitoring + OAuth connect | DONE | `apps/web/src/components/destinations/*`, `apps/web/src/app/app/destinations`, `apps/web/src/server/oauth.ts` | browser walkthrough | OAuth providers need platform client ids |
| Connectors — Group 1 (Meta, Google Ads, TikTok, Microsoft, LinkedIn, Reddit, Pinterest, Snapchat) + GA4 + webhook | DONE | `packages/connectors/src/vendors/*` | `pnpm --filter @track-site/connectors test:contract` | 61 contract tests against mock vendors |
| Connectors — Group 2 (X, Taboola, Outbrain, Amazon, Spotify, Quora) | DONE | same | same | Amazon/Quora bodies verified through secondary references (see docs/09) |
| Connectors — Group 3 (Yahoo, Trade Desk, GMP/Floodlight, AdRoll, Criteo, affiliate S2S with 13 presets) | DONE | same, `affiliate-presets.ts` | same | AdRoll beta + TTD tag prerequisites shown in the wizard |
| Integration matrix (auto-checked) + handover | DONE | `docs/integrations-matrix.md`, `docs/09-integrations-handover.md` | `pnpm --filter @track-site/connectors test` | regenerate with `pnpm --filter @track-site/connectors matrix` |
| Event debugger + lineage UI | DONE | `apps/web/src/app/app/debugger/page.tsx`, destination monitor, `get_destination_status`, `show_delivery_errors` | browser walkthrough | redacted payload preview, consent record and policy decision per destination |
| Dashboard pages events / data quality / consent center / audiences / team / settings / billing | DONE | `apps/web/src/app/app/*` | browser walkthrough | data quality issues with resolve/ignore, consent center with DSAR + retention, team invites/roles |
| Commerce integrations Shopify / WooCommerce / Shopware 6 | DONE | `apps/collector/src/shop-inbound.ts`, `packages/db/src/repositories/commerce.ts`, `apps/web/src/app/app/sites/[siteId]/shop`, `integrations/*`, `docs/10-commerce-integrations.md` | `pnpm --filter @track-site/collector test`, `pnpm --filter @track-site/policy test`, `pnpm --filter @track-site/worker test:integration` | signed webhooks verified (HMAC), Shopify web pixel, WooCommerce plugin with managed webhooks, Shopware app manifest + registration handshake; local E2E: signed `orders/paid` → verified purchase + conversion record + connection `connected` |
| Marketing frontend, SEO, blog (30 topics x en/de) | DONE | `apps/web/src/app/[locale]/*`, `apps/web/content/blog/{en,de}` (30 + 30 posts), `apps/web/scripts/seo-check.ts` | `pnpm seo:check` (against a running web server) | typed copy per locale, legal identity from `LEGAL_*` env, prices only from Stripe, MDX blog with front matter, sources and review dates |
| Stripe billing + entitlements + usage ledger | DONE | `apps/web/src/server/billing.ts`, `pricing.ts`, `apps/web/src/app/api/stripe/webhook/route.ts`, `/app/billing` | browser walkthrough (test mode) | honest empty state without `STRIPE_*`; prices come from Stripe only; signed webhooks update subscriptions/entitlements |
| Privacy center, DSAR, retention | DONE | `/app/consent`, `apps/web/src/server/actions/privacy.ts`, `apps/web/src/app/api/privacy/dsar/[id]/route.ts`, `apps/worker/src/jobs/retention.ts` | browser walkthrough | export/delete/restrict/rectify with audit + completion report; retention overrides per org (site overrides for events/click ids) |
| CI gates | DONE | `.github/workflows/ci.yml` | first run on push | lint, typecheck, unit, contract, integration (Postgres 18 service), SDK budget, matrix check, production build; all gates pass locally (`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm --filter @track-site/web build`: 173 static pages) |
| Playwright smoke tests (marketing a11y/SEO structure, blog, pricing honesty, dashboard sign-in, shop connection page) | DONE | `apps/web/e2e/*.spec.ts`, `apps/web/playwright.config.ts` | `pnpm --filter @track-site/web test:e2e` (against a running server, seeded demo user) | axe-core WCAG 2 A/AA: contrast tokens raised to AA |
| SEO gate | DONE | `apps/web/scripts/seo-check.ts` | `pnpm seo:check` | 113 pages (en/de static, integrations, 60 blog posts), robots, sitemap, feed; titles/descriptions cut for snippets |
| Load test baseline | DONE | `docs/performance-baseline.md` | `pnpm load:collector` | dev laptop: 483 req/s = 2,417 events/s, p95 189 ms, 0 errors; limiter runs show 429 at the configured per-IP/per-site limits; single worker drained 70k events within 2.5 min |
| Data plane on Fly.io (collector + worker, Frankfurt) | DONE | `infra/docker/*.Dockerfile`, `infra/fly/*.toml`, docs/07 §Data plane | `fly status -a track-site-collector`, collector `/health` | live at https://track-site-collector.fly.dev (db ok, queue ok); worker running with retention job; ingest host https://ingest.track.site live with certificate |
| Vercel deployment of apps/web | DONE | `apps/web/vercel.json`, docs/07 §Vercel | `SEO_BASE_URL=https://www.track.site pnpm seo:check` | live at https://www.track.site (project modernice/track-site, fra1); dashboard needs `DATABASE_URL`; collector/worker still need an EU container host |

## External blockers (owner action)

| Blocker | Needed for | Action |
| --- | --- | --- |
| OpenAI API key per environment (projects exist) | live AI assistant | set `OPENAI_API_KEY` (List models: read, Responses: write) |
| Stripe account, products/prices, webhook secret | live checkout | set `STRIPE_*` |
| Vendor platform apps: Google Ads developer token + OAuth client, LinkedIn app, Login with Amazon app, X developer app | OAuth connectors | register apps, set `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_OAUTH_*`, `LINKEDIN_*`, `AMAZON_ADS_*`, `X_CONSUMER_*` |
| Vendor accounts for production sends | live vendor verification | first real test events per destination (docs/09 §7) |
| DNS for `track.site`, `app.`, `api.`, `cdn.`, `ingest.` | production hosts | configure DNS + TLS |
| EU infrastructure (DB, SQS, S3, KMS, ClickHouse) | production data plane | provision via `infra/terraform` |

## Next executable step

Owner actions from the blocker table (vendor apps, Stripe, OpenAI keys, DNS, EU infrastructure), then the first real test event per destination (docs/09 §7) and the shop integrations against one real Shopify, WooCommerce and Shopware installation each (docs/10 checklist). Engineering follow-ups: ClickHouse event-store integration test on real ClickHouse, SQS queue driver soak, production load test on EU infrastructure against the targets in `docs/performance-baseline.md`.
