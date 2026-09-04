import { describe, expect, it, vi } from "vitest";

// the loaders' runtime dependencies are server-only; the rules under test are pure
vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ db: vi.fn(), logger: { warn: vi.fn() } }));
vi.mock("./session", () => ({ withOrg: vi.fn() }));
vi.mock("./entitlements", () => ({ planLimits: vi.fn() }));

import { defaultBundle, diffBundles, lintBundle, type ConfigBundle } from "@track-site/config";
import {
  buildImpactPreview,
  bundleFacts,
  criticalSignals,
  destinationNames,
  evaluateFourEyes,
  isCriticalChange,
  parseScheduleInput,
  readableChanges,
  selectEnvironment,
  type ApprovalView,
  type ImpactInput,
} from "./releases";

const NOW = new Date("2026-09-04T12:00:00.000Z");
const META_ID = "11111111-1111-4111-8111-111111111111";
const GA4_ID = "22222222-2222-4222-8222-222222222222";

/** page_view (from the default bundle), a critical purchase with a shop source, a plain add_to_cart; Meta (marketing) and GA4 (analytics). */
function base(): ConfigBundle {
  const b = defaultBundle("A7K2Q9", "production", "shop.example");
  b.events.push({ name: "purchase", enabled: true, critical: true, trigger: { type: "api" }, props_map: null, authoritative_source: "shop_integration" });
  b.events.push({ name: "add_to_cart", enabled: true, critical: false, trigger: { type: "data_layer", key: "add_to_cart" }, props_map: null, authoritative_source: "none" });
  b.destinations.push({ id: META_ID, type: "meta", name: "Meta Ads", enabled: true, purpose: "marketing", mode: "hybrid", browser: { pixel_id: "123" }, test_mode: false, mappings: [{ event: "purchase", vendor_event: "Purchase", enabled: true, field_map: null }] });
  b.destinations.push({ id: GA4_ID, type: "ga4", name: "GA4", enabled: true, purpose: "analytics", mode: "browser", browser: { measurement_id: "G-1" }, test_mode: false, mappings: [{ event: "page_view", vendor_event: "page_view", enabled: true, field_map: null }] });
  return b;
}

const clone = (b: ConfigBundle): ConfigBundle => structuredClone(b);
const ev = (b: ConfigBundle, name: string) => b.events.find((e) => e.name === name)!;
const dest = (b: ConfigBundle, id: string) => b.destinations.find((d) => d.id === id)!;

const approval = (over: Partial<ApprovalView>): ApprovalView => ({
  id: "a1",
  kind: "publish",
  decision: "approved",
  critical: true,
  criticalReasons: ["critical_event"],
  requestedBy: "u1",
  requestedByName: "Devin",
  requestNote: null,
  approverId: "u2",
  approverName: "Olivia",
  reason: null,
  current: true,
  summary: { baseVersion: 1, nextVersion: 2, changes: [] },
  createdAt: NOW.toISOString(),
  decidedAt: NOW.toISOString(),
  ...over,
});

describe("readable changes", () => {
  it("parses area, key and field out of diff paths", () => {
    const before = base();
    const after = clone(before);
    ev(after, "add_to_cart").enabled = false;
    dest(after, META_ID).purpose = "analytics";
    dest(after, META_ID).mappings[0]!.enabled = false;
    after.consent.default_region_mode = "opt_out";
    after.settings.allowed_hosts = ["shop.example"];
    const changes = readableChanges(diffBundles(before, after));
    expect(changes.find((c) => c.path === "events[add_to_cart].enabled")).toMatchObject({ area: "events", key: "add_to_cart", field: "enabled", op: "change", before: true, after: false });
    expect(changes.find((c) => c.path === `destinations[${META_ID}].purpose`)).toMatchObject({ area: "destinations", key: META_ID, field: "purpose" });
    expect(changes.find((c) => c.path === `destinations[${META_ID}].mappings[purchase].enabled`)).toMatchObject({ area: "destinations", key: META_ID, field: "mappings[purchase].enabled" });
    expect(changes.find((c) => c.path === "consent.default_region_mode")).toMatchObject({ area: "consent", key: null, field: "default_region_mode" });
    expect(changes.find((c) => c.path === "settings.allowed_hosts")).toMatchObject({ area: "settings", key: null, field: "allowed_hosts" });
  });
  it("labels destinations from both bundles", () => {
    const before = base();
    const after = clone(before);
    after.destinations = after.destinations.filter((d) => d.id !== GA4_ID);
    expect(destinationNames(before, after)).toEqual({ [META_ID]: "Meta Ads", [GA4_ID]: "GA4" });
    expect(destinationNames(null, after)).toEqual({ [META_ID]: "Meta Ads" });
  });
});

