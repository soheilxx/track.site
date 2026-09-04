import { describe, expect, it } from "vitest";
import { DEFAULT_SITE_POLICY } from "@track-site/policy";
import {
  DEFAULT_SIMULATOR_INPUT,
  defaultSignalFor,
  filterEvents,
  parseSimulatorInput,
  requiredPurposeFor,
  selectDestinations,
  serializeSimulatorInput,
  simulate,
  simulatorEvents,
  sitePolicyFrom,
  type SimDestination,
  type SimulatorInput,
} from "./consent-simulator";

const meta: SimDestination = { id: "11111111-1111-4111-8111-111111111111", name: "Meta Ads", connectorType: "meta", status: "connected", requiredPurpose: null, hypothetical: false };
const ga4: SimDestination = { id: "22222222-2222-4222-8222-222222222222", name: "GA4", connectorType: "ga4", status: "connected", requiredPurpose: null, hypothetical: false };
const webhook: SimDestination = { id: "33333333-3333-4333-8333-333333333333", name: "Own webhook", connectorType: "webhook", status: "paused", requiredPurpose: null, hypothetical: false };

const events = simulatorEvents(["newsletter_open"]);
const row = (name: string, result: ReturnType<typeof simulate>) => result.rows.find((r) => r.event.name === name)!;
const input = (overrides: Partial<SimulatorInput> = {}): SimulatorInput => ({ ...DEFAULT_SIMULATOR_INPUT, ...overrides });

describe("URL state", () => {
  it("falls back per field and keeps an explicit empty consent", () => {
    const parsed = parseSimulatorInput({ region: "fr", granted: "", signal: "nonsense", gpc: "1", destination: "type:meta", policy: "draft", category: "commerce", source: "shop" });
    expect(parsed).toEqual({ region: "FR", granted: [], signal: "api", gpc: true, source: "shop", destination: "type:meta", policy: "draft", category: "commerce" });
    expect(parseSimulatorInput({})).toEqual(DEFAULT_SIMULATOR_INPUT);
    expect(parseSimulatorInput({ granted: ["marketing", "bogus"] }).granted).toEqual(DEFAULT_SIMULATOR_INPUT.granted);
  });
  it("round-trips through the serialised query in a stable order", () => {
    const state = input({ region: "US", granted: ["marketing", "analytics"], gpc: true, destination: "all", category: "lead" });
    const query = serializeSimulatorInput(state);
    expect(query).toBe("policy=published&region=US&granted=analytics%2Cmarketing&signal=api&gpc=1&source=browser&destination=all&category=lead");
    expect(parseSimulatorInput(Object.fromEntries(new URLSearchParams(query)))).toEqual({ ...state, granted: ["analytics", "marketing"] });
  });
  it("maps the site's CMP provider to the default signal", () => {
    expect(defaultSignalFor("usercentrics")).toBe("cmp:usercentrics");
    expect(defaultSignalFor("tcf")).toBe("tcf");
    expect(defaultSignalFor("none")).toBe("default");
    expect(defaultSignalFor(null)).toBe("api");
  });
});

describe("policy source", () => {
  it("builds the runtime policy like the worker and ignores unknown values", () => {
    const policy = sitePolicyFrom({ version: 3, regionPolicies: { US: { mode: "opt_out", allowAdvancedConsentMode: false }, XX: { mode: "bogus", allowAdvancedConsentMode: false } }, destinationPurposes: { ga4: "marketing", nope: "analytics" }, operationalEvents: ["purchase"] });
    expect(policy.version).toBe("v3");
    expect(policy.regionPolicies["US"]).toEqual({ mode: "opt_out", allowAdvancedConsentMode: false });
    expect(policy.regionPolicies["EU"]).toEqual({ mode: "strict_opt_in", allowAdvancedConsentMode: false });
    expect(policy.regionPolicies["XX"]).toBeUndefined();
    expect(policy.destinationPurposes).toEqual({ ga4: "marketing" });
    expect(policy.operationalEvents).toEqual(["purchase"]);
    expect(sitePolicyFrom(null)).toBe(DEFAULT_SITE_POLICY);
  });
  it("resolves the strictest required purpose for a destination", () => {
    expect(requiredPurposeFor(ga4, DEFAULT_SITE_POLICY)).toBe("analytics");
    expect(requiredPurposeFor(ga4, { ...DEFAULT_SITE_POLICY, destinationPurposes: { ga4: "marketing" } })).toBe("marketing");
    expect(requiredPurposeFor({ ...meta, requiredPurpose: "analytics" }, DEFAULT_SITE_POLICY)).toBe("marketing");
  });
});

describe("event and destination selection", () => {
  it("lists the standard catalogue first and the site's custom events last", () => {
    expect(events[0]!.name).toBe("page_view");
    expect(events.at(-1)).toMatchObject({ name: "newsletter_open", category: "custom", isStandard: false });
    expect(filterEvents(events, "custom").map((e) => e.name)).toEqual(["newsletter_open"]);
    expect(filterEvents(events, "commerce").every((e) => e.category === "commerce")).toBe(true);
  });
  it("selects all, one or a hypothetical destination", () => {
    expect(selectDestinations(input(), [meta, ga4])).toEqual([meta, ga4]);
    expect(selectDestinations(input({ destination: ga4.id }), [meta, ga4])).toEqual([ga4]);
    expect(selectDestinations(input({ destination: "type:tiktok" }), [meta])).toEqual([{ id: "type:tiktok", name: "tiktok", connectorType: "tiktok", status: "connected", requiredPurpose: null, hypothetical: true }]);
    expect(selectDestinations(input({ destination: "type:bogus" }), [meta])).toEqual([meta]);
  });
});

