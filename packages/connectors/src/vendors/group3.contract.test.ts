import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startMockVendorServer } from "@track-site/testing";
import { AdRollConnector } from "./adroll.ts";
import { CriteoConnector } from "./criteo.ts";
import { dispatchFor, leadEvent, purchaseEvent, testContext } from "./fixtures.ts";
import { GmpConnector } from "./gmp.ts";
import { SpotifyConnector } from "./spotify.ts";
import { YahooConnector } from "./yahoo.ts";

let mock: Awaited<ReturnType<typeof startMockVendorServer>>;
const TOKENS = { yahooSecret: "yahoo-client-secret-000000", cm360: "ya29.cm360-token-000000", adroll: "sat-adroll-token-000000" };

beforeAll(async () => {
  mock = await startMockVendorServer({ yahooClientSecret: TOKENS.yahooSecret, cm360Token: TOKENS.cm360, adrollToken: TOKENS.adroll });
});
afterAll(async () => {
  await mock.close();
});
beforeEach(() => {
  mock.records.length = 0;
  mock.state.failNext = null;
});

const mapping = (event: string, vendorEvent = "") => ({ event, vendorEvent, enabled: true, fieldMap: null });

describe("Yahoo Conversions API connector", () => {
  const connector = new YahooConnector();
  const ctx = (over: Parameters<typeof testContext>[0] = {}) => testContext({ integrationId: `yahoo-${Math.random()}`, publicConfig: { pixel_id: "10012345", project_id: "10000" }, baseUrlOverride: mock.url, credentials: { client_id: "yahoo-client-id", client_secret: TOKENS.yahooSecret }, ...over });

  it("maps events to the DataX schema and mints a JWT-asserted token", async () => {
    const p = connector.mapEvent(dispatchFor(purchaseEvent(), { vmcid: "vmcid123456" }), mapping("purchase", "Purchase"), ctx())!;
    const ev = (p.body as Array<Record<string, unknown>>)[0]!;
    expect(ev).toMatchObject({ eventName: "Purchase", eventId: "01J9EXAMPLESOURCEEVENTID00", actionSource: "web", country: "DE", clickData: { vmcid: "vmcid123456" } });
    expect((ev.userData as { email: string[] }).email[0]).toMatch(/^b4c9a289/);
    expect((ev.eventData as { price: number; customKeyValues: { currency: string } }).price).toBe(129.9);
    expect(JSON.stringify(p.preview)).not.toContain("b4c9a289");
    expect(connector.validatePayload(p).ok).toBe(true);
    const c = ctx();
    const [ok] = await connector.dispatchBatch(c, [p]);
    expect(ok?.ok, JSON.stringify(ok)).toBe(true);
    expect(mock.records.map((r) => r.path)).toEqual(["/yahoo/zts/v1/oauth2/token", "/yahoo/v1/events/10012345"]);
    await connector.dispatchBatch(c, [p]);
    expect(mock.records.filter((r) => r.path.endsWith("/token"))).toHaveLength(1); // cached token reused
    const [bad] = await connector.dispatchBatch(ctx({ credentials: { client_id: "yahoo-client-id", client_secret: "wrong" } }), [p]);
    expect(bad).toMatchObject({ ok: false, errorClass: "credential_expired" });
    const [missing] = await connector.dispatchBatch(ctx({ credentials: {} }), [p]);
    expect(missing?.errorClass).toBe("credential_expired");
    const partial = connector.mapEvent(dispatchFor(leadEvent({ user_data: null })), mapping("generate_lead", "Lead"), ctx())!;
    expect(connector.validatePayload(partial).ok).toBe(false);
    expect((await connector.dispatchBatch(c, [partial]))[0]).toMatchObject({ ok: false, errorClass: "invalid_payload" });
    expect(await connector.validateCredentials(ctx())).toMatchObject({ ok: true });
    expect(await connector.validateCredentials(ctx({ credentials: {} }))).toMatchObject({ status: "not_connected" });
  });
});