describe("critical signals", () => {
  it("is empty for an unchanged bundle and for harmless edits", () => {
    const before = base();
    expect(criticalSignals(before, clone(before))).toEqual([]);
    const after = clone(before);
    after.settings.batch.flush_ms = 2000;
    ev(after, "add_to_cart").enabled = false; // add_to_cart is not critical
    expect(criticalSignals(before, after)).toEqual([]);
  });
  it("flags a critical event that stops or changes its trigger", () => {
    const before = base();
    const disabled = clone(before);
    ev(disabled, "purchase").enabled = false;
    expect(criticalSignals(before, disabled)).toEqual(["critical_event"]);
    const removed = clone(before);
    removed.events = removed.events.filter((e) => e.name !== "purchase");
    expect(criticalSignals(before, removed)).toEqual(["critical_event"]);
    const retriggered = clone(before);
    ev(retriggered, "purchase").trigger = { type: "data_layer", key: "purchase" };
    expect(criticalSignals(before, retriggered)).toEqual(["critical_event"]);
  });
  it("flags weaker consent, weaker destination purpose, stopped and new advertising destinations", () => {
    const before = base();
    const weaker = clone(before);
    weaker.consent.default_region_mode = "opt_out";
    weaker.consent.respect_gpc = false;
    expect(criticalSignals(before, weaker)).toEqual(["consent_weaker"]);
    const purpose = clone(before);
    dest(purpose, META_ID).purpose = "analytics";
    expect(criticalSignals(before, purpose)).toEqual(["destination_purpose_weaker"]);
    const stopped = clone(before);
    dest(stopped, META_ID).enabled = false;
    expect(criticalSignals(before, stopped)).toEqual(["destination_stopped"]);
    const added = clone(before);
    added.destinations.push({ id: "33333333-3333-4333-8333-333333333333", type: "tiktok", name: "TikTok", enabled: true, purpose: "marketing", mode: "browser", browser: { pixel_id: "t" }, test_mode: false, mappings: [] });
    expect(criticalSignals(before, added)).toEqual(["marketing_destination_added"]);
  });
  it("flags the kill switch and removed hosts, and treats the first publish against the strict defaults", () => {
    const before = base();
    const kill = clone(before);
    kill.settings.kill_switch = true;
    kill.settings.allowed_hosts = [];
    expect(criticalSignals(before, kill)).toEqual(["kill_switch", "allowed_hosts_reduced"]);
    const first = base();
    expect(criticalSignals(null, first)).toEqual(["marketing_destination_added"]);
    first.consent.consent_mode.mode = "advanced";
    expect(criticalSignals(null, first)).toEqual(["consent_weaker", "marketing_destination_added"]);
  });
  it("applies four-eyes to production only", () => {
    expect(isCriticalChange("production", ["kill_switch"])).toBe(true);
    expect(isCriticalChange("staging", ["kill_switch"])).toBe(false);
    expect(isCriticalChange("production", [])).toBe(false);
  });
});

describe("four-eyes rule", () => {
  it("is not required for harmless changes and cannot be satisfied by a single publisher", () => {
    expect(evaluateFourEyes({ critical: false, reasons: [], publishers: 3, approvals: [] })).toMatchObject({ required: false, state: "not_required", approval: null });
    expect(evaluateFourEyes({ critical: true, reasons: ["kill_switch"], publishers: 1, approvals: [] })).toMatchObject({ required: false, state: "single_publisher" });
  });
  it("needs a current approval by a second member", () => {
    const reasons = ["critical_event"] as const;
    expect(evaluateFourEyes({ critical: true, reasons: [...reasons], publishers: 2, approvals: [] }).state).toBe("missing");
    expect(evaluateFourEyes({ critical: true, reasons: [...reasons], publishers: 2, approvals: [approval({ decision: "pending", approverId: null })] }).state).toBe("pending");
    expect(evaluateFourEyes({ critical: true, reasons: [...reasons], publishers: 2, approvals: [approval({ decision: "rejected" })] }).state).toBe("rejected");
    expect(evaluateFourEyes({ critical: true, reasons: [...reasons], publishers: 2, approvals: [approval({ current: false })] }).state).toBe("stale");
    const ok = evaluateFourEyes({ critical: true, reasons: [...reasons], publishers: 2, approvals: [approval({ current: false, id: "old" }), approval({ id: "new" })] });
    expect(ok).toMatchObject({ required: true, state: "satisfied" });
    expect(ok.approval?.id).toBe("new");
  });
  it("uses an existing current approval even when the rule is not required", () => {
    const r = evaluateFourEyes({ critical: false, reasons: [], publishers: 1, approvals: [approval({})] });
    expect(r.state).toBe("satisfied");
    expect(r.approval?.id).toBe("a1");
  });
});

