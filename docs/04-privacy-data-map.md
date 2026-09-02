# 04 - Privacy Data Map

Roles: the customer is the controller for visitor tracking on their property; track.site is a processor under Art. 28 GDPR. track.site never uses customer raw data for its own training, advertising, cross-tenant identity graphs or general benchmarks. EU data region is the default.

## 1. Data inventory

| Data | Category | Source | Class | Storage | Retention default | Recipients |
| --- | --- | --- | --- | --- | --- | --- |
| `anonymous_id` (random first-party cookie/localStorage) | pseudonymous ID | SDK, only after analytics or marketing consent | OBSERVED | event store | 13 months | consented destinations |
| `user_id` (customer-provided) | pseudonymous ID | identify / server API | OBSERVED | event store | 13 months | per purpose |
| `session_id` | pseudonymous | SDK | OBSERVED | event store | 13 months | - |
| URL (scrubbed), referrer, UTM | usage data | SDK | OBSERVED | event store | 13 months | destinations |
| Click IDs (`gclid`, `fbclid/fbc`, `ttclid/ttp`, `rdt_cid`, `li_fat_id`) | pseudonymous, personal | SDK, marketing consent only | OBSERVED with source + expiry | event store | 90 days | matching vendor only |
| IP address | personal | request | transient | not persisted; truncated (/24, /48) for geo and bot filter; hashed for rate limits | 0 raw, 30 days hash | vendor CAPI only when consented and required |
| User agent | personal | request | OBSERVED | parsed family only | 13 months | vendor CAPI when consented |
| Hashed email/phone/name/address (SHA-256, vendor normalization) | personal (hashed) | server events / identify | OBSERVED | hash only | 13 months | vendor CAPI when consented |
| Order data (`order_id`, value, currency, items) | commercial | shop webhooks / server API | OBSERVED (server_verified) | event store | 13 months | destinations per policy |
| Consent snapshot | evidentiary | CMP / `track.consent` | OBSERVED | Postgres + event | 3 years | - |
| Inferences (page type, mapping suggestions) | derived | AI on aggregate inputs | INFERRED with confidence/expiry | Postgres | until expiry | never exported to ad platforms |
| Account data (email, name, password hash) | personal | signup | - | Postgres | account lifetime + 30 days | Stripe (billing email) |
| Billing data | personal/financial | Stripe | - | Stripe (only customer id in DB) | legal retention | Stripe |
| Connector credentials | secret | secure credential card / OAuth | - | envelope encrypted | until rotated/revoked | vendor |
| Audit log | security | system | - | Postgres append-only | 2 years | - |
| Chat transcript (redacted) + structured summary | personal | dashboard chat | - | Postgres, encrypted | 30 days / until site deletion | OpenAI (`store: false`, minimized) |
| Contact / demo / support requests | personal | forms | - | Postgres inbox + email | 12 months | configured mailbox |

Never collected: passwords, CVV/card data, keystrokes, full forms, session replay, arbitrary DOM text, unfiltered query strings, precise geolocation.

## 2. Consent engine (strict-EU default)

- Purposes: `necessary`, `analytics`, `marketing`, `personalization`; each event carries a consent snapshot id.
- Without a valid signal: no non-essential cookies/storage/IDs, no analytics or marketing persistence, no pixels, no CAPI, no replay afterwards. Reject is as easy as accept.
- Withdrawal takes effect immediately for capture and delivery; purpose-specific local IDs are removed.
- Google Consent Mode v2 flags (`ad_storage`, `analytics_storage`, `ad_user_data`, `ad_personalization`) are derived from purposes and set before any Google tag. Basic (blocking) mode is default; advanced mode only after explicit customer opt-in with documented legal review.
- Signals: `track.consent()`, IAB TCF 2.2, GPP, Global Privacy Control, Usercentrics, Cookiebot, OneTrust.
- Server-side events never bypass a missing browser consent for advertising purposes; operational processing of a purchase is possible under `necessary` but ad dispatch is blocked.

## 3. Data subject rights

Workflows for export, deletion, restriction, rectification, objection and portability. Deletion propagates through Postgres, event store, caches, queues (tombstone filter) and object store; vendor deletion APIs are invoked where available, otherwise documented. Backups expire within 35 days; the deletion record notes the backup horizon.

## 4. Transfers and subprocessors

| Subprocessor | Purpose | Region | Transfer basis |
| --- | --- | --- | --- |
| Hosting / DB / queue (EU) | infrastructure | EU | - |
| Stripe | billing | EU/US | SCC / DPF per Stripe DPA |
| OpenAI | AI assistant (minimized, redacted, `store: false`) | US, EU residency where available | SCC / DPF; per-tenant switch, feature can be disabled |
| Email provider (SMTP / Resend) | transactional email | configurable | provider DPA |
| Ad/analytics vendors chosen by the customer | destinations | vendor-specific | customer contracts; see `05-connector-credential-matrix.md` |

Legal templates (DPA, TOMs, subprocessor list) live under `apps/web/content/legal/` and are marked as templates requiring legal review. They are not legal advice.

## 5. Logging rule

No PII in logs, traces, URLs, error tracking or AI prompts. pino redacts `email`, `phone`, `ip`, `userAgent`, `*token*`, `*secret*`, `authorization`, `cookie`.
