# ADR-0004 - Postgres reference implementations for queue and event store; SQS, ClickHouse, S3, KMS as production adapters

Date: 2026-09-02. Status: accepted.

## Context
The spec defaults to SQS (queue) and ClickHouse (event store) in the EU with LocalStack locally. The build machine has no Docker, and the first production scale (10-100 M events/month) is achievable with partitioned Postgres. Abstractions must ship with a working reference implementation.

## Decision
- `packages/queue`: `Queue` interface; `PgQueue` (durable table, `FOR UPDATE SKIP LOCKED`, visibility timeout, attempts, DLQ, replay) is the tested reference; `SqsQueue` (AWS SDK v3) is contract-tested against a fake; `MemoryQueue` for unit tests. Driver via `QUEUE_DRIVER`.
- `packages/analytics`: `EventStore` interface; `PgEventStore` (monthly range partitions, unique `(site_id, source_event_id)`) reference; `ClickHouseEventStore` adapter. Driver via `EVENT_STORE_DRIVER`.
- Object store (`fs`/`s3`) and KMS (`local`/`aws`) follow the same pattern.

## Consequences
Local dev and CI run on Postgres only; production adapters are exercised by contract tests and must be verified in staging before use (tracked in `IMPLEMENTATION_STATUS.md`). Switching drivers is an env change.
