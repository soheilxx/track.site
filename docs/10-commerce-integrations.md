# 10 — Commerce integrations (Shopify, WooCommerce, Shopware 6)

Status: implemented (verified webhook receivers, pairing, UI, integration packages, tests). See `IMPLEMENTATION_STATUS.md` for the phase table.

## Design

The single snippet is the browser path. Purchases are authoritative only when they come from a **verified server-side order source**: the shop platform's own webhooks, signed with a secret the customer stores in track.site. The browser purchase stays optional and carries what the server cannot know — the visitor's consent record and click ids.

```
browser purchase (consent, click ids, order id)  ──┐
                                                   ├─ pairing by order id in the ingest stage
shop webhook (signed, verified, totals, items)   ──┘
```

Rules (worker `ingest.ts`, policy `engine.ts`):

1. A shop event carries no consent of its own. If a browser `purchase` with the same order id exists (30-day window), the server event **inherits** its consent record, anonymous/session/user id, click ids, vendor ids and hashed user data; provenance marks the consent as `DERIVED` (`browser:order_join`).
2. Without a browser purchase the verified shop record is persisted as an **operational record** (`isVerifiedShopRecord` → purpose `necessary`; identifiers stripped without the analytics purpose, click ids without marketing). It reaches only destinations whose policy needs no consent (webhooks, own reporting). Marketing consent is never assumed.
3. `conversion_records` holds one row per `(site, kind, order_id)`. A verified server record **supersedes** an unverified browser row (event id, source, value). The same path reporting the same order twice is a duplicate (`duplicate_conversion`); a cross-path pair is routed on both paths.
4. Vendors deduplicate on the **order-derived event id** `purchase:<order id>` / `refund:<order id>` (`vendorDedupId` in `@track-site/events`, `vendorMirrorId` in the SDK), so pixel, server API and shop webhook count once at Meta, TikTok, Microsoft, Pinterest, Snapchat and Reddit; Google Ads and GA4 dedupe on the order/transaction id anyway.
5. Platform redeliveries produce deterministic ULID-shaped event ids (`deterministicUlid`) and hit the event-level dedup guard.

## Receiver (`apps/collector/src/shop-inbound.ts`)

`POST /v1/shop/:platform/:trackingId/:token` — the site is resolved by tracking id, the connection by platform and unguessable path token, the secret decrypted from the vault (`credentials`, AAD `shop:<connection id>`).

| Platform | Signature | Topics → events | Notes |
| --- | --- | --- | --- |
| Shopify | `X-Shopify-Hmac-Sha256` = base64(HMAC-SHA256(body, secret)); `X-Shopify-Shop-Domain` must match | `orders/paid`, `orders/create` (paid only) → `purchase`; `refunds/create` → `refund` | line items from `line_items`, matching data from order/customer/billing address |
| WooCommerce | `X-WC-Webhook-Signature` = base64(HMAC-SHA256(body, secret)) | `order.created`/`order.updated`: status `processing`/`completed` → `purchase`; `refunds[]` → `refund` per entry | form-encoded ping (`webhook_id=`) answered after signature check |
| Shopware 6 | `shopware-shop-signature` = hex(HMAC-SHA256(body, secret)); app registration `GET …/register` (`shopware-app-signature`), `POST …/confirm` | `state_enter.order_transaction.state.paid` → `purchase`; `…refunded` → `refund`; `checkout.order.placed` → `purchase` only with `purchase_on: placed` | currency from `order.currency.isoCode`, else the connection's fallback currency |

Every accepted webhook updates `shop_connections.last_event_at`, the observed topics and flips `pending → connected`; failures are recorded in `last_error`. Paused connections answer 200 and drop. Unit tests: `shop-inbound.test.ts` (signatures, mapping, handshake).

## Data model

`shop_connections` (migration `0003_shop_connections.sql`, RLS tenant isolation): `platform`, `shop_domain`, `status` (`pending|connected|paused`), `path_token`, `credential_id`, `settings` (`default_currency`, `purchase_on`, `topics`), `last_event_at`, `last_error`. Repository: `packages/db/src/repositories/commerce.ts`.

## UI

Site → **Shop connection** (`/app/sites/[siteId]/shop`): one card per platform with domain, fallback currency, (Shopware) purchase moment, webhook URL, registration URL, secret form (vault, never shown again), status, last webhook, observed topics, per-platform steps, pause/resume/remove. Actions in `apps/web/src/server/actions/shops.ts` require `sites.update` and are audited (`shop.create|update|secret|pause|resume|delete`).

## Integration packages (`integrations/`)

- `shopify/web-pixel/` — Shopify web pixel extension (strict sandbox): standard events with the customer's consent state from the Customer Privacy API; `checkout_completed` carries the order id for pairing. README covers the webhook setup in Shopify admin.
- `woocommerce/track-site/` — WordPress plugin: snippet, thank-you-page purchase data layer, and managed native WooCommerce webhooks (`order.created`, `order.updated`) signed with the stored secret. HPOS-compatible. README covers the plugin-less alternative.
- `shopware/manifest.xml` — Shopware app manifest with registration URL, order read permissions and the three webhooks. README covers installation and the storefront snippet.

## Verification checklist

- [x] Signature verification and mapping unit tests (collector)
- [x] Policy tests for verified shop records (persist without consent, no ad dispatch)
- [x] Pipeline integration test: browser purchase + shop purchase → inheritance, record upgrade, duplicate handling
- [x] SDK tests for the shared vendor dedup id and the first-party click-id store
- [ ] Manual end-to-end against a real Shopify/WooCommerce/Shopware installation (requires customer shops; the receivers are exercised with recorded payload shapes)
