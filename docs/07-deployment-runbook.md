# 07 - Deployment Runbook

## Topology

| Component | Recommended host | Scaling |
| --- | --- | --- |
| `apps/web` | Vercel (EU region `fra1`) or container | serverless / 2+ replicas |
| `apps/collector` | container (ECS/Fargate eu-central-1, Fly.io fra) behind ALB/CDN | stateless, 2+ replicas, P95 < 150 ms |
| `apps/worker` | container, one per queue family | scale by queue lag |
| PostgreSQL | managed (RDS/Aurora, Neon EU) with PITR | primary + read replica |
| Queue | SQS (`QUEUE_DRIVER=sqs`) | per destination queue + DLQ |
| Event store | ClickHouse Cloud EU (`EVENT_STORE_DRIVER=clickhouse`) or Postgres partitions | |
| Object store | S3 eu-central-1, SSE-KMS | |
| Secrets | AWS KMS (`KMS_DRIVER=aws`) | |
| CDN | CloudFront/Cloudflare in front of the `cdn.` bucket | immutable versioned paths |

Environments: development -> staging -> production, with separate OpenAI projects, Stripe test vs. live and separate signing keys.

## First deployment (staging)

1. Provision infra (`infra/terraform`, EU only): DB URL, SQS URLs, S3 bucket, KMS key.
2. Create DB roles: owner (migrations) and `tracksite_app` (runtime, no BYPASSRLS). Migrations grant `tracksite_app` on all tables.
3. Set env from `.env.example` in each platform; no secrets in the repo.
4. Run migrations with the owner URL (unpooled): `pnpm --filter @track-site/db migrate`.
5. Deploy collector + worker containers (`infra/docker/*.Dockerfile`), then web.
6. DNS: `track.site`, `app.`, `api.` -> web; `ingest.` -> collector; `cdn.` -> CDN. TLS via platform.
7. Stripe: create products/prices (test mode), set `STRIPE_PRICE_*`, register webhook `https://api.<host>/billing/webhook`, store `STRIPE_WEBHOOK_SECRET`.
8. Vendor OAuth apps (Google Ads, LinkedIn): redirect URIs `https://app.<host>/api/oauth/<vendor>/callback`.
9. Smoke: `/api/health`, collector `/health`, publish demo config, send a test event, verify delivery in the Event Debugger.

## Release procedure

1. CI green on the feature branch (all gates in `.github/workflows/ci.yml`).
2. Migrations are expand/contract; `pnpm db:check` fails CI on drift.
3. Deploy worker first, then collector, then web.
4. Verify queue lag, DLQ size, delivery success rate, config activation < 60 s.
5. Rollback: redeploy the previous build; config rollback via dashboard; compensating migrations only.

## Operations

| Task | Where |
| --- | --- |
| DLQ replay | `pnpm --filter @track-site/worker cli dlq:replay --queue dest.meta --limit 100` |
| Kill switch | `KILL_SWITCH_GLOBAL=true` (collector answers 503 + Retry-After); per org/site/connector in Settings |
| Rotate config signing key | new pair, `CONFIG_SIGNING_PRIVATE_KEY_NEXT`, republish active configs, rebuild SDK with both public keys during overlap |
| Rotate master key | `pnpm --filter @track-site/core keys:rotate` re-wraps DEKs |
| Backups | daily snapshots + PITR (35 days); restore test documented in `docs/ops/restore-tests.md` |
| Incident | `docs/ops/incident-runbook.md` |

## Observability

OTLP endpoint via `OTEL_EXPORTER_OTLP_ENDPOINT`; metrics per org/site/env/connector (received, accepted, dropped, deduplicated, billable, consent drops, schema/PII errors, queue lag, retries, DLQ size, delivery success, 4xx/5xx, latency, active config version, token health). SLOs: collector P95 < 150 ms, delivery P95 < 60 s, config activation <= 60 s.

## Vercel (apps/web)

The dashboard and marketing site run on Vercel; collector and worker stay on containers (see topology). Settings that matter:

