import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startMockVendorServer } from "@track-site/testing";
import type { Connector, ConnectorContext } from "../connector.ts";
import { dispatchFor, leadEvent, purchaseEvent, testContext } from "./fixtures.ts";
import { GoogleAdsConnector } from "./google-ads.ts";
import { LinkedInConnector } from "./linkedin.ts";
import { MicrosoftConnector } from "./microsoft.ts";
import { PinterestConnector } from "./pinterest.ts";
import { RedditConnector } from "./reddit.ts";
import { SnapchatConnector } from "./snapchat.ts";
import { TikTokConnector } from "./tiktok.ts";

let mock: Awaited<ReturnType<typeof startMockVendorServer>>;
const TOKENS = { microsoft: "ms-capi-token-0000000000", linkedin: "li-oauth-token-000000000", pinterest: "pina_token_0000000000000", snapchat: "snap-capi-token-0000000000", google: "ya29.google-access-token-00000", tiktok: "tt-events-api-token-000000", reddit: "rdt-conversion-token-000000" };

beforeAll(async () => {
  mock = await startMockVendorServer({ googleAdsToken: TOKENS.google, tiktokToken: TOKENS.tiktok, redditToken: TOKENS.reddit, microsoftToken: TOKENS.microsoft, linkedinToken: TOKENS.linkedin, pinterestToken: TOKENS.pinterest, snapchatToken: TOKENS.snapchat });
});
afterAll(async () => {
  await mock.close();
});
beforeEach(() => {
  mock.records.length = 0;
  mock.state.failNext = null;
});

interface Case {
  name: string;
  connector: Connector;
  publicConfig: Record<string, unknown>;
  settings?: Record<string, unknown>;
  credentialKind: "access_token" | "oauth_access_token";
  token: string;
  clickIds: Record<string, string>;
  vendorPurchase: string;
  expectPath: string;
  hashedMarker: string;
  extraCtx?: Partial<ConnectorContext>;
  /** vendor has no order-id field */
  noOrderId?: boolean;
  /** vendor dedups on order id instead of the shared event id */
  noSourceEventId?: boolean;
}

const cases: Case[] = [
  { name: "TikTok Events API", connector: new TikTokConnector(), publicConfig: { pixel_id: "CABCDEFGHIJKLMNOPQRS" }, settings: { test_event_code: "TEST0001" }, credentialKind: "access_token", token: TOKENS.tiktok, clickIds: { ttclid: "E.C.P.example-ttclid" }, vendorPurchase: "CompletePayment", expectPath: "/tiktok/open_api/v1.3/event/track/", hashedMarker: "b4c9a289" },
  { name: "Reddit CAPI", connector: new RedditConnector(), publicConfig: { pixel_id: "a2_abcd1234" }, credentialKind: "access_token", token: TOKENS.reddit, clickIds: { rdt_cid: "rdt-click-id-example" }, vendorPurchase: "Purchase", expectPath: "/reddit/api/v3/pixels/a2_abcd1234/conversion_events", hashedMarker: "b4c9a289", noOrderId: true },
  { name: "Microsoft CAPI", connector: new MicrosoftConnector(), publicConfig: { uet_tag_id: "187012345" }, credentialKind: "access_token", token: TOKENS.microsoft, clickIds: { msclkid: "dd4afccc-b1c9-4a4c-ad95-44dd7e5006ab" }, vendorPurchase: "purchase", expectPath: "/microsoft/v1/187012345/events", hashedMarker: "b4c9a289" },
  { name: "LinkedIn CAPI", connector: new LinkedInConnector(), publicConfig: { partner_id: "1234567", ad_account_id: "512345678" }, settings: { conversion_rules: { purchase: "104012", generate_lead: "104013" } }, credentialKind: "oauth_access_token", token: TOKENS.linkedin, clickIds: { li_fat_id: "df5gf5-gh6t7-ph4j7h-fgf6n1" }, vendorPurchase: "conversion:104012", expectPath: "/linkedin/rest/conversionEvents", hashedMarker: "b4c9a289", noOrderId: true },
  { name: "Pinterest CAPI", connector: new PinterestConnector(), publicConfig: { tag_id: "2613456789012", ad_account_id: "549755885175" }, credentialKind: "access_token", token: TOKENS.pinterest, clickIds: { epik: "dj0yJnU9example" }, vendorPurchase: "checkout", expectPath: "/pinterest/v5/ad_accounts/549755885175/events", hashedMarker: "b4c9a289" },
  { name: "Snapchat CAPI", connector: new SnapchatConnector(), publicConfig: { pixel_id: "6a1f0b2c-3d4e-4f50-8a6b-7c8d9e0f1a2b" }, credentialKind: "access_token", token: TOKENS.snapchat, clickIds: { ScCid: "sc-click-id-example" }, vendorPurchase: "PURCHASE", expectPath: "/snapchat/v3/6a1f0b2c-3d4e-4f50-8a6b-7c8d9e0f1a2b/events", hashedMarker: "b4c9a289" },
  {
    name: "Google Ads upload",
    connector: new GoogleAdsConnector(),
    publicConfig: { conversion_id: "AW-123456789", customer_id: "1234567890" },
    settings: { conversion_actions: { purchase: "987654", generate_lead: "987655" } },
    credentialKind: "oauth_access_token",
    token: TOKENS.google,
    clickIds: { gclid: "Cj0KCQjw_example_gclid" },
    vendorPurchase: "conversionAction:987654",
    expectPath: "/google-ads/v25/customers/1234567890:uploadClickConversions",
    hashedMarker: "b4c9a289",
    extraCtx: { platform: { google_ads_developer_token: "dev-token-000000000000" } },
    noSourceEventId: true,
  },
];