describe("schedule input", () => {
  it("accepts an ISO time inside the window and refuses the rest", () => {
    expect(parseScheduleInput("2026-09-04T13:00:00.000Z", NOW)).toEqual({ at: new Date("2026-09-04T13:00:00.000Z"), error: null });
    expect(parseScheduleInput("2026-09-04T12:02:00.000Z", NOW).error).toBe("too_soon");
    expect(parseScheduleInput("2027-01-01T12:00:00.000Z", NOW).error).toBe("too_far");
    expect(parseScheduleInput("tomorrow", NOW).error).toBe("invalid");
    expect(parseScheduleInput("", NOW).error).toBe("invalid");
  });
});

describe("change impact preview", () => {
  function input(over: Partial<ImpactInput> & { after: ConfigBundle; before: ConfigBundle | null }): ImpactInput {
    return {
      lint: lintBundle(over.after),
      window: { from: new Date(NOW.getTime() - 30 * 86_400_000), to: NOW },
      volumes: [
        { name: "page_view", accepted: 10_000, delivered: 9_000, failed: 10, billable: 10_000 },
        { name: "purchase", accepted: 250, delivered: 240, failed: 2, billable: 250 },
        { name: "add_to_cart", accepted: 900, delivered: 0, failed: 0, billable: 900 },
      ],
      lastBucketAt: new Date(NOW.getTime() - 3_600_000),
      integrations: [
        { id: META_ID, name: "Meta Ads", connectorType: "meta", status: "connected" },
        { id: GA4_ID, name: "GA4", connectorType: "ga4", status: "connected" },
      ],
      health: { [META_ID]: { errorRate: 0.02, attemptsSuccess: 230, attemptsFailed: 5, lastSuccessAt: NOW.toISOString(), computedAt: NOW.toISOString(), windowMinutes: 1440, stale: false } },
      openIssues: [
        { event: "add_to_cart", severity: "warning" },
        { event: "add_to_cart", severity: "info" },
      ],
      plan: { planId: "starter", eventsPerMonth: 50_000 },
      usage: { periodKey: "2026-09", billable: 4_000 },
      now: NOW,
      ...over,
    };
  }

  it("lists affected events with measured volume, issues and destinations", () => {
    const before = base();
    const after = clone(before);
    ev(after, "add_to_cart").enabled = false;
    after.events.push({ name: "generate_lead", enabled: true, critical: false, trigger: { type: "api" }, props_map: null, authoritative_source: "none" });
    const preview = buildImpactPreview(input({ before, after }));
    expect(preview.events).toHaveLength(2);
    expect(preview.events.find((e) => e.name === "add_to_cart")).toMatchObject({ change: "disabled", accepted: 900, openIssues: 2, enabledAfter: false, destinations: [] });
    expect(preview.events.find((e) => e.name === "generate_lead")).toMatchObject({ change: "added", accepted: null, openIssues: 0 });
    expect(preview.volume).toMatchObject({ measured: true, baselineAccepted: 10_250, removedAccepted: 900, unmeasuredEvents: ["generate_lead"], stale: false });
    expect(preview.plan).toMatchObject({ planId: "starter", eventsPerMonth: 50_000, usedBillable: 4_000, usedSharePercent: 8, projectedMonthly: 10_250, projectedSharePercent: 20.5, thresholdCrossed: null });
    const codes = preview.dataQuality.map((d) => d.code);
    expect(codes).toContain("event_removed_open_issues");
    expect(codes).toContain("new_event_unmeasured");
    expect(codes).not.toContain("no_rule_fired");
  });

  it("explains a stopped destination with its health and a critical event stop with its volume", () => {
    const before = base();
    const after = clone(before);
    dest(after, META_ID).enabled = false;
    ev(after, "purchase").enabled = false;
    const preview = buildImpactPreview(input({ before, after }));
    expect(preview.destinations).toHaveLength(1);
    expect(preview.destinations[0]).toMatchObject({ id: META_ID, change: "disabled", purposeBefore: "marketing", purposeAfter: "marketing", status: "connected", enabledAfter: false });
    expect(preview.destinations[0]!.health?.attemptsSuccess).toBe(230);
    expect(preview.dataQuality).toContainEqual({ code: "destination_stopped", tone: "warn", params: { destination: "Meta Ads", delivered: 230, measured: "yes" } });
    expect(preview.dataQuality).toContainEqual({ code: "critical_event_stopped", tone: "bad", params: { event: "purchase", accepted: 250, measured: "yes" } });
  });

  it("reports consent changes as weaker and keeps unknown volume null", () => {
    const before = base();
    const after = clone(before);
    after.consent.default_region_mode = "notice_only";
    after.consent.click_ids.ttl_days = 120;
    const preview = buildImpactPreview(input({ before, after, volumes: [], lastBucketAt: null, usage: { periodKey: "2026-09", billable: null } }));
    expect(preview.consent).toMatchObject({ weaker: true, regionMode: { before: "strict_opt_in", after: "notice_only" }, clickIdTtl: { before: 90, after: 120 }, gpc: null });
    expect(preview.volume).toMatchObject({ measured: false, baselineAccepted: null, billable: null, lastBucketAt: null });
    expect(preview.plan).toMatchObject({ usedBillable: null, usedSharePercent: null, projectedMonthly: null, thresholdCrossed: null });
    expect(preview.dataQuality.map((d) => d.code)).toContain("consent_weaker");
  });

  it("crosses the catalogue threshold when the projected volume exceeds the plan", () => {
    const before = base();
    const after = clone(before);
    after.settings.debug = true;
    const preview = buildImpactPreview(input({ before, after, plan: { planId: "starter", eventsPerMonth: 12_000 } }));
    expect(preview.plan.projectedMonthly).toBe(11_150);
    expect(preview.plan.projectedSharePercent).toBeCloseTo(92.9, 1);
    expect(preview.plan.thresholdCrossed).toBe(90);
    expect(preview.dataQuality).toEqual([{ code: "no_rule_fired", tone: "ok", params: {} }]);
  });

  it("marks stale aggregates, the kill switch and removed hosts", () => {
    const before = base();
    const after = clone(before);
    after.settings.kill_switch = true;
    after.settings.allowed_hosts = ["shop.example"];
    const preview = buildImpactPreview(input({ before, after, lastBucketAt: new Date(NOW.getTime() - 3 * 86_400_000) }));
    expect(preview.volume.stale).toBe(true);
    expect(preview.dataQuality).toContainEqual({ code: "kill_switch_on", tone: "bad", params: {} });
    expect(preview.dataQuality).toContainEqual({ code: "allowed_hosts_reduced", tone: "warn", params: { hosts: "*.shop.example" } });
  });

  it("surfaces lint findings as expectations", () => {
    const before = base();
    const after = clone(before);
    ev(after, "purchase").authoritative_source = "none"; // purchase to an ad destination without a server source → lint error
    dest(after, GA4_ID).mappings = [];
    const preview = buildImpactPreview(input({ before, after }));
    expect(preview.lint.ok).toBe(false);
    expect(preview.dataQuality).toContainEqual({ code: "lint_errors", tone: "bad", params: { count: 1 } });
    expect(preview.dataQuality).toContainEqual({ code: "conversion_without_authoritative_source", tone: "bad", params: { event: "purchase" } });
    expect(preview.dataQuality).toContainEqual({ code: "destination_no_mappings", tone: "warn", params: { destination: "GA4" } });
  });
});

