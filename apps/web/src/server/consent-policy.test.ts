import { describe, expect, it } from "vitest";
import { DEFAULT_POLICY_FIELDS, diffPolicyFields, effectiveDestinationPurpose, effectiveRegionMode, isWeaker, parseDraftForm, policyFieldsFrom, type PolicyFields } from "./consent-policy";

const fields = (overrides: Partial<PolicyFields> = {}): PolicyFields => ({ ...DEFAULT_POLICY_FIELDS, ...overrides });
const form = (values: Record<string, string>) => (name: string) => values[name] ?? null;

describe("consent policy fields", () => {
  it("normalises stored columns and drops unknown values", () => {
    const parsed = policyFieldsFrom({ regionPolicies: { US: { mode: "opt_out" }, XX: { mode: "weird" } }, destinationPurposes: { ga4: "marketing", ga4x: "marketing", meta: "bogus" }, operationalEvents: ["purchase", 3] });
    expect(parsed).toEqual({ regionPolicies: { US: { mode: "opt_out", allowAdvancedConsentMode: false } }, destinationPurposes: { ga4: "marketing" }, operationalEvents: ["purchase"] });
    expect(policyFieldsFrom(null)).toBe(DEFAULT_POLICY_FIELDS);
  });
  it("resolves effective modes and purposes with the platform defaults", () => {
    expect(effectiveRegionMode(fields(), "EU")).toBe("strict_opt_in");
    expect(effectiveRegionMode(fields({ regionPolicies: { EU: { mode: "opt_out", allowAdvancedConsentMode: false } } }), "EU")).toBe("opt_out");
    expect(effectiveDestinationPurpose(fields(), "ga4")).toBe("analytics");
    expect(effectiveDestinationPurpose(fields({ destinationPurposes: { ga4: "marketing" } }), "ga4")).toBe("marketing");
    // a stored override weaker than the base purpose never takes effect
    expect(effectiveDestinationPurpose(fields({ destinationPurposes: { meta: "analytics" } }), "meta")).toBe("marketing");
  });
  it("classifies every change as stricter or weaker", () => {
    const from = fields({ destinationPurposes: { ga4: "marketing" } });
    const to = fields({ regionPolicies: { US: { mode: "opt_out", allowAdvancedConsentMode: false } }, destinationPurposes: {}, operationalEvents: ["purchase"] });
    const changes = diffPolicyFields(from, to);
    expect(changes).toEqual([
      { kind: "region", key: "US", from: "strict_opt_in", to: "opt_out", weaker: true },
      { kind: "destination", key: "ga4", from: "marketing", to: "analytics", weaker: true },
      { kind: "operational", key: "refund", added: false, weaker: false },
    ]);
    expect(isWeaker(changes)).toBe(true);
    const stricter = diffPolicyFields(to, from);
    expect(stricter.every((c) => !c.weaker)).toBe(false); // adding refund back is "weaker"
    expect(stricter.find((c) => c.kind === "region")).toMatchObject({ weaker: false });
    expect(diffPolicyFields(from, from)).toEqual([]);
  });
  it("parses the editor form, keeps only non-default values and rejects weak overrides", () => {
    const result = parseDraftForm(form({ region_EU: "strict_opt_in", region_US: "opt_out", region_UK: "bogus", dest_ga4: "marketing", dest_meta: "analytics", dest_webhook: "", op_purchase: "1", legalBasisNote: "  Reviewed by counsel on 2026-08-01.  " }), ["ga4", "meta", "webhook"]);
    expect(result.fields).toEqual({ regionPolicies: { US: { mode: "opt_out", allowAdvancedConsentMode: false } }, destinationPurposes: { ga4: "marketing" }, operationalEvents: ["purchase"] });
    expect(result.fieldErrors).toEqual({ region_UK: "invalid", dest_meta: "purposeTooWeak" });
    expect(result.legalBasisNote).toBe("Reviewed by counsel on 2026-08-01.");
  });
});
