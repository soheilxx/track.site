# 00 - Source Audit

Date: 2026-09-02. Status: living document.

## 1. Target repository

| Item | Finding |
| --- | --- |
| Repository | `https://github.com/soheilxx/track.site.git` (public) |
| Correction | The master prompt named `modernice/track.site`; that repository does not exist (HTTP 404, also authenticated as `soheilxx`). The owner corrected the target in chat on 2026-09-02 to `soheilxx/track.site`. |
| State at audit | Empty repository: no commits, no branches, no CLAUDE.md / AGENTS.md / README / architecture files. |
| Local clone | `C:\Users\Soheil\Downloads\track.site`, branch `feat/ai-tag-manager-platform` created from the empty `main`. |
| Existing user changes | None (empty). Nothing to preserve. |
| Push policy | Normal feature-branch push only; never force push; never rewrite history; `main` is never overwritten. |

Because the repository was empty, a clean structure was created (see `01-target-architecture.md` and ADR-0001).

## 2. Optional read-only reference: `soheilxx/urlshorter`

Inspected read-only on explicit permission of the owner (chat, 2026-09-02). Local clone at `C:\Users\Soheil\Downloads\urlshorter` (branch `main`, clean working tree, HEAD `f7880fc`). No file in that repository was modified.

### 2.1 What the source is

A single-tenant Next.js 15 application for `lizenzzumerfolg.com`: URL shortener with click statistics, a book landing page, a sweepstakes module, Amazon ranking monitoring and a small pixel/CAPI tag script (`t.js`). It is not a product base for track.site and is explicitly out of scope as a dependency.

### 2.2 License and secret scan

| Check | Result |
| --- | --- |
| License file | none (`package.json` has no `license` field): treated as proprietary, owned by the same author. Only patterns were reused, no files copied verbatim. |
| Secret patterns (`sk_live_`, `AKIA...`, private keys, `ghp_`, Slack tokens) over tracked files | 0 hits |
| Tracked env files | `.env.example` (names only) and `.env.test` (local test values). Neither was copied. Only variable names were viewed. |
| `.git`, `node_modules`, build artefacts, logs, DB dumps | not touched, not copied |

### 2.3 Neutral infrastructure considered for reuse

| Source item | Decision | Target |
| --- | --- | --- |
| Flat ESLint + Prettier conventions (printWidth 100, double quotes, trailing commas) | adopted (rewritten) | root `eslint.config.mjs`, `.prettierrc` |
| Vitest split unit vs. integration with a global setup that refuses to run unless the DB name ends with `_test` | adopted (rewritten) | `packages/testing` |
| Playwright against a production build with a health-check web server | adopted (rewritten) | `apps/web/playwright.config.ts` |
| AES-256-GCM secret helper with HKDF-derived key and versioned `v1:` payload | pattern adopted, extended to envelope encryption with per-secret DEKs and a KMS abstraction | `packages/core/src/crypto` |
| Web Crypto HMAC helper usable in edge and node | pattern adopted (rewritten) | `packages/core/src/crypto/hmac.ts` |
| Structured JSON logger without PII | replaced by pino with redaction paths | `packages/core/src/logger.ts` |
| Design tokens (off-white surface, royal blue #1F62FF, Bricolage Grotesque display font, Inter body, 12-18 px radii) | adopted as starting palette, re-derived from the fast.site inspiration; no assets copied | `packages/ui` |
| Vercel build script running migrations before `next build` with the unpooled URL | pattern adopted | `apps/web/scripts/vercel-build.sh` |
| Role helper without ORM imports (usable in client/edge) | pattern adopted, different role set | `packages/core/src/rbac.ts` |

### 2.4 Explicitly NOT reused

- Short-link / slug / redirect routing, `ShortLink`, `ClickEvent`, redirect `Destination` models and statistics
- Sweepstakes, book landing page, Amazon ranking modules and all their tables and migrations
- `t.js`, `/api/tag/collect`, `TagEvent`, `TagSiteConfig`, `tag-capi.ts` and any pixel/CAPI forwarding code
- Single-tenant auth (`User`, `LoginAttempt`, env-admin bootstrap): replaced by multi-tenant better-auth (ADR-0003)
- Any `.env`, tokens, GA4/pixel IDs, production data or migrations

Guard: `scripts/check-source-boundary.mjs` (CI job `source-boundary`) fails when forbidden identifiers appear outside `docs/`. See `02-migration-map.md`.

## 3. Toolchain verified on 2026-09-02

| Tool | Version | Note |
| --- | --- | --- |
| Node | 24.18.0 | `.nvmrc` |
| pnpm | 11.21.0 | `packageManager` |
| git | 2.55 | |
| Docker | not installed on the build machine | compose file provided; local dev uses embedded Postgres 18 |

Dependency versions were pinned after checking npm dist-tags (see ADR-0002 and ADR-0008).
