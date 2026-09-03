# Performance baseline — collector ingestion

Measured 2026-09-03 on the development setup. These numbers describe the reference implementation running in **dev mode on a laptop**; they are a floor, not a capacity claim for the EU production deployment, which has to be measured on its own infrastructure (`infra/terraform`) before launch.

## Setup

| Component | Configuration |
| --- | --- |
| Machine | Windows 11, Node 24, single collector process started with `tsx watch` (no clustering) |
| Database | embedded PostgreSQL 18 on `127.0.0.1:54330`, `PgQueue` (transactional outbox/queue in Postgres) |
| Rate limits | `RATE_LIMIT_IP_PER_MIN=100000`, `RATE_LIMIT_SITE_PER_MIN=10000000` for the throughput run; defaults (`600` per IP, `20000` per site) for the limiter runs |
| Generator | `pnpm load:collector` (autocannon): 50 connections, 30 s, 5 events per `POST /v1/e`, GA4-shaped `page_view`/`view_item` events with analytics consent, a rotating synthetic client IP per request (`x-forwarded-for`) |
| Site | `TI8R42` (active, origin `shop.example.com` allowed) |

Reproduce:

```bash
RATE_LIMIT_IP_PER_MIN=100000 RATE_LIMIT_SITE_PER_MIN=10000000 pnpm --filter @track-site/collector dev
LOAD_SITE_ID=TI8R42 LOAD_DURATION_S=30 LOAD_CONNECTIONS=50 LOAD_BATCH=5 pnpm load:collector
```

Raw results are written to `packages/testing/load-results/<timestamp>.json` (git-ignored).

## Throughput run (limits raised)

| Metric | Value |
| --- | --- |
| Requests / s | 483 |
| Events / s | 2,417 |
| Accepted (HTTP 202) | 14,017 of 14,017 requests (70,085 events) |
| Errors / timeouts | 0 / 0 |
| Latency p50 | 97 ms |
| Latency p95 | 189 ms |
| Latency p99 | 303 ms |
| Latency max | 2,043 ms |

Every accepted batch is validated, rate-limited, origin-checked and written to the Postgres queue before the 202 is returned (no fire-and-forget), so the latency includes one queue insert per batch.

## Worker drain

A single worker (`tsx watch`, default concurrency) consumed the 70,085 events of the throughput run and left the ingest queue empty within 2.5 minutes of the run finishing (`/health` reported `queue.ready: 0` at 02:13:06 for a run that ended 02:11:00), i.e. at least ~470 events/s sustained through normalisation, PII scan, policy evaluation, consent snapshots, the partitioned event store and routing.

## Limiter runs (defaults)

The same generator against default limits shows the protection working as designed:

| Run | Accepted | Rejected (429) | Explanation |
| --- | --- | --- | --- |
| single client IP | 120 requests (600 events) | 23,391 | per-IP limit of 600 events/min |
| rotating client IPs | 4,000 requests (20,000 events) | 43,683 | per-site limit of 20,000 events/min |

Rejections are cheap (p50 25–36 ms) and carry `retry-after`/rate-limit headers.

## Caveats

- Dev mode (`tsx watch`, source maps, no cluster) and a laptop disk: production numbers will differ in both directions.
- The generator and the collector shared one machine; part of the latency is generator overhead.
- Postgres-backed queue: at higher volumes the SQS driver (`QUEUE_DRIVER=sqs`) and ClickHouse event store are the intended production path; they are not covered by this baseline.
- The run exercised browser batches only. Server batches (`/v1/s`) and shop webhooks take the same validation path plus HMAC/source-key checks.

## Targets to verify on EU infrastructure before launch

- p95 < 150 ms at 5,000 events/s per collector instance behind the edge
- worker lag < 30 s at that rate with two worker instances
- zero 5xx over a 30-minute soak; DLQ empty
