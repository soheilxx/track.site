import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Hono } from "hono";
import { newUlid } from "@track-site/core";
import type { IncomingServerEvent, IngestMessage } from "@track-site/events";
import { QUEUES, partitionKeyFor } from "@track-site/queue";
import type { CollectorDeps } from "./app.ts";
import type { ResolvedSite } from "./site-cache.ts";

/**
 * Verified shop order sources. `POST /v1/shop/:platform/:trackingId/:token` receives the platform's own
 * webhooks, verifies the platform signature with the secret stored for the site's shop connection and turns
 * paid orders and refunds into verified server events (`source: shopify|woocommerce|shopware`, `source_verified`).
 *
 *   - Shopify:     `X-Shopify-Hmac-Sha256` = base64(HMAC-SHA256(raw body, webhook signing secret)); topics
 *                  `orders/paid`, `orders/create` (only when already paid) and `refunds/create`.
 *   - WooCommerce: `X-WC-Webhook-Signature` = base64(HMAC-SHA256(raw body, webhook secret)); topics
 *                  `order.created` / `order.updated` with the REST v3 order shape; refunds come from `refunds[]`.
 *   - Shopware 6:  app webhooks signed with `shopware-shop-signature` = hex(HMAC-SHA256(raw body, shop secret));
 *                  `state_enter.order_transaction.state.paid` -> purchase, `..._refunded` -> refund, and
 *                  `checkout.order.placed` -> purchase when the connection is set to count placed orders.
 *                  The app registration handshake (`/register`, `/confirm`) uses the same secret as app secret.
 *
 * Consent is never assumed: a shop event carries no consent record of its own; the ingest stage pairs it with
 * the browser purchase for the same order id and inherits that record, otherwise it stays an operational record.
 */
export type ShopPlatform = "shopify" | "woocommerce" | "shopware";

export interface ShopConnectionSettings {
  default_currency?: string;
  purchase_on?: "paid" | "placed";
}

interface ShopConnectionRow {
  id: string;
  site_id: string;
  platform: ShopPlatform;
  shop_domain: string;
  status: string;
  settings: ShopConnectionSettings | null;
  ciphertext: string | null;
}

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Deterministic ULID-shaped id from a seed so platform redeliveries hit the event-level dedup guard. */
export function deterministicUlid(seed: string): string {
  const digest = createHash("sha256").update(seed).digest();
  let out = "";
  for (let i = 0; i < 26; i++) out += CROCKFORD[digest[i]! % 32];
  return out;
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const hmacBase64 = (raw: string, secret: string): string => createHmac("sha256", secret).update(raw, "utf8").digest("base64");
export const hmacHex = (raw: string, secret: string): string => createHmac("sha256", secret).update(raw, "utf8").digest("hex");

export function verifyShopify(raw: string, header: string | undefined, secret: string): boolean {
  return !!header && safeEqual(hmacBase64(raw, secret), header.trim());
}
export const verifyWooCommerce = verifyShopify;
export function verifyShopware(raw: string, header: string | undefined, secret: string): boolean {
  return !!header && safeEqual(hmacHex(raw, secret), header.trim());
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v));
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown, max = 256): string | null => (v === null || v === undefined ? null : String(v).slice(0, max) || null);
const ms = (v: unknown, fallback: Date): number => {
  const t = typeof v === "string" ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? t : fallback.getTime();
};
const currencyOf = (v: unknown, fallback: string | undefined): string | null => {
  const c = typeof v === "string" ? v.toUpperCase() : (fallback ?? "").toUpperCase();
  return /^[A-Z]{3}$/.test(c) ? c : null;
};

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {});
const arr = (v: unknown): Rec[] => (Array.isArray(v) ? v.map(rec) : []);

function userData(fields: { email?: unknown; phone?: unknown; first?: unknown; last?: unknown; city?: unknown; zip?: unknown; country?: unknown; external?: unknown }): IncomingServerEvent["user_data"] | undefined {
  const out: Record<string, string> = {};
  if (typeof fields.email === "string" && fields.email.includes("@")) out.email = fields.email.slice(0, 320);
  if (typeof fields.phone === "string" && fields.phone.trim()) out.phone = fields.phone.slice(0, 32);
  if (typeof fields.first === "string" && fields.first) out.first_name = fields.first.slice(0, 128);
  if (typeof fields.last === "string" && fields.last) out.last_name = fields.last.slice(0, 128);
  if (typeof fields.city === "string" && fields.city) out.city = fields.city.slice(0, 128);
  if (typeof fields.zip === "string" && fields.zip) out.zip = fields.zip.slice(0, 16);
  if (typeof fields.country === "string" && /^[A-Za-z]{2}$/.test(fields.country)) out.country = fields.country.toUpperCase();
  if (fields.external !== null && fields.external !== undefined && fields.external !== "") out.external_id = String(fields.external).slice(0, 128);
  return Object.keys(out).length ? out : undefined;
}

