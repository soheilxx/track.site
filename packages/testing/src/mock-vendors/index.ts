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
  app.post("/meta/:version/:pixel/events", async (c) => {
    const body = (await c.req.json()) as { access_token?: string; data?: unknown[]; test_event_code?: string };
    record("meta", c.req.path, c.req.raw.headers, body);
    const f = forced();
    if (f) return c.json({ error: { message: "forced", type: "OAuthException", code: f } }, f as 500);
    if (!body.access_token || (options.metaToken && body.access_token !== options.metaToken)) return c.json({ error: { message: "Invalid OAuth access token.", type: "OAuthException", code: 190 } }, 401);
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
    if (!c.req.header("authorization")?.startsWith("Bearer ")) return c.json({ error: { code: 401, message: "UNAUTHENTICATED" } }, 401);
    if (!c.req.header("developer-token")) return c.json({ error: { code: 403, message: "DEVELOPER_TOKEN_MISSING" } }, 403);
    if (!Array.isArray(body.conversions) || !body.conversions.length) return c.json({ error: { code: 400, message: "conversions required" } }, 400);
    return c.json({ results: body.conversions.map(() => ({ conversionAction: "customers/1/conversionActions/1", conversionDateTime: new Date().toISOString() })), partialFailureError: null });
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
