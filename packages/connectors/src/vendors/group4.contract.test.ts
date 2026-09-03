import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startMockVendorServer } from "@track-site/testing";
import { AffiliateConnector, affiliateMeta } from "./affiliate.ts";
import { AFFILIATE_PRESETS, affiliateCredentialRequirements, isSecretField } from "./affiliate-presets.ts";
import { AmazonConnector } from "./amazon.ts";
import { dispatchFor, leadEvent, purchaseEvent, testContext } from "./fixtures.ts";
import { QuoraConnector } from "./quora.ts";
import { TradeDeskConnector } from "./tradedesk.ts";

let mock: Awaited<ReturnType<typeof startMockVendorServer>>;
const TOKENS = { quora: "quora-capi-token-000000", amazon: "Atza|amazon-access-token-000000" };

beforeAll(async () => {
  mock = await startMockVendorServer({ quoraToken: TOKENS.quora, amazonToken: TOKENS.amazon });
});
afterAll(async () => {
  await mock.close();
});
beforeEach(() => {
  mock.records.length = 0;
  mock.state.failNext = null;
});

const mapping = (event: string, vendorEvent = "") => ({ event, vendorEvent, enabled: true, fieldMap: null });

describe("Quora Conversion API connector", () => {
  const connector = new QuoraConnector();
  const ctx = (over: Parameters<typeof testContext>[0] = {}) => testContext({ publicConfig: { pixel_id: "0123456789abcdef0123456789abcdef", account_id: "12345678" }, baseUrlOverride: mock.url, credentials: { access_token: TOKENS.quora }, ...over });

  it("maps events with qclid + hashed email and Bearer auth", async () => {
    const p = connector.mapEvent(dispatchFor(purchaseEvent(), { qclid: "qclid-example" }), mapping("purchase"), ctx())!;
    const b = p.body as { account_id: string; conversion: Record<string, unknown>; user: Record<string, unknown> };
    expect(b.account_id).toBe("12345678");
    expect(b.conversion).toMatchObject({ event_name: "Purchase", click_id: "qclid-example", event_id: "01J9EXAMPLESOURCEEVENTID00", value: 129.9, currency: "EUR" });
    expect(String(b.conversion.timestamp)).toMatch(/^\d{16}$/);
    expect(b.user.email).toMatch(/^b4c9a289/);
    expect(JSON.stringify(p.preview)).not.toContain("b4c9a289");
    expect(connector.validatePayload(p).ok).toBe(true);
    const [ok] = await connector.dispatchBatch(ctx(), [p]);
    expect(ok?.ok, JSON.stringify(ok)).toBe(true);
    expect(mock.records[0]?.path).toBe("/quora/_/ad/conversion");
    expect((await connector.dispatchBatch(ctx({ credentials: { access_token: "wrong" } }), [p]))[0]?.errorClass).toBe("credential_expired");
    expect((await connector.dispatchBatch(ctx({ credentials: {} }), [p]))[0]?.errorClass).toBe("credential_expired");
    const noId = connector.mapEvent(dispatchFor(leadEvent({ user_data: null })), mapping("generate_lead"), ctx())!;
    expect(connector.validatePayload(noId).ok).toBe(false);
    expect(await connector.validateCredentials(ctx())).toMatchObject({ ok: true });
    expect(await connector.validateCredentials(ctx({ credentials: { access_token: "wrong" } }))).toMatchObject({ status: "expired" });
  });
});