// ---------------------------------------------------------------------------------------------- Shopify

export function mapShopify(topic: string, body: unknown, now: Date): IncomingServerEvent[] {
  const o = rec(body);
  if (topic === "orders/paid" || (topic === "orders/create" && o.financial_status === "paid")) {
    const orderId = str(o.id, 128);
    if (!orderId) return [];
    const billing = rec(o.billing_address);
    const customer = rec(o.customer);
    const items = arr(o.line_items).map((li) => ({
      item_id: str(li.variant_id ?? li.product_id ?? li.sku ?? li.id, 128) ?? "unknown",
      item_name: str(li.title ?? li.name, 256),
      price: num(li.price),
      quantity: num(li.quantity) ?? 1,
    }));
    return [
      {
        id: deterministicUlid(`shopify:order:${orderId}:purchase`),
        name: "purchase",
        ts: ms(o.processed_at ?? o.created_at, now),
        commerce: {
          order_id: orderId,
          transaction_id: orderId,
          currency: currencyOf(o.currency, undefined),
          value: num(o.current_total_price ?? o.total_price),
          tax: num(o.total_tax),
          shipping: num(rec(rec(o.total_shipping_price_set).shop_money).amount),
          discount: num(o.total_discounts),
          coupon: str(arr(o.discount_codes)[0]?.code, 64),
          items,
        },
        props: { shop_order_name: str(o.name, 64), financial_status: str(o.financial_status, 32), shop_platform: "shopify", test_order: o.test === true },
        user_data: userData({ email: o.email ?? o.contact_email ?? customer.email, phone: o.phone ?? customer.phone ?? billing.phone, first: billing.first_name ?? customer.first_name, last: billing.last_name ?? customer.last_name, city: billing.city, zip: billing.zip, country: billing.country_code, external: customer.id }),
        source: "shopify",
        source_verified: true,
      },
    ];
  }
  if (topic === "refunds/create") {
    const orderId = str(o.order_id, 128);
    const refundId = str(o.id, 128);
    if (!orderId || !refundId) return [];
    const transactions = arr(o.transactions).filter((t) => t.kind === "refund" && (t.status === "success" || t.status === undefined));
    const value = transactions.reduce((acc, t) => acc + (num(t.amount) ?? 0), 0);
    const items = arr(o.refund_line_items).map((r) => {
      const li = rec(r.line_item);
      return { item_id: str(li.variant_id ?? li.product_id ?? li.sku ?? li.id, 128) ?? "unknown", item_name: str(li.title, 256), price: num(li.price), quantity: num(r.quantity) ?? 1 };
    });
    return [
      {
        id: deterministicUlid(`shopify:refund:${refundId}`),
        name: "refund",
        ts: ms(o.processed_at ?? o.created_at, now),
        commerce: { order_id: orderId, transaction_id: orderId, currency: currencyOf(transactions[0]?.currency, undefined), value, items },
        props: { shop_platform: "shopify", refund_id: refundId },
        source: "shopify",
        source_verified: true,
      },
    ];
  }
  return [];
}

// ------------------------------------------------------------------------------------------ WooCommerce

const WOO_PAID = new Set(["processing", "completed"]);

