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
