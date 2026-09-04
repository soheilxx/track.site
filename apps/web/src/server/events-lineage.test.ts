import { describe, expect, it } from "vitest";
import { buildJourneyEvents, buildTimeline, checkRequiredParams, consentStatus, freshnessStatus, maskClickId, maskId, presentUserDataFields, redactForDisplay, requiredParamsStatus, timelineSummary, toneForOutcome, type LineageRowLike } from "./events-lineage";

const NOW = new Date("2026-09-04T10:00:00.000Z");

describe("buildTimeline", () => {
  it("derives every stage from a stored event when no lineage was recorded (timestamps stay null)", () => {
    const steps = buildTimeline({ event_id: "E1", server_ts: "2026-09-04T09:00:00.000Z", processing_state: "routed", drop_reason: null, deliveries: { "int-1": { status: "delivered", at: "2026-09-04T09:00:02.000Z", attempts: 1 } } }, [], []);
    expect(steps.map((s) => `${s.stage}:${s.outcome}`)).toEqual(["captured:ok", "accepted:ok", "normalized:ok", "policy:ok", "deduplicated:unique", "routed:ok", "delivered:delivered"]);
    expect(steps[0]!.at).toBe("2026-09-04T09:00:00.000Z");
    expect(steps[1]!.at).toBeNull();
    expect(steps.every((s) => s.derived)).toBe(true);
    expect(steps[6]!.integrationId).toBe("int-1");
  });

  it("ends the flow with a rejected marker after a blocking policy stage", () => {
    const lineage: LineageRowLike[] = [
      { stage: "captured", outcome: "ok", reason: null, integrationId: null, detail: {}, occurredAt: "2026-09-04T09:00:00.000Z" },
      { stage: "accepted", outcome: "ok", reason: null, integrationId: null, detail: {}, occurredAt: "2026-09-04T09:00:00.100Z" },
      { stage: "normalized", outcome: "ok", reason: null, integrationId: null, detail: {}, occurredAt: "2026-09-04T09:00:00.100Z" },
      { stage: "policy", outcome: "blocked", reason: "consent_missing", integrationId: null, detail: { purpose_required: "analytics" }, occurredAt: "2026-09-04T09:00:00.200Z" },
    ];
    const steps = buildTimeline(null, lineage, []);
    expect(steps.map((s) => s.stage)).toEqual(["captured", "accepted", "normalized", "policy", "rejected"]);
    const last = steps[steps.length - 1]!;
    expect(last.reason).toBe("consent_missing");
    expect(last.tone).toBe("bad");
    expect(timelineSummary(steps)).toMatchObject({ stage: "rejected", outcome: "blocked", reason: "consent_missing" });
  });

  it("prefers recorded rows, orders stages by pipeline order and adds delivery attempts as delivered steps", () => {
    const lineage: LineageRowLike[] = [
      { stage: "routed", outcome: "ok", reason: null, integrationId: "int-1", detail: { connector_type: "webhook" }, occurredAt: "2026-09-04T09:00:00.300Z" },
      { stage: "captured", outcome: "ok", reason: null, integrationId: null, detail: {}, occurredAt: "2026-09-04T09:00:00.000Z" },
      { stage: "policy", outcome: "ok", reason: null, integrationId: null, detail: { stripped_fields: ["click_ids"] }, occurredAt: "2026-09-04T09:00:00.200Z" },
      { stage: "deduplicated", outcome: "unique", reason: null, integrationId: null, detail: {}, occurredAt: "2026-09-04T09:00:00.250Z" },
    ];
    const event = { event_id: "E1", server_ts: "2026-09-04T09:00:00.000Z", processing_state: "routed", drop_reason: null, deliveries: null };
    const attempts = [
      { integrationId: "int-1", attempt: 0, status: "retry", errorClass: "temporary", errorCode: "503", httpStatus: 503, at: "2026-09-04T09:00:01.000Z" },
      { integrationId: "int-1", attempt: 1, status: "success", errorClass: "none", errorCode: null, httpStatus: 200, at: "2026-09-04T09:00:05.000Z" },
    ];
    const steps = buildTimeline(event, lineage, attempts);
    expect(steps.map((s) => s.stage)).toEqual(["captured", "accepted", "normalized", "policy", "deduplicated", "routed", "delivered", "delivered"]);
    expect(steps.find((s) => s.stage === "policy")!.derived).toBe(false);
    expect(steps.find((s) => s.stage === "accepted")!.derived).toBe(true);
    const delivered = steps.filter((s) => s.stage === "delivered");
    expect(delivered.map((s) => s.outcome)).toEqual(["retry", "delivered"]);
    expect(delivered[0]!.reason).toBe("503");
    expect(timelineSummary(steps).outcome).toBe("retry");
  });

  it("marks a duplicate conversion as terminal", () => {
    const event = { event_id: "E2", server_ts: "2026-09-04T09:00:00.000Z", processing_state: "deduplicated", drop_reason: "duplicate_conversion", deliveries: null };
    const steps = buildTimeline(event, [], []);
    expect(steps.map((s) => `${s.stage}:${s.outcome}`)).toEqual(["captured:ok", "accepted:ok", "normalized:ok", "policy:ok", "deduplicated:duplicate", "rejected:duplicate"]);
    expect(steps[4]!.reason).toBe("duplicate_conversion");
  });

  it("maps outcomes to semantic tones", () => {
    expect(toneForOutcome("delivered")).toBe("ok");
    expect(toneForOutcome("dead")).toBe("bad");
    expect(toneForOutcome("retry")).toBe("warn");
    expect(toneForOutcome("none")).toBe("info");
    expect(toneForOutcome("pending")).toBe("neutral");
  });
});

