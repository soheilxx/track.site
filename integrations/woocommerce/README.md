# WooCommerce integration

`track-site/` is a small WordPress plugin (PHP 8.1+, WooCommerce 8+, HPOS-compatible). It does three things and nothing else:

1. **Snippet** – prints the standard async loader with the tracking id in `wp_head` (custom SDK/collector hosts only when they differ from the defaults).
2. **Purchase data layer** – on the thank-you page pushes a GA4-shaped `purchase` into `window.dataLayer` (transaction id = order id, value, currency, tax, shipping, coupon, items), guarded by an order meta flag against reloads. The SDK observes the push through a `data_layer` trigger with key `purchase`; this is the browser path that carries consent and click ids.
3. **Signed webhooks** – creates and maintains two native WooCommerce webhooks (`order.created`, `order.updated`, REST v3 payload) pointing at the connection's webhook URL, signed with the secret you enter (`X-WC-Webhook-Signature`, base64 HMAC-SHA256). Deactivating the plugin removes them.

Payment details are never part of the payload: WooCommerce's order representation contains billing/shipping data, totals and line items, not card data.

## Install

1. In track.site: site → **Shop connection** → WooCommerce, enter the shop domain, save, copy the webhook URL; choose a secret (≥ 8 characters, ideally 32 random) and store it there.
2. Upload `track-site/` to `wp-content/plugins/`, activate, open Settings → track.site, enter tracking id, webhook URL and the same secret, save. The plugin reports the two managed webhooks.
3. Place a test order and set it to *processing*: the event debugger shows `purchase` with `source: woocommerce`, `source_verified: true`.

## Without the plugin

Create the same webhooks under WooCommerce → Settings → Advanced → Webhooks (topics `order.created` and `order.updated`, API version v3, delivery URL = webhook URL, secret = the stored secret) and add the snippet to your theme. Refunds are recognised from the order's `refunds[]` array on `order.updated`.

## Verification

`apps/collector/src/shop-inbound.test.ts` covers the signature check, the WooCommerce ping (`webhook_id=…`), the paid-status mapping and refund extraction.
