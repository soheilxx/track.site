import { describe, expect, it } from "vitest";
import { newUlid } from "@track-site/core";
import type { CanonicalEvent, ConsentState } from "@track-site/events";
import { DEFAULT_SITE_POLICY, applyStrip, clickIdsForDestination, evaluateDispatch, evaluatePersistence } from "./engine.ts";
import { scanEventForPii } from "./pii-scanner.ts";
import { consentSnapshotHash } from "./snapshot.ts";
import { toConsentMode } from "./purposes.ts";

function consent(granted: ConsentState["granted"], source: ConsentState["source"] = "api", extra: Partial<ConsentState> = {}): ConsentState {
  return { granted, source, policy_version: "v1", ts: Date.now(), region: "DE", gpc: null, ...extra };
}

function event(overrides: Partial<CanonicalEvent> = {}): CanonicalEvent {
  const now = new Date().toISOString();
  return {
    event_id: newUlid(),
    source_event_id: newUlid(),
    organization_id: "11111111-1111-4111-8111-111111111111",
    site_id: "22222222-2222-4222-8222-222222222222",
    site_tracking_id: "A7K2Q9",
    environment_id: "33333333-3333-4333-8333-333333333333",
    name: "page_view",
    is_standard: true,
    category: "engagement",
    client_ts: now,
    server_ts: now,
    anonymous_id: "anon",
    session_id: "s",
    user_id: null,
    url: "https://shop.example.com/",
    host: "shop.example.com",
    path: "/",
    referrer: null,
    title: "Home",
    utm: null,
    click_ids: { fbclid: { value: "fb1", source: "browser", captured_at: now, expires_at: new Date(Date.now() + 86_400_000).toISOString() }, gclid: { value: "g1", source: "browser", captured_at: now, expires_at: new Date(Date.now() - 1000).toISOString() } },
    vendor_ids: { fbp: "fb.1.x" },
    consent: consent(["necessary", "analytics", "marketing"]),
    consent_snapshot_id: null,
    props: null,
    commerce: null,
    user_data: null,
    ip_truncated: "1.2.3.0",
    ua_family: "chrome",
    locale: "de-DE",
    source: "browser",
    source_verified: false,
    sdk_version: "1.0.0",
    config_version: 1,
    schema_version: "1.0.0",
    provenance: {},
    processing_state: "normalized",
    drop_reason: null,
    is_billable: false,
    is_bot: false,
    ...overrides,
  };
}

describe("persistence gate (strict EU default)", () => {
  it("drops non-operational events without an explicit signal", () => {
    const d = evaluatePersistence(event({ consent: consent(["necessary"], "default") }));
    expect(d).toMatchObject({ allow: false, reason: "consent_missing" });
  });
  it("drops analytics events when analytics was denied explicitly", () => {
    expect(evaluatePersistence(event({ consent: consent(["necessary"]) }))).toMatchObject({ allow: false, reason: "consent_denied" });
  });
  it("persists analytics-only events but strips marketing identifiers", () => {
    const d = evaluatePersistence(event({ consent: consent(["necessary", "analytics"]) }));
    expect(d.allow).toBe(true);
    if (d.allow) {
      expect(d.strippedFields).toEqual(["click_ids", "vendor_ids"]);
      const stripped = applyStrip(event(), d.strippedFields);
      expect(stripped.click_ids).toBeNull();
      expect(stripped.vendor_ids).toBeNull();
    }
  });
  it("keeps operational purchases without consent but strips all identifiers", () => {
    const d = evaluatePersistence(event({ name: "purchase", category: "commerce", source: "shopify", consent: consent(["necessary"], "server") }));
    expect(d.allow).toBe(true);
    if (d.allow) expect(d.strippedFields).toEqual(expect.arrayContaining(["anonymous_id", "click_ids"]));
  });
});

