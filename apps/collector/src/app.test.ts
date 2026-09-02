import { describe, expect, it } from "vitest";
import { newUlid, silentLogger } from "@track-site/core";
import { MemoryQueue, QUEUES } from "@track-site/queue";
import { createCollectorApp } from "./app.ts";
import { collectorEnvSchema } from "./env.ts";
import type { ResolvedSite, SiteResolver } from "./site-cache.ts";

const env = collectorEnvSchema.parse({ ALLOW_LOCALHOST_ORIGINS: "true", RATE_LIMIT_IP_PER_MIN: "20" });

function site(over: Partial<ResolvedSite> = {}): ResolvedSite {
  return {
    organizationId: "11111111-1111-4111-8111-111111111111",
    siteId: "22222222-2222-4222-8222-222222222222",
    trackingId: "A7K2Q9",
    environments: [{ id: "33333333-3333-4333-8333-333333333333", kind: "production", isDefault: true }],
    status: "active",
    killSwitch: false,
    orgKillSwitch: false,
    partitionOverride: null,
    allowedHosts: ["shop.example.com"],
    activeConfigVersion: 1,
    fetchedAt: Date.now(),
    ...over,
  };
}

function resolver(s: ResolvedSite | null): SiteResolver {
  return {
    byTrackingId: async (id) => (s && id === s.trackingId ? s : null),
    bySourceKey: async (secret) => (secret === "tsk_test_valid" && s ? { sourceKeyId: "44444444-4444-4444-8444-444444444444", siteId: s.siteId, environmentId: s.environments[0]!.id, organizationId: s.organizationId, scopes: ["events:write"] } : null),
    invalidate: () => undefined,
  };
}

function batch(n = 1, siteId = "a7k2q9") {
  return {
    site_id: siteId,
    sent_at: Date.now(),
    events: Array.from({ length: n }, () => ({
      id: newUlid(),
      name: "page_view",
      ts: Date.now(),
      page: { url: "https://shop.example.com/" },
      ids: { anonymous_id: "a" },
      consent: { granted: ["necessary", "analytics"], source: "api", policy_version: "v1", ts: Date.now(), region: "DE", gpc: false },
      sdk: { name: "browser", version: "1.0.0", config_version: 1, schema_version: "1.0.0" },
    })),
  };
}

function build(s: ResolvedSite | null = site(), queue = new MemoryQueue()) {
  const app = createCollectorApp({ env, queue, sites: resolver(s), pool: null, logger: silentLogger() });
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    app.request(path, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers: { origin: "https://shop.example.com", "user-agent": "Mozilla/5.0 Chrome/128", "content-type": "text/plain", ...headers } });
  return { app, queue, post };
}

describe("collector /v1/e", () => {
  it("accepts a valid batch only after the queue stored it (202) and normalizes the tracking id", async () => {
    const { queue, post } = build();
    const res = await post("/v1/e", batch(2));
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ ok: true, accepted: 2 });
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const msgs = await queue.receive<{ kind: string; site: { tracking_id: string; partition_key: string }; ip_truncated: string | null; events: unknown[] }>(QUEUES.ingest);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]?.body.site.tracking_id).toBe("A7K2Q9");
    expect(msgs[0]?.body.site.partition_key).toContain("22222222");
    expect(msgs[0]?.body.events).toHaveLength(2);
  });

  it("rejects invalid json, invalid batches, unknown sites and wrong origins", async () => {
    const { post } = build();
    expect((await post("/v1/e", "{not json")).status).toBe(400);
    expect((await post("/v1/e", { site_id: "A7K2Q9", sent_at: 1, events: [] })).status).toBe(400);
    expect((await post("/v1/e", batch(1, "ZZZZZZ"))).status).toBe(404);
    expect((await post("/v1/e", batch(1), { origin: "https://evil.example.org" })).status).toBe(403);
    expect((await post("/v1/e", batch(1), { origin: "http://localhost:3000" })).status).toBe(202);
  });

  it("returns 503 with Retry-After when the queue is unavailable and honours kill switches", async () => {
    const broken = new MemoryQueue();
    broken.enqueue = async () => {
      throw new Error("down");
    };
    const { post } = build(site(), broken);
    const res = await post("/v1/e", batch());
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("5");
    const paused = build(site({ killSwitch: true }));
    expect(await (await paused.post("/v1/e", batch())).json()).toMatchObject({ ok: false, reason: "site_paused" });
  });

  it("rate limits per ip", async () => {
    const { post } = build();
    let last = 0;
    for (let i = 0; i < 25; i++) last = (await post("/v1/e", batch(1))).status;
    expect(last).toBe(429);
  });

  it("truncates ips and flags bots", async () => {
    const { queue, post } = build();
    await post("/v1/e", batch(), { "x-forwarded-for": "203.0.113.77, 10.0.0.1", "user-agent": "Googlebot/2.1" });
    const [m] = await queue.receive<{ ip_truncated: string | null; is_bot_hint: boolean; ua_family: string }>(QUEUES.ingest);
    expect(m?.body.ip_truncated).toBe("203.0.113.0");
    expect(m?.body.is_bot_hint).toBe(true);
  });
});

describe("collector /v1/s", () => {
  it("requires a valid source key", async () => {
    const { post } = build();
    expect((await post("/v1/s", { events: [{ name: "purchase" }] })).status).toBe(401);
    expect((await post("/v1/s", { events: [{ name: "purchase" }] }, { authorization: "Bearer tsk_test_wrong" })).status).toBe(401);
  });
});

describe("collector /health", () => {
  it("reports queue driver", async () => {
    const { app } = build();
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, queue: { driver: "memory" } });
  });
});
