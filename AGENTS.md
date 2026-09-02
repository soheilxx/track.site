# track.site - guidance for coding agents

Read `IMPLEMENTATION_STATUS.md` first and continue from the `NEXT` step. The product spec is the owner's master prompt (kept outside the repo); `docs/01-target-architecture.md` is the in-repo summary.

## Non-negotiables

- Target repo is `soheilxx/track.site`. Work on feature branches, never force push, never rewrite `main`.
- Multi-tenant everywhere: tenant context from session or source keys only; every tenant table has `organization_id`; RLS is enforced with `tracksite_app`.
- No `eval`, `new Function`, custom HTML/JS execution, fingerprinting, consent bypass, synthetic conversions.
- The LLM is control plane only and acts exclusively through typed tools with server-side validation, RBAC, approval tokens and audit entries.
- Secrets never reach logs, chat transcripts, the model or the client. Use envelope encryption from `packages/core`.
- Unknown stays `null`; never invent identities, consent, orders, values or conversions.
- Nothing from `urlshorter` beyond neutral infrastructure patterns (see `docs/02-migration-map.md`).

## Commands

`pnpm install`, `pnpm dev`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:contract`, `pnpm test:e2e`, `pnpm build`, `pnpm db:migrate`, `pnpm db:seed`

## Layout

See `docs/01-target-architecture.md` section 3. Shared code lives in `packages/*`; apps import only from packages, never from each other.
