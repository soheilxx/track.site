# Shopware 6 integration

Two parts, both documented and testable:

1. **Storefront (browser)** – the standard track.site snippet in the theme. Add it to `Resources/views/storefront/base.html.twig` of your theme inside the `base_head` block (or use the Shopware "custom JavaScript" section of a theme that offers one). The snippet is shown on the site page in the app:

   ```twig
   {% block base_head %}
     {{ parent() }}
     <script async src="https://cdn.track.site/v1/tracker.js" data-site-id="TRACKING_ID"></script>
   {% endblock %}
   ```

   On the checkout finish page Shopware's storefront exposes the order in `page.order`; the browser purchase is optional because the server path below is authoritative, but it carries the visitor's consent record and click ids that the server event inherits (pairing by order id).

2. **App (server-side truth)** – `manifest.xml` registers the track.site app with three webhooks:

   | Shopware event | track.site event |
   | --- | --- |
   | `state_enter.order_transaction.state.paid` | `purchase` |
   | `state_enter.order_transaction.state.refunded` | `refund` |
   | `checkout.order.placed` | `purchase` only when the connection is set to "count placed orders" |

## Install

1. In track.site open the site → **Shop connection** → Shopware 6, enter the shop domain and store a secret (any random string ≥ 32 characters, e.g. `openssl rand -hex 32`).
2. Copy `manifest.xml` into `custom/apps/TrackSite/manifest.xml` in your Shopware installation, replace `TRACKING_ID`, `PATH_TOKEN` (both shown on the connection page) and `APP_SECRET` (the secret from step 1).
3. Run `bin/console app:install --activate TrackSite`. Shopware calls the registration URL (signature checked with the app secret), receives the proof and confirms; the connection turns **connected** after the first verified webhook.
4. Place a test order and mark its transaction as paid: the destination monitor shows a `purchase` with `source: shopware`, `source_verified: true`.

## Notes

- Payload currency: the `paid`/`refunded` events carry the order with its currency association in current Shopware versions; if your version omits it, set the **fallback currency** on the connection.
- No API credentials are stored: the confirmation request's API key/secret are discarded on purpose. The collector only receives webhooks.
- Multiple partial refunds: the first refund per order is recorded; later partial refunds for the same order are deduplicated by order id (documented limitation of the conversion record model).
- Verification: `apps/collector/src/shop-inbound.test.ts` covers signature verification, the registration handshake and the payload mapping.
