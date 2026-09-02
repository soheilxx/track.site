import { describe, expect, it } from "vitest";
import { newUlid } from "@track-site/core";
import { canonicalName, hashUserData, normalizeBrowserEvent, normalizeServerEvent, truncateIp, uaFamily } from "./normalize.ts";
import { canonicalEventSchema, incomingBrowserBatchSchema, type IncomingBrowserEvent } from "./schema.ts";
import { isValidCustomEventName } from "./standard-events.ts";

const site = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  siteId: "22222222-2222-4222-8222-222222222222",
  trackingId: "A7K2Q9",
  environmentId: "33333333-3333-4333-8333-333333333333",
};

function browserEvent(overrides: Partial<IncomingBrowserEvent> = {}): IncomingBrowserEvent {
  return {
    id: newUlid(),
    name: "page_view",
    ts: Date.now(),
    page: { url: "https://shop.example.com/p/1?utm_source=meta&fbclid=abc&email=x@y.de", referrer: "https://google.com/?q=shoes", title: "Shoe" },
    ids: { anonymous_id: "anon1", session_id: "s1" },
    consent: { granted: ["necessary", "analytics"], source: "api", policy_version: "v1", ts: Date.now(), region: "DE", gpc: false },
    sdk: { name: "browser", version: "1.0.0", config_version: 3, schema_version: "1.0.0" },
    ...overrides,
  };
}

describe("names", () => {
  it("maps legacy names and validates custom names", () => {
    expect(canonicalName("Purchase")).toEqual({ name: "purchase", isStandard: true });
    expect(canonicalName("InitiateCheckout")).toEqual({ name: "begin_checkout", isStandard: true });
    expect(canonicalName("newsletter_click")).toEqual({ name: "newsletter_click", isStandard: false });
    expect(canonicalName("gtm_thing")).toBeNull();
    expect(isValidCustomEventName("Bad Name")).toBe(false);
  });
});

describe("normalizeBrowserEvent", () => {
  it("scrubs url, extracts click ids with expiry, and builds a valid canonical event", () => {
    const r = normalizeBrowserEvent(browserEvent(), { site, serverTs: new Date(), ipTruncated: "1.2.3.0", uaFamily: "chrome" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(canonicalEventSchema.safeParse(r.event).success).toBe(true);
    expect(r.event.url).toBe("https://shop.example.com/p/1?utm_source=meta");
    expect(r.event.utm).toEqual({ utm_source: "meta" });
    expect(r.event.click_ids?.fbclid?.value).toBe("abc");
    expect(r.event.click_ids?.fbclid?.expires_at).toBeDefined();
    expect(r.event.provenance.url?.data_class).toBe("DERIVED");
    expect(r.event.user_data).toBeNull();
    expect(r.event.processing_state).toBe("normalized");
  });

  it("rejects out-of-window timestamps and bad names", () => {
    expect(normalizeBrowserEvent(browserEvent({ ts: Date.now() - 3 * 86_400_000 }), { site, serverTs: new Date(), ipTruncated: null, uaFamily: null })).toMatchObject({ ok: false, reason: "timestamp_out_of_window" });
    expect(normalizeBrowserEvent(browserEvent({ name: "gtm_x" }), { site, serverTs: new Date(), ipTruncated: null, uaFamily: null })).toMatchObject({ ok: false, reason: "invalid_event_name" });
  });

  it("validates batches", () => {
    expect(incomingBrowserBatchSchema.safeParse({ site_id: "a7k2q9", sent_at: Date.now(), events: [browserEvent()] }).success).toBe(true);
    expect(incomingBrowserBatchSchema.safeParse({ site_id: "a7k2q9", sent_at: Date.now(), events: [] }).success).toBe(false);
  });
});

describe("normalizeServerEvent", () => {
  it("hashes user data, keeps unknown fields null and marks verified sources", () => {
    const r = normalizeServerEvent(
      {
        name: "purchase",
        commerce: { order_id: "1001", currency: "EUR", value: 99.9 },
        user_data: { email: " Jane@Example.com ", phone: "+49 151 1234567" },
        source: "shopify",
        source_verified: true,
      },
      { site, serverTs: new Date(), ipTruncated: null, uaFamily: null },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.event.user_data?.em).toHaveLength(64);
    expect(r.event.user_data?.fn).toBeNull();
    expect(r.event.provenance.commerce?.source).toBe("shopify:verified");
    expect(r.event.consent.source).toBe("server");
    expect(canonicalEventSchema.safeParse(r.event).success).toBe(true);
  });

  it("warns on purchase without order id", () => {
    const r = normalizeServerEvent({ name: "purchase", source: "server", source_verified: false }, { site, serverTs: new Date(), ipTruncated: null, uaFamily: null });
    expect(r.ok && r.warnings).toContain("purchase_without_order_id");
  });

  it("hashUserData normalizes", () => {
    expect(hashUserData({ email: "A@B.de" })?.em).toBe(hashUserData({ email: "a@b.de" })?.em);
    expect(hashUserData({})).toBeNull();
  });
});

describe("helpers", () => {
  it("truncates ips and classifies ua families", () => {
    expect(truncateIp("192.168.10.55")).toBe("192.168.10.0");
    expect(truncateIp("2a02:8108:abcd:1234::1")).toBe("2a02:8108:abcd::");
    expect(uaFamily("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36")).toBe("chrome");
    expect(uaFamily("Googlebot/2.1")).toBe("bot");
  });
});
