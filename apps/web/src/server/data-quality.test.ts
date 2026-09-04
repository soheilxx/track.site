import { describe, expect, it } from "vitest";
import { defaultBundle, type ConfigBundle } from "@track-site/config";
import type { IssueEvidence } from "@track-site/db";
import { applyFixPlan, categoryOf, fixPlanFor, groupIssues, impactScore, isStale, normalizeStatus, parseKind, rankIssues, type FixContext, type InboxIssue } from "./data-quality";

const evidence = (over: Partial<IssueEvidence> = {}): IssueEvidence => ({ window: null, affected: null, total: null, value: null, samples: [], facts: {}, ...over });

function issue(over: Partial<InboxIssue> & Pick<InboxIssue, "kind" | "severity">): InboxIssue {
  const { prefix, parts } = parseKind(over.kind);
  return {
    id: over.kind,
    kindPrefix: prefix,
    kindParts: parts,
    category: categoryOf(over.kind, null),
    status: "open",
    summary: "",
    occurrences: 1,
    firstSeenAt: new Date("2026-09-01T00:00:00Z"),
    lastSeenAt: new Date("2026-09-04T00:00:00Z"),
    resolvedAt: null,
    acknowledgedAt: null,
    mutedUntil: null,
    muteReason: null,
    statusNote: null,
    environmentId: null,
    environmentKind: null,
    impact: 0,
    stale: false,
    evidence: null,
    details: {},
    fixTool: null,
    fixDraftId: null,
    fixDraftAt: null,
    fixPlan: { code: null, reason: null, params: {} },
    ...over,
  };
}

function bundleWith(mutate?: (b: ConfigBundle) => void): ConfigBundle {
  const b = defaultBundle("ABC123", "production", "shop.example.test");
  mutate?.(b);
  return b;
}

const ctx = (over: Partial<FixContext> = {}): FixContext => ({ bundle: bundleWith(), shopPlatform: null, siteCurrency: "EUR", destinationNames: {}, ...over });

describe("kinds and categories", () => {
  it("parses structured kinds and maps them to categories", () => {
    expect(parseKind("missing_required_field:purchase:currency")).toEqual({ prefix: "missing_required_field", parts: ["purchase", "currency"] });
    expect(categoryOf("missing_required_field:purchase:currency", null)).toBe("required_fields");
    expect(categoryOf("unplanned_event:foo", null)).toBe("schema");
    expect(categoryOf("invalid_value:purchase:value", null)).toBe("values");
    expect(categoryOf("currency_mismatch:purchase", null)).toBe("values");
    expect(categoryOf("duplicate_conversion:purchase", null)).toBe("duplicates");
    expect(categoryOf("ingest_drop:pii_blocked", null)).toBe("drops");
    expect(categoryOf("event_drop:purchase", null)).toBe("drops");
    expect(categoryOf("conversion_spike:purchase", null)).toBe("spikes");
    expect(categoryOf("revenue_leak:abc:purchase", null)).toBe("revenue");
    expect(categoryOf("signal_gap:browser_capture:purchase", null)).toBe("revenue");
    expect(categoryOf("usage_limit_90", null)).toBe("usage");
    expect(categoryOf("usage_limit_reached", null)).toBe("usage");
    expect(categoryOf("something_else", "delivery")).toBe("delivery");
    expect(categoryOf("something_else", "nonsense")).toBe("other");
  });

  it("shows the legacy ignored status as muted", () => {
    expect(normalizeStatus("ignored")).toBe("muted");
    expect(normalizeStatus("acknowledged")).toBe("acknowledged");
    expect(normalizeStatus("weird")).toBe("open");
  });
});

