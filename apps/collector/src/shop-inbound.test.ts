import { describe, expect, it } from "vitest";
import { deterministicUlid, hmacBase64, hmacHex, mapShopify, mapShopware, mapWooCommerce, shopwareRegistration, verifyShopify, verifyShopware, verifyWooCommerce } from "./shop-inbound.ts";

const NOW = new Date("2026-09-03T10:00:00Z");
const SECRET = "shpss_test_secret_0123456789";

describe("shop inbound signatures", () => {
  it("verifies Shopify and WooCommerce base64 HMAC headers and rejects tampering", () => {
    const raw = JSON.stringify({ id: 1 });
    expect(verifyShopify(raw, hmacBase64(raw, SECRET), SECRET)).toBe(true);
    expect(verifyWooCommerce(raw, hmacBase64(raw, SECRET), SECRET)).toBe(true);
    expect(verifyShopify(raw + " ", hmacBase64(raw, SECRET), SECRET)).toBe(false);
    expect(verifyShopify(raw, undefined, SECRET)).toBe(false);
    expect(verifyShopify(raw, hmacBase64(raw, "other"), SECRET)).toBe(false);
  });
  it("verifies Shopware hex signatures", () => {
    const raw = JSON.stringify({ data: { event: "checkout.order.placed" } });
    expect(verifyShopware(raw, hmacHex(raw, SECRET), SECRET)).toBe(true);
    expect(verifyShopware(raw, hmacHex(raw, SECRET).toUpperCase().slice(1), SECRET)).toBe(false);
  });
  it("derives ULID-shaped deterministic ids", () => {
    const a = deterministicUlid("shopify:order:1:purchase");
    expect(a).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(deterministicUlid("shopify:order:1:purchase")).toBe(a);
    expect(deterministicUlid("shopify:order:2:purchase")).not.toBe(a);
  });
});

describe("Shopify mapping", () => {
  const order = {
    id: 5678901234,
    name: "#1042",
    email: "Anna.Mueller@example.com",
    phone: null,
    currency: "EUR",
    total_price: "129.90",
    current_total_price: "129.90",
    total_tax: "20.74",
    total_discounts: "10.00",
    total_shipping_price_set: { shop_money: { amount: "4.90", currency_code: "EUR" } },
    discount_codes: [{ code: "WELCOME10", amount: "10.00", type: "fixed_amount" }],
    financial_status: "paid",
    processed_at: "2026-09-03T09:58:00+02:00",
    test: false,
    customer: { id: 777, email: "anna.mueller@example.com", phone: "+49 30 1234567", first_name: "Anna", last_name: "Müller" },
    billing_address: { first_name: "Anna", last_name: "Müller", city: "Berlin", zip: "10115", country_code: "DE", phone: null },
    line_items: [
      { id: 1, product_id: 100, variant_id: 1001, sku: "SKU-1", title: "Mug", price: "24.90", quantity: 2, vendor: "Acme" },
      { id: 2, product_id: 101, variant_id: null, sku: null, title: "Poster", price: "80.10", quantity: 1 },
    ],
  };
  it("maps a paid order to a verified purchase with items, totals and raw matching data", () => {
    const [e] = mapShopify("orders/paid", order, NOW);
    expect(e).toBeDefined();
    expect(e!.name).toBe("purchase");
    expect(e!.source).toBe("shopify");
    expect(e!.source_verified).toBe(true);
    expect(e!.commerce).toMatchObject({ order_id: "5678901234", currency: "EUR", value: 129.9, tax: 20.74, shipping: 4.9, discount: 10, coupon: "WELCOME10" });
    expect(e!.commerce!.items).toEqual([
      { item_id: "1001", item_name: "Mug", price: 24.9, quantity: 2 },
      { item_id: "101", item_name: "Poster", price: 80.1, quantity: 1 },
    ]);
    expect(e!.user_data).toMatchObject({ email: "Anna.Mueller@example.com", phone: "+49 30 1234567", first_name: "Anna", city: "Berlin", zip: "10115", country: "DE", external_id: "777" });
    expect(e!.ts).toBe(Date.parse("2026-09-03T09:58:00+02:00"));
    expect(e!.consent).toBeUndefined();
    expect(e!.id).toBe(deterministicUlid("shopify:order:5678901234:purchase"));
  });
  it("ignores unpaid order creation and unrelated topics", () => {
    expect(mapShopify("orders/create", { ...order, financial_status: "pending" }, NOW)).toEqual([]);
    expect(mapShopify("orders/updated", order, NOW)).toEqual([]);
    expect(mapShopify("orders/create", order, NOW)[0]!.id).toBe(mapShopify("orders/paid", order, NOW)[0]!.id);
  });
  it("maps a refund from its refund transactions", () => {
    const [e] = mapShopify(
      "refunds/create",
      { id: 42, order_id: 5678901234, created_at: "2026-09-03T11:00:00Z", transactions: [{ kind: "refund", status: "success", amount: "24.90", currency: "EUR" }], refund_line_items: [{ quantity: 1, line_item: { variant_id: 1001, title: "Mug", price: "24.90" } }] },
      NOW,
    );
    expect(e!.name).toBe("refund");
    expect(e!.commerce).toMatchObject({ order_id: "5678901234", value: 24.9, currency: "EUR" });
    expect(e!.commerce!.items).toEqual([{ item_id: "1001", item_name: "Mug", price: 24.9, quantity: 1 }]);
  });
});

