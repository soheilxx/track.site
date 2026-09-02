import { newUlid, silentLogger } from "@track-site/core";
import type { CanonicalEvent } from "@track-site/events";
import type { ConnectorContext, DispatchEvent } from "../connector.ts";

/** Shared, anonymised canonical events for connector contract tests and documentation samples. */
export function purchaseEvent(over: Partial<CanonicalEvent> = {}): CanonicalEvent {
  const now = new Date().toISOString();
  return {
    event_id: newUlid(),
    source_event_id: "01J9EXAMPLESOURCEEVENTID00",
    organization_id: "11111111-1111-4111-8111-111111111111",
    site_id: "22222222-2222-4222-8222-222222222222",
    site_tracking_id: "A7K2Q9",
    environment_id: "33333333-3333-4333-8333-333333333333",
    name: "purchase",
    is_standard: true,
    category: "commerce",
    client_ts: now,
    server_ts: now,
    anonymous_id: "01J9ANONYMOUSIDEXAMPLE0000",
    session_id: "01J9SESSIONIDEXAMPLE000000",
    user_id: null,
    url: "https://shop.example.com/checkout/thank-you?utm_source=meta",
    host: "shop.example.com",
    path: "/checkout/thank-you",
    referrer: "https://shop.example.com/checkout",
    title: "Thank you",
    utm: { utm_source: "meta" },
    click_ids: { fbclid: { value: "IwAR0examplefbclid", source: "browser", captured_at: now, expires_at: new Date(Date.now() + 86_400_000).toISOString() } },
    vendor_ids: { fbp: "fb.1.1700000000000.1234567890", ttp: "example-ttp", ga_client_id: "1234567890.1700000000" },
    consent: { granted: ["necessary", "analytics", "marketing"], source: "cmp:cookiebot", policy_version: "v3", ts: Date.now(), region: "DE", gpc: false },
    consent_snapshot_id: "44444444-4444-4444-8444-444444444444",
    props: { payment_type: "card" },
    commerce: { order_id: "ORD-10021", transaction_id: null, currency: "EUR", value: 129.9, items: [{ item_id: "SKU-1", item_name: "Running shoe", price: 99.9, quantity: 1, category: "shoes" }, { item_id: "SKU-2", item_name: "Socks", price: 15, quantity: 2 }], tax: 20.7, shipping: 4.9, coupon: null, quantity: 3, discount: null },
    user_data: { em: "b4c9a289323b21a01c3e940f150eb9b8c542587f1abfd8f0e1cc1ffc5e475514", ph: "4a2d3b4e0f7b1f65d9a2b5c7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7", fn: null, ln: null, ct: null, zp: null, country: "de", external_id: null },
    ip_truncated: "203.0.113.0",
    ua_family: "chrome",
    locale: "de-DE",
    source: "shopify",
    source_verified: true,
    sdk_version: "server",
    config_version: 4,
    schema_version: "1.0.0",
    provenance: {},
    processing_state: "routed",
    drop_reason: null,
    is_billable: true,
    is_bot: false,
    ...over,
  };
}

export function leadEvent(over: Partial<CanonicalEvent> = {}): CanonicalEvent {
  return purchaseEvent({ name: "generate_lead", category: "lead", commerce: null, source: "browser", source_verified: false, sdk_version: "1.0.0", user_data: null, url: "https://shop.example.com/contact", path: "/contact", props: { lead_type: "quote" }, ...over });
}

export function dispatchFor(event: CanonicalEvent, clickIds: Record<string, string> = {}): DispatchEvent {
  return { event, clickIds, dedupId: event.source_event_id };
}

export function testContext(over: Partial<ConnectorContext> & { credentials?: Record<string, string> }): ConnectorContext {
  const creds = over.credentials ?? {};
  return {
    organizationId: "11111111-1111-4111-8111-111111111111",
    siteId: "22222222-2222-4222-8222-222222222222",
    integrationId: "55555555-5555-4555-8555-555555555555",
    publicConfig: {},
    settings: {},
    testMode: false,
    getCredential: async (kind) => creds[kind] ?? null,
    fetch,
    baseUrlOverride: null,
    allowPrivateNetwork: true,
    logger: silentLogger(),
    now: () => new Date(),
    ...over,
  };
}