describe("simulation (strict EU default policy)", () => {
  it("is deterministic", () => {
    const a = simulate(input(), DEFAULT_SITE_POLICY, [meta, ga4], events);
    const b = simulate(input(), DEFAULT_SITE_POLICY, [meta, ga4], events);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
  it("blocks everything but operational events without an explicit signal, and nothing is forwarded", () => {
    const r = simulate(input({ signal: "default", granted: [] }), DEFAULT_SITE_POLICY, [meta, ga4], events);
    expect(r.explicitSignal).toBe(false);
    expect(row("page_view", r).persistence).toMatchObject({ status: "blocked", reason: "consent_missing" });
    expect(row("page_view", r).dispatch.every((d) => d.status === "blocked" && d.reason === "not_persisted")).toBe(true);
    expect(row("purchase", r).persistence).toMatchObject({ status: "reduced", withheld: ["analytics_ids", "network", "click_ids", "vendor_ids"] });
    expect(row("purchase", r).dispatch.find((d) => d.destinationId === meta.id)).toMatchObject({ status: "blocked", reason: "consent_missing", purposeRequired: "marketing" });
    expect(r.summary.forwarded).toBe(0);
  });
  it("analytics-only consent: stored without marketing identifiers, forwarded to GA4, not to Meta", () => {
    const r = simulate(input({ granted: ["analytics"] }), DEFAULT_SITE_POLICY, [meta, ga4], events);
    const pv = row("page_view", r);
    expect(pv.persistence).toMatchObject({ status: "reduced", withheld: ["click_ids", "vendor_ids"] });
    expect(pv.dispatch.find((d) => d.destinationId === ga4.id)).toMatchObject({ status: "forwarded", purposeRequired: "analytics", clickIds: [], clickIdsWithheld: true });
    expect(pv.dispatch.find((d) => d.destinationId === meta.id)).toMatchObject({ status: "blocked", reason: "purpose_not_granted", purposeRequired: "marketing" });
    expect(r.consentMode).toMatchObject({ analytics_storage: "granted", ad_storage: "denied" });
  });
  it("full consent forwards vendor-scoped click ids only", () => {
    const r = simulate(input({ granted: ["analytics", "marketing"] }), DEFAULT_SITE_POLICY, [meta, ga4], events);
    const pv = row("page_view", r);
    expect(pv.persistence.status).toBe("allowed");
    expect(pv.dispatch.find((d) => d.destinationId === meta.id)).toMatchObject({ status: "forwarded", clickIds: ["fbclid"], forwarded: expect.arrayContaining(["event", "page", "click_ids", "vendor_ids"]) });
    expect(pv.dispatch.find((d) => d.destinationId === ga4.id)!.clickIds).toEqual(["gbraid", "gclid", "wbraid"]);
  });
  it("GPC removes marketing even when it was granted", () => {
    const r = simulate(input({ granted: ["analytics", "marketing"], gpc: true }), DEFAULT_SITE_POLICY, [meta, ga4], events);
    expect(r.effectiveGranted).toEqual(["necessary", "analytics"]);
    expect(row("page_view", r).dispatch.find((d) => d.destinationId === meta.id)).toMatchObject({ status: "blocked", reason: "gpc_opt_out" });
    expect(row("page_view", r).dispatch.find((d) => d.destinationId === ga4.id)!.status).toBe("forwarded");
  });
  it("paused destinations never receive events", () => {
    const r = simulate(input(), DEFAULT_SITE_POLICY, [webhook], events);
    expect(row("page_view", r).dispatch[0]).toMatchObject({ status: "blocked", reason: "destination_paused" });
  });
  it("verified shop orders are stored operationally but never reach ads without marketing consent", () => {
    const strict = { ...DEFAULT_SITE_POLICY, operationalEvents: [] };
    const r = simulate(input({ source: "shop", signal: "server", granted: [] }), strict, [meta, webhook], events);
    const purchase = row("purchase", r);
    expect(purchase.persistence).toMatchObject({ status: "reduced", purposeRequired: "necessary" });
    expect(purchase.persistence.applicable).toContain("user_data");
    expect(purchase.dispatch.find((d) => d.destinationId === meta.id)).toMatchObject({ status: "blocked", reason: "purpose_not_granted" });
    // an unverified server page view under the same policy is dropped
    expect(row("page_view", simulate(input({ source: "server", signal: "server", granted: [] }), strict, [], events)).persistence.status).toBe("blocked");
  });
  it("region overrides in a draft change the outcome and the reported mode", () => {
    const draft = sitePolicyFrom({ version: 2, regionPolicies: { US: { mode: "notice_only", allowAdvancedConsentMode: false } }, destinationPurposes: {}, operationalEvents: ["purchase", "refund"] });
    const r = simulate(input({ region: "US", signal: "default", granted: [] }), draft, [ga4], events);
    expect(r.regionGroup).toBe("US");
    expect(r.regionMode).toBe("notice_only");
    // the worker never persists without a signal (persistWithoutSignal is false), so the event is still blocked
    expect(row("page_view", r).persistence.status).toBe("blocked");
  });
  it("counts the summary consistently", () => {
    const r = simulate(input({ granted: ["analytics"] }), DEFAULT_SITE_POLICY, [meta, ga4], events);
    expect(r.summary.events).toBe(events.length);
    expect(r.summary.allowed + r.summary.reduced + r.summary.blocked).toBe(events.length);
    expect(r.summary.forwarded + r.summary.dispatchBlocked).toBe(events.length * 2);
  });
});
