# 01 - Target Architecture

Status: implemented incrementally; `IMPLEMENTATION_STATUS.md` states what exists today.

## 1. Product cores

1. First-party event layer: lawfully collected browser and server events in a vendor-neutral canonical model.
2. Consent-aware tag manager: declarative, versioned, signed connector templates. No custom HTML/JS execution.
3. Server-side event router: durable queue, policy engine, dedup, per-destination queues, connector workers.
4. AI configuration assistant: OpenAI Responses API agent with strict function calling; control plane only.

## 2. Control plane vs. data plane

```
Control plane  apps/web (Next.js 16): marketing, auth, dashboard, AI chat, control API,
               Stripe, config publishing, audit, DSAR  ->  PostgreSQL (RLS) + outbox

Data plane     tracker.js / server API -> apps/collector (Hono, stateless, 202 after enqueue)
               -> durable queue -> apps/worker: validate -> normalize -> PII scan -> policy
               -> dedup -> event store -> destination queues -> connector -> vendor
```

The LLM never sits in the ingestion, consent, dedup, billing or destination hot path. Collector, queues, rule engine and connector workers keep running when OpenAI is slow, unreachable or disabled.

## 3. Repository layout (pnpm workspaces + Turborepo)

| Path | Package | Purpose |
| --- | --- | --- |
| `apps/web` | `@track-site/web` | Next.js App Router: marketing, dashboard + chat, control API, local CDN routes, Stripe |
| `apps/collector` | `@track-site/collector` | Hono ingestion (`POST /v1/e`, `GET /v1/c/:siteId` manifest, `/health`) |
| `apps/worker` | `@track-site/worker` | pipeline stages, destination dispatch, outbox relay, usage aggregation, retention jobs |
| `packages/core` | `@track-site/core` | env, logger, ids (tracking id), crypto (envelope, HMAC, Ed25519), result contract, URL/PII scrubbing, rate limits |
| `packages/db` | `@track-site/db` | Drizzle schema, SQL migrations, RLS, tenant-scoped client, repositories, synthetic seed |
| `packages/events` | `@track-site/events` | canonical event schema (Zod + JSON Schema), standard event catalog, normalization, data classes |
| `packages/policy` | `@track-site/policy` | consent purposes, region/purpose/vendor matrix, consent snapshots, Consent Mode mapping, PII scanner |
| `packages/queue` | `@track-site/queue` | `Queue` interface; `PgQueue` (reference), `SqsQueue`, `MemoryQueue` |
| `packages/config` | `@track-site/config` | config bundle schema, lint, diff, Ed25519 signing, publish/rollback, manifest |
| `packages/connectors` | `@track-site/connectors` | versioned `Connector` interface + webhook, meta, tiktok, reddit, linkedin, ga4, google-ads |
| `packages/ai` | `@track-site/ai` | Responses API agent loop, tool registry, UI schema, DLP interceptor, setup state machine, approvals |
| `packages/analytics` | `@track-site/analytics` | `EventStore` interface, `PgEventStore`, `ClickHouseEventStore`, aggregates, health score |
| `packages/sdk` | `@track-site/sdk` | browser SDK -> `tracker.js` (IIFE, <= 30 KB gzip), shop adapters lazy-loaded |
| `packages/ui` | `@track-site/ui` | design tokens + primitives (Tailwind 4, Radix) |
| `packages/testing` | `@track-site/testing` | fixtures, mock vendor servers, test DB helpers, load scripts |
| `integrations/shopify` | - | app config, web pixel extension, webhook topics |
| `integrations/woocommerce` | - | PHP plugin: signed order/refund webhooks + browser adapter |
| `integrations/shopware` | - | Shopware 6 app manifest: storefront script + signed webhooks |
| `infra` | - | docker-compose for the full local stack, Dockerfiles, Terraform skeleton (EU) |

## 4. Hosts

| Host | Serves | Local |
| --- | --- | --- |
| `track.site` | marketing, docs, blog, auth entry | `http://localhost:3000` |
| `app.track.site` | dashboard + AI setup | `http://localhost:3000/app` |
| `api.track.site` | control/server API | `http://localhost:3000/api` |
| `cdn.track.site` | `v1/tracker.js`, config manifests | `http://localhost:3000/cdn` |
| `ingest.track.site` | collector | `http://localhost:3100` |
| `metrics.<customer>` | optional verified CNAME proxy to ingest | - |

Hostnames come from `HOST_*` env variables; a middleware maps hosts to route groups so path-based local development works without DNS.

## 5. Data plane guarantees

- Collector returns `202` only after the durable queue has accepted the batch; otherwise `503` + `Retry-After`.
- No high-volume writes through Next.js routes; the collector is a separate stateless service.
- One logical queue per destination type, partitioned by `hash(organization_id, site_id)`; hot tenants can be pinned to dedicated partitions via `site.partition_override`.
- Transactional outbox for control-plane events (publish, credential rotation, deletion jobs).
- Retry: exponential backoff with full jitter, `Retry-After` honoured, per-destination circuit breaker, permanent vs. temporary error classes, DLQ with replay.
- Idempotency: unique `(site_id, source_event_id)` in the event store; delivery attempts keyed by `(event_id, destination_id)`; vendor dedup is additional.

## 6. Infrastructure defaults (ADR-0004)

| Concern | Reference implementation | Production adapter |
| --- | --- | --- |
| Control plane DB | PostgreSQL 16+ (EU) with RLS | same |
| Durable queue | `PgQueue` | `SqsQueue` (eu-central-1) |
| Event store | `PgEventStore` (monthly partitions) | `ClickHouseEventStore` (EU) |
| Raw archive | `FsObjectStore` | `S3ObjectStore` (SSE-KMS, EU) |
| Cache / locks / rate limits | in-process + Postgres | Redis/Valkey adapter |
| Secrets | envelope encryption, local master key | AWS KMS key provider |
| Telemetry | pino JSON logs + OpenTelemetry (OTLP HTTP) | same |

Adapters are selected by env (`QUEUE_DRIVER`, `EVENT_STORE_DRIVER`, `OBJECT_STORE_DRIVER`, `KMS_DRIVER`).

## 7. Config delivery

Draft -> validate/lint -> preview -> publish (Ed25519 signed, immutable version) -> manifest pointer -> rollback. The SDK fetches the manifest (max-age 30 s), verifies the signature with the embedded public key and fails closed for tracking, open for the host page. Published configs are active within 60 s.

## 8. Security boundaries

- Tenant context is derived from the authenticated session or server-side resolved source keys; never from request bodies or model arguments.
- All tenant tables are protected by PostgreSQL RLS; the application runs as `tracksite_app` (no bypass) and sets `app.organization_id` per transaction.
- No `eval`, `new Function`, custom HTML or arbitrary JS. Transformations are JSONLogic with an allow-list and complexity limits.
- The model reaches the world only through typed tools with server-side re-validation, RBAC, entitlements, policy checks, idempotency keys and audit entries.
