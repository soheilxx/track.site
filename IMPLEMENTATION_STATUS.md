# IMPLEMENTATION_STATUS

States: `DONE` (implemented + tested), `PARTIAL` (usable, incomplete; see note), `BLOCKED` (needs external action), `NEXT` (next executable step). Updated 2026-09-03.

| Area | State | Evidence | Test command | Note |
| --- | --- | --- | --- | --- |
| Target repo audit + docs 00-09 + ADRs 0001-0008 | DONE | `docs/` | - | target `soheilxx/track.site`, branch `feat/ai-tag-manager-platform` |
| Monorepo foundation (pnpm 11, turbo, TS 5.9, eslint flat, prettier) | DONE | root configs | `pnpm lint && pnpm typecheck` | apps/web lint pins React version for eslint-plugin-react |
| packages/core (env, logger, ids, crypto, PII, URL scrub, RBAC, result) | DONE | `packages/core` | `pnpm --filter @track-site/core test` | 32 tests |
| packages/db schema + migrations 0000-0002 + RLS + partitions | DONE | `packages/db` | `pnpm test:integration` | migration 0002 adds credential kinds (OAuth 1.0a secret, client id/secret) |
| Auth (better-auth, orgs, roles, invites, MFA, passkeys) | DONE | `apps/web/src/server/auth.ts` | browser walkthrough | signup → verification mail → org → site verified in browser |
| Site + 6-char tracking id + domain verification | DONE | `packages/core/src/ids`, `packages/db/src/repositories/sites.ts` | `pnpm --filter @track-site/core test` | site TI8R42 created in browser |
| SDK tracker.js + consent gate + signed config + vendor loaders (22 templates) | DONE | `packages/sdk` | `pnpm --filter @track-site/sdk test && pnpm --filter @track-site/sdk budget` | 12 KB gzip of 30 KB budget |
| Collector + PgQueue + worker pipeline + event store + DLQ/replay | DONE | `apps/collector`, `apps/worker`, `packages/queue`, `packages/analytics` | `pnpm --filter @track-site/collector test`, worker pipeline integration test | inbound affiliate postbacks (Digistore24 IPN) added |
| Config bundles (draft → lint → publish → rollback, Ed25519 signed) | DONE | `packages/config`, `packages/db/src/repositories/config.ts` | `pnpm --filter @track-site/config test` | version 1 published from the wizard in browser |
| Consent policy engine + Consent Mode v2 + click-id policy | DONE | `packages/policy` | `pnpm --filter @track-site/policy test` | 22 destination types in the matrix |
| AI setup (Responses API, typed tools, structured UI, approvals, DLP) | DONE | `packages/ai`, `apps/web/src/app/api/ai/*` | `pnpm --filter @track-site/ai test` | needs `OPENAI_API_KEY`; rule-based wizard is the fallback |
| Destination wizard (19 steps) + catalog + monitoring + OAuth connect | DONE | `apps/web/src/components/destinations/*`, `apps/web/src/app/app/destinations`, `apps/web/src/server/oauth.ts` | browser walkthrough | OAuth providers need platform client ids |
| Connectors — Group 1 (Meta, Google Ads, TikTok, Microsoft, LinkedIn, Reddit, Pinterest, Snapchat) + GA4 + webhook | DONE | `packages/connectors/src/vendors/*` | `pnpm --filter @track-site/connectors test:contract` | 61 contract tests against mock vendors |
| Connectors — Group 2 (X, Taboola, Outbrain, Amazon, Spotify, Quora) | DONE | same | same | Amazon/Quora bodies verified through secondary references (see docs/09) |
| Connectors — Group 3 (Yahoo, Trade Desk, GMP/Floodlight, AdRoll, Criteo, affiliate S2S with 13 presets) | DONE | same, `affiliate-presets.ts` | same | AdRoll beta + TTD tag prerequisites shown in the wizard |
| Integration matrix (auto-checked) + handover | DONE | `docs/integrations-matrix.md`, `docs/09-integrations-handover.md` | `pnpm --filter @track-site/connectors test` | regenerate with `pnpm --filter @track-site/connectors matrix` |
| Event debugger + lineage UI | PARTIAL | destination monitor step, `get_destination_status`, `show_delivery_errors` | - | dedicated `/app/debugger` page with lineage view still to build |
| Dashboard pages events / data quality / consent center / audiences / team / settings | NEXT | nav entries exist | - | |
| Commerce integrations shopify/woocommerce/shopware | NEXT | server event schema accepts the sources | - | |
| Marketing frontend, SEO, blog (30 topics x en/de) | PARTIAL | home, header/footer, JSON-LD, sitemap, robots | `pnpm seo:check` | feature/pricing/integration/blog pages pending |
| Stripe billing + entitlements + usage ledger | PARTIAL | plans, subscriptions, usage ledger tables + entitlement checks | - | checkout/portal/webhooks pending |
| Privacy center, DSAR, retention | PARTIAL | retention jobs, `deleteSubject` in event store, DSAR tables | - | UI + export pending |
| CI gates | NEXT | `.github/workflows/ci.yml` | - | |
| Load test baseline | NEXT | `docs/performance-baseline.md` | `pnpm load:collector` | |

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

Build the event debugger page (`/app/debugger`) on top of `get_destination_status` / event store queries, then the remaining dashboard pages, commerce integrations, marketing pages + blog, Stripe, privacy center, CI workflow and the load-test baseline.