describe("The Trade Desk real-time conversions connector", () => {
  const connector = new TradeDeskConnector();
  const ctx = (over: Parameters<typeof testContext>[0] = {}) => testContext({ publicConfig: { advertiser_id: "abcd123", pixel_id: "0f6b8f1e-2c4d-4e7a-9b1c-3d5e7f9a1b2c", tracker_id: "" }, baseUrlOverride: mock.url, ...over });

  it("posts data[] records keyed by advertiser and pixel", async () => {
    const p = connector.mapEvent(dispatchFor(purchaseEvent({ vendor_ids: { tdid: "11111111-2222-3333-4444-555555555555" } }), { ttd_uuid: "imp-uuid" }), mapping("purchase"), ctx())!;
    const r = (p.body as { data: Array<Record<string, unknown>> }).data[0]!;
    expect(r).toMatchObject({ adv: "abcd123", upixel_id: "0f6b8f1e-2c4d-4e7a-9b1c-3d5e7f9a1b2c", event_name: "purchase", value: "129.9", currency: "EUR", order_id: "ORD-10021", tdid: "11111111-2222-3333-4444-555555555555", imp: "imp-uuid" });
    expect((r.items as unknown[]).length).toBe(2);
    expect(connector.validatePayload(p).ok).toBe(true);
    const [ok] = await connector.dispatchBatch(ctx(), [p]);
    expect(ok?.ok).toBe(true);
    const bad = connector.mapEvent(dispatchFor(purchaseEvent()), mapping("purchase"), ctx({ publicConfig: { advertiser_id: "abcd123", pixel_id: "", tracker_id: "" } }))!;
    expect(connector.validatePayload(bad).ok).toBe(false);
    expect((await connector.dispatchBatch(ctx(), [bad]))[0]).toMatchObject({ ok: false, errorClass: "invalid_payload", httpStatus: 402 });
    expect(connector.mapEvent(dispatchFor(purchaseEvent({ name: "download" })), mapping("download"), ctx())).toBeNull();
    expect(await connector.validateCredentials(ctx())).toMatchObject({ ok: true });
  });
});

describe("Amazon Ads Events API connector", () => {
  const connector = new AmazonConnector();
  const ctx = (over: Parameters<typeof testContext>[0] = {}) => testContext({ publicConfig: { tag_id: "1234567890abcdef1234567890abcdef", account_id: "amzn1.ads-account.g.abc123", region: "EU", data_set_name: "tracksite_web_events" }, baseUrlOverride: mock.url, credentials: { oauth_access_token: TOKENS.amazon }, platform: { amazon_ads_client_id: "amzn1.application-oa2-client.abc" }, ...over });

  it("sends events with match keys, consent and dataset to the regional Events API", async () => {
    const p = connector.mapEvent(dispatchFor(purchaseEvent()), mapping("purchase", "Purchase (web)"), ctx())!;
    const ev = (p.body as { events: Array<Record<string, unknown>> }).events[0]!;
    expect(ev).toMatchObject({ eventId: "01J9EXAMPLESOURCEEVENTID00", eventActionSource: "WEBSITE", countryCode: "DE", value: 129.9, currencyCode: "EUR", unitsSold: 3, eventDescription: { name: "Purchase (web)", conversionType: "OFF_AMAZON_PURCHASES", dataSetName: "tracksite_web_events", eventIngestionMethod: "SERVER_TO_SERVER" } });
    expect((ev.matchKeys as Array<{ type: string }>).map((k) => k.type)).toEqual(["EMAIL", "PHONE"]);
    expect(ev.consent).toEqual({ amazonConsent: { amznAdStorage: "GRANTED", amznUserData: "GRANTED" } });
    expect(JSON.stringify(p.preview)).not.toContain("b4c9a289");
    expect(connector.validatePayload(p).ok).toBe(true);
    const [ok] = await connector.dispatchBatch(ctx(), [p]);
    expect(ok?.ok, JSON.stringify(ok)).toBe(true);
    expect(mock.records[0]?.path).toBe("/amazon/EU/events/v1");
    expect(mock.records[0]?.headers["amazon-ads-accountid"]).toBe("amzn1.ads-account.g.abc123");
    const anon = connector.mapEvent(dispatchFor(leadEvent({ user_data: null })), mapping("generate_lead", "Lead"), ctx())!;
    expect((anon.body as { events: Array<{ matchKeys: Array<{ type: string }> }> }).events[0]!.matchKeys[0]!.type).toBe("MATCH_ID");
    expect((await connector.dispatchBatch(ctx({ credentials: { oauth_access_token: "wrong" } }), [p]))[0]?.errorClass).toBe("credential_expired");
    expect((await connector.dispatchBatch(ctx({ platform: {} }), [p]))[0]?.errorClass).toBe("auth");
    expect(await connector.validateCredentials(ctx())).toMatchObject({ ok: true });
    expect(await connector.validateCredentials(ctx({ credentials: {} }))).toMatchObject({ status: "not_connected" });
  });
});

