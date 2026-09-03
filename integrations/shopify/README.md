# Shopify integration

Shopify's hosted checkout does not run third-party scripts, so the browser path is a **web pixel extension** and the server path is Shopify's own **order webhooks**. Both are in this folder; the collector code that verifies and maps the webhooks is `apps/collector/src/shop-inbound.ts` with tests in `shop-inbound.test.ts`.

## Server path (authoritative)

1. In track.site: site → **Shop connection** → Shopify, enter `your-store.myshopify.com`, save. Copy the webhook URL.
2. In Shopify admin: Settings → Notifications → Webhooks → *Create webhook*:
   - `orders/paid` → the webhook URL, format JSON, latest stable API version
   - `refunds/create` → the same URL
3. Copy the **signing secret** shown below the webhook list into the connection's secret field in track.site.
4. Place a test order. The connection turns *connected* on the first verified webhook; the event debugger shows `purchase` with `source: shopify`, `source_verified: true`, order id, items, totals and hashed matching data.

What is verified: `X-Shopify-Hmac-Sha256` (base64 HMAC-SHA256 of the raw body with the signing secret) and, when set, `X-Shopify-Shop-Domain` against the connection's shop domain. `orders/create` is accepted only when `financial_status` is already `paid`; redeliveries deduplicate on a deterministic event id.

## Browser path (optional, carries consent and click ids)

`web-pixel/` is a Shopify app extension of type `web_pixel_extension` (strict sandbox):

```bash
shopify app generate extension   # or copy web-pixel/ into an existing app's extensions/
shopify app deploy
```

Configure the extension's `trackingId` (and optionally a first-party `ingestUrl`) in the app settings. The pixel subscribes to `page_viewed`, `product_viewed`, `product_added_to_cart`, `checkout_started`, `payment_info_submitted` and `checkout_completed`, maps them to the standard events, reads the consent state from Shopify's Customer Privacy API (`analyticsProcessingAllowed` → analytics, `marketingAllowed` → marketing) and posts to the collector's browser endpoint. It mirrors nothing to vendor tags; vendors receive events server-side.

The browser `purchase` carries the Shopify order id. When the `orders/paid` webhook arrives, the router inherits the browser event's consent record and click ids by order id, so the verified server purchase can reach advertising destinations exactly as far as the customer consented. Without a browser purchase the server event stays an operational record.

## Storefront theme (alternative browser path)

Shops that prefer the regular SDK can add the snippet from the site page to `theme.liquid`; it covers the storefront but not the checkout, which is why the pixel exists.