describe("Google Marketing Platform (CM360) connector", () => {
  const connector = new GmpConnector();
  const ctx = (over: Parameters<typeof testContext>[0] = {}) => testContext({ publicConfig: { floodlight_configuration_id: "1234567", profile_id: "7654321" }, settings: { floodlight_activities: { purchase: "111111", generate_lead: "222222" } }, baseUrlOverride: mock.url, credentials: { oauth_access_token: TOKENS.cm360 }, ...over });

  it("uploads Floodlight conversions with gclid/dclid or hashed identifiers", async () => {
    const p = connector.mapEvent(dispatchFor(purchaseEvent(), { gclid: "Cj0gclid" }), mapping("purchase"), ctx())!;
    const conv = (p.body as { conversions: Array<Record<string, unknown>> }).conversions[0]!;
    expect(conv).toMatchObject({ floodlightActivityId: "111111", floodlightConfigurationId: "1234567", ordinal: "ORD-10021", gclid: "Cj0gclid", quantity: 3, value: 129.9, adUserDataConsent: "GRANTED" });
    expect(String(conv.timestampMicros)).toMatch(/^\d{16}$/);
    expect(connector.validatePayload(p).ok).toBe(true);
    const [ok] = await connector.dispatchBatch(ctx(), [p]);
    expect(ok?.ok, JSON.stringify(ok)).toBe(true);
    expect(mock.records[0]?.path).toBe("/cm360/dfareporting/v5/userprofiles/7654321/conversions/batchinsert");
    const noId = connector.mapEvent(dispatchFor(leadEvent({ user_data: null, user_id: null })), mapping("generate_lead"), ctx())!;
    expect(connector.validatePayload(noId).ok).toBe(false);
    const results = await connector.dispatchBatch(ctx(), [p, noId]);
    expect(results[0]?.ok).toBe(true);
    expect(results[1]).toMatchObject({ ok: false, errorClass: "invalid_payload", errorCode: "INVALID_ARGUMENT" });
    expect((await connector.dispatchBatch(ctx({ credentials: { oauth_access_token: "wrong" } }), [p]))[0]?.errorClass).toBe("credential_expired");
    expect(await connector.validateCredentials(ctx())).toMatchObject({ ok: true });
    expect(await connector.validateCredentials(ctx({ credentials: {} }))).toMatchObject({ status: "not_connected" });
    expect(connector.mapEvent(dispatchFor(purchaseEvent({ name: "add_to_cart" })), mapping("add_to_cart"), ctx())).toBeNull();
  });
});

describe("AdRoll S2S connector", () => {
  const connector = new AdRollConnector();
  const ctx = (over: Parameters<typeof testContext>[0] = {}) => testContext({ publicConfig: { advertiser_id: "ABCDEFGHIJKLMNOPQRSTUVWX", pixel_id: "ZYXWVUTSRQPONMLKJIHGFEDC" }, baseUrlOverride: mock.url, credentials: { access_token: TOKENS.adroll }, ...over });

  it("requires the first-party cookie or adct and posts with Token auth", async () => {
    expect(connector.meta.accessNote).toMatch(/beta/i);
    const p = connector.mapEvent(dispatchFor(purchaseEvent({ vendor_ids: { adroll_fpc: "1.2.3.fpc" } })), mapping("purchase"), ctx())!;
    const ev = (p.body as Array<Record<string, unknown>>)[0]!;
    expect(ev).toMatchObject({ advertisable_eid: "ABCDEFGHIJKLMNOPQRSTUVWX", event_name: "purchase", conversion_value: 129.9, currency: "EUR", identifiers: { first_party_cookie: "1.2.3.fpc" } });
    expect(connector.validatePayload(p).ok).toBe(true);
    const [ok] = await connector.dispatchBatch(ctx(), [p]);
    expect(ok?.ok).toBe(true);
    expect(mock.records[0]?.path).toBe("/adroll/api?advertisable=ABCDEFGHIJKLMNOPQRSTUVWX");
    expect(mock.records[0]?.headers.authorization).toBe(`Token ${TOKENS.adroll}`);
    const test = await connector.sendTest(ctx(), p);
    expect(test.ok).toBe(true);
    expect(mock.records[1]?.path).toContain("dry_run=true");
    const noId = connector.mapEvent(dispatchFor(purchaseEvent()), mapping("purchase"), ctx())!;
    expect(connector.validatePayload(noId).ok).toBe(false);
    expect((await connector.dispatchBatch(ctx({ credentials: { access_token: "wrong" } }), [p]))[0]?.errorClass).toBe("credential_expired");
    expect(await connector.validateCredentials(ctx({ credentials: {} }))).toMatchObject({ status: "not_connected" });
    expect(await connector.validateCredentials(ctx())).toMatchObject({ ok: true });
  });
});

