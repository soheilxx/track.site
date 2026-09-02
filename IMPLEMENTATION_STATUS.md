# IMPLEMENTATION_STATUS

States: `DONE` (implemented + tested), `PARTIAL` (usable, incomplete; see note), `BLOCKED` (needs external action), `NEXT` (next executable step).

| Area | State | Evidence | Test command | Note |
| --- | --- | --- | --- | --- |
| Target repo audit + docs 00-07 + ADRs | DONE | `docs/` | - | target corrected to `soheilxx/track.site` by owner |
| Monorepo foundation (pnpm, turbo, ts, eslint, prettier) | NEXT | root configs | `pnpm lint && pnpm typecheck` | |
| packages/core (env, logger, ids, crypto, rbac, result) | NEXT | | `pnpm --filter @track-site/core test` | |
| packages/db schema + baseline migration + RLS | NEXT | | `pnpm test:integration` | |
| Auth (better-auth, orgs, roles, invites, MFA) | NEXT | | | |
| Site + 6-char tracking id + domain verification | NEXT | | | |
| SDK tracker.js + consent gate + signed config | NEXT | | `pnpm sdk:budget` | |
| Collector + PgQueue + worker pipeline + event store | NEXT | | | |
| Event debugger + lineage UI | NEXT | | | |
| Generic webhook connector | NEXT | | `pnpm test:contract` | |
| AI setup (Responses API, tools, structured UI, approvals) | NEXT | | | |
| Connectors meta/tiktok/reddit/linkedin/ga4/google-ads | NEXT | | | |
| Commerce integrations shopify/woocommerce/shopware | NEXT | | | |
| Marketing frontend, SEO, blog (30 topics x en/de) | NEXT | | `pnpm seo:check` | |
| Stripe billing + entitlements + usage ledger | NEXT | | | |
| Privacy center, DSAR, retention | NEXT | | | |
| CI gates | NEXT | `.github/workflows/ci.yml` | | |
| Load test baseline | NEXT | `docs/performance-baseline.md` | `pnpm load:collector` | |

## External blockers (owner action)

| Blocker | Needed for | Action |
| --- | --- | --- |
| OpenAI API key per environment | live AI assistant | set `OPENAI_API_KEY` |
| Stripe account, products/prices, webhook secret | live checkout | set `STRIPE_*` |
| Vendor OAuth apps (Google Ads developer token, LinkedIn app) | live OAuth connectors | register apps, set env |
| DNS for `track.site`, `app.`, `api.`, `cdn.`, `ingest.` | production hosts | configure DNS + TLS |
| EU infrastructure (DB, SQS, S3, KMS, ClickHouse) | production data plane | provision via `infra/terraform` |

## Next executable step

Scaffold packages and apps, install dependencies, get lint/typecheck/test green, then implement the vertical slice.
