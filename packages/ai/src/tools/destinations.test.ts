import { describe, expect, it } from "vitest";
import { DESTINATION_SETTING_KEYS, DESTINATION_SETTING_KEY_LIST, DESTINATION_SETTING_SPECS, resolveSettingEntries, setDestinationSettingsDraft, type DestinationSettingEntry } from "./destinations.ts";

const entry = (key: string, patch: Partial<DestinationSettingEntry> = {}): DestinationSettingEntry => ({ key, string_value: null, number_value: null, boolean_value: null, event_map: null, string_list: null, ...patch });

function failure(fn: () => unknown): { code: string; message: string } {
  try {
    fn();
  } catch (e) {
    const err = e as { code?: string; message: string };
    return { code: err.code ?? "none", message: err.message };
  }
  throw new Error("expected the call to throw");
}

describe("destination setting catalog", () => {
  it("names exactly the keys the connectors read", () => {
    expect(DESTINATION_SETTING_KEYS.webhook).toEqual(["allowFields", "includeIdentifiers", "timeoutMs"]);
    expect(DESTINATION_SETTING_KEYS.linkedin).toEqual(["conversion_rules"]);
    expect(DESTINATION_SETTING_KEYS.x).toEqual(["event_ids"]);
    for (const key of DESTINATION_SETTING_KEY_LIST) expect(DESTINATION_SETTING_SPECS[key], key).toBeDefined();
  });

  it("puts the per-connector key list into the tool description", () => {
    expect(setDestinationSettingsDraft.description).toContain("webhook: allowFields, includeIdentifiers, timeoutMs");
    expect(setDestinationSettingsDraft.description).toContain("linkedin: conversion_rules");
    expect(setDestinationSettingsDraft.description.length).toBeLessThanOrEqual(1024);
  });
});

