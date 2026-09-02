# ADR-0002 - Drizzle ORM + SQL migrations on PostgreSQL with Row-Level Security

Date: 2026-09-02. Status: accepted.

## Context
The spec allows Prisma if the current stable version and RLS/migration needs are handled cleanly. On 2026-09-02 the `prisma` CLI `latest` tag was `8.0.0-rc.12` while `@prisma/client` latest was `7.10.0`; Prisma 7 needs driver adapters and a generator step. RLS must be a first-class part of the schema, and the data-plane hot path needs lean SQL.

## Decision
Drizzle ORM 0.45 with `pg`, `drizzle-kit` SQL migrations committed to the repo, RLS policies declared in the schema and applied by migrations. Runtime transactions run `SET LOCAL ROLE tracksite_app` and `set_config('app.organization_id', ..., true)` via `withTenant`. Migrations run as the owner role.

## Alternatives
Prisma 7/8 (more moving parts, RC on latest, RLS outside the schema); Kysely (no schema-level RLS).

## Consequences
Reviewable SQL migrations; `pnpm db:check` fails CI on drift; RLS is enforced independently of application code; better-auth uses its Drizzle adapter on the same connection.
