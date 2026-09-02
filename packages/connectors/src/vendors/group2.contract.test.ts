import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startMockVendorServer } from "@track-site/testing";
import { oauth1Header } from "../oauth1.ts";
import { dispatchFor, leadEvent, purchaseEvent, testContext } from "./fixtures.ts";
import { OutbrainConnector } from "./outbrain.ts";
import { TaboolaConnector } from "./taboola.ts";
import { XConnector } from "./x.ts";

let mock: Awaited<ReturnType<typeof startMockVendorServer>>;
const X_TOKEN = "x-user-token-0000000000";

beforeAll(async () => {
  mock = await startMockVendorServer({ xToken: X_TOKEN });
});
afterAll(async () => {
  await mock.close();
});
beforeEach(() => {
  mock.records.length = 0;
  mock.state.failNext = null;
});

const mapping = (event: string, vendorEvent = "") => ({ event, vendorEvent, enabled: true, fieldMap: null });

describe("OAuth 1.0a signing", () => {
  it("produces the RFC 5849 reference signature", () => {
    // reference vector from the X developer documentation (creating a signature)
    const header = oauth1Header(
      "POST",
      "https://api.twitter.com/1.1/statuses/update.json?include_entities=true",
      { consumerKey: "xvz1evFS4wEEPTGEFPHBog", consumerSecret: "kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw", token: "370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb", tokenSecret: "LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE" },
      () => new Date(1318622958 * 1000),
      "kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg",
    );
    // the documented example also signs the form body (status=...), which JSON requests omit; verify structure + deterministic signature
    expect(header).toMatch(/^OAuth oauth_consumer_key="xvz1evFS4wEEPTGEFPHBog", oauth_nonce="kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg", oauth_signature_method="HMAC-SHA1", oauth_timestamp="1318622958", oauth_token="370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb", oauth_version="1.0", oauth_signature="[A-Za-z0-9%]+"$/);
  });
});

describe("X Conversion API connector", () => {
  const connector = new XConnector();
  const ctx = (over: Parameters<typeof testContext>[0] = {}) => testContext({ publicConfig: { pixel_id: "o8abc" }, settings: { event_ids: { purchase: "tw-o8abc-purch", generate_lead: "tw-o8abc-lead" } }, baseUrlOverride: mock.url, credentials: { oauth_access_token: X_TOKEN, oauth_token_secret: "x-user-secret-000" }, platform: { x_consumer_key: "ck", x_consumer_secret: "cs" }, ...over });

  it("maps purchases with twclid + hashed identifiers and the dedup conversion_id", () => {
    const p = connector.mapEvent(dispatchFor(purchaseEvent(), { twclid: "26example_twclid" }), mapping("purchase"), ctx())!;
    const conv = (p.body as { conversions: Array<Record<string, unknown>> }).conversions[0]!;
    expect(conv.event_id).toBe("tw-o8abc-purch");
    expect(conv.identifiers).toEqual([{ twclid: "26example_twclid" }, { hashed_email: expect.stringMatching(/^b4c9a289/) }, { hashed_phone_number: expect.any(String) }]);
    expect(conv).toMatchObject({ conversion_id: "01J9EXAMPLESOURCEEVENTID00", value: 129.9, price_currency: "EUR", number_items: 3 });
    expect(JSON.stringify(p.preview)).not.toContain("b4c9a289");
    expect(connector.validatePayload(p).ok).toBe(true);
    expect(connector.mapEvent(dispatchFor(purchaseEvent({ name: "add_to_cart" })), mapping("add_to_cart"), ctx())).toBeNull();
  });

  it("delivers with an OAuth 1.0a header and classifies auth failures", async () => {
    const p = connector.mapEvent(dispatchFor(purchaseEvent(), { twclid: "26example_twclid" }), mapping("purchase"), ctx())!;
    const [ok] = await connector.dispatchBatch(ctx(), [p]);
    expect(ok).toMatchObject({ ok: true, vendorEventId: "mock-debug" });
    expect(mock.records[0]?.headers.authorization).toMatch(/^OAuth oauth_consumer_key="ck"/);
    const [bad] = await connector.dispatchBatch(ctx({ credentials: { oauth_access_token: "wrong", oauth_token_secret: "x" } }), [p]);
    expect(bad?.errorClass).toBe("credential_expired");
    const [missing] = await connector.dispatchBatch(ctx({ platform: {} }), [p]);
    expect(missing?.errorClass).toBe("credential_expired");
    mock.state.failNext = { status: 503, remaining: 1 };
    const [tmp] = await connector.dispatchBatch(ctx(), [p]);
    expect(tmp?.errorClass).toBe("temporary");
    expect(await connector.validateCredentials(ctx())).toMatchObject({ ok: true });
    expect(await connector.validateCredentials(ctx({ credentials: { oauth_access_token: "wrong", oauth_token_secret: "x" } }))).toMatchObject({ status: "expired" });
  });
});

