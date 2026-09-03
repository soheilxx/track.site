import { register } from "@shopify/web-pixels-extension";

/**
 * track.site web pixel for Shopify (Customer Events / Web Pixels API).
 *
 * Runs in Shopify's strict sandbox (no DOM), so it does not load the regular SDK. It sends the standard
 * browser events to the track.site collector with the customer's consent state from Shopify's Customer
 * Privacy API and mirrors nothing to vendor tags itself: vendor delivery happens server-side through
 * the configured destinations. Purchases carry the Shopify order id so the verified `orders/paid` webhook
 * pairs with them (consent + click ids inherited by order id, vendors deduplicate on `purchase:<order id>`).
 */
const SDK_VERSION = "1.0.0";
const SCHEMA_VERSION = "1.0.0";
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function ulid(now = Date.now()) {
  let time = "";
  let t = now;
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD[t % 32] + time;
    t = Math.floor(t / 32);
  }
  let rand = "";
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  for (let i = 0; i < 16; i++) rand += CROCKFORD[bytes[i] % 32];
  return time + rand;
}

const orderIdOf = (id) => {
  if (id === null || id === undefined) return null;
  const s = String(id);
  const m = s.match(/(\d+)$/);
  return m ? m[1] : s;
};

const money = (m) => (m && m.amount !== undefined && m.amount !== null ? Number(m.amount) : null);

const lineItems = (items) =>
  (items || []).slice(0, 200).map((li) => ({
    item_id: String((li.variant && li.variant.id) || (li.variant && li.variant.product && li.variant.product.id) || li.id || ""),
    item_name: li.title || (li.variant && li.variant.product && li.variant.product.title) || null,
    price: li.variant && li.variant.price ? money(li.variant.price) : null,
    quantity: li.quantity || 1,
    sku: (li.variant && li.variant.sku) || null,
    brand: (li.variant && li.variant.product && li.variant.product.vendor) || null,
  }));

const checkoutCommerce = (checkout) => ({
  order_id: checkout.order ? orderIdOf(checkout.order.id) : null,
  transaction_id: checkout.order ? orderIdOf(checkout.order.id) : null,
  currency: checkout.currencyCode || null,
  value: money(checkout.totalPrice),
  tax: money(checkout.totalTax),
  shipping: checkout.shippingLine ? money(checkout.shippingLine.price) : null,
  coupon: checkout.discountApplications && checkout.discountApplications[0] ? checkout.discountApplications[0].title || null : null,
  items: lineItems(checkout.lineItems),
});

register(({ analytics, browser, init, settings, customerPrivacy }) => {
  const trackingId = String(settings.trackingId || "").trim();
  const ingest = String(settings.ingestUrl || "https://ingest.track.site").replace(/\/$/, "");
  if (!/^[A-Za-z0-9]{6}$/.test(trackingId)) return;

  const purposesOf = (cp) => {
    const granted = ["necessary"];
    if (cp && cp.analyticsProcessingAllowed) granted.push("analytics");
    if (cp && cp.marketingAllowed) granted.push("marketing");
    return granted;
  };
  let consent = { granted: purposesOf(init.customerPrivacy), source: "api", policy_version: null, ts: Date.now(), region: null, gpc: null };
  if (customerPrivacy && typeof customerPrivacy.subscribe === "function") {
    customerPrivacy.subscribe("visitorConsentCollected", (event) => {
      consent = { ...consent, granted: purposesOf(event.customerPrivacy), ts: Date.now() };
    });
  }

  const allowed = () => consent.granted.indexOf("analytics") >= 0 || consent.granted.indexOf("marketing") >= 0;
  const anonymousId = async () => {
    if (!allowed()) return null;
    try {
      const existing = await browser.localStorage.getItem("_ts_id");
      if (existing && /^[0-9A-Z]{26}$/.test(existing)) return existing;
      const id = ulid();
      await browser.localStorage.setItem("_ts_id", id);
      return id;
    } catch {
      return null;
    }
  };

  let seq = 0;
  const send = async (name, context, extra) => {
    const doc = (context && context.document) || init.context.document;
    const event = {
      id: ulid(),
      name,
      ts: Date.now(),
      seq: seq++,
      page: { url: doc.location.href, referrer: doc.referrer || null, title: doc.title ? String(doc.title).slice(0, 512) : null },
      ids: { anonymous_id: await anonymousId(), session_id: null, user_id: null },
      consent,
      sdk: { name: "shopify", version: SDK_VERSION, config_version: null, schema_version: SCHEMA_VERSION },
      locale: (context && context.navigator && context.navigator.language) || init.context.navigator.language || undefined,
      ...extra,
    };
    try {
      await fetch(`${ingest}/v1/e`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ site_id: trackingId, sent_at: Date.now(), events: [event] }), keepalive: true });
    } catch {
      /* the collector is unreachable: nothing to retry in the sandbox */
    }
  };

  analytics.subscribe("page_viewed", (e) => send("page_view", e.context, {}));
  analytics.subscribe("product_viewed", (e) => {
    const v = e.data.productVariant || {};
    send("view_item", e.context, { commerce: { currency: v.price ? v.price.currencyCode : null, value: money(v.price), items: lineItems([{ variant: v, title: v.product && v.product.title, quantity: 1 }]) } });
  });
  analytics.subscribe("product_added_to_cart", (e) => {
    const line = e.data.cartLine || {};
    const v = line.merchandise || {};
    send("add_to_cart", e.context, { commerce: { currency: line.cost && line.cost.totalAmount ? line.cost.totalAmount.currencyCode : null, value: line.cost ? money(line.cost.totalAmount) : null, items: lineItems([{ variant: v, title: v.product && v.product.title, quantity: line.quantity }]) } });
  });
  analytics.subscribe("checkout_started", (e) => send("begin_checkout", e.context, { commerce: checkoutCommerce(e.data.checkout || {}) }));
  analytics.subscribe("payment_info_submitted", (e) => send("add_payment_info", e.context, { commerce: checkoutCommerce(e.data.checkout || {}) }));
  analytics.subscribe("checkout_completed", (e) => send("purchase", e.context, { commerce: checkoutCommerce(e.data.checkout || {}), props: { shop_platform: "shopify" } }));
});