export function mapWooCommerce(topic: string, body: unknown, now: Date): IncomingServerEvent[] {
  if (!topic.startsWith("order.")) return [];
  const o = rec(body);
  const orderId = str(o.id, 128);
  if (!orderId) return [];
  const billing = rec(o.billing);
  const out: IncomingServerEvent[] = [];
  const status = typeof o.status === "string" ? o.status : "";
  const user = userData({ email: billing.email, phone: billing.phone, first: billing.first_name, last: billing.last_name, city: billing.city, zip: billing.postcode, country: billing.country, external: o.customer_id });
  const currency = currencyOf(o.currency, undefined);
  if (WOO_PAID.has(status) || status === "refunded") {
    out.push({
      id: deterministicUlid(`woocommerce:order:${orderId}:purchase`),
      name: "purchase",
      ts: ms(o.date_paid_gmt ? `${o.date_paid_gmt}Z` : o.date_created_gmt ? `${o.date_created_gmt}Z` : null, now),
      commerce: {
        order_id: orderId,
        transaction_id: str(o.transaction_id, 128) ?? orderId,
        currency,
        value: num(o.total),
        tax: num(o.total_tax),
        shipping: num(o.shipping_total),
        discount: num(o.discount_total),
        coupon: str(arr(o.coupon_lines)[0]?.code, 64),
        items: arr(o.line_items).map((li) => ({ item_id: str(li.variation_id && Number(li.variation_id) > 0 ? li.variation_id : (li.product_id ?? li.sku ?? li.id), 128) ?? "unknown", item_name: str(li.name, 256), price: num(li.price), quantity: num(li.quantity) ?? 1 })),
      },
      props: { shop_order_number: str(o.number, 64), order_status: status, shop_platform: "woocommerce" },
      user_data: user,
      source: "woocommerce",
      source_verified: true,
    });
  }
  for (const r of arr(o.refunds)) {
    const refundId = str(r.id, 128);
    const total = num(r.total);
    if (!refundId || total === null) continue;
    out.push({
      id: deterministicUlid(`woocommerce:refund:${refundId}`),
      name: "refund",
      ts: ms(o.date_modified_gmt ? `${o.date_modified_gmt}Z` : null, now),
      commerce: { order_id: orderId, transaction_id: orderId, currency, value: Math.abs(total), items: [] },
      props: { shop_platform: "woocommerce", refund_id: refundId, reason: str(r.reason, 256) },
      user_data: user,
      source: "woocommerce",
      source_verified: true,
    });
  }
  return out;
}

// -------------------------------------------------------------------------------------------- Shopware 6

export function mapShopware(body: unknown, settings: ShopConnectionSettings | null, now: Date): { events: IncomingServerEvent[]; event: string | null; error: string | null } {
  const data = rec(rec(body).data);
  const event = typeof data.event === "string" ? data.event : null;
  if (!event) return { events: [], event: null, error: "missing data.event" };
  const purchaseOn = settings?.purchase_on ?? "paid";
  const isPurchase = event === "state_enter.order_transaction.state.paid" || (purchaseOn === "placed" && event === "checkout.order.placed");
  const isRefund = event === "state_enter.order_transaction.state.refunded" || event === "state_enter.order_transaction.state.refunded_partially";
  if (!isPurchase && !isRefund) return { events: [], event, error: null };
  const payload = arr(data.payload)[0] ?? {};
  const order = rec(payload.order);
  const orderId = str(order.id, 128);
  if (!orderId) return { events: [], event, error: "payload without order" };
  const customer = rec(order.orderCustomer);
  const billing = rec(order.billingAddress);
  const currency = currencyOf(rec(order.currency).isoCode, settings?.default_currency);
  const items = arr(order.lineItems)
    .filter((li) => li.type === undefined || li.type === "product")
    .map((li) => ({ item_id: str(rec(li.payload).productNumber ?? li.referencedId ?? li.productId ?? li.id, 128) ?? "unknown", item_name: str(li.label, 256), price: num(li.unitPrice), quantity: num(li.quantity) ?? 1 }));
  const user = userData({ email: customer.email, first: customer.firstName, last: customer.lastName, city: billing.city, zip: billing.zipcode, country: rec(billing.country).iso, external: customer.customerId ?? customer.customerNumber });
  const base = { commerce_currency: currency, order_number: str(order.orderNumber, 64) };
  if (isPurchase) {
    return {
      events: [
        {
          id: deterministicUlid(`shopware:order:${orderId}:purchase`),
          name: "purchase",
          ts: ms(order.orderDateTime, now),
          commerce: { order_id: orderId, transaction_id: str(order.orderNumber, 128) ?? orderId, currency, value: num(order.amountTotal), tax: num(order.amountTotal) !== null && num(order.amountNet) !== null ? Number((num(order.amountTotal)! - num(order.amountNet)!).toFixed(2)) : null, shipping: num(order.shippingTotal), items },
          props: { shop_order_number: base.order_number, shop_platform: "shopware", shopware_event: event },
          user_data: user,
          source: "shopware",
          source_verified: true,
        },
      ],
      event,
      error: null,
    };
  }
  return {
    events: [
      {
        id: deterministicUlid(`shopware:refund:${orderId}:${event}`),
        name: "refund",
        ts: now.getTime(),
        commerce: { order_id: orderId, transaction_id: str(order.orderNumber, 128) ?? orderId, currency, value: num(order.amountTotal), items },
        props: { shop_order_number: base.order_number, shop_platform: "shopware", shopware_event: event },
        user_data: user,
        source: "shopware",
        source_verified: true,
      },
    ],
    event,
    error: null,
  };
}

