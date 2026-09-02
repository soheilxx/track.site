import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startMockVendorServer } from "@track-site/testing";
import { dispatchFor, leadEvent, purchaseEvent, testContext } from "./fixtures.ts";
import { MetaConnector } from "./meta.ts";

let mock: Awaited<ReturnType<typeof startMockVendorServer>>;
const connector = new MetaConnector();
const TOKEN = "EAABmockSystemUserToken1234567890abcdefghijklmnopqrstuvwxyz";

beforeAll(async () => {
  mock = await startMockVendorServer({ metaToken: TOKEN });
});
afterAll(async () => {
  await mock.close();
});
beforeEach(() => {
  mock.records.length = 0;
  mock.state.failNext = null;
});

const ctx = (over: Parameters<typeof testContext>[0] = {}) => testContext({ publicConfig: { pixel_id: "123456789012345" }, baseUrlOverride: mock.url, credentials: { access_token: TOKEN }, ...over });

describe("Meta Conversions API connector", () => {
  it("maps a purchase with hashed matching data, click id and shared event_id", () => {
    const payload = connector.mapEvent(dispatchFor(purchaseEvent(), { fbclid: "IwAR0examplefbclid" }), { event: "purchase", vendorEvent: "", enabled: true, fieldMap: null }, ctx())!;
    const body = payload.body as { data: Array<Record<string, unknown>>; test_event_code?: string };
    const d = body.data[0]!;
    expect(d.event_name).toBe("Purchase");
    expect(d.event_id).toBe("01J9EXAMPLESOURCEEVENTID00");
    expect(d.action_source).toBe("website");
    const ud = d.user_data as Record<string, unknown>;
    expect(ud.em).toEqual(["b4c9a289323b21a01c3e940f150eb9b8c542587f1abfd8f0e1cc1ffc5e475514"]);
    expect(ud.country).toHaveLength(1);
    expect(String((ud.country as string[])[0])).toHaveLength(64);
    expect(ud.fbp).toBe("fb.1.1700000000000.1234567890");
    expect(ud.fbc).toMatch(/^fb\.1\.\d+\.IwAR0examplefbclid$/);
    expect(ud.client_ip_address).toBeUndefined();
    const cd = d.custom_data as Record<string, unknown>;
    expect(cd).toMatchObject({ value: 129.9, currency: "EUR", order_id: "ORD-10021", content_type: "product", num_items: 3 });
    expect(cd.content_ids).toEqual(["SKU-1", "SKU-2"]);
    expect(payload.preview).not.toContain("b4c9a289");
    expect(connector.validatePayload(payload).ok).toBe(true);
    expect(body.test_event_code).toBeUndefined();
  });

  it("adds test_event_code only in test mode and maps leads", () => {
    const payload = connector.mapEvent(dispatchFor(leadEvent()), { event: "generate_lead", vendorEvent: "", enabled: true, fieldMap: null }, ctx({ testMode: true, settings: { test_event_code: "TEST123" } }))!;
    const body = payload.body as { data: Array<{ event_name: string }>; test_event_code?: string };
    expect(body.data[0]!.event_name).toBe("Lead");
    expect(body.test_event_code).toBe("TEST123");
  });

  it("delivers to the (mock) Graph API with the token in the query string and classifies responses", async () => {
    const payload = connector.mapEvent(dispatchFor(purchaseEvent()), { event: "purchase", vendorEvent: "", enabled: true, fieldMap: null }, ctx())!;
    const [ok] = await connector.dispatchBatch(ctx(), [payload]);
    expect(ok).toMatchObject({ ok: true, httpStatus: 200, vendorEventId: "mock" });
    expect(mock.records[0]?.path).toBe("/meta/v25.0/123456789012345/events");
    expect(ok!.responseExcerpt).not.toContain(TOKEN);

    const [bad] = await connector.dispatchBatch(ctx({ credentials: { access_token: "EAABwrong000000000000000000000000000000000000" } }), [payload]);
    expect(bad).toMatchObject({ ok: false, errorClass: "auth", errorCode: "fb_190" });

    mock.state.failNext = { status: 500, remaining: 1 };
    const [tmp] = await connector.dispatchBatch(ctx(), [payload]);
    expect(tmp?.errorClass).toBe("temporary");

    const [missing] = await connector.dispatchBatch(ctx({ credentials: {} }), [payload]);
    expect(missing?.errorClass).toBe("credential_expired");
  });

  it("validates credentials against the dataset endpoint", async () => {
    expect(await connector.validateCredentials(ctx())).toMatchObject({ ok: true, status: "valid" });
    expect(await connector.validateCredentials(ctx({ credentials: { access_token: "EAABbad00000000000000000000000000000000000000" } }))).toMatchObject({ ok: false, status: "expired" });
    expect(await connector.validateCredentials(ctx({ credentials: {} }))).toMatchObject({ status: "not_connected" });
    expect(connector.getBrowserConfig({ pixel_id: "123456789012345" })).toMatchObject({ template: "meta_pixel", consentPurpose: "marketing" });
  });

  it("rejects payloads without matching data or stale timestamps", () => {
    const stale = purchaseEvent({ client_ts: new Date(Date.now() - 10 * 86_400_000).toISOString(), user_data: null, anonymous_id: null, vendor_ids: null });
    const payload = connector.mapEvent(dispatchFor(stale), { event: "purchase", vendorEvent: "", enabled: true, fieldMap: null }, ctx())!;
    const v = connector.validatePayload(payload);
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toMatch(/7 days/);
    expect(v.errors.join(" ")).toMatch(/user_data/);
  });
});