const mapping = (event: string) => ({ event, vendorEvent: "", enabled: true, fieldMap: null });

describe.each(cases)("$name connector", (tc) => {
  const ctx = (over: Parameters<typeof testContext>[0] = {}) => testContext({ publicConfig: tc.publicConfig, settings: tc.settings ?? {}, baseUrlOverride: mock.url, credentials: { [tc.credentialKind]: tc.token }, ...tc.extraCtx, ...over });

  it("maps purchases with the shared dedup id, hashed identifiers and click id, and redacts the preview", () => {
    const payload = tc.connector.mapEvent(dispatchFor(purchaseEvent(), tc.clickIds), mapping("purchase"), ctx())!;
    expect(payload).not.toBeNull();
    expect(payload.vendorEventName).toBe(tc.vendorPurchase);
    const raw = JSON.stringify(payload.body);
    if (!tc.noSourceEventId) expect(raw).toContain("01J9EXAMPLESOURCEEVENTID00");
    expect(raw).toContain(tc.hashedMarker);
    expect(raw).toContain(Object.values(tc.clickIds)[0]!);
    if (!tc.noOrderId) expect(raw).toContain("ORD-10021");
    expect(JSON.stringify(payload.preview)).not.toContain(tc.hashedMarker);
    expect(tc.connector.validatePayload(payload)).toEqual({ ok: true, errors: [] });
  });

  it("maps leads and rejects payloads without identifiers", () => {
    const lead = tc.connector.mapEvent(dispatchFor(leadEvent(), tc.clickIds), mapping("generate_lead"), ctx())!;
    expect(lead).not.toBeNull();
    const bare = tc.connector.mapEvent(dispatchFor(leadEvent({ user_data: null, anonymous_id: null, vendor_ids: null })), mapping("generate_lead"), ctx());
    if (bare) expect(tc.connector.validatePayload(bare).ok).toBe(false);
  });

  it("delivers to the mock endpoint and classifies auth, transient and missing-credential failures", async () => {
    const payload = tc.connector.mapEvent(dispatchFor(purchaseEvent(), tc.clickIds), mapping("purchase"), ctx())!;
    const [ok] = await tc.connector.dispatchBatch(ctx(), [payload]);
    expect(ok?.ok, JSON.stringify(ok)).toBe(true);
    expect(mock.records.at(-1)?.path.replace(/\?.*$/, "")).toBe(tc.expectPath);
    expect(JSON.stringify(mock.records.at(-1)?.headers)).not.toContain("undefined");
    expect(ok?.responseExcerpt ?? "").not.toContain(tc.token);

    const [bad] = await tc.connector.dispatchBatch(ctx({ credentials: { [tc.credentialKind]: "wrong-token-000000000000" } }), [payload]);
    expect(bad?.ok).toBe(false);
    expect(["auth", "credential_expired"]).toContain(bad?.errorClass);

    mock.state.failNext = { status: 503, remaining: 1 };
    const [tmp] = await tc.connector.dispatchBatch(ctx(), [payload]);
    expect(tmp?.errorClass).toBe("temporary");

    const [missing] = await tc.connector.dispatchBatch(ctx({ credentials: {} }), [payload]);
    expect(missing?.errorClass).toBe("credential_expired");

    const test = await tc.connector.sendTest(ctx(), payload);
    expect(test.ok, JSON.stringify(test)).toBe(true);
  });

  it("validates credentials and reports health", async () => {
    expect(await tc.connector.validateCredentials(ctx())).toMatchObject({ ok: true, status: "valid" });
    expect(await tc.connector.validateCredentials(ctx({ credentials: { [tc.credentialKind]: "wrong-token-000000000000" } }))).toMatchObject({ ok: false });
    expect(await tc.connector.validateCredentials(ctx({ credentials: {} }))).toMatchObject({ status: "not_connected" });
    expect((await tc.connector.getHealth(ctx())).status).toBe("healthy");
    expect(tc.connector.getBrowserConfig(tc.publicConfig)).not.toBeNull();
  });
});

describe("Microsoft partial batches", () => {
  it("maps per-row validation errors back to the right event", async () => {
    const connector = new MicrosoftConnector();
    const ctx = testContext({ publicConfig: { uet_tag_id: "187012345" }, baseUrlOverride: mock.url, credentials: { access_token: TOKENS.microsoft } });
    const good = connector.mapEvent(dispatchFor(purchaseEvent()), mapping("purchase"), ctx)!;
    const broken = connector.mapEvent(dispatchFor(leadEvent({ event_id: "01J9BROKEN0000000000000000" })), mapping("generate_lead"), ctx)!;
    (broken.body as { data: Array<Record<string, unknown>> }).data[0]!.eventType = "bogus";
    const results = await connector.dispatchBatch(ctx, [good, broken]);
    expect(results[0]).toMatchObject({ ok: true });
    expect(results[1]).toMatchObject({ ok: false, errorClass: "invalid_payload", errorCode: "InvalidEnumValue" });
  });
});