/** Shopware app registration: proof = HMAC-SHA256(shopId + shopUrl + appName, appSecret); the shop secret signs later webhooks. */
export function shopwareRegistration(query: Record<string, string>, appSecret: string, appName: string, signatureHeader: string | undefined, confirmationUrl: string): { ok: boolean; body: Record<string, string> } {
  const shopId = query["shop-id"] ?? "";
  const shopUrl = query["shop-url"] ?? "";
  const timestamp = query.timestamp ?? "";
  if (!shopId || !shopUrl || !timestamp || !signatureHeader) return { ok: false, body: {} };
  const expected = hmacHex(`shop-id=${shopId}&shop-url=${shopUrl}&timestamp=${timestamp}`, appSecret);
  if (!safeEqual(expected, signatureHeader.trim())) return { ok: false, body: {} };
  return { ok: true, body: { proof: hmacHex(`${shopId}${shopUrl}${appName}`, appSecret), secret: appSecret, confirmation_url: confirmationUrl } };
}

// ------------------------------------------------------------------------------------------------ routes

export function registerShopInbound(app: Hono, deps: CollectorDeps, now: () => Date): void {
  type Loaded = { ok: false; error: "not configured" | "unknown site" | "unknown connection" | "paused" | "no secret" } | { ok: true; site: ResolvedSite; conn: ShopConnectionRow; secret: string };
  const load = async (platform: string, trackingId: string, token: string): Promise<Loaded> => {
    if (!deps.pool || !deps.vault) return { ok: false, error: "not configured" };
    const site = await deps.sites.byTrackingId(trackingId);
    if (!site || site.status !== "active") return { ok: false, error: "unknown site" };
    const res = await deps.pool.query<ShopConnectionRow>(
      `SELECT c.id, c.site_id, c.platform, c.shop_domain, c.status, c.settings, cr.ciphertext
         FROM shop_connections c LEFT JOIN credentials cr ON cr.id = c.credential_id AND cr.status = 'active'
        WHERE c.site_id = $1 AND c.platform = $2 AND c.path_token = $3`,
      [site.siteId, platform, token],
    );
    const conn = res.rows[0];
    if (!conn) return { ok: false, error: "unknown connection" };
    if (conn.status === "paused") return { ok: false, error: "paused" };
    if (!conn.ciphertext) return { ok: false, error: "no secret" };
    const secret = await deps.vault.decrypt(conn.ciphertext, `shop:${conn.id}`);
    return { ok: true, site, conn, secret };
  };

  const record = async (connId: string, error: string | null, topic: string | null) => {
    if (!deps.pool) return;
    await deps.pool
      .query(
        `UPDATE shop_connections SET last_event_at = CASE WHEN $2::text IS NULL THEN now() ELSE last_event_at END, last_error = $2,
                status = CASE WHEN $2::text IS NULL AND status = 'pending' THEN 'connected' ELSE status END,
                settings = CASE WHEN $3::text IS NULL THEN settings ELSE settings || jsonb_build_object('topics', (SELECT jsonb_agg(DISTINCT t) FROM jsonb_array_elements_text(coalesce(settings->'topics', '[]'::jsonb) || to_jsonb(ARRAY[$3::text])) AS t)) END,
                updated_at = now()
          WHERE id = $1`,
        [connId, error, topic],
      )
      .catch((e: unknown) => deps.logger.warn({ err: e }, "shop connection update failed"));
  };

  const enqueue = async (site: ResolvedSite, events: IncomingServerEvent[], ua: string): Promise<boolean> => {
    const env = site.environments.find((e) => e.isDefault) ?? site.environments[0];
    if (!env) return false;
    const message: IngestMessage = {
      kind: "server_batch",
      message_id: newUlid(),
      received_at: now().toISOString(),
      site: { organization_id: site.organizationId, site_id: site.siteId, tracking_id: site.trackingId, environment_id: env.id, partition_key: partitionKeyFor(site.organizationId, site.siteId, site.partitionOverride) },
      source_key_id: null,
      ip_truncated: null,
      ua_family: ua,
      events,
    };
    try {
      await deps.queue.enqueue(QUEUES.ingest, [{ id: message.message_id, body: message, partitionKey: message.site.partition_key }]);
      return true;
    } catch {
      return false;
    }
  };

  app.post("/v1/shop/:platform/:trackingId/:token", async (c) => {
    if (deps.env.KILL_SWITCH_GLOBAL) return c.text("paused", 503);
    const platform = c.req.param("platform");
    if (platform !== "shopify" && platform !== "woocommerce" && platform !== "shopware") return c.text("unknown platform", 404);
    const loaded = await load(platform, c.req.param("trackingId"), c.req.param("token"));
    if (!loaded.ok) return c.text(loaded.error, loaded.error === "paused" ? 200 : loaded.error === "not configured" ? 503 : 404);
    const { site, conn, secret } = loaded;
    const raw = await c.req.text();
    if (raw.length > deps.env.COLLECTOR_MAX_BODY_BYTES * 8) return c.text("payload too large", 413);

    let events: IncomingServerEvent[] = [];
    let topic: string | null = null;
    if (platform === "shopify") {
      if (!verifyShopify(raw, c.req.header("x-shopify-hmac-sha256"), secret)) return c.text("invalid signature", 401);
      const shop = c.req.header("x-shopify-shop-domain") ?? "";
      if (conn.shop_domain && shop && shop.toLowerCase() !== conn.shop_domain.toLowerCase()) {
        await record(conn.id, `shop domain mismatch: ${shop}`, null);
        return c.text("shop mismatch", 403);
      }
      topic = c.req.header("x-shopify-topic") ?? null;
      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        return c.text("invalid json", 400);
      }
      events = mapShopify(topic ?? "", body, now());
    } else if (platform === "woocommerce") {
      if (!verifyWooCommerce(raw, c.req.header("x-wc-webhook-signature"), secret)) return c.text("invalid signature", 401);
      topic = c.req.header("x-wc-webhook-topic") ?? null;
      let body: unknown = null;
      try {
        body = JSON.parse(raw);
      } catch {
        // WooCommerce sends a form-encoded ping (`webhook_id=…`) when a webhook is created
        if (/^webhook_id=\d+/.test(raw)) {
          await record(conn.id, null, "ping");
          return c.text("pong", 200);
        }
        return c.text("invalid json", 400);
      }
      events = mapWooCommerce(topic ?? "", body, now());
    } else {
      if (!verifyShopware(raw, c.req.header("shopware-shop-signature"), secret)) return c.text("invalid signature", 401);
      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        return c.text("invalid json", 400);
      }
      const mapped = mapShopware(body, conn.settings, now());
      topic = mapped.event;
      if (mapped.error) {
        await record(conn.id, mapped.error, topic);
        return c.text(mapped.error, 400);
      }
      events = mapped.events;
    }

    if (events.length === 0) {
      await record(conn.id, null, topic);
      return c.text("ignored", 200);
    }
    const ok = await enqueue(site, events, `shop-${platform}`);
    if (!ok) {
      c.header("retry-after", "5");
      return c.text("queue unavailable", 503);
    }
    await record(conn.id, null, topic);
    return c.json({ ok: true, accepted: events.length }, 200);
  });

  // Shopware app registration handshake (manifest `registrationUrl` / `confirmationUrl`)
  app.get("/v1/shop/shopware/:trackingId/:token/register", async (c) => {
    const loaded = await load("shopware", c.req.param("trackingId"), c.req.param("token"));
    if (!loaded.ok) return c.text(loaded.error, 404);
    const base = new URL(c.req.url);
    const confirmation = `${base.origin}/v1/shop/shopware/${c.req.param("trackingId")}/${c.req.param("token")}/confirm`;
    const reg = shopwareRegistration(c.req.query(), loaded.secret, "TrackSite", c.req.header("shopware-app-signature"), confirmation);
    if (!reg.ok) return c.text("invalid signature", 401);
    return c.json(reg.body);
  });
  app.post("/v1/shop/shopware/:trackingId/:token/confirm", async (c) => {
    const loaded = await load("shopware", c.req.param("trackingId"), c.req.param("token"));
    if (!loaded.ok) return c.text(loaded.error, 404);
    const raw = await c.req.text();
    if (!verifyShopware(raw, c.req.header("shopware-shop-signature"), loaded.secret)) return c.text("invalid signature", 401);
    // API credentials in the confirmation body are intentionally not stored: the collector only receives webhooks
    await record(loaded.conn.id, null, "app.registered");
    return c.body(null, 204);
  });
}
