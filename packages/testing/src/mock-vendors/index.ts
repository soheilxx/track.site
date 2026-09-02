import { createHmac } from "node:crypto";
import { Hono, type Context } from "hono";
import { serve, type ServerType } from "@hono/node-server";

/**
 * Local mock vendor servers used by connector contract tests and by `VENDOR_MOCK_BASE_URL`.
 * Every route validates the vendor's documented auth mechanism and replies with the documented
 * success/error shapes; received payloads can be inspected through `/__records`.
 */
export interface Recorded {
  vendor: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
  at: string;
}

export interface MockVendorOptions {
  metaToken?: string;
  tiktokToken?: string;
  redditToken?: string;
  linkedinToken?: string;
  ga4Secret?: string;
  googleAdsToken?: string;
  microsoftToken?: string;
  xToken?: string;
  yahooClientSecret?: string;
  cm360Token?: string;
  adrollToken?: string;
  quoraToken?: string;
  amazonToken?: string;
  pinterestToken?: string;
  snapchatToken?: string;
  /** force behaviour for the next N requests: status code to return */
  failNext?: { status: number; remaining: number } | null;
}

export function createMockVendorApp(options: MockVendorOptions = {}) {
  const records: Recorded[] = [];
  const state = { failNext: options.failNext ?? null };
  const app = new Hono();

  const record = (vendor: string, path: string, headers: Headers, body: unknown) => {
    const h: Record<string, string> = {};
    headers.forEach((v, k) => (h[k] = v));
    records.push({ vendor, path, headers: h, body, at: new Date().toISOString() });
  };
  const forced = () => {
    if (state.failNext && state.failNext.remaining > 0) {
      state.failNext.remaining--;
      return state.failNext.status;
    }
    return null;
  };

  app.get("/__records", (c) => c.json(records));
  app.post("/__reset", (c) => {
    records.length = 0;
    state.failNext = null;
    return c.json({ ok: true });
  });
  app.post("/__fail", async (c) => {
    const b = (await c.req.json()) as { status: number; times: number };
    state.failNext = { status: b.status, remaining: b.times };
    return c.json({ ok: true });
  });

  // Meta Conversions API: POST /{version}/{pixel_id}/events with access_token in body
  app.get("/meta/:version/:pixel", (c) => {
    const token = c.req.query("access_token");
    if (!token || (options.metaToken && token !== options.metaToken)) return c.json({ error: { message: "Invalid OAuth access token.", type: "OAuthException", code: 190 } }, 401);
    return c.json({ id: c.req.param("pixel"), name: "Mock dataset" });
  });
  app.post("/meta/:version/:pixel/events", async (c) => {
    const body = (await c.req.json()) as { access_token?: string; data?: unknown[]; test_event_code?: string };
    record("meta", c.req.path, c.req.raw.headers, body);
    const f = forced();
    if (f) return c.json({ error: { message: "forced", type: "OAuthException", code: f } }, f as 500);
    const token = body.access_token ?? c.req.query("access_token");
    if (!token || (options.metaToken && token !== options.metaToken)) return c.json({ error: { message: "Invalid OAuth access token.", type: "OAuthException", code: 190 } }, 401);
    if (!Array.isArray(body.data) || body.data.length === 0) return c.json({ error: { message: "(#100) Param data is required", type: "OAuthException", code: 100 } }, 400);
    return c.json({ events_received: body.data.length, messages: [], fbtrace_id: "mock" });
  });

  // TikTok Events API: POST /open_api/{version}/event/track/ with Access-Token header
  app.post("/tiktok/open_api/:version/event/track/", async (c) => {
    const body = (await c.req.json()) as { event_source_id?: string; data?: unknown[] };
    record("tiktok", c.req.path, c.req.raw.headers, body);
    const f = forced();
    if (f) return c.json({ code: f, message: "forced" }, f as 500);
    const token = c.req.header("access-token");
    if (!token || (options.tiktokToken && token !== options.tiktokToken)) return c.json({ code: 40001, message: "Access token is incorrect" }, 401);
    if (!Array.isArray(body.data) || !body.data.length) return c.json({ code: 40002, message: "data required" }, 400);
    return c.json({ code: 0, message: "OK", request_id: "mock" });
  });

  // Reddit CAPI: POST /api/v3/pixels/{pixel_id}/conversion_events with bearer token
  app.post("/reddit/api/v3/pixels/:pixel/conversion_events", async (c) => {
    const body = (await c.req.json()) as { events?: unknown[]; test_id?: string };
    record("reddit", c.req.path, c.req.raw.headers, body);
    const f = forced();
    if (f) return c.json({ message: "forced" }, f as 500);
    const auth = c.req.header("authorization") ?? "";
    if (!auth.startsWith("Bearer ") || (options.redditToken && auth !== `Bearer ${options.redditToken}`)) return c.json({ message: "Unauthorized" }, 401);
    if (!Array.isArray(body.events) || !body.events.length) return c.json({ message: "events required" }, 400);
    return c.json({ message: "Successfully processed 1 conversion events.", invalid_events: [] });
  });

  // LinkedIn CAPI: POST /rest/conversionEvents with bearer token + Linkedin-Version
  app.post("/linkedin/rest/conversionEvents", async (c) => {
    const body = (await c.req.json()) as { conversion?: string; eventId?: string };
    record("linkedin", c.req.path, c.req.raw.headers, body);
    const f = forced();
    if (f) return c.json({ message: "forced" }, f as 500);
    const auth = c.req.header("authorization") ?? "";
    if (!auth.startsWith("Bearer ") || (options.linkedinToken && auth !== `Bearer ${options.linkedinToken}`)) return c.json({ message: "Unauthorized" }, 401);
    if (!c.req.header("linkedin-version")) return c.json({ message: "Linkedin-Version header required" }, 400);
    if (!body.conversion) return c.json({ message: "conversion required" }, 422);
    return c.body(null, 201);
  });

  // GA4 Measurement Protocol: POST /mp/collect?measurement_id=&api_secret= ; debug endpoint validates
  const ga4 = async (c: Context, debug: boolean) => {
    const body = (await c.req.json().catch(() => null)) as { client_id?: string; events?: Array<{ name: string }> } | null;
    record("ga4", c.req.path, c.req.raw.headers, { query: c.req.query(), body });
    const f = forced();
    if (f) return c.body("forced", f as 500);
    const secret = c.req.query("api_secret");
    const mid = c.req.query("measurement_id");
    const messages: Array<{ fieldPath: string; description: string; validationCode: string }> = [];
    if (!mid) messages.push({ fieldPath: "measurement_id", description: "Missing measurement_id", validationCode: "VALUE_INVALID" });
    if (!secret || (options.ga4Secret && secret !== options.ga4Secret)) messages.push({ fieldPath: "api_secret", description: "Invalid api_secret", validationCode: "VALUE_INVALID" });
    if (!body?.client_id) messages.push({ fieldPath: "client_id", description: "Missing client_id", validationCode: "VALUE_REQUIRED" });
    if (!body?.events?.length) messages.push({ fieldPath: "events", description: "events required", validationCode: "VALUE_REQUIRED" });
    if (debug) return c.json({ validationMessages: messages });
    return c.body(null, 204);
  };
  app.post("/ga4/mp/collect", (c) => ga4(c, false));
  app.post("/ga4/debug/mp/collect", (c) => ga4(c, true));

  // Google Ads: POST /v{n}/customers/{id}:uploadClickConversions with bearer + developer-token
  app.post("/google-ads/:version/customers/:customer\\:uploadClickConversions", async (c) => {
    const body = (await c.req.json()) as { conversions?: unknown[]; partialFailure?: boolean; validateOnly?: boolean };
    record("google_ads", c.req.path, c.req.raw.headers, body);
    const f = forced();
    if (f) return c.json({ error: { code: f, message: "forced" } }, f as 500);
    const gauth = c.req.header("authorization") ?? "";
    if (!gauth.startsWith("Bearer ") || (options.googleAdsToken && gauth !== `Bearer ${options.googleAdsToken}`)) return c.json({ error: { code: 401, message: "Request had invalid authentication credentials.", status: "UNAUTHENTICATED" } }, 401);
    if (!c.req.header("developer-token")) return c.json({ error: { code: 403, message: "DEVELOPER_TOKEN_MISSING" } }, 403);
    if (!Array.isArray(body.conversions) || !body.conversions.length) return c.json({ error: { code: 400, message: "conversions required" } }, 400);
    return c.json({ results: body.conversions.map(() => ({ conversionAction: "customers/1/conversionActions/1", conversionDateTime: new Date().toISOString() })), partialFailureError: null });
  });

  // LinkedIn conversion rules lookup (credential validation)
  app.get("/linkedin/rest/conversions", (c) => {
    const auth = c.req.header("authorization") ?? "";
    if (!auth.startsWith("Bearer ") || (options.linkedinToken && auth !== `Bearer ${options.linkedinToken}`)) return c.json({ message: "Unauthorized", serviceErrorCode: 65600 }, 401);
    return c.json({ elements: [{ id: 104012, name: "Purchase (CAPI)", conversionMethod: "CONVERSIONS_API", enabled: true, type: "PURCHASE" }] });
  });

  // Microsoft UET Conversions API: POST /v1/{tagId}/events with Bearer token
  app.post("/microsoft/v1/:tag/events", async (c) => {
    const body = (await c.req.json()) as { data?: Array<{ eventType?: string; eventTime?: number }>; continueOnValidationError?: boolean };
    record("microsoft", c.req.path, c.req.raw.headers, body);
    const f = forced();
    if (f) return c.json({ error: { code: "Internal", message: "forced" } }, f as 500);
    const auth = c.req.header("authorization") ?? "";
    if (!auth.startsWith("Bearer ") || (options.microsoftToken && auth !== `Bearer ${options.microsoftToken}`)) return c.json({ error: { code: "Unauthorized", message: "You are not authorized to access this resource." } }, 401);
    const details = (body.data ?? []).flatMap((ev, index) => (ev.eventType === "pageLoad" || ev.eventType === "custom" ? [] : [{ index, propertyName: `data[${index}].eventType`, errorMessage: "eventType must be one of the following: pageLoad, custom.", errorCode: "InvalidEnumValue", isWarning: false }]));
    if (!body.data?.length || (details.length && !body.continueOnValidationError) || details.length === body.data.length) return c.json({ error: { code: "ValidationError", message: "One or multiple parameters did not pass validation checks, see details.", details: details.length ? details : [{ index: 0, propertyName: "data", errorMessage: "data must not be empty", errorCode: "Empty", isWarning: false }] } }, 400);
    return c.json({ eventsReceived: body.data.length - details.length, ...(details.length ? { error: { code: "ValidationError", message: "partial", details } } : {}) });
  });

  // Pinterest Conversions API v5: POST /v5/ad_accounts/{id}/events[?test=true]
  app.post("/pinterest/v5/ad_accounts/:account/events", async (c) => {
    const body = (await c.req.json()) as { data?: Array<{ event_name?: string; user_data?: Record<string, unknown> }> };
    record("pinterest", c.req.path + (c.req.query("test") ? "?test=true" : ""), c.req.raw.headers, body);
    const f = forced();
    if (f) return c.json({ code: f, message: "forced" }, f as 500);
    const auth = c.req.header("authorization") ?? "";
    if (!auth.startsWith("Bearer ") || (options.pinterestToken && auth !== `Bearer ${options.pinterestToken}`)) return c.json({ code: 2, message: "Authentication failed." }, 401);
    if (!body.data?.length) return c.json({ code: 1, message: "data required" }, 400);
    const events = body.data.map((ev) => (ev.user_data && Object.keys(ev.user_data).length ? { status: "processed", error_message: null, warning_message: null } : { status: "failed", error_message: "user_data must contain at least one identifier", warning_message: null }));
    return c.json({ num_events_received: body.data.length, num_events_processed: events.filter((e) => e.status === "processed").length, events });
  });

  // Snapchat Conversions API v3: POST /v3/{pixel}/events and /validate with Bearer token
  const snap = async (c: Context) => {
    const body = (await c.req.json()) as { data?: Array<{ event_name?: string; user_data?: Record<string, unknown> }> };
    record("snapchat", c.req.path, c.req.raw.headers, body);
    const f = forced();
    if (f) return c.json({ status: "FAILED", reason: "forced" }, f as 500);
    const auth = c.req.header("authorization") ?? "";
    if (!auth.startsWith("Bearer ") || (options.snapchatToken && auth !== `Bearer ${options.snapchatToken}`)) return c.json({ status: "FAILED", reason: "Unauthorized" }, 401);
    if (!body.data?.length) return c.json({ status: "FAILED", reason: "data required" }, 400);
    const error_records = body.data.flatMap((ev, index) => (ev.user_data && Object.keys(ev.user_data).length ? [] : [{ index, reason: "user_data required" }]));
    return c.json({ status: error_records.length === body.data.length ? "FAILED" : "SUCCESS", reason: error_records.length ? "partial" : "OK", error_records });
  };
  app.post("/snapchat/v3/:pixel/events", snap);
  app.post("/snapchat/v3/:pixel/events/validate", snap);

  // X Ads Conversion API (OAuth 1.0a): POST /{version}/measurement/conversions/{pixel}; GET /{version}/accounts for validation
  const xAuthOk = (c: Context) => {
    const auth = c.req.header("authorization") ?? "";
    if (!auth.startsWith("OAuth ")) return false;
    const token = /oauth_token="([^"]+)"/.exec(auth)?.[1] ?? "";
    return /oauth_signature="[^"]+"/.test(auth) && (!options.xToken || token === options.xToken);
  };
  app.get("/x/:version/accounts", (c) => (xAuthOk(c) ? c.json({ data: [{ id: "18ce54d4x5t", name: "Mock account" }] }) : c.json({ errors: [{ code: "UNAUTHORIZED_ACCESS", message: "This request is not properly authenticated" }] }, 401)));
  app.post("/x/:version/measurement/conversions/:pixel", async (c) => {
    const body = (await c.req.json()) as { conversions?: unknown[] };
    record("x", c.req.path, c.req.raw.headers, body);
    const f = forced();
    if (f) return c.json({ errors: [{ code: "SERVICE_UNAVAILABLE", message: "forced" }] }, f as 500);
    if (!xAuthOk(c)) return c.json({ errors: [{ code: "UNAUTHORIZED_ACCESS", message: "This request is not properly authenticated" }] }, 401);
    if (!body.conversions?.length) return c.json({ errors: [{ code: "MISSING_PARAMETER", message: "conversions required" }] }, 400);
    return c.json({ data: { conversions_processed: body.conversions.length, debug_id: "mock-debug" }, request: { params: {} } });
  });

  // Taboola bulk S2S: POST /{account}/log/3/bulk-s2s-action -> 204 (no auth)
  app.post("/taboola/:account/log/3/bulk-s2s-action", async (c) => {
    const body = (await c.req.json()) as { actions?: unknown[] };
    record("taboola", c.req.path, c.req.raw.headers, body);
    const f = forced();
    if (f) return c.body("forced", f as 500);
    if (!Array.isArray(body.actions)) return c.body("actions required", 400);
    return c.body(null, 204);
  });

  // Outbrain unifiedPixel postback: GET with query parameters (no auth)
  app.get("/outbrain/unifiedPixel", (c) => {
    record("outbrain", c.req.path, c.req.raw.headers, { query: c.req.query() });
    const f = forced();
    if (f) return c.body("forced", f as 500);
    if (!c.req.query("ob_click_id") || !c.req.query("name")) return c.body("missing parameters", 400);
    return c.body("ok", 200);
  });

  // Yahoo ID B2B token + DataX events
  app.post("/yahoo/zts/v1/oauth2/token", async (c) => {
    const form = new URLSearchParams(await c.req.text());
    const assertion = form.get("client_assertion") ?? "";
    const [h, cl, sig] = assertion.split(".");
    record("yahoo", c.req.path, c.req.raw.headers, { grant_type: form.get("grant_type"), realm: form.get("realm") });
    if (!h || !cl || !sig || form.get("grant_type") !== "client_credentials") return c.json({ error: "invalid_request" }, 400);
    if (options.yahooClientSecret) {
      const expected = createHmac("sha256", options.yahooClientSecret).update(`${h}.${cl}`).digest("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
      if (expected !== sig) return c.json({ error: "invalid_client", error_description: "signature mismatch" }, 401);
    }
    return c.json({ access_token: "yahoo-access-token-mock", token_type: "Bearer", expires_in: 3600 });
  });
  app.post("/yahoo/v1/events/:pixel", async (c) => {
    const body = (await c.req.json()) as Array<{ eventName?: string; userData?: Record<string, unknown>; clickData?: Record<string, unknown> }>;
    record("yahoo", c.req.path, c.req.raw.headers, body);
    const f = forced();
    if (f) return c.json({ error: "forced" }, f as 500);
    if ((c.req.header("authorization") ?? "") !== "Bearer yahoo-access-token-mock") return c.json({ error: "invalid_token" }, 401);
    if (!Array.isArray(body) || !body.length) return c.json({ error: "events required" }, 400);
    const bad = body.filter((e) => !e.eventName || (!Object.keys(e.userData ?? {}).length && !Object.keys(e.clickData ?? {}).length)).length;
    return c.json(bad ? { success: "PARTIAL", message: `{MISSING_IDENTIFIER=${bad}}` } : { success: "COMPLETE" });
  });

  // Campaign Manager 360 conversions.batchinsert + floodlightConfigurations read
  app.get("/cm360/dfareporting/:version/userprofiles/:profile/floodlightConfigurations/:id", (c) => {
    const auth = c.req.header("authorization") ?? "";
    if (!auth.startsWith("Bearer ") || (options.cm360Token && auth !== `Bearer ${options.cm360Token}`)) return c.json({ error: { code: 401, message: "Invalid Credentials", status: "UNAUTHENTICATED" } }, 401);
    return c.json({ kind: "dfareporting#floodlightConfiguration", id: c.req.param("id"), advertiserId: "555" });
  });
  app.post("/cm360/dfareporting/:version/userprofiles/:profile/conversions/batchinsert", async (c) => {
    const body = (await c.req.json()) as { conversions?: Array<{ gclid?: string; dclid?: string; matchId?: string; userIdentifiers?: unknown[]; floodlightActivityId?: string }> };
    record("cm360", c.req.path, c.req.raw.headers, body);
    const f = forced();
    if (f) return c.json({ error: { code: f, message: "forced", status: "UNAVAILABLE" } }, f as 500);
    const auth = c.req.header("authorization") ?? "";
    if (!auth.startsWith("Bearer ") || (options.cm360Token && auth !== `Bearer ${options.cm360Token}`)) return c.json({ error: { code: 401, message: "Invalid Credentials", status: "UNAUTHENTICATED" } }, 401);
    if (!body.conversions?.length) return c.json({ error: { code: 400, message: "conversions required", status: "INVALID_ARGUMENT" } }, 400);
    const status = body.conversions.map((conv) => ({ kind: "dfareporting#conversionStatus", conversion: conv, errors: conv.gclid || conv.dclid || conv.matchId || conv.userIdentifiers ? [] : [{ kind: "dfareporting#conversionError", code: "INVALID_ARGUMENT", message: "Missing user identifier" }] }));
    return c.json({ kind: "dfareporting#conversionsBatchInsertResponse", hasFailures: status.some((s) => s.errors.length), status });
  });

  // AdRoll S2S: POST /api?advertisable=EID[&dry_run=true] with Token auth
  app.post("/adroll/api", async (c) => {
    const body = (await c.req.json()) as Array<{ identifiers?: Record<string, unknown> }>;
    record("adroll", c.req.path + "?" + new URLSearchParams(c.req.query()).toString(), c.req.raw.headers, body);
    const f = forced();
    if (f) return c.json({ error: "forced" }, f as 500);
    const auth = c.req.header("authorization") ?? "";
    if (!auth.startsWith("Token ") || (options.adrollToken && auth !== `Token ${options.adrollToken}`)) return c.json({ error: "unauthorized" }, 401);
    if (!c.req.query("advertisable")) return c.json({ error: "advertisable required" }, 400);
    if (!Array.isArray(body) || !body.length) return c.json({ error: "events required" }, 400);
    return c.json({ accepted: body.length, dry_run: c.req.query("dry_run") === "true" });
  });

  // Spotify Ad Analytics server-side pixel (GET image endpoint)
  app.get("/spotify/img", (c) => {
    record("spotify", c.req.path, c.req.raw.headers, { query: c.req.query() });
    const f = forced();
    if (f) return c.body("forced", f as 500);
    if (!c.req.query("key") || !c.req.query("a")) return c.body("missing", 400);
    return c.body("GIF89a", 200, { "content-type": "image/gif" });
  });

  // Criteo OneTag S2S: POST /m/event?version=s2s_v0 -> always 200 with { errors, warnings }
  app.post("/criteo/m/event", async (c) => {
    const body = (await c.req.json()) as { account?: string; id?: Record<string, unknown>; events?: Array<{ event?: string }> };
    record("criteo", c.req.path + "?version=" + (c.req.query("version") ?? ""), c.req.raw.headers, body);
    const f = forced();
    if (f) return c.body("forced", f as 500);
    const errors: string[] = [];
    if (!body.account) errors.push("AccountMissing");
    const id = body.id ?? {};
    if (!(id.email || (id.mapping_key && id.mapped_user_id) || id.idfa || id.gaid)) errors.push("UserIdentifierMissing");
    if (!body.events?.length) errors.push("EventsMissing");
    return c.json({ errors, warnings: [] });
  });

  // Quora Conversion API: POST /_/ad/conversion with Bearer token
  app.post("/quora/_/ad/conversion", async (c) => {
    const body = (await c.req.json()) as { account_id?: string; conversion?: Record<string, unknown>; user?: Record<string, unknown> };
    record("quora", c.req.path, c.req.raw.headers, body);
    const f = forced();
    if (f) return c.json({ error: "forced" }, f as 500);
    const auth = c.req.header("authorization") ?? "";
    if (!auth.startsWith("Bearer ") || (options.quoraToken && auth !== `Bearer ${options.quoraToken}`)) return c.json({ error: "Invalid token" }, 401);
    if (!body.account_id || !body.conversion?.event_name) return c.json({ error: "account_id and conversion.event_name required" }, 400);
    return c.json({ success: true });
  });

  // The Trade Desk real-time conversions: POST /track/realtimeconversion (no auth; unknown tags -> 402)
  app.post("/tradedesk/track/realtimeconversion", async (c) => {
    const body = (await c.req.json()) as { data?: Array<{ adv?: string; upixel_id?: string; tracker_id?: string }> };
    record("tradedesk", c.req.path, c.req.raw.headers, body);
    const f = forced();
    if (f) return c.body("forced", f as 500);
    if (!body.data?.length) return c.body("data required", 400);
    if (body.data.some((d) => !d.adv || (!d.upixel_id && !d.tracker_id))) return c.body("unknown pixel", 402);
    return c.body("ok", 200);
  });

  // Amazon Ads Events API: POST /{region}/events/v1 with LwA bearer + client id headers
  app.post("/amazon/:region/events/v1", async (c) => {
    const body = (await c.req.json()) as { events?: Array<{ matchKeys?: unknown[]; eventDescription?: Record<string, unknown> }> };
    record("amazon", c.req.path, c.req.raw.headers, body);
    const f = forced();
    if (f) return c.json({ message: "forced" }, f as 500);
    const auth = c.req.header("authorization") ?? "";
    if (!auth.startsWith("Bearer ") || (options.amazonToken && auth !== `Bearer ${options.amazonToken}`)) return c.json({ message: "Unauthorized" }, 401);
    if (!c.req.header("amazon-advertising-api-clientid")) return c.json({ message: "Missing client id" }, 403);
    if (!body.events?.length) return c.json({ message: "events required" }, 400);
    const error = body.events.flatMap((ev, index) => (ev.matchKeys?.length ? [] : [{ index, httpStatusCode: 400, subErrors: [{ errorCode: "MATCH_KEYS_MISSING", errorMessage: "matchKeys required" }] }]));
    return c.json({ success: body.events.map((_, index) => ({ index })).filter((s) => !error.some((e) => e.index === s.index)), error });
  });

  // Affiliate postbacks: generic receivers per preset (GET query or POST form/json), records everything
  app.all("/affiliate/:preset", async (c) => {
    const ct = c.req.header("content-type") ?? "";
    const body = c.req.method === "GET" ? { query: c.req.query() } : ct.includes("json") ? await c.req.json().catch(() => null) : Object.fromEntries(new URLSearchParams(await c.req.text()));
    record("affiliate", c.req.path + (c.req.method === "GET" ? "?" + new URLSearchParams(c.req.query()).toString() : ""), c.req.raw.headers, body);
    const f = forced();
    if (f) return c.body("forced", f as 500);
    if (c.req.param("preset") === "impact" && !(c.req.header("authorization") ?? "").startsWith("Basic ")) return c.json({ Status: "Unauthorized" }, 401);
    return c.req.param("preset") === "impact" ? c.json({ Status: "Queued", QueuedUri: "/Advertisers/IRabc/Conversions/1" }) : c.body("ok", 200);
  });

  // Generic webhook receiver
  app.post("/webhook", async (c) => {
    const body = await c.req.json().catch(() => null);
    record("webhook", c.req.path, c.req.raw.headers, body);
    const f = forced();
    if (f) return c.body("forced", f as 500);
    return c.json({ received: true });
  });

  return { app, records, state };
}

export async function startMockVendorServer(options: MockVendorOptions = {}, port = 0): Promise<{ url: string; server: ServerType; records: Recorded[]; close: () => Promise<void>; state: { failNext: MockVendorOptions["failNext"] } }> {
  const { app, records, state } = createMockVendorApp(options);
  return new Promise((resolve) => {
    const server = serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, (info) => {
      resolve({
        url: `http://127.0.0.1:${info.port}`,
        server,
        records,
        state,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}