describe("Spotify Ad Analytics connector", () => {
  const connector = new SpotifyConnector();
  const ctx = (over: Parameters<typeof testContext>[0] = {}) => testContext({ publicConfig: { pixel_id: "123" }, baseUrlOverride: mock.url, ...over });

  it("sends init/lead/purchase pixel requests with a hashed session id", async () => {
    const p = connector.mapEvent(dispatchFor(purchaseEvent()), mapping("purchase"), ctx())!;
    expect(p.body).toMatchObject({ key: "123", a: "purchase", value: "129.9", currency: "EUR", order_id: "ORD-10021" });
    expect((p.body as { uid: string }).uid).toMatch(/^[0-9a-f]{40}$/);
    expect(connector.validatePayload(p).ok).toBe(true);
    const [ok] = await connector.dispatchBatch(ctx(), [p]);
    expect(ok?.ok).toBe(true);
    expect((mock.records[0]?.body as { query: Record<string, string> }).query.a).toBe("purchase");
    expect(mock.records[0]?.headers["x-forwarded-for"]).toBe("203.0.113.0");
    const lead = connector.mapEvent(dispatchFor(leadEvent()), mapping("generate_lead"), ctx())!;
    expect(lead.body).toMatchObject({ a: "lead", type: "quote" });
    expect(connector.mapEvent(dispatchFor(purchaseEvent({ name: "add_to_cart" })), mapping("add_to_cart"), ctx())).toBeNull();
    expect(await connector.validateCredentials(ctx())).toMatchObject({ ok: true });
  });
});

describe("Criteo S2S connector", () => {
  const connector = new CriteoConnector();
  const ctx = (over: Parameters<typeof testContext>[0] = {}) => testContext({ publicConfig: { account_id: "12345" }, baseUrlOverride: mock.url, ...over });

  it("maps OneTag events with hashed email or GUM id and reads the errors array", async () => {
    const p = connector.mapEvent(dispatchFor(purchaseEvent()), mapping("purchase"), ctx())!;
    const body = p.body as { account: string; id: Record<string, unknown>; events: Array<Record<string, unknown>> };
    expect(body.account).toBe("12345");
    expect(body.id).toEqual({ email: { sha256: expect.stringMatching(/^b4c9a289/) } });
    expect(body.events[0]).toMatchObject({ event: "trackTransaction", id: "ORD-10021", currency: "EUR", dd: "true" });
    expect((body.events[0]!.item as unknown[]).length).toBe(2);
    expect(JSON.stringify(p.preview)).not.toContain("b4c9a289");
    expect(connector.validatePayload(p).ok).toBe(true);
    const [ok] = await connector.dispatchBatch(ctx(), [p]);
    expect(ok?.ok, JSON.stringify(ok)).toBe(true);
    expect(mock.records[0]?.path).toBe("/criteo/m/event?version=s2s_v0");
    const gum = connector.mapEvent(dispatchFor(purchaseEvent({ user_data: null, vendor_ids: { crto_mapped_user_id: "crit_abc" } })), mapping("purchase"), ctx())!;
    expect((gum.body as { id: Record<string, unknown> }).id).toEqual({ mapping_key: "12345", mapped_user_id: "crit_abc" });
    const noId = connector.mapEvent(dispatchFor(leadEvent({ user_data: null, name: "page_view" })), mapping("page_view"), ctx())!;
    expect(connector.validatePayload(noId).ok).toBe(false);
    expect((await connector.dispatchBatch(ctx(), [noId]))[0]).toMatchObject({ ok: false, errorClass: "invalid_payload", errorCode: "UserIdentifierMissing" });
    expect(connector.mapEvent(dispatchFor(purchaseEvent({ name: "sign_up" })), mapping("sign_up"), ctx())).toBeNull();
    expect(await connector.validateCredentials(ctx())).toMatchObject({ ok: true });
  });
});
