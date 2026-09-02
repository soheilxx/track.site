# 03 - Threat Model

Method: STRIDE per trust boundary; updated whenever a boundary changes.

## 1. Assets

| Asset | Sensitivity |
| --- | --- |
| Customer connector credentials (CAPI tokens, OAuth refresh tokens, API secrets) | critical: envelope encrypted, never in logs, chat or model |
| Visitor events (pseudonymous IDs, hashed identifiers, click IDs, transient IP) | high: personal data under GDPR |
| Consent snapshots | high: evidentiary |
| Config versions + signing key | critical: supply chain for customer sites |
| Billing state, Stripe customer IDs | high |
| Audit log | high: append only |
| OpenAI API key, Stripe secret, DB credentials, master key | critical |

## 2. Trust boundaries and threats

### B1 Customer browser -> collector
- Spoofing: tracking IDs are public. Mitigations: allow-listed origins per site, rate limits per IP/site/org, bot heuristics, payload limits (64 KB, 50 events), schema validation; the public ID only selects the site, it never grants trust.
- Event poisoning / replay: `source_event_id` unique per site; timestamps within 48 h; sequence numbers per SDK session.
- Denial of service: 202 only after enqueue; queue back-pressure returns 503 + `Retry-After`; per-partition isolation.
- Privacy: consent gate before persistence; URL/PII scrubbing in SDK and worker; raw IP only transient.

### B2 Server events and shop webhooks -> API/collector
- Spoofing / replay: HMAC-SHA256 with timestamp + nonce (5 min window, nonce cache), rotatable source keys, idempotency keys; platform signatures (Shopify HMAC, WooCommerce signed plugin, Shopware app secret).
- Tampering: signed canonical JSON body.

### B3 Dashboard user -> control plane
- Elevation: RBAC on every server action and route, RLS in Postgres, composite tenant keys, cross-tenant negative tests. Hiding UI never counts.
- Session: better-auth sessions (httpOnly, secure, SameSite=Lax), rotation on privilege change, revoke-all, MFA/WebAuthn optional for OWNER/ADMIN and mandatory for PLATFORM_ADMIN.
- CSRF: same-origin server actions with origin check; API uses bearer tokens.
- Open redirect: only relative `next` paths; OAuth redirect URIs registered per environment.

### B4 AI agent and tools
- Prompt injection from site scans, event values, vendor responses: untrusted data is wrapped, size-limited and semantically separated; tools have a state/role allow-list; injected content can at most trigger a draft, never publish, credential access or cross-tenant reads.
- Confused deputy: tenant/site/actor derive from the session, never from model arguments; every write tool re-validates with Zod and checks RBAC, entitlements, workflow state and the policy engine.
- Secret leakage: pre-LLM DLP interceptor (token patterns, entropy) blocks secrets from reaching the model; transcript redaction; secure credential card outside the transcript.
- Unconfirmed mutation: approval token (HMAC over action, version, tenant, actor, diff hash; 10 min expiry; single use).
- Availability: circuit breaker, model fallback, rule-based wizard.

### B5 Worker -> vendor APIs
- SSRF (generic webhook): DNS resolution check, blocked private/link-local/loopback ranges, no redirects, re-check at connect, allow-listed schemes and ports.
- Credential misuse: credentials decrypted only in the worker process per dispatch, never logged.
- Vendor compromise: outbound payload allow-lists per connector; only hashed identifiers per vendor spec.

### B6 Config delivery
- Supply chain: Ed25519-signed immutable bundles, key in KMS, SDK verifies before applying; fail closed for tracking, open for the host page. JSONLogic with allow-list + complexity limit.
- Cache poisoning: versioned immutable URLs + short-TTL manifest.

### B7 Billing
- Webhook signature verification, idempotent event ledger, entitlements only from verified server truth.

### B8 Platform operators
- No raw data by default; break-glass access is time-boxed, justified, step-up authenticated and immutably audited. Global and tenant kill switches.

## 3. Abuse / AUP

Prohibited and technically discouraged: stealth tracking, fingerprinting, consent bypass, ad fraud / synthetic conversions, credential capture, children or sensitive-category tracking, malware. Domain ownership verification is required before production dispatch; risk-based review for high-volume or high-risk verticals.

## 4. Controls checklist

| Control | Where | CI |
| --- | --- | --- |
| CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy | `apps/web/next.config.ts`, collector middleware | e2e header test |
| Rate limits, payload limits | `packages/core`, collector | unit + integration |
| RLS + cross-tenant negative tests | `packages/db` | integration |
| SSRF guard | `packages/connectors` webhook | unit |
| Approval tokens, DLP interceptor | `packages/ai` | unit + eval |
| Signed config | `packages/config`, `packages/sdk` | unit |
| Secret scan, dependency audit, SAST | `.github/workflows/ci.yml` | gitleaks, pnpm audit, CodeQL |
| Append-only audit log | DB trigger blocks UPDATE/DELETE | integration |
