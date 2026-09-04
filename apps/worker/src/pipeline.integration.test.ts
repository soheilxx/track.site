import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LocalKeyProvider, SecretVault, generateSigningKeyPair, newUlid, silentLogger, verifySignedRequest } from "@track-site/core";
import { PgEventStore } from "@track-site/analytics";
import { defaultBundle, signConfigBundle } from "@track-site/config";
import { organization, withTenant, withWorker } from "@track-site/db";
import { testDb } from "@track-site/db/testing";
import { configPublications, configVersions, credentials, environments, integrations, sites } from "@track-site/db/schema";
import type { IngestMessage } from "@track-site/events";
import { PgQueue, QUEUES } from "@track-site/queue";
import { ConfigCache } from "./config-cache.ts";
import type { WorkerContext } from "./context.ts";
import { workerEnvSchema } from "./env.ts";
import { processDeliveryMessage } from "./stages/deliver.ts";
import { processIngestMessage } from "./stages/ingest.ts";
import { eq, sql } from "drizzle-orm";

const t = testDb();
const SECRET = "whs_pipeline_secret_0123456789";
const MASTER = Buffer.alloc(32, 5).toString("base64");
let server: Server;
let port = 0;
const received: Array<{ body: Record<string, unknown>; ok: boolean }> = [];
let failNext = 0;

let orgId = "";
let siteId = "";
let envId = "";
let integrationId = "";
let ctx: WorkerContext;

