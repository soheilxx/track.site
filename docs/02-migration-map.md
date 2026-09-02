# 02 - Migration Map

Purpose: prove what was and was not carried over from the optional read-only source `soheilxx/urlshorter`, and how existing data would be migrated if the owner ever asks for it.

## 1. Code / concept map

| Source (`urlshorter`) | Target (`track.site`) | Status | Notes |
| --- | --- | --- | --- |
| `eslint.config.mjs`, `.prettierrc` | root `eslint.config.mjs`, `.prettierrc` | rewritten | stricter rules (no eval / new Function, no console) |
| `vitest.config.ts`, `vitest.integration.config.ts` | per-package vitest configs + `packages/testing` | rewritten | test DB guard (`_test` suffix) |
| `playwright.config.ts` | `apps/web/playwright.config.ts` | rewritten | desktop + mobile projects, axe checks |
| `src/lib/secrets.ts` | `packages/core/src/crypto/envelope.ts` | pattern only | envelope encryption, KMS interface, key versioning |
| `src/lib/signing.ts` | `packages/core/src/crypto/hmac.ts` | pattern only | Web Crypto HMAC, edge + node |
| `src/lib/logger.ts` | `packages/core/src/logger.ts` | replaced | pino with redact paths |
| `src/lib/env.ts` (lazy zod env) | `packages/core/src/env.ts` | pattern only | zod v4, no product defaults |
| `src/lib/permissions.ts` | `packages/core/src/rbac.ts` | pattern only | new role set |
| `src/app/globals.css` tokens | `packages/ui/src/styles/tokens.css` | inspired | derived from the fast.site design language |
| `scripts/vercel-build.sh` | `apps/web/scripts/vercel-build.sh` | rewritten | drizzle migrate before build |
| README structure | `README.md` | inspired | |

## 2. Explicitly excluded (must never appear in track.site)

| Source module | Reason |
| --- | --- |
| `src/app/[code]`, `lib/shortcode.ts`, `ShortLink`, redirect `Destination`, `ClickEvent`, `DailyAggregate`, bridge page | URL shortener / redirect functionality is a non-goal |
| `src/app/gewinn`, `SweepstakesEntry`, `sweepstakes*.ts` | sweepstakes, unrelated |
| `src/app/das-buch`, `buch-config.ts` | book landing page, unrelated |
| `lib/amazon/*`, all `Amazon*` tables | Amazon ranking, unrelated |
| `src/app/t.js`, `tag-collect.ts`, `tag-capi.ts`, `tag-sites.ts`, `TagEvent`, `TagSiteConfig`, `meta-capi.ts`, `tiktok-events.ts`, `linkedin-capi.ts` | single-tenant tag script without consent engine, canonical model or queues |
| `User`, `LoginAttempt`, env-admin bootstrap, `auth.ts`, `session.ts` | single-tenant auth, replaced by better-auth |
| `.env*`, GA4/pixel IDs, tokens, Vercel settings | secrets / production data |
| Prisma migrations | not imported; track.site has a clean baseline migration |

Automated guard: `scripts/check-source-boundary.mjs` (CI job `source-boundary`) fails if forbidden identifiers (`ShortLink`, `shortcode`, `SweepstakesEntry`, `AmazonRank`, `TagSiteConfig`, `lze(`, `/t.js`) appear outside `docs/`.

## 3. Data migration (only on request; not executed)

No data was migrated. If the owner ever wants `lizenzzumerfolg.com` tracking data in track.site:

1. Create a "Legacy" organization and one site per legacy domain (new 6-character tracking IDs).
2. Dry run: export legacy tag events to JSONL, map to the canonical event schema, mark every field `OBSERVED` with `source=legacy-import`, set `consent_snapshot_id=null` and `processing_state=imported`; such events are never dispatched to destinations.
3. Backfill into the event store with checksums per batch and an import log under `docs/migrations/`.
4. Rollback = delete by `import_batch_id`.

Short links, sweepstakes and Amazon data have no target in track.site and are not migrated.
