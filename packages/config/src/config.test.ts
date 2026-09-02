import { describe, expect, it } from "vitest";
import { generateSigningKeyPair } from "@track-site/core";
import { defaultBundle, type ConfigBundle } from "./bundle.ts";
import { diffBundles, publishImpact } from "./diff.ts";
import { applyFieldMap, applyLogic, validateLogic } from "./jsonlogic.ts";
import { lintBundle, originAllowed } from "./lint.ts";
import { browserView, buildManifest, signConfigBundle, verifyConfigBundle } from "./signing.ts";

const dest = (over: Partial<ConfigBundle["destinations"][number]> = {}): ConfigBundle["destinations"][number] => ({
  id: "11111111-1111-4111-8111-111111111111",
  type: "meta",
  name: "Meta",
  enabled: true,
  purpose: "marketing",
  mode: "hybrid",
  browser: { pixel_id: "123456789012345", measurement_id: null, partner_id: null, conversion_id: null, conversion_label: null },
  test_mode: true,
  mappings: [{ event: "page_view", vendor_event: "PageView", enabled: true, field_map: null }],
  ...over,
});

describe("jsonlogic sandbox", () => {
  it("allows only listed operators and bounded depth", () => {
    expect(validateLogic({ var: "commerce.value" }).ok).toBe(true);
    expect(validateLogic({ eval: "x" }).ok).toBe(false);
    expect(validateLogic({ var: "__proto__.x" }).ok).toBe(false);
    let deep: unknown = { var: "a" };
    for (let i = 0; i < 10; i++) deep = { if: [true, deep, null] };
    expect(validateLogic(deep).ok).toBe(false);
  });
  it("applies field maps with custom pure helpers", () => {
    const out = applyFieldMap(
      { value: { round: [{ var: "commerce.value" }, 2] }, currency: { upper: { var: "commerce.currency" } }, id: { coalesce: [{ var: "commerce.order_id" }, { var: "commerce.transaction_id" }] } },
      { commerce: { value: 12.345, currency: "eur", order_id: null, transaction_id: "t1" } },
    );
    expect(out).toEqual({ value: 12.35, currency: "EUR", id: "t1" });
    expect(() => applyLogic({ eval: "x" }, {})).toThrow();
  });
});

describe("lint", () => {
  it("accepts the default bundle for staging and requires hosts in production", () => {
    const b = defaultBundle("A7K2Q9", "staging", null);
    expect(lintBundle(b).ok).toBe(true);
    const prod = defaultBundle("A7K2Q9", "production", null);
    expect(lintBundle(prod).errors.map((e) => e.code)).toContain("no_allowed_hosts");
    expect(lintBundle(defaultBundle("A7K2Q9", "production", "www.shop.de")).ok).toBe(true);
  });
  it("blocks weak purposes, missing ids, custom code and unverified conversions", () => {
    const b = defaultBundle("A7K2Q9", "staging", "shop.de");
    b.destinations = [dest({ purpose: "analytics" })];
    expect(lintBundle(b).errors.map((e) => e.code)).toContain("purpose_too_weak");
    b.destinations = [dest({ browser: { pixel_id: null, measurement_id: null, partner_id: null, conversion_id: null, conversion_label: null } })];
    expect(lintBundle(b).errors.map((e) => e.code)).toContain("missing_public_id");
    b.destinations = [dest()];
    b.events.push({ name: "purchase", enabled: true, critical: true, trigger: { type: "api" }, props_map: null, authoritative_source: "none" });
    expect(lintBundle(b).errors.map((e) => e.code)).toContain("conversion_without_authoritative_source");
    expect(lintBundle({ ...b, events: [{ ...b.events[0], html: "<script>" }] }).ok).toBe(false);
  });
  it("matches origins", () => {
    expect(originAllowed(defaultBundle("A7K2Q9", "production", "www.shop.de"), "shop.de")).toBe(true);
    expect(originAllowed(defaultBundle("A7K2Q9", "production", "www.shop.de"), "evil.de")).toBe(false);
  });
});

describe("diff + signing", () => {
  it("produces readable diffs and impact summaries", () => {
    const before = defaultBundle("A7K2Q9", "staging", "shop.de");
    const after = { ...before, destinations: [dest()], settings: { ...before.settings, debug: true } };
    const d = diffBundles(before, after);
    expect(d.map((x) => x.summary)).toEqual(expect.arrayContaining(["Destination 11111111-1111-4111-8111-111111111111 added", "Setting debug: false → true"]));
    expect(publishImpact(after).recipients[0]).toMatchObject({ type: "meta", purpose: "marketing", events: ["page_view"] });
  });
  it("signs, verifies and fails closed on tampering", () => {
    const kp = generateSigningKeyPair("cfg-v1");
    const b = { ...defaultBundle("A7K2Q9", "production", "shop.de"), version: 3 };
    const signed = signConfigBundle(b, kp.keyId, kp.privateKeyBase64);
    expect(verifyConfigBundle(signed, { "cfg-v1": kp.publicKeyBase64 })).toBe(true);
    const tampered = { ...signed, payload: { ...signed.payload, settings: { ...signed.payload.settings, kill_switch: true } } };
    expect(verifyConfigBundle(tampered, { "cfg-v1": kp.publicKeyBase64 })).toBe(false);
    const manifest = buildManifest(signed, "https://cdn.test/config/A7K2Q9/3.json", false, "2026-09-02T00:00:00.000Z");
    expect(manifest).toMatchObject({ version: 3, tracking_id: "A7K2Q9", key_id: "cfg-v1" });
    const view = browserView({ ...b, destinations: [dest({ mode: "server" }), dest({ id: "22222222-2222-4222-8222-222222222222" })] });
    expect(view.destinations).toHaveLength(1);
  });
});
