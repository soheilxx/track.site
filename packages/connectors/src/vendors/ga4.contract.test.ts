import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startMockVendorServer } from "@track-site/testing";
import { dispatchFor, leadEvent, purchaseEvent, testContext } from "./fixtures.ts";
import { Ga4Connector } from "./ga4.ts";

let mock: Awaited<ReturnType<typeof startMockVendorServer>>;
const connector = new Ga4Connector();
const SECRET = "mp-secret-abcdefghijklmnop";

beforeAll(async () => {
  mock = await startMockVendorServer({ ga4Secret: SECRET });
});
afterAll(async () => {
  await mock.close();
});
beforeEach(() => {
  mock.records.length = 0;
  mock.state.failNext = null;
});

const ctx = (over: Parameters<typeof testContext>[0] = {}) => testContext({ publicConfig: { measurement_id: "G-ABC123DEF4" }, baseUrlOverride: mock.url, credentials: { api_secret: SECRET }, ...over });

describe("GA4 Measurement Protocol connector", () => {
  it("maps purchases with transaction_id, items, consent flags and the GA client id", () => {
    const payload = connector.mapEvent(dispatchFor(purchaseEvent()), { event: "purchase", vendorEvent: "", enabled: true, fieldMap: null }, ctx())!;
    const body = payload.body as { client_id: string; events: Array<{ name: string; params: Record<string, unknown> }>; consent: Record<string, string>; non_personalized_ads: boolean; user_data?: unknown };
    expect(body.client_id).toBe("1234567890.1700000000");
    expect(body.events[0]!.name).toBe("purchase");
    expect(body.events[0]!.params).toMatchObject({ transaction_id: "ORD-10021", currency: "EUR", value: 129.9 });
    expect((body.events[0]!.params.items as unknown[]).length).toBe(2);
    expect(body.consent).toEqual({ ad_user_data: "GRANTED", ad_personalization: "DENIED" });
    expect(body.non_personalized_ads).toBe(false);
    expect(body.user_data).toBeDefined();
    expect(payload.dedupKey).toBe("ORD-10021");
    expect(payload.preview).toMatchObject({ user_data: "[hashed]" });
    expect(connector.validatePayload(payload).ok).toBe(true);
  });

  it("derives a client id and non-personalized flags for analytics-only events", () => {
    const e = leadEvent({ vendor_ids: null, consent: { granted: ["necessary", "analytics"], source: "api", policy_version: "v1", ts: 1, region: "DE", gpc: false } });
    const payload = connector.mapEvent(dispatchFor(e), { event: "generate_lead", vendorEvent: "", enabled: true, fieldMap: null }, ctx())!;
    const body = payload.body as { client_id: string; non_personalized_ads: boolean; consent: Record<string, string>; events: Array<{ name: string }> };
    expect(body.client_id).toMatch(/^\d+\.\d+$/);
    expect(body.non_personalized_ads).toBe(true);
    expect(body.consent.ad_user_data).toBe("DENIED");
    expect(body.events[0]!.name).toBe("generate_lead");
  });

  it("sends to the EU endpoint, validates through the debug endpoint in test mode and reports missing secrets", async () => {
    const payload = connector.mapEvent(dispatchFor(purchaseEvent()), { event: "purchase", vendorEvent: "", enabled: true, fieldMap: null }, ctx())!;
    const [ok] = await connector.dispatchBatch(ctx(), [payload]);
    expect(ok).toMatchObject({ ok: true, httpStatus: 204 });
    expect(mock.records[0]?.path).toBe("/ga4/mp/collect");
    expect(String((mock.records[0]?.body as { query: Record<string, string> }).query.api_secret)).toBe(SECRET);

    const [tested] = await connector.dispatchBatch(ctx({ testMode: true }), [payload]);
    expect(tested?.ok).toBe(true);
    expect(mock.records.map((r) => r.path)).toContain("/ga4/debug/mp/collect");

    const [badSecret] = await connector.dispatchBatch(ctx({ testMode: true, credentials: { api_secret: "wrong-secret-000000" } }), [payload]);
    expect(badSecret).toMatchObject({ ok: false, errorClass: "invalid_payload", errorCode: "mp_validation" });

    const [missing] = await connector.dispatchBatch(ctx({ credentials: {} }), [payload]);
    expect(missing?.errorClass).toBe("credential_expired");

    mock.state.failNext = { status: 503, remaining: 1 };
    const [tmp] = await connector.dispatchBatch(ctx(), [payload]);
    expect(tmp?.errorClass).toBe("temporary");
  });

  it("validates credentials and rejects invalid payloads", async () => {
    expect(await connector.validateCredentials(ctx())).toMatchObject({ ok: true });
    expect(await connector.validateCredentials(ctx({ publicConfig: { measurement_id: "UA-1" } }))).toMatchObject({ ok: false, status: "invalid" });
    const p = connector.mapEvent(dispatchFor(purchaseEvent({ client_ts: new Date(Date.now() - 80 * 3_600_000).toISOString() })), { event: "purchase", vendorEvent: "google_bad", enabled: true, fieldMap: null }, ctx())!;
    const v = connector.validatePayload(p);
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toMatch(/reserved/);
    expect(v.errors.join(" ")).toMatch(/72 hours/);
  });
});