describe("impact and ranking", () => {
  it("scores severity, affected share and value without exceeding 100", () => {
    expect(impactScore({ severity: "info", affected: null, total: null, valueAmount: null })).toBe(10);
    expect(impactScore({ severity: "warning", affected: 5, total: 100, valueAmount: null })).toBe(36);
    expect(impactScore({ severity: "critical", affected: 100, total: 100, valueAmount: 10_000 })).toBe(97);
    expect(impactScore({ severity: "critical", affected: 1_000_000, total: 1, valueAmount: 1e12 })).toBe(100);
    // a count without a comparison base grows logarithmically
    expect(impactScore({ severity: "warning", affected: 99, total: null, valueAmount: null })).toBe(45);
  });

  it("ranks by impact, then severity, then recency and groups by category", () => {
    const a = issue({ kind: "unplanned_event:foo", severity: "warning", impact: 40 });
    const b = issue({ kind: "missing_required_field:purchase:currency", severity: "critical", impact: 80 });
    const c = issue({ kind: "invalid_value:purchase:value", severity: "critical", impact: 40, lastSeenAt: new Date("2026-09-03T00:00:00Z") });
    const d = issue({ kind: "currency_mismatch:purchase", severity: "warning", impact: 40, lastSeenAt: new Date("2026-09-04T12:00:00Z") });
    expect(rankIssues([a, b, c, d]).map((i) => i.kind)).toEqual([b.kind, c.kind, d.kind, a.kind]);
    const groups = groupIssues([a, b, c, d]);
    expect(groups.map((g) => g.category)).toEqual(["required_fields", "values", "schema"]);
    expect(groups[1]!.issues.map((i) => i.kind)).toEqual([c.kind, d.kind]);
    expect(groups[0]!.critical).toBe(1);
  });

  it("marks issues stale after seven days without an observation", () => {
    const now = new Date("2026-09-10T00:00:00Z");
    expect(isStale(new Date("2026-09-04T00:00:00Z"), now)).toBe(false);
    expect(isStale(new Date("2026-09-02T23:00:00Z"), now)).toBe(true);
  });
});

