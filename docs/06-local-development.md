# 06 - Local Development

## Prerequisites

- Node 24 (`.nvmrc`), pnpm 11 (`corepack enable && corepack prepare pnpm@11.21.0 --activate`)
- PostgreSQL 16+: Docker (`infra/docker-compose.yml`) or the embedded helper below
- Optional (Docker): ClickHouse, LocalStack (SQS), MinIO (S3), Valkey, OTel collector

## 1. Install

```bash
pnpm install
cp .env.example .env
pnpm --filter @track-site/core keys:generate   # prints MASTER_KEY, CONFIG_SIGNING_* and AUTH_SECRET
```

## 2. Database

Docker:

```bash
docker compose -f infra/docker-compose.yml up -d postgres
```

Embedded Postgres (no Docker; used on the Windows build machine):

```bash
pnpm --dir .local/tools --ignore-workspace add embedded-postgres@18.4.0-beta.17   # once; the runtime is deliberately not a workspace dependency (its build scripts would fail the Vercel install)
node scripts/local-postgres.mjs start   # Postgres 18 on 127.0.0.1:54330, data in .local/pgdata
node scripts/local-postgres.mjs stop
```

`DATABASE_URL=postgresql://postgres:localdev@127.0.0.1:54330/tracksite_dev`
`TEST_DATABASE_URL=postgresql://postgres:localdev@127.0.0.1:54330/tracksite_test`

```bash
pnpm db:migrate
pnpm db:seed     # synthetic organization, site A7K2Q9, demo users; no real data
```

## 3. Run

```bash
pnpm dev   # web :3000, collector :3100, worker
```

Local hosts (no DNS): marketing `http://localhost:3000`, dashboard `http://localhost:3000/app`, API `http://localhost:3000/api`, CDN `http://localhost:3000/cdn/v1/tracker.js`, ingest `http://localhost:3100`.

Demo login after seed (only when `SEED_DEMO=true`): `owner@acme.test` / `Demo-Password-123!`

## 4. Tests

| Command | Scope |
| --- | --- |
| `pnpm lint`, `pnpm typecheck`, `pnpm format:check` | static |
| `pnpm test` | unit, no DB |
| `pnpm test:integration` | Postgres integration; DB name must end with `_test` |
| `pnpm test:contract` | connector contract tests against mock vendor servers |
| `pnpm test:e2e` | Playwright against a production build of `apps/web` (`next start` with `AI_DEV_FIXTURES=1` so the dev-only Track AI fixture route answers; seeded demo organization) |
| `pnpm sdk:budget` | SDK bundle size gate (<= 30 KB gzip) |
| `pnpm seo:check` | title, description, canonical, hreflang, JSON-LD, broken links |
| `pnpm load:collector` | load test against the collector (`docs/performance-baseline.md`) |

## 5. Mock vendors and AI

- `VENDOR_MOCK_BASE_URL` points connectors at the mock servers (`pnpm --filter @track-site/testing mock:vendors`).
- Without `OPENAI_API_KEY` the chat shows the rule-based wizard and an honest "AI not configured" state.
- Stripe: test keys + `stripe listen --forward-to localhost:3000/api/billing/webhook`; without keys the pricing page shows "billing not configured".

## 6. Conventions

- Conventional commits, one logical change per commit.
- After schema changes: `pnpm db:generate`, review the SQL, commit `packages/db/drizzle/*.sql`.
- Never run `next build` while `next dev` is running (shared `.next`).