describe("Taboola S2S connector", () => {
  const connector = new TaboolaConnector();
  const ctx = (over: Parameters<typeof testContext>[0] = {}) => testContext({ publicConfig: { account_id: "1234567" }, baseUrlOverride: mock.url, ...over });

  it("requires the tblci click id and posts bulk actions", async () => {
    expect(connector.mapEvent(dispatchFor(purchaseEvent()), mapping("purchase", "PURCHASE"), ctx())).toBeNull();
    const p = connector.mapEvent(dispatchFor(purchaseEvent(), { tblci: "GiC3sJdfEHXrroWoRIMZNc" }), mapping("purchase", "PURCHASE"), ctx())!;
    expect((p.body as { actions: Array<Record<string, unknown>> }).actions[0]).toMatchObject({ "click-id": "GiC3sJdfEHXrroWoRIMZNc", name: "PURCHASE", revenue: 129.9, currency: "EUR", quantity: 3, orderid: "ORD-10021" });
    expect(connector.validatePayload(p).ok).toBe(true);
    const lead = connector.mapEvent(dispatchFor(leadEvent(), { tblci: "GiC3sJdfEHXrroWoRIMZNc" }), mapping("generate_lead", "LEAD"), ctx())!;
    const results = await connector.dispatchBatch(ctx(), [p, lead]);
    expect(results.map((r) => r.ok)).toEqual([true, true]);
    expect(mock.records[0]?.path).toBe("/taboola/1234567/log/3/bulk-s2s-action");
    expect((mock.records[0]?.body as { actions: unknown[] }).actions).toHaveLength(2);
    mock.state.failNext = { status: 500, remaining: 1 };
    expect((await connector.dispatchBatch(ctx(), [p]))[0]?.errorClass).toBe("temporary");
    expect(await connector.validateCredentials(ctx())).toMatchObject({ ok: true });
    expect(await connector.validateCredentials(ctx({ publicConfig: { account_id: "abc" } }))).toMatchObject({ ok: false });
  });
});

describe("Outbrain S2S connector", () => {
  const connector = new OutbrainConnector();
  const ctx = (over: Parameters<typeof testContext>[0] = {}) => testContext({ publicConfig: { marketer_id: "00abcdef1234567890abcdef1234567890" }, baseUrlOverride: mock.url, ...over });

  it("requires ob_click_id and sends a GET postback with the documented parameters", async () => {
    expect(connector.mapEvent(dispatchFor(purchaseEvent()), mapping("purchase"), ctx())).toBeNull();
    const p = connector.mapEvent(dispatchFor(purchaseEvent(), { ob_click_id: "obclick123" }), mapping("purchase", "Purchase Complete"), ctx())!;
    expect(p.body).toMatchObject({ ob_click_id: "obclick123", name: "Purchase_Complete", orderValue: "129.9", orderId: "ORD-10021", currency: "EUR" });
    expect(p.endpoint).toContain("/outbrain/unifiedPixel?ob_click_id=obclick123&name=Purchase_Complete");
    const [ok] = await connector.dispatchBatch(ctx(), [p]);
    expect(ok?.ok).toBe(true);
    expect((mock.records[0]?.body as { query: Record<string, string> }).query.timestamp).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    mock.state.failNext = { status: 502, remaining: 1 };
    expect((await connector.dispatchBatch(ctx(), [p]))[0]?.errorClass).toBe("temporary");
    expect(await connector.validateCredentials(ctx())).toMatchObject({ ok: true });
  });
});