describe("fix plans", () => {
  it("never drafts without an active bundle and never drafts twice", () => {
    expect(fixPlanFor({ kind: "unplanned_event:foo", evidence: null, fixDraftId: null }, ctx({ bundle: null }))).toEqual({ code: null, reason: "no_bundle", params: {} });
    expect(fixPlanFor({ kind: "unplanned_event:foo", evidence: null, fixDraftId: "d1" }, ctx()).reason).toBe("already_drafted");
  });

  it("adds unplanned custom events to the plan, but only valid names that are not there yet", () => {
    expect(fixPlanFor({ kind: "unplanned_event:newsletter_signup", evidence: null, fixDraftId: null }, ctx())).toEqual({ code: "add_event", reason: null, params: { event: "newsletter_signup" } });
    expect(fixPlanFor({ kind: "unplanned_event:fb_pixel", evidence: null, fixDraftId: null }, ctx()).reason).toBe("not_applicable");
    expect(fixPlanFor({ kind: "unplanned_event:page_view", evidence: null, fixDraftId: null }, ctx()).reason).toBe("not_applicable");
    const next = applyFixPlan(bundleWith(), { code: "add_event", reason: null, params: { event: "newsletter_signup" } });
    expect(next.events.find((e) => e.name === "newsletter_signup")).toMatchObject({ enabled: true, critical: false, trigger: { type: "api" }, authoritative_source: "none" });
    expect(applyFixPlan(next, { code: "add_event", reason: null, params: { event: "newsletter_signup" } }).events).toHaveLength(next.events.length);
  });

  it("makes a connected shop the authoritative purchase source for missing fields and duplicates", () => {
    const missing = { kind: "missing_required_field:purchase:currency", evidence: null, fixDraftId: null };
    expect(fixPlanFor(missing, ctx())).toEqual({ code: null, reason: "connect_shop", params: { event: "purchase", field: "currency" } });
    expect(fixPlanFor(missing, ctx({ shopPlatform: "shopify" }))).toEqual({ code: "authoritative_shop", reason: null, params: { platform: "shopify" } });
    const already = bundleWith((b) => b.events.push({ name: "purchase", enabled: true, critical: true, trigger: { type: "shop_integration", platform: "shopify" }, props_map: null, authoritative_source: "shop_integration" }));
    expect(fixPlanFor(missing, ctx({ shopPlatform: "shopify", bundle: already })).reason).toBe("site_change");
    expect(fixPlanFor({ kind: "duplicate_conversion:purchase", evidence: null, fixDraftId: null }, ctx({ shopPlatform: "woocommerce" })).code).toBe("authoritative_shop");
    const next = applyFixPlan(bundleWith(), { code: "authoritative_shop", reason: null, params: { platform: "shopify" } });
    expect(next.events.find((e) => e.name === "purchase")).toMatchObject({ enabled: true, critical: true, authoritative_source: "shop_integration", trigger: { type: "shop_integration", platform: "shopify" } });
    const existing = bundleWith((b) => b.events.push({ name: "purchase", enabled: false, critical: false, trigger: { type: "api" }, props_map: null, authoritative_source: "none" }));
    expect(applyFixPlan(existing, { code: "authoritative_shop", reason: null, params: { platform: "shopware" } }).events.find((e) => e.name === "purchase")).toMatchObject({ enabled: true, critical: true, authoritative_source: "shop_integration", trigger: { type: "api" } });
  });

  it("re-enables a disabled event behind an event drop and points elsewhere otherwise", () => {
    const disabled = bundleWith((b) => b.events.push({ name: "purchase", enabled: false, critical: true, trigger: { type: "api" }, props_map: null, authoritative_source: "none" }));
    expect(fixPlanFor({ kind: "event_drop:purchase", evidence: null, fixDraftId: null }, ctx({ bundle: disabled }))).toEqual({ code: "enable_event", reason: null, params: { event: "purchase" } });
    expect(applyFixPlan(disabled, { code: "enable_event", reason: null, params: { event: "purchase" } }).events.find((e) => e.name === "purchase")?.enabled).toBe(true);
    expect(fixPlanFor({ kind: "event_drop:purchase", evidence: null, fixDraftId: null }, ctx()).reason).toBe("destination_health");
    expect(fixPlanFor({ kind: "ingest_drop:consent_missing", evidence: null, fixDraftId: null }, ctx()).reason).toBe("consent");
    expect(fixPlanFor({ kind: "ingest_drop:pii_blocked", evidence: null, fixDraftId: null }, ctx()).reason).toBe("site_change");
    expect(fixPlanFor({ kind: "conversion_spike:purchase", evidence: null, fixDraftId: null }, ctx()).reason).toBe("not_applicable");
    expect(fixPlanFor({ kind: "usage_limit_90", evidence: null, fixDraftId: null }, ctx({ bundle: null })).reason).toBe("billing");
  });

  it("switches a browser-only destination to hybrid for a revenue leak, else names the real cause", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const withDest = (mode: "browser" | "server", mapped: boolean) =>
      bundleWith((b) => b.destinations.push({ id, type: "meta", name: "Meta Pixel", enabled: true, purpose: "marketing", mode, browser: null, test_mode: false, mappings: mapped ? [{ event: "purchase", vendor_event: "Purchase", enabled: true, field_map: null }] : [] }));
    const leak = (facts: Record<string, number>) => ({ kind: `revenue_leak:${id}:purchase`, evidence: evidence({ facts }), fixDraftId: null });
    expect(fixPlanFor(leak({ no_consent: 0, delivery_failed: 0, not_captured: 3 }), ctx({ bundle: withDest("browser", true), destinationNames: { [id]: "Meta Pixel" } }))).toEqual({ code: "destination_hybrid", reason: null, params: { destination: "Meta Pixel", event: "purchase" } });
    expect(fixPlanFor(leak({ no_consent: 0, delivery_failed: 0, not_captured: 3 }), ctx({ bundle: withDest("browser", false) })).reason).toBe("needs_mapping");
    expect(fixPlanFor(leak({ no_consent: 5, delivery_failed: 1, not_captured: 0 }), ctx({ bundle: withDest("server", true) })).reason).toBe("consent");
    expect(fixPlanFor(leak({ no_consent: 0, delivery_failed: 4, not_captured: 1 }), ctx({ bundle: withDest("server", true) })).reason).toBe("destination_health");
    expect(fixPlanFor(leak({ no_consent: 0, delivery_failed: 1, not_captured: 4 }), ctx({ bundle: withDest("server", true) })).reason).toBe("connect_shop");
    expect(fixPlanFor(leak({ no_consent: 0, delivery_failed: 1, not_captured: 4 }), ctx({ bundle: withDest("server", true), shopPlatform: "shopware" })).code).toBe("authoritative_shop");
    const next = applyFixPlan(withDest("browser", true), { code: "destination_hybrid", reason: null, params: { destination: "Meta Pixel", event: "purchase" } });
    expect(next.destinations[0]!.mode).toBe("hybrid");
  });
});
