# 08 - AI Provider and Secret Management

## OpenAI projects (pre-existing, do not recreate or reconfigure)

| Project | Used by | Key variable |
| --- | --- | --- |
| `track.site-development` | development, tests, staging | `OPENAI_API_KEY` in the development/staging secret store |
| `track.site-production` | production only | `OPENAI_API_KEY` in the production secret store |

Minimal key permissions:

| Endpoint | Permission |
| --- | --- |
| List models (`GET /v1/models`) | Read |
| Responses (`POST /v1/responses`) | Write |
| everything else | None |

Only the Responses API is used (strict function calling, structured outputs, streaming). Assistants/Threads and Chat Completions are not used anywhere in the code base (`scripts/check-source-boundary.mjs` also fails on `chat.completions` and `beta.assistants`).

## Model routing

| Variable | Default (verified 2026-09-02) | Role |
| --- | --- | --- |
| `AI_MODEL_PRIMARY` | `gpt-5.6-terra` | onboarding and configuration turns |
| `AI_MODEL_FAST` | `gpt-5.6-luna` | read-only answers, summaries, fallback |
| `AI_MODEL_COMPLEX` | `gpt-5.6-sol` | escalations (ambiguous plans, diagnostics) |

Model ids are never hard-coded in the frontend; the UI only shows the role name. On startup `packages/ai` calls `models.list()` and verifies that every configured model is available in the project. A missing model is logged as a blocker (`ai.model_unavailable`), written to the AI health status shown in the dashboard, and the assistant degrades to the rule-based wizard. Suggested replacements are reported from the list of available `gpt-5.6*` models but the allow-list is never changed automatically.

## Where keys live

| Environment | Store | Notes |
| --- | --- | --- |
| local | `.env` (git-ignored) | `OPENAI_API_KEY=` stays empty unless the developer has a development key |
| CI | GitHub Actions secrets | tests run with mocked OpenAI responses; no key needed |
| staging | Vercel project env (web) + AWS Secrets Manager (`/track-site/staging/openai`) for workers | development project key |
| production | Vercel production env + AWS Secrets Manager (`/track-site/production/openai`) | production project key |

Keys are read only server-side through `loadEnv()`. They never reach the browser (`NEXT_PUBLIC_*` never contains secrets), logs (pino redaction), chat transcripts (DLP interceptor + separate credential path), or the customer database.

## Data minimisation towards OpenAI

- `store: false` on every request; no `previous_response_id`, no Conversations.
- Only minimized schemas, aggregates, redacted diagnostics and synthetic examples are sent; never raw visitor events, IPs, e-mails, phone numbers, order details, full URLs with query strings, free text from visitor forms or secrets.
- `safety_identifier` is an HMAC of the tenant id.
- Developer instructions and tool schemas are stable to benefit from prompt caching.

## Rotation

1. Create a new key in the same OpenAI project with the same minimal permissions.
2. Update the secret store; redeploy (web) / restart (worker).
3. Revoke the old key after the health check confirms the new key (`ai.health = ok`).

## Other platform secrets

| Secret | Store | Rotation |
| --- | --- | --- |
| `MASTER_KEY` (envelope root, `KMS_DRIVER=local`) or AWS KMS key | Secrets Manager / KMS | `pnpm --filter @track-site/db rotate-secrets` re-wraps DEKs |
| `CONFIG_SIGNING_PRIVATE_KEY` | Secrets Manager | see `07-deployment-runbook.md` (overlap window, SDK rebuild) |
| `AUTH_SECRET`, `APPROVAL_TOKEN_SECRET` | Secrets Manager | rotate with session invalidation window |
| Stripe keys / webhook secret | Vercel env | Stripe dashboard rotation |
| Vendor OAuth client secrets | Secrets Manager | vendor console |