describe("facts and environment selection", () => {
  it("counts what a bundle switches on", () => {
    expect(bundleFacts(base())).toEqual({ eventsEnabled: 3, eventsCritical: 1, destinationsEnabled: ["Meta Ads", "GA4"], consentRegionMode: "strict_opt_in", consentMode: "basic", respectGpc: true, clickIdTtlDays: 90, allowedHosts: ["shop.example", "*.shop.example"], killSwitch: false });
  });
  it("prefers a requested environment of the site, then the workspace environment, then the default", () => {
    const prod = { id: "05e25e2c-959b-43e7-bd6b-133ac70aa069", kind: "production" as const, name: "Production", isDefault: true, testMode: false };
    const staging = { id: "b44225f4-39ea-4c4e-af19-179009c0e468", kind: "staging" as const, name: "Staging", isDefault: false, testMode: true };
    expect(selectEnvironment([prod, staging], prod, staging.id)).toBe(staging);
    expect(selectEnvironment([prod, staging], staging, "not-a-uuid")).toBe(staging);
    expect(selectEnvironment([prod, staging], staging, "99999999-9999-4999-8999-999999999999")).toBe(staging);
    expect(selectEnvironment([prod, staging], null, undefined)).toBe(prod);
    expect(selectEnvironment([], null, undefined)).toBeNull();
  });
});