describe("Affiliate postback connector", () => {
  const connector = new AffiliateConnector();
  const ctx = (publicConfig: Record<string, unknown>, credentials: Record<string, string> = {}, over: Parameters<typeof testContext>[0] = {}) => testContext({ publicConfig, baseUrlOverride: mock.url, credentials, ...over });

  it("ships every preset with docs, click-id parameters and a purchase mapping", () => {
    for (const preset of Object.values(AFFILIATE_PRESETS)) {
      expect(preset.docsUrl).toMatch(/^https:\/\//);
      expect(preset.clickIdParams.length).toBeGreaterThan(0);
      expect(preset.events).toContain("purchase");
    }
    expect(Object.keys(AFFILIATE_PRESETS)).toEqual(expect.arrayContaining(["awin", "cj", "impact", "tradetracker", "tradedoubler", "partnerize", "rakuten", "webgains", "digistore24", "adcell", "belboon", "tune", "everflow", "custom"]));
  });

  it("declares every preset secret as a vault credential requirement and lists the union in the connector meta", () => {
    const kinds = (list: Array<{ kind: string }>) => list.map((r) => r.kind);
    for (const preset of Object.values(AFFILIATE_PRESETS)) {
      const reqs = affiliateCredentialRequirements(preset);
      expect(new Set(kinds(reqs)).size, `${preset.id}: one vault slot per kind`).toBe(reqs.length);
      for (const field of preset.config.filter(isSecretField)) expect(reqs.find((r) => r.kind === field.credential), `${preset.id}.${field.key}`).toMatchObject({ label: `${preset.name}: ${field.label}`, optional: field.optional === true, secret: true, oauth: null });
      if (preset.auth.type === "basic") expect(reqs).toContainEqual(expect.objectContaining({ kind: preset.auth.passwordCredential, optional: false }));
      for (const r of reqs) expect(kinds(affiliateMeta.requiredCredentials), `${preset.id}.${r.kind} must be storable through the credential route`).toContain(r.kind);
    }
    expect(affiliateCredentialRequirements(AFFILIATE_PRESETS.awin!)).toEqual([expect.objectContaining({ kind: "webhook_secret", optional: true })]);
    expect(affiliateCredentialRequirements(AFFILIATE_PRESETS.cj!)).toEqual([expect.objectContaining({ kind: "access_token", optional: false, label: "CJ Affiliate: Personal access token (SIGNATURE)" }), expect.objectContaining({ kind: "webhook_secret", optional: true })]);
    expect(affiliateCredentialRequirements(AFFILIATE_PRESETS.tradedoubler!)).toEqual([expect.objectContaining({ kind: "signing_secret", optional: false, label: "Tradedoubler: Checksum secret code" }), expect.objectContaining({ kind: "webhook_secret", optional: true })]);
    expect(affiliateCredentialRequirements(AFFILIATE_PRESETS.impact!)).toEqual([expect.objectContaining({ kind: "api_secret", optional: false, label: "impact.com: AuthToken (Basic auth password)" }), expect.objectContaining({ kind: "webhook_secret", optional: true })]);
    expect(affiliateCredentialRequirements(AFFILIATE_PRESETS.tune!)).toEqual([expect.objectContaining({ kind: "api_secret", optional: true }), expect.objectContaining({ kind: "webhook_secret", optional: true })]);
    expect(affiliateCredentialRequirements(AFFILIATE_PRESETS.digistore24!)).toEqual([expect.objectContaining({ kind: "signing_secret", optional: true, label: "Digistore24: IPN passphrase (inbound postbacks)" })]);

    expect(kinds(affiliateMeta.requiredCredentials)).toEqual(["access_token", "api_secret", "signing_secret", "webhook_secret"]);
    for (const r of affiliateMeta.requiredCredentials) {
      expect(r.optional, r.kind).toBe(true);
      expect(r.oauth, r.kind).toBeNull();
      expect(r.help, r.kind).toContain("Depends on the selected network preset");
    }
    expect(affiliateMeta.requiredCredentials.find((r) => r.kind === "access_token")?.help).toContain("required by CJ Affiliate");
    expect(affiliateMeta.requiredCredentials.find((r) => r.kind === "api_secret")?.help).toMatch(/required by impact\.com; optional for TUNE \(HasOffers\), Everflow/);
    expect(affiliateMeta.requiredCredentials.find((r) => r.kind === "signing_secret")?.help).toMatch(/required by Tradedoubler; optional for Digistore24/);
    expect(affiliateMeta.requiredCredentials.find((r) => r.kind === "webhook_secret")?.help).toMatch(/optional for 13 presets incl\. Awin, CJ Affiliate, impact\.com/);
  });

  it("names the missing credential kind and label instead of a generic secret error", async () => {
    const cj = ctx({ preset: "cj", enterprise_id: "1234567", action_id: "402340" });
    expect(await connector.validateCredentials(cj)).toMatchObject({ ok: false, status: "not_connected", detail: expect.stringContaining("Missing credential: access_token (CJ Affiliate: Personal access token (SIGNATURE))") });
    expect(await connector.validateCredentials(ctx({ preset: "tradedoubler", organization_id: "12345", event_id: "23456" }))).toMatchObject({ status: "not_connected", detail: expect.stringContaining("signing_secret (Tradedoubler: Checksum secret code)") });
    expect(await connector.validateCredentials(ctx({ preset: "impact", account_sid: "IRabc123def", campaign_id: "12345", action_tracker_id: "23456" }))).toMatchObject({ status: "not_connected", detail: expect.stringContaining("api_secret (impact.com: AuthToken (Basic auth password))") });
    expect((await connector.validateCredentials(cj)).detail).not.toMatch(/webhook_secret/); // inbound-only secrets never block
    expect((await connector.validateCredentials(ctx({ preset: "tune", network_domain: "network.go2cloud.org" }))).ok).toBe(true); // optional token
    expect((await connector.validateCredentials(ctx({ preset: "digistore24" }))).ok).toBe(true);
    expect((await connector.validateCredentials(ctx({ preset: "cj", enterprise_id: "1234567", action_id: "402340" }, { access_token: "pat-0123456789" }))).ok).toBe(true);
    const p = connector.mapEvent(dispatchFor(purchaseEvent(), { cjevent: "cj-click" }), mapping("purchase"), cj)!;
    expect(JSON.stringify(p.preview)).not.toContain("pat-0123456789");
    const [r] = await connector.dispatchBatch(cj, [p]);
    expect(r).toMatchObject({ ok: false, errorClass: "credential_expired", errorCode: "missing_access_token" });
  });

  it("renders Awin GET postbacks with the awc click id and test mode", async () => {
    const c = ctx({ preset: "awin", merchant_id: "12345", commission_group: "DEFAULT" });
    expect(connector.mapEvent(dispatchFor(purchaseEvent()), mapping("purchase"), c)).toBeNull();
    const p = connector.mapEvent(dispatchFor(purchaseEvent(), { awc: "12345_1700000000_abc" }), mapping("purchase"), c)!;
    expect(p.endpoint).toContain("/affiliate/awin?tt=ss&tv=2&merchant=12345&amount=129.9&ch=aw&cr=EUR&ref=ORD-10021&parts=DEFAULT%3A129.9&cks=12345_1700000000_abc&testmode=0");
    expect(connector.validatePayload(p).ok).toBe(true);
    const [ok] = await connector.dispatchBatch(c, [p]);
    expect(ok?.ok, JSON.stringify(ok)).toBe(true);
    expect(mock.records[0]?.path).toContain("testmode=0");
    const test = await connector.sendTest(c, p);
    expect(test.ok).toBe(true);
    expect(mock.records[1]?.path).toContain("testmode=0"); // rendered at map time; test mode toggles at destination level
  });

  it("signs Tradedoubler checksums and keeps the secret out of previews", async () => {
    const c = ctx({ preset: "tradedoubler", organization_id: "12345", event_id: "23456" }, { signing_secret: "secretcode" });
    const p = connector.mapEvent(dispatchFor(purchaseEvent(), { tduid: "e0f15774d8d148963fd2df1bf9396d54" }), mapping("purchase"), c)!;
    expect(JSON.stringify(p.preview)).not.toContain("secretcode");
    const [ok] = await connector.dispatchBatch(c, [p]);
    expect(ok?.ok).toBe(true);
    const query = (mock.records[0]?.body as { query: Record<string, string> }).query;
    expect(query).toMatchObject({ organization: "12345", event: "23456", orderNumber: "ORD-10021", orderValue: "129.9", currency: "EUR", tduid: "e0f15774d8d148963fd2df1bf9396d54" });
    expect(query.checksum).toMatch(/^v04[0-9a-f]{32}$/);
    expect(query.reportInfo).toContain("f1=SKU-1");
    expect((await connector.dispatchBatch(ctx({ preset: "tradedoubler", organization_id: "12345", event_id: "23456" }), [p]))[0]?.errorClass).toBe("credential_expired");
  });

  it("posts impact.com conversions as a Basic-authenticated form and Webgains as JSON", async () => {
    const impact = ctx({ preset: "impact", account_sid: "IRabc123def", campaign_id: "12345", action_tracker_id: "23456" }, { api_secret: "auth-token-000" });
    const p = connector.mapEvent(dispatchFor(purchaseEvent(), { irclickid: "irclick-1" }), mapping("purchase"), impact)!;
    const [ok] = await connector.dispatchBatch(impact, [p]);
    expect(ok?.ok, JSON.stringify(ok)).toBe(true);
    expect(mock.records[0]?.headers.authorization).toBe(`Basic ${Buffer.from("IRabc123def:auth-token-000").toString("base64")}`);
    expect(mock.records[0]?.body).toMatchObject({ CampaignId: "12345", ActionTrackerId: "23456", OrderId: "ORD-10021", ClickId: "irclick-1", CurrencyCode: "EUR", Amount: "129.9" });
    expect(ok?.responseExcerpt).not.toContain("auth-token-000");

    const wg = ctx({ preset: "webgains", program_id: "12345" });
    const w = connector.mapEvent(dispatchFor(purchaseEvent(), { wgu: "wgu-click" }), mapping("purchase"), wg)!;
    const [wok] = await connector.dispatchBatch(wg, [w]);
    expect(wok?.ok).toBe(true);
    expect(mock.records[1]?.body).toMatchObject({ ids: [{ name: "s2s", value: "wgu-click" }], programId: "12345", value: "129.9", currency: "EUR", orderReference: "ORD-10021" });
    expect((mock.records[1]?.body as { items: unknown[] }).items).toHaveLength(2);
  });

  it("renders Partnerize path parameters and custom templates", async () => {
    const pz = ctx({ preset: "partnerize", campaign_id: "10abc1234" });
    const p = connector.mapEvent(dispatchFor(purchaseEvent(), { clickref: "click-ref-1" }), mapping("purchase"), pz)!;
    expect(p.endpoint.split("?")[0]).toContain("/affiliate/partnerize");
    const rendered = (p.body as { values: Record<string, string> }).values;
    expect(rendered.items_pz).toContain("[category:shoes/sku:SKU-1/value:99.9/quantity:1]");
    const custom = ctx({ preset: "custom", postback_url: "https://network.example/pb?cid={click_id}&amount={value}&order={order_id}&ev={event_name}" });
    const cp = connector.mapEvent(dispatchFor(leadEvent(), { aff_click_id: "abc" }), mapping("generate_lead", "lead"), custom)!;
    expect(cp.vendorEventName).toBe("lead");
    expect((await connector.validateCredentials(custom)).ok).toBe(true);
    expect((await connector.getHealth(ctx({ preset: "cj", enterprise_id: "1234567", action_id: "402340" }, { access_token: "pat" }))).status).toBe("degraded");
  });
});