describe("WooCommerce mapping", () => {
  const order = {
    id: 3120,
    number: "3120",
    status: "processing",
    currency: "EUR",
    total: "59.00",
    total_tax: "9.42",
    shipping_total: "0.00",
    discount_total: "0.00",
    customer_id: 12,
    transaction_id: "pi_123",
    date_created_gmt: "2026-09-03T08:00:00",
    date_paid_gmt: "2026-09-03T08:01:00",
    billing: { first_name: "Jo", last_name: "Doe", email: "jo@example.com", phone: "030 1234", city: "Berlin", postcode: "10115", country: "DE" },
    coupon_lines: [],
    line_items: [{ id: 9, name: "Tee", product_id: 55, variation_id: 56, sku: "TEE-M", quantity: 1, price: 59, total: "59.00" }],
    refunds: [],
  };
  it("maps a processing order to a purchase with the paid timestamp", () => {
    const [e] = mapWooCommerce("order.updated", order, NOW);
    expect(e!.name).toBe("purchase");
    expect(e!.source).toBe("woocommerce");
    expect(e!.commerce).toMatchObject({ order_id: "3120", transaction_id: "pi_123", value: 59, currency: "EUR" });
    expect(e!.commerce!.items).toEqual([{ item_id: "56", item_name: "Tee", price: 59, quantity: 1 }]);
    expect(e!.ts).toBe(Date.parse("2026-09-03T08:01:00Z"));
  });
  it("emits refund events for each refund entry and nothing for pending orders", () => {
    expect(mapWooCommerce("order.created", { ...order, status: "pending" }, NOW)).toEqual([]);
    const events = mapWooCommerce("order.updated", { ...order, status: "refunded", date_modified_gmt: "2026-09-03T09:00:00", refunds: [{ id: 501, reason: "damaged", total: "-59.00" }] }, NOW);
    expect(events.map((e) => e.name)).toEqual(["purchase", "refund"]);
    expect(events[1]!.commerce).toMatchObject({ order_id: "3120", value: 59 });
    expect(events[1]!.id).toBe(deterministicUlid("woocommerce:refund:501"));
  });
  it("ignores non-order topics", () => {
    expect(mapWooCommerce("product.updated", order, NOW)).toEqual([]);
  });
});

describe("Shopware mapping and registration", () => {
  const order = {
    id: "0190c6a5b1f27a9e8f1f0c4d9a1b2c3d",
    orderNumber: "10021",
    amountTotal: 89.9,
    amountNet: 75.55,
    shippingTotal: 4.9,
    orderDateTime: "2026-09-03T07:30:00.000+00:00",
    currency: { isoCode: "EUR" },
    orderCustomer: { email: "kim@example.com", firstName: "Kim", lastName: "Lee", customerId: "c1", customerNumber: "10005" },
    billingAddress: { city: "Hamburg", zipcode: "20095", country: { iso: "DE" } },
    lineItems: [
      { id: "li1", type: "product", label: "Lamp", quantity: 1, unitPrice: 85, totalPrice: 85, productId: "p1", referencedId: "p1", payload: { productNumber: "SW10001" } },
      { id: "li2", type: "promotion", label: "Promo", quantity: 1, unitPrice: 0, totalPrice: 0 },
    ],
  };
  it("maps a paid transaction to a purchase and a refunded one to a refund", () => {
    const paid = mapShopware({ data: { event: "state_enter.order_transaction.state.paid", payload: [{ order }] }, source: { shopId: "s1" } }, null, NOW);
    expect(paid.error).toBeNull();
    expect(paid.events[0]).toMatchObject({ name: "purchase", source: "shopware", source_verified: true });
    expect(paid.events[0]!.commerce).toMatchObject({ order_id: order.id, transaction_id: "10021", currency: "EUR", value: 89.9, tax: 14.35, shipping: 4.9 });
    expect(paid.events[0]!.commerce!.items).toEqual([{ item_id: "SW10001", item_name: "Lamp", price: 85, quantity: 1 }]);
    const refunded = mapShopware({ data: { event: "state_enter.order_transaction.state.refunded", payload: [{ order }] } }, null, NOW);
    expect(refunded.events[0]).toMatchObject({ name: "refund" });
  });
  it("counts placed orders only when the connection opts in and falls back to the default currency", () => {
    const body = { data: { event: "checkout.order.placed", payload: [{ order: { ...order, currency: undefined } }] } };
    expect(mapShopware(body, null, NOW).events).toEqual([]);
    const placed = mapShopware(body, { purchase_on: "placed", default_currency: "chf" }, NOW);
    expect(placed.events[0]!.commerce!.currency).toBe("CHF");
  });
  it("reports payloads without an order and unknown events", () => {
    expect(mapShopware({ data: { event: "state_enter.order_transaction.state.paid", payload: [{ orderId: "x" }] } }, null, NOW).error).toBe("payload without order");
    expect(mapShopware({ data: { event: "product.written" } }, null, NOW)).toMatchObject({ events: [], event: "product.written", error: null });
    expect(mapShopware({}, null, NOW).error).toBe("missing data.event");
  });
  it("answers the app registration handshake with a proof and rejects bad signatures", () => {
    const query = { "shop-id": "abc123", "shop-url": "https://shop.example", timestamp: "1767225600" };
    const sig = hmacHex(`shop-id=${query["shop-id"]}&shop-url=${query["shop-url"]}&timestamp=${query.timestamp}`, SECRET);
    const ok = shopwareRegistration(query, SECRET, "TrackSite", sig, "https://ingest.example/confirm");
    expect(ok.ok).toBe(true);
    expect(ok.body).toEqual({ proof: hmacHex("abc123https://shop.exampleTrackSite", SECRET), secret: SECRET, confirmation_url: "https://ingest.example/confirm" });
    expect(shopwareRegistration(query, SECRET, "TrackSite", "deadbeef", "x").ok).toBe(false);
    expect(shopwareRegistration({}, SECRET, "TrackSite", sig, "x").ok).toBe(false);
  });
});