describe("dispatch gate", () => {
  const meta = { connectorType: "meta" as const, status: "connected" as const };
  const ga4 = { connectorType: "ga4" as const, status: "connected" as const };
  it("analytics-only consent: GA4 allowed, Meta blocked", () => {
    const e = event({ consent: consent(["necessary", "analytics"]) });
    expect(evaluateDispatch(e, ga4).allow).toBe(true);
    expect(evaluateDispatch(e, meta)).toMatchObject({ allow: false, reason: "purpose_not_granted", purposeRequired: "marketing" });
  });
  it("server purchase without marketing consent is not sent to ads", () => {
    const e = event({ name: "purchase", source: "shopify", consent: consent(["necessary"], "server") });
    expect(evaluateDispatch(e, meta)).toMatchObject({ allow: false, reason: "purpose_not_granted", purposeRequired: "marketing" });
    const noSignal = event({ name: "purchase", source: "shopify", consent: consent(["necessary"], "default") });
    expect(evaluateDispatch(noSignal, meta)).toMatchObject({ allow: false, reason: "consent_missing" });
  });
  it("GPC blocks marketing destinations even with granted marketing", () => {
    const e = event({ consent: consent(["necessary", "analytics", "marketing"], "api", { gpc: true }) });
    expect(evaluateDispatch(e, meta)).toMatchObject({ allow: false, reason: "gpc_opt_out" });
    expect(evaluateDispatch(e, ga4).allow).toBe(true);
  });
  it("paused destinations never receive events", () => {
    expect(evaluateDispatch(event(), { ...meta, status: "paused" })).toMatchObject({ allow: false, reason: "destination_paused" });
  });
  it("inferred values are never exported to ad platforms", () => {
    const e = event({ provenance: { commerce: { data_class: "INFERRED", source: "ai", at: new Date().toISOString(), algorithm: null, algorithm_version: null, inputs: null, model: "m", confidence: 0.4, expires_at: null, human_confirmed_at: null } } });
    expect(evaluateDispatch(e, meta)).toMatchObject({ allow: false, reason: "inferred_data_not_exportable" });
    expect(evaluateDispatch(e, ga4).allow).toBe(true);
  });
  it("customer overrides can only be stricter", () => {
    const e = event({ consent: consent(["necessary", "analytics"]) });
    expect(evaluateDispatch(e, ga4, { ...DEFAULT_SITE_POLICY, destinationPurposes: { ga4: "marketing" } }).allow).toBe(false);
    expect(evaluateDispatch(e, { ...meta, requiredPurpose: "necessary" }).allow).toBe(false);
  });
  it("click ids are vendor-scoped and expire", () => {
    expect(clickIdsForDestination(event(), "meta")).toEqual({ fbclid: "fb1" });
    expect(clickIdsForDestination(event(), "ga4")).toEqual({});
    expect(clickIdsForDestination(event(), "tiktok")).toEqual({});
  });
});

describe("pii scanner", () => {
  it("redacts emails in free text and blocks secrets/cards", () => {
    const r = scanEventForPii(event({ title: "Order for max@example.com", props: { note: "card 4111 1111 1111 1111" } }));
    expect(r.blocked).toBe(true);
    expect(r.event.title).toBe("Order for [redacted:email]");
    expect(r.event.props?.note).toBe("card [redacted:card]");
    expect(r.event.processing_state).toBe("rejected");
    expect(scanEventForPii(event({ props: { color: "red" } })).blocked).toBe(false);
  });
});

describe("consent mode + snapshots", () => {
  it("derives consent mode flags", () => {
    expect(toConsentMode(consent(["necessary", "analytics"]))).toMatchObject({ analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
    expect(toConsentMode(consent(["necessary", "analytics", "marketing", "personalization"], "api", { gpc: true })).ad_storage).toBe("denied");
  });
  it("hashes snapshots order-independently", () => {
    const a = consentSnapshotHash({ siteId: "s", policyVersion: "v1", granted: ["analytics", "necessary"], vendors: ["meta"], source: "api", region: "DE", gpc: false });
    const b = consentSnapshotHash({ siteId: "s", policyVersion: "v1", granted: ["necessary", "analytics"], vendors: ["meta"], source: "api", region: "DE", gpc: false });
    expect(a).toBe(b);
  });
});

describe("verified shop records", () => {
  it("persists a verified shop purchase without browser consent as an operational record with identifiers stripped", () => {
    const strict = { ...DEFAULT_SITE_POLICY, operationalEvents: [] };
    const d = evaluatePersistence(event({ name: "purchase", category: "commerce", source: "shopify", source_verified: true, consent: consent(["necessary"], "server") }), strict);
    expect(d.allow).toBe(true);
    if (d.allow) expect(d.strippedFields).toEqual(expect.arrayContaining(["anonymous_id", "click_ids"]));
  });
  it("still drops an unverified server purchase without consent", () => {
    const strict = { ...DEFAULT_SITE_POLICY, operationalEvents: [] };
    const d = evaluatePersistence(event({ name: "purchase", category: "commerce", source: "server", source_verified: false, consent: consent(["necessary"], "server") }), strict);
    expect(d.allow).toBe(false);
  });
  it("does not route a verified shop purchase to advertising destinations without marketing consent", () => {
    const d = evaluateDispatch(event({ name: "purchase", category: "commerce", source: "shopify", source_verified: true, consent: consent(["necessary"], "server") }), { connectorType: "meta", status: "connected" });
    expect(d.allow).toBe(false);
  });
});