describe("resolveSettingEntries", () => {
  it("rejects keys another connector owns and lists the supported ones", () => {
    const f = failure(() => resolveSettingEntries("meta", [entry("conversion_rules", { event_map: [{ event: "purchase", id: "1" }] })]));
    expect(f.code).toBe("VALIDATION_ERROR");
    expect(f.message).toMatch(/not supported for meta; supported: test_event_code/);
    expect(failure(() => resolveSettingEntries("ga4", [entry("test_event_code", { string_value: "x" })])).message).toMatch(/supported: none/);
  });

  it("requires exactly the value field of the key's shape", () => {
    expect(failure(() => resolveSettingEntries("webhook", [entry("includeIdentifiers", { string_value: "true" })])).message).toMatch(/boolean setting: set boolean_value/);
    expect(failure(() => resolveSettingEntries("webhook", [entry("timeoutMs", { number_value: 5000, boolean_value: true })])).message).toMatch(/set number_value/);
    expect(failure(() => resolveSettingEntries("linkedin", [entry("conversion_rules", { string_value: "123" })])).message).toMatch(/event_map setting: set event_map/);
  });

  it("rejects a key listed twice", () => {
    expect(failure(() => resolveSettingEntries("meta", [entry("test_event_code", { string_value: "A" }), entry("test_event_code", { string_value: "B" })])).message).toMatch(/listed twice/);
  });

  it("normalises event maps to lower-case canonical events with validated ids", () => {
    const linkedin = resolveSettingEntries("linkedin", [entry("conversion_rules", { event_map: [{ event: "Purchase", id: " 123456 " }, { event: "generate_lead", id: "7" }] })]);
    expect(linkedin).toEqual({ settings: { conversion_rules: { purchase: "123456", generate_lead: "7" } }, publicConfig: {} });
    expect(failure(() => resolveSettingEntries("google_ads", [entry("conversion_actions", { event_map: [{ event: "purchase", id: "abc" }] })])).message).toMatch(/id "abc" for purchase is invalid; expected .*digits only/);
    expect(failure(() => resolveSettingEntries("gmp", [entry("floodlight_activities", { event_map: [{ event: "Not An Event!", id: "1" }] })])).message).toMatch(/not a canonical event name/);
    expect(failure(() => resolveSettingEntries("gmp", [entry("floodlight_activities", { event_map: [{ event: "purchase", id: "1" }, { event: "PURCHASE", id: "2" }] })])).message).toMatch(/purchase is listed twice/);
    expect(resolveSettingEntries("x", [entry("event_ids", { event_map: [{ event: "purchase", id: "tw-abc12-def34" }] })]).settings).toEqual({ event_ids: { purchase: "tw-abc12-def34" } });
    expect(failure(() => resolveSettingEntries("x", [entry("event_ids", { event_map: [{ event: "purchase", id: "123456" }] })])).message).toMatch(/tw-xxxxx-xxxxx/);
  });

  it("validates strings, blocks secret-looking values and never stores them", () => {
    expect(resolveSettingEntries("meta", [entry("test_event_code", { string_value: " TEST12345 " })]).settings).toEqual({ test_event_code: "TEST12345" });
    expect(failure(() => resolveSettingEntries("tiktok", [entry("test_event_code", { string_value: "has space" })])).message).toMatch(/expected test event code/);
    expect(failure(() => resolveSettingEntries("meta", [entry("test_event_code", { string_value: "   " })])).message).toMatch(/value is empty/);
    const f = failure(() => resolveSettingEntries("affiliate", [entry("merchant_id", { string_value: "sk_live_51H8abcdefghijklmnop" })]));
    expect(f.code).toBe("POLICY_BLOCKED");
    expect(f.message).toMatch(/secure credential card/);
  });

  it("bounds numbers and accepts booleans and field lists for the webhook", () => {
    expect(failure(() => resolveSettingEntries("webhook", [entry("timeoutMs", { number_value: 500 })])).message).toMatch(/out of range; expected .*1000-30000/);
    expect(failure(() => resolveSettingEntries("webhook", [entry("timeoutMs", { number_value: 1500.5 })])).message).toMatch(/not an integer/);
    expect(resolveSettingEntries("webhook", [entry("timeoutMs", { number_value: 5000 }), entry("includeIdentifiers", { boolean_value: false }), entry("allowFields", { string_list: [" name ", "props", "name"] })])).toEqual({ settings: { timeoutMs: 5000, includeIdentifiers: false, allowFields: ["name", "props"] }, publicConfig: {} });
    expect(failure(() => resolveSettingEntries("webhook", [entry("allowFields", { string_list: ["bad field"] })])).message).toMatch(/"bad field" is not a valid field name/);
  });

  it("mirrors keys the connector reads from publicConfig", () => {
    expect(resolveSettingEntries("amazon", [entry("profile_id", { string_value: "1234567890" })])).toEqual({ settings: { profile_id: "1234567890" }, publicConfig: { profile_id: "1234567890" } });
    expect(resolveSettingEntries("affiliate", [entry("merchant_id", { string_value: "m-42" })]).publicConfig).toEqual({ merchant_id: "m-42" });
  });
});

describe("set_destination_settings_draft input", () => {
  const base = { integration_id: "6d1f7a0e-1b2c-4d3e-8f90-a1b2c3d4e5f6", mode: null, test_mode: null, enabled: null, name: null };

  it("rejects the old record shape with a message that names the expected shape", () => {
    const r = setDestinationSettingsDraft.validate({ ...base, settings: { test_event_code: "TEST1" } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/settings: .*expected array/);
  });

  it("rejects unknown keys by naming the allowed ones", () => {
    const r = setDestinationSettingsDraft.validate({ ...base, settings: [entry("allowed_fields", { string_list: ["name"] })] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/settings\.0\.key/);
      expect(r.error).toContain("allowFields");
      expect(r.error).toContain("test_event_code");
    }
  });

  it("accepts a well-formed entry list", () => {
    const r = setDestinationSettingsDraft.validate({ ...base, settings: [entry("test_event_code", { string_value: "TEST1" })] });
    expect(r.ok).toBe(true);
  });
});