describe("display redaction", () => {
  it("masks identifiers and click ids", () => {
    expect(maskId("01J8ZC5X2R7Q4M9N3P6T8V0W1Y")).toBe("…0W1Y");
    expect(maskId("ab")).toBe("…");
    expect(maskId(null)).toBeNull();
    expect(maskClickId("Cj0KCQjw-abcdef")).toBe("Cj0KCQ…");
  });

  it("redacts PII inside payload previews and lists hashed user-data fields without values", () => {
    const out = redactForDisplay({ email: "customer@example.com", nested: { note: "call +49 170 1234567" }, keep: 42 }) as { email: string; nested: { note: string }; keep: number };
    expect(out.email).toBe("[redacted:email]");
    expect(out.nested.note).toContain("[redacted:phone]");
    expect(out.keep).toBe(42);
    expect(presentUserDataFields({ em: "a".repeat(64), ph: null, fn: "" })).toEqual(["em"]);
  });
});

describe("coverage helpers", () => {
  it("rates freshness against the window and expectation", () => {
    expect(freshnessStatus("2026-09-04T08:00:00.000Z", NOW, true)).toEqual({ status: "ok", message: "fresh" });
    expect(freshnessStatus("2026-09-01T08:00:00.000Z", NOW, true)).toEqual({ status: "warn", message: "stale" });
    expect(freshnessStatus(null, NOW, true)).toEqual({ status: "bad", message: "missing" });
    expect(freshnessStatus(null, NOW, false)).toEqual({ status: "none", message: "notExpected" });
  });

  it("checks required parameters in props or the commerce block", () => {
    const check = checkRequiredParams("purchase", [
      { props: null, commerce: { order_id: "A1", currency: "EUR", value: 10 } },
      { props: { value: 5 }, commerce: { order_id: "A2", currency: "" } },
      { props: null, commerce: { order_id: "A3" } },
    ]);
    expect(check.required).toEqual(["order_id", "currency", "value"]);
    expect(check.sampled).toBe(3);
    expect(check.missing).toEqual({ currency: 2, value: 1 });
    expect(requiredParamsStatus(check)).toBe("warn");
    expect(requiredParamsStatus({ required: ["items"], sampled: 2, missing: { items: 2 } })).toBe("bad");
    expect(requiredParamsStatus({ required: ["items"], sampled: 0, missing: {} })).toBe("unknown");
    expect(requiredParamsStatus({ required: [], sampled: 0, missing: {} })).toBe("none");
    expect(requiredParamsStatus(checkRequiredParams("page_view", []))).toBe("none");
  });

  it("never reports consent as healthy without a measurement", () => {
    expect(consentStatus(0, 0)).toBe("unknown");
    expect(consentStatus(100, 0)).toBe("ok");
    expect(consentStatus(100, 10)).toBe("info");
    expect(consentStatus(100, 80)).toBe("warn");
  });
});

describe("test lab journeys", () => {
  const ids = (() => {
    let n = 0;
    return () => `01J8ZC5X2R7Q4M9N3P6T8V0W${String(n++).padStart(2, "0")}`;
  })();

  it("builds a purchase journey with a duplicate order and no user data", () => {
    const { steps, events } = buildJourneyEvents("purchase", "all", { runId: "01J8ZC5X2R7Q4M9N3P6T8V0WXY", host: "shop.example", currency: "EUR", now: NOW, ids });
    expect(steps.map((s) => s.kind)).toEqual(["page_view", "begin_checkout", "purchase", "duplicate_purchase"]);
    expect(events.map((e) => e.name)).toEqual(["page_view", "begin_checkout", "purchase", "purchase"]);
    const [, , p1, p2] = events;
    expect(p1!.id).not.toBe(p2!.id);
    expect(p1!.commerce?.order_id).toBe(p2!.commerce?.order_id);
    expect(p1!.commerce?.order_id).toMatch(/^TESTLAB-/);
    expect(events.every((e) => e.user_data === undefined)).toBe(true);
    expect(events.every((e) => e.props?.test === true && e.props?.test_lab_run === "01J8ZC5X2R7Q4M9N3P6T8V0WXY")).toBe(true);
    expect(events[0]!.consent?.granted).toEqual(["necessary", "analytics", "marketing"]);
    expect(events[0]!.page?.url).toBe("https://shop.example/track-test-lab/page_view");
  });

  it("sends no consent signal for the 'none' choice so the policy decision is visible", () => {
    const { events } = buildJourneyEvents("lead", "none", { runId: "01J8ZC5X2R7Q4M9N3P6T8V0WXY", host: "shop.example", currency: "EUR", now: NOW, ids });
    expect(events.map((e) => e.name)).toEqual(["page_view", "generate_lead"]);
    expect(events[0]!.consent).toMatchObject({ granted: ["necessary"], source: "default" });
    expect(events[1]!.props?.lead_type).toBe("test");
  });
});
