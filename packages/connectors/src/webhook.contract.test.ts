import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newUlid, silentLogger, verifySignedRequest } from "@track-site/core";
import type { CanonicalEvent } from "@track-site/events";
import type { ConnectorContext, DispatchEvent } from "./connector.ts";
import { WebhookConnector } from "./webhook.ts";

const SECRET = "whs_test_secret_1234567890";
let server: Server;
let port = 0;
let mode: "ok" | "500" | "429" | "401" | "redirect" | "slow" = "ok";
const received: Array<{ headers: IncomingMessage["headers"]; body: string; verdict: unknown }> = [];

beforeAll(async () => {
  server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const verdict = await verifySignedRequest(body, String(req.headers["x-tracksite-signature"] ?? ""), [SECRET]);
    received.push({ headers: req.headers, body, verdict });
    if (mode === "500") return void res.writeHead(500).end("boom");
    if (mode === "429") return void res.writeHead(429, { "retry-after": "7" }).end("slow down");
    if (mode === "401") return void res.writeHead(401).end("nope");
    if (mode === "redirect") return void res.writeHead(302, { location: "https://evil.test/" }).end();
    if (mode === "slow") return void setTimeout(() => res.writeHead(200).end("late"), 500);
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ received: true }));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as { port: number }).port;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

function ctx(over: Partial<ConnectorContext> = {}): ConnectorContext {
  return {
    organizationId: "o",
    siteId: "s",
    integrationId: "i",
    publicConfig: { url: `http://127.0.0.1:${port}/hook` },
    settings: { timeoutMs: 300 },
    testMode: false,
    getCredential: async (kind) => (kind === "signing_secret" ? SECRET : null),
    fetch,
    allowPrivateNetwork: true,
    logger: silentLogger(),
    now: () => new Date(),
    ...over,
  };
}

function dispatchEvent(): DispatchEvent {
  const now = new Date().toISOString();
  const event = {
    event_id: newUlid(),
    source_event_id: "src1",
    organization_id: "o",
    site_id: "s",
    site_tracking_id: "A7K2Q9",
    environment_id: "e",
    name: "purchase",
    is_standard: true,
    category: "commerce",
    client_ts: now,
    server_ts: now,
    anonymous_id: "anon",
    session_id: "sess",
    user_id: null,
    url: "https://shop.test/thanks",
    host: "shop.test",
    path: "/thanks",
    referrer: null,
    title: null,
    utm: null,
    click_ids: null,
    vendor_ids: null,
    consent: { granted: ["necessary", "analytics"], source: "api", policy_version: "v1", ts: 1, region: "DE", gpc: false },
    consent_snapshot_id: null,
    props: null,
    commerce: { order_id: "1001", value: 10, currency: "EUR" },
    user_data: { em: "x".repeat(64), ph: null, fn: null, ln: null, ct: null, zp: null, country: null, external_id: null },
    ip_truncated: "1.2.3.0",
    ua_family: "chrome",
    locale: "de",
    source: "shopify",
    source_verified: true,
    sdk_version: "server",
    config_version: null,
    schema_version: "1.0.0",
    provenance: {},
    processing_state: "routed",
    drop_reason: null,
    is_billable: true,
    is_bot: false,
  } satisfies CanonicalEvent;
  return { event, clickIds: {}, dedupId: "src1" };
}

const connector = new WebhookConnector();
const mapping = { event: "purchase", vendorEvent: "order.completed", enabled: true, fieldMap: { total: { var: "event.commerce.value" } } };

describe("webhook connector contract", () => {
  it("sends signed, allow-listed payloads without identifiers by default", async () => {
    mode = "ok";
    const payload = connector.mapEvent(dispatchEvent(), mapping, ctx())!;
    expect(payload.vendorEventName).toBe("order.completed");
    expect(connector.validatePayload(payload).ok).toBe(true);
    const [r] = await connector.dispatchBatch(ctx(), [payload]);
    expect(r).toMatchObject({ ok: true, httpStatus: 200, errorClass: "none" });
    const last = received.at(-1)!;
    expect(last.verdict).toMatchObject({ ok: true });
    const body = JSON.parse(last.body);
    expect(body.type).toBe("order.completed");
    expect(body.data.total).toBe(10);
    expect(body.data.user_data).toBeUndefined();
    expect(body.data.anonymous_id).toBeUndefined();
    expect(body.data.commerce.order_id).toBe("1001");
  });

  it("includes identifiers only when explicitly enabled", () => {
    const payload = connector.mapEvent(dispatchEvent(), mapping, ctx({ settings: { includeIdentifiers: true } }))!;
    const body = payload.body as { data: Record<string, unknown> };
    expect(body.data.anonymous_id).toBe("anon");
    expect(payload.preview).toMatchObject({ data: { user_data: "[hashed]" } });
  });

  it("classifies vendor failures, honours retry-after and never follows redirects", async () => {
    const payload = connector.mapEvent(dispatchEvent(), mapping, ctx())!;
    mode = "500";
    expect((await connector.dispatchBatch(ctx(), [payload]))[0]).toMatchObject({ ok: false, errorClass: "temporary", httpStatus: 500 });
    mode = "429";
    expect((await connector.dispatchBatch(ctx(), [payload]))[0]).toMatchObject({ errorClass: "rate_limited", retryAfterMs: 7000 });
    mode = "401";
    expect((await connector.dispatchBatch(ctx(), [payload]))[0]).toMatchObject({ errorClass: "auth" });
    mode = "redirect";
    expect((await connector.dispatchBatch(ctx(), [payload]))[0]).toMatchObject({ errorClass: "permanent", httpStatus: 302 });
    mode = "slow";
    expect((await connector.dispatchBatch(ctx(), [payload]))[0]?.errorClass).toBe("timeout");
    mode = "ok";
  });

  it("blocks private destinations unless explicitly allowed and reports missing secrets", async () => {
    const payload = connector.mapEvent(dispatchEvent(), mapping, ctx())!;
    const blocked = await connector.dispatchBatch(ctx({ allowPrivateNetwork: false }), [payload]);
    expect(blocked[0]).toMatchObject({ ok: false, errorClass: "permanent", errorCode: "ssrf_blocked" });
    const noSecret = await connector.dispatchBatch(ctx({ getCredential: async () => null }), [payload]);
    expect(noSecret[0]).toMatchObject({ errorClass: "credential_expired" });
    expect(await connector.validateCredentials(ctx({ getCredential: async () => null }))).toMatchObject({ status: "not_connected" });
    expect(await connector.validateCredentials(ctx())).toMatchObject({ ok: true });
  });

  it("test sends are flagged", async () => {
    mode = "ok";
    const payload = connector.mapEvent(dispatchEvent(), mapping, ctx())!;
    const r = await connector.sendTest(ctx(), payload);
    expect(r.ok).toBe(true);
    expect(JSON.parse(received.at(-1)!.body).test).toBe(true);
  });
});
