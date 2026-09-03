# track.site

Multi-tenant, AI-first tag manager, consent-aware server-side event router and first-party event layer. One async snippet in the browser, an assistant-guided setup in the dashboard, verified shop and server sources for authoritative purchases, and 22 destination connectors (browser, server and hybrid) with consent enforced per event and per destination.

- Product architecture: `docs/01-target-architecture.md`
- Integrations handover (all destinations, API versions, dedup, tests): `docs/09-integrations-handover.md` and the machine-checked `docs/integrations-matrix.md`
- Commerce integrations (Shopify, WooCommerce, Shopware 6): `docs/10-commerce-integrations.md`
- Status per area: `IMPLEMENTATION_STATUS.md`
- Threat model, privacy data map, AI and secrets: `docs/03-threat-model.md`, `docs/04-privacy-data-map.md`, `docs/08-ai-and-secrets.md`

## Layout

```
apps/web         Next.js 16 dashboard, marketing site (en/de), API routes, Stripe, privacy centre
apps/collector   Hono collector: browser/server ingestion, config delivery, affiliate + shop inbound
apps/worker      Ingest → policy → event store → destination delivery, retention and usage jobs
packages/*       core, db (Drizzle + RLS), events, policy, config (signed bundles), connectors, ai, sdk, queue, analytics, ui, testing
integrations/*   Shopify web pixel, WooCommerce plugin, Shopware app manifest
docs/*           Architecture, runbooks, ADRs, handover
```

## Local development

Requirements: Node 24, pnpm 11, PostgreSQL 18 (an embedded instance is started by `scripts/local-postgres.mjs`).

```bash
pnpm install
cp .env.example .env            # fill in what you have; the app degrades honestly without vendor keys
pnpm db:migrate && pnpm db:seed # SEED_DEMO=true creates a demo organisation
pnpm dev                        # web :3000, collector :3100, worker
MOCK_VENDOR_PORT=3250 pnpm --filter @track-site/testing mock:vendors   # mock vendor APIs for local sends
```

## Quality gates

```bash
pnpm lint && pnpm typecheck && pnpm test
pnpm --filter @track-site/connectors test:contract   # 61 contract tests against the mock vendors
pnpm test:integration                                # DB-backed tests (RLS, event store, pipeline)
pnpm --filter @track-site/sdk budget                 # tracker.js ≤ 30 KB gzip
pnpm seo:check                                       # marketing pages, sitemap, feed (needs a running web server)
pnpm load:collector                                  # collector load baseline (docs/performance-baseline.md)
```

## Non-negotiables

Tenant context only from sessions or source keys; RLS on every tenant table; no custom HTML/JS tags, no fingerprinting, no consent bypass, no synthetic conversions; the model acts only through typed, server-validated tools with approvals and audit; secrets never reach logs, transcripts, the model or the client; unknown stays `null`.