beforeAll(async () => {
  server = createServer(async (req, res) => {
    let body = "";
    for await (const c of req) body += c;
    const verdict = await verifySignedRequest(body, String(req.headers["x-tracksite-signature"] ?? ""), [SECRET]);
    received.push({ body: JSON.parse(body), ok: verdict.ok });
    if (failNext > 0) {
      failNext--;
      res.writeHead(503).end("busy");
      return;
    }
    res.writeHead(200).end("ok");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as { port: number }).port;

  const [org] = await t.db.insert(organization).values({ name: "Pipeline", slug: `pipe-${Date.now()}` }).returning();
  orgId = org!.id;
  await withTenant(t.db, orgId, async (tx) => {
    const [site] = await tx.insert(sites).values({ organizationId: orgId, trackingId: "PL1PE2", name: "Pipeline shop", primaryDomain: "shop.pipe.test" }).returning();
    siteId = site!.id;
    const [env] = await tx.insert(environments).values({ organizationId: orgId, siteId, kind: "production", name: "Production", isDefault: true }).returning();
    envId = env!.id;
    const [integ] = await tx
      .insert(integrations)
      .values({ organizationId: orgId, siteId, connectorType: "webhook", name: "Order webhook", status: "connected", publicConfig: { url: `http://127.0.0.1:${port}/hook` }, testMode: false })
      .returning();
    integrationId = integ!.id;
    const vault = new SecretVault(new LocalKeyProvider(MASTER, "local-v1"));
    await tx.insert(credentials).values({ organizationId: orgId, integrationId, kind: "signing_secret", label: "Webhook secret", ciphertext: await vault.encrypt(SECRET, `integration:${integrationId}`), keyId: "local-v1", last4: SECRET.slice(-4) });
    const bundle = { ...defaultBundle("PL1PE2", "production", "shop.pipe.test"), version: 1 };
    bundle.events.push({ name: "purchase", enabled: true, critical: true, trigger: { type: "api" }, props_map: null, authoritative_source: "server_api" });
    bundle.destinations.push({
      id: integrationId,
      type: "webhook",
      name: "Order webhook",
      enabled: true,
      purpose: "necessary",
      mode: "server",
      browser: null,
      test_mode: false,
      mappings: [
        { event: "purchase", vendor_event: "order.completed", enabled: true, field_map: null },
        { event: "page_view", vendor_event: "page.viewed", enabled: true, field_map: null },
      ],
    });
    const kp = generateSigningKeyPair("cfg-v1");
    const signed = signConfigBundle(bundle, kp.keyId, kp.privateKeyBase64);
    const [cv] = await tx.insert(configVersions).values({ organizationId: orgId, siteId, environmentId: envId, version: 1, bundle: signed.payload, digest: signed.digest, signature: signed.signature, keyId: signed.keyId }).returning();
    await tx.insert(configPublications).values({ organizationId: orgId, siteId, environmentId: envId, versionId: cv!.id, isActive: true });
  });

  const env = workerEnvSchema.parse({ MASTER_KEY: MASTER, MASTER_KEY_ID: "local-v1", VENDOR_ALLOW_PRIVATE: "true", MAX_DELIVERY_ATTEMPTS: "3" });
  ctx = {
    env,
    pool: t.pool,
    queue: new PgQueue(t.pool),
    eventStore: new PgEventStore(t.pool),
    vault: new SecretVault(new LocalKeyProvider(MASTER, "local-v1")),
    configs: new ConfigCache(t.pool, 1),
    logger: silentLogger(),
    now: () => new Date(),
    fetch,
  };
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await t.close();
});

function browserMessage(events: Array<Record<string, unknown>>): IngestMessage {
  return {
    kind: "browser_batch",
    message_id: newUlid(),
    received_at: new Date().toISOString(),
    site: { organization_id: orgId, site_id: siteId, tracking_id: "PL1PE2", environment_id: envId, partition_key: `${orgId}:${siteId}` },
    ip_truncated: "203.0.113.0",
    ua_family: "chrome",
    is_bot_hint: false,
    origin_host: "shop.pipe.test",
    events: events as never,
  };
}

function pageView(consentGranted: string[], source: "api" | "default" = "api", id = newUlid()) {
  return {
    id,
    name: "page_view",
    ts: Date.now(),
    page: { url: "https://shop.pipe.test/p/1?fbclid=abc&email=x@y.de" },
    ids: { anonymous_id: "anon-1", session_id: "s-1" },
    consent: { granted: consentGranted, source, policy_version: "v1", ts: Date.now(), region: "DE", gpc: false },
    sdk: { name: "browser", version: "1.0.0", config_version: 1, schema_version: "1.0.0" },
  };
}

describe("vertical slice: ingest -> store -> route -> deliver", () => {
  it("drops events without consent and never persists them", async () => {
    const stats = await processIngestMessage(ctx, browserMessage([pageView(["necessary"], "default")]));
    expect(stats.accepted).toBe(0);
    expect(stats.dropped.consent_missing).toBe(1);
    const stored = await ctx.eventStore.query({ siteId, limit: 10 });
    expect(stored).toHaveLength(0);
  });

  it("stores consented events, strips marketing ids without marketing consent, dedups and routes to the webhook", async () => {
    const id = newUlid();
    const stats = await processIngestMessage(ctx, browserMessage([pageView(["necessary", "analytics"], "api", id), pageView(["necessary", "analytics"], "api", id)]));
    expect(stats.accepted).toBe(1);
    expect(stats.duplicates).toBe(1);
    expect(stats.routed).toBe(1);
    const [stored] = await ctx.eventStore.query({ siteId, name: "page_view", limit: 1 });
    expect(stored?.url).toBe("https://shop.pipe.test/p/1");
    expect(stored?.click_ids).toBeNull();
    expect(stored?.consent_snapshot_id).toBeTruthy();
    expect(stored?.processing_state).toBe("routed");
    expect(stored?.is_billable).toBe(true);

    const ledger = await t.pool.query(`SELECT count(*)::int AS n FROM usage_ledger WHERE site_id = $1`, [siteId]);
    expect(ledger.rows[0].n).toBe(1);

    const [delivery] = await ctx.queue.receive(QUEUES.destination("webhook"), { max: 1 });
    expect(delivery).toBeDefined();
    const outcome = await processDeliveryMessage(ctx, delivery as never);
    expect(outcome).toBe("delivered");
    expect(received.at(-1)?.ok).toBe(true);
    expect(received.at(-1)?.body.type).toBe("page.viewed");
    expect((received.at(-1)?.body.data as Record<string, unknown>).anonymous_id).toBeUndefined();
    const attempts = await t.pool.query(`SELECT status, error_class FROM delivery_attempts WHERE event_id = $1`, [stored!.event_id]);
    expect(attempts.rows[0]).toMatchObject({ status: "success", error_class: "none" });
    const after = await ctx.eventStore.getById(siteId, stored!.event_id);
    expect(after?.processing_state).toBe("delivered");
  });

  it("server purchase: order id dedup, no ads dispatch without marketing consent, webhook still receives it", async () => {
    const msg: IngestMessage = {
      kind: "server_batch",
      message_id: newUlid(),
      received_at: new Date().toISOString(),
      site: { organization_id: orgId, site_id: siteId, tracking_id: "PL1PE2", environment_id: envId, partition_key: `${orgId}:${siteId}` },
      source_key_id: null,
      ip_truncated: null,
      ua_family: null,
      events: [
        { name: "purchase", commerce: { order_id: "ORD-1", value: 49.9, currency: "EUR" }, user_data: { email: "buyer@example.com" }, source: "server", source_verified: true },
        { name: "purchase", commerce: { order_id: "ORD-1", value: 49.9, currency: "EUR" }, source: "server", source_verified: true },
      ],
    };
    const stats = await processIngestMessage(ctx, msg);
    // the second server record of the same order is a duplicate conversion: not accepted, never billed
    expect(stats.accepted).toBe(1);
    expect(stats.dropped.duplicate_conversion).toBe(1);
    const conv = await t.pool.query(`SELECT count(*)::int AS n FROM conversion_records WHERE site_id = $1 AND order_id = 'ORD-1'`, [siteId]);
    expect(conv.rows[0].n).toBe(1);
    const events = await ctx.eventStore.query({ siteId, name: "purchase", limit: 5 });
    const routed = events.filter((e) => e.processing_state === "routed");
    expect(routed).toHaveLength(1);
    expect(routed[0]?.user_data?.em).toHaveLength(64);
    const [delivery] = await ctx.queue.receive(QUEUES.destination("webhook"), { max: 1 });
    expect(await processDeliveryMessage(ctx, delivery as never)).toBe("delivered");
    expect(received.at(-1)?.body.type).toBe("order.completed");
  });

  it("pairs a verified shop purchase with the browser purchase for the same order: consent and click ids inherited, record upgraded", async () => {
    const browserPurchase = { ...pageView(["necessary", "analytics", "marketing"]), name: "purchase", page: { url: "https://shop.pipe.test/thank-you?gclid=CLICK123" }, commerce: { order_id: "ORD-PAIR", value: 80, currency: "EUR" } };
    const s1 = await processIngestMessage(ctx, browserMessage([browserPurchase]));
    expect(s1.accepted).toBe(1);
    const shop: IngestMessage = {
      kind: "server_batch",
      message_id: newUlid(),
      received_at: new Date().toISOString(),
      site: { organization_id: orgId, site_id: siteId, tracking_id: "PL1PE2", environment_id: envId, partition_key: `${orgId}:${siteId}` },
      source_key_id: null,
      ip_truncated: null,
      ua_family: "shop-shopify",
      events: [{ name: "purchase", commerce: { order_id: "ORD-PAIR", value: 80, currency: "EUR" }, user_data: { email: "pair@example.com" }, source: "shopify", source_verified: true }],
    };
    const s2 = await processIngestMessage(ctx, shop);
    expect(s2.accepted).toBe(1);
    expect(s2.dropped.duplicate_conversion).toBeUndefined();
    const events = (await ctx.eventStore.query({ siteId, name: "purchase", limit: 20 })).filter((e) => e.commerce?.order_id === "ORD-PAIR");
    expect(events).toHaveLength(2);
    const server = events.find((e) => e.source === "shopify");
    expect(server?.consent.granted).toContain("marketing");
    expect(server?.click_ids?.gclid?.value).toBe("CLICK123");
    expect(server?.anonymous_id).toBe("anon-1");
    expect(server?.user_data?.em).toHaveLength(64);
    expect(server?.provenance.consent?.source).toBe("browser:order_join");
    expect(events.every((e) => e.processing_state === "routed")).toBe(true);
    const conv = await t.pool.query(`SELECT event_id, source, source_verified FROM conversion_records WHERE site_id = $1 AND order_id = 'ORD-PAIR'`, [siteId]);
    expect(conv.rows).toHaveLength(1);
    expect(conv.rows[0]).toMatchObject({ event_id: server!.event_id, source: "shopify", source_verified: true });
    // a second shop delivery of the same order is a duplicate, a browser replay too
    const s3 = await processIngestMessage(ctx, { ...shop, message_id: newUlid(), events: [{ ...shop.events[0]! }] });
    expect(s3.dropped.duplicate_conversion).toBe(1);
  });

  it("retries temporary vendor failures with backoff and dead-letters after the limit", async () => {
    failNext = 10;
    await processIngestMessage(ctx, browserMessage([pageView(["necessary", "analytics"])]));
    let outcome = "";
    for (let i = 0; i < 4; i++) {
      await t.pool.query(`UPDATE queue_messages SET available_at = now(), locked_until = NULL WHERE queue = $1`, [QUEUES.destination("webhook")]);
      const [m] = await ctx.queue.receive(QUEUES.destination("webhook"), { max: 1 });
      if (!m) break;
      outcome = await processDeliveryMessage(ctx, m as never);
      if (outcome === "dead") break;
    }
    expect(outcome).toBe("dead");
    const stats = await ctx.queue.stats(QUEUES.destination("webhook"));
    expect(stats.deadLetters).toBe(1);
    const refs = await t.pool.query(`SELECT count(*)::int AS n FROM dead_letter_references WHERE site_id = $1`, [siteId]);
    expect(refs.rows[0].n).toBe(1);
    failNext = 0;
    expect(await ctx.queue.replayDeadLetters(QUEUES.destination("webhook"))).toBe(1);
    const [m] = await ctx.queue.receive(QUEUES.destination("webhook"), { max: 1 });
    expect(await processDeliveryMessage(ctx, m as never)).toBe("delivered");
  });

  it("paused destinations are skipped with a policy record and aggregates are maintained", async () => {
    await withWorker(t.db, (tx) => tx.update(integrations).set({ status: "paused" }).where(eq(integrations.id, integrationId)));
    ctx.configs.invalidate(siteId);
    const stats = await processIngestMessage(ctx, browserMessage([pageView(["necessary", "analytics"])]));
    expect(stats.routed).toBe(0);
    const skipped = await t.pool.query(`SELECT count(*)::int AS n FROM delivery_attempts WHERE site_id = $1 AND status = 'skipped' AND error_class = 'policy_blocked'`, [siteId]);
    expect(skipped.rows[0].n).toBeGreaterThanOrEqual(1);
    const agg = await withWorker(t.db, (tx) => tx.execute(sql`SELECT sum(received)::int AS received, sum(accepted)::int AS accepted FROM event_aggregates WHERE site_id = ${siteId}`));
    const row = (agg as unknown as { rows: Array<{ received: number; accepted: number }> }).rows[0];
    expect(row!.received).toBeGreaterThanOrEqual(6);
    expect(row!.accepted).toBeGreaterThanOrEqual(4);
  });
});