| Setting | Value | Why |
| --- | --- | --- |
| Root Directory | `apps/web` | monorepo; Vercel installs the pnpm workspace from the repository root ("include files outside root" stays on) |
| Framework | Next.js (auto) | `apps/web/vercel.json` pins it |
| Functions region | `fra1` | EU data residency; pinned in `apps/web/vercel.json` |
| Node.js | 22.x | `engines.node >= 22.12` in the root `package.json` |
| Install / build | `pnpm install --frozen-lockfile` / `pnpm --filter @track-site/web build` | pnpm 11 from `packageManager`; turbo is not needed for the web build |
| Git | connect `soheilxx/track.site`, production branch `main`, previews for `feat/*` | every push deploys |

Environment variables (Production and Preview; secrets never in the repo):

- Minimum for the public site: `NODE_ENV=production`, `APP_ENV=production|staging`, `HOST_MARKETING`, `HOST_APP`, `HOST_CDN`, `HOST_INGEST`, `NEXT_PUBLIC_HOST_INGEST`, `NEXT_PUBLIC_HOST_CDN`, `LEGAL_*` (operator identity for imprint/privacy).
- Dashboard and auth: `DATABASE_URL` (pooled), `DATABASE_URL_UNPOOLED` (migrations), `AUTH_SECRET`, `MASTER_KEY` + `MASTER_KEY_ID`, `CONFIG_SIGNING_PRIVATE_KEY` / `CONFIG_SIGNING_PUBLIC_KEY` / `CONFIG_SIGNING_KEY_ID`, `APPROVAL_TOKEN_SECRET`, mail (`SMTP_URL` or `RESEND_API_KEY`, `MAIL_FROM`, `CONTACT_INBOX_EMAIL`).
- Optional, each enabling one feature honestly: `OPENAI_API_KEY` + `AI_MODEL_*`, `STRIPE_*`, vendor OAuth apps (`GOOGLE_OAUTH_*`, `LINKEDIN_*`, `AMAZON_ADS_*`, `X_CONSUMER_*`, `GOOGLE_ADS_DEVELOPER_TOKEN`), `GOOGLE_SITE_VERIFICATION`, `BING_SITE_VERIFICATION`.

Without `DATABASE_URL` the marketing site works and every dashboard/auth route fails; run migrations with the unpooled URL before the first sign-up. The database must be PostgreSQL in the EU (Neon Frankfurt, Supabase Frankfurt or RDS eu-central-1) with the `tracksite_app` and `tracksite_worker` roles created by the migrations.

### Current state (2026-09-03)

- Vercel project `modernice/track-site` (ID `prj_w3HvPvF8Q8d9FRZgNXD4r8u4Ig1W`), Git-connected to `soheilxx/track.site`, Root Directory `apps/web`, Node 22.x, functions in `fra1`. Domains: `www.track.site` (canonical), `track.site` (308 → www), `track-site-tau.vercel.app`.
- Environment variables set for Production and Preview: generated `AUTH_SECRET`, `MASTER_KEY` (+`MASTER_KEY_ID=vercel-v1`), `APPROVAL_TOKEN_SECRET`, Ed25519 `CONFIG_SIGNING_*` (`cfg-vercel-v1`), `HOST_*` (marketing/app on `https://www.track.site`, ingest/cdn on the planned `ingest.`/`cdn.track.site`), drivers (`pg`/`local`), AI model names, `APP_ENV`.
- Not set yet: `DATABASE_URL` / `DATABASE_URL_UNPOOLED` (EU Postgres), mail, `OPENAI_API_KEY`, `STRIPE_*`, `LEGAL_*`, vendor OAuth apps. Without the database the marketing site is live and every dashboard/auth route answers as signed-out; `/api/health` reports `db:false`.
- Production branch is `main` (created 2026-09-03 from the feature branch); every push to `main` deploys production, pushes to `feat/*` build previews. Manual production deployment stays available:

```bash
# from the repository root (linked to modernice/track-site)
npx vercel@latest deploy --prod --scope modernice
```

- Collector and worker are not on Vercel (long-running processes, EU containers per topology); until they run, `ingest.track.site` and `cdn.track.site` do not resolve and browser snippets cannot send.
