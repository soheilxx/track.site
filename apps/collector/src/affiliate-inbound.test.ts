import { describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { LocalKeyProvider, SecretVault, silentLogger } from "@track-site/core";
import { MemoryQueue, QUEUES } from "@track-site/queue";
import { digistoreSignature } from "./affiliate-inbound.ts";
import { createCollectorApp } from "./app.ts";
import { collectorEnvSchema } from "./env.ts";
import type { ResolvedSite, SiteResolver } from "./site-cache.ts";

const env = collectorEnvSchema.parse({ ALLOW_LOCALHOST_ORIGINS: "true" });
const INTEGRATION = "55555555-5555-4555-8555-555555555555";

const site: ResolvedSite = {
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
};

const resolver: SiteResolver = { byTrackingId: async (id) => (id === "A7K2Q9" ? site : null), bySourceKey: async () => null, invalidate: () => undefined };

async function build(passphrase = "ipn-passphrase-123") {
  const vault = new SecretVault(new LocalKeyProvider("dGVzdC1tYXN0ZXIta2V5LTMyLWJ5dGVzLWxvbmctMDAwMDA=", "test-v1"), []);
  const ciphertext = await vault.encrypt(passphrase, `integration:${INTEGRATION}`);
  const pool = {
    query: async (sql: string) => {
      if (sql.includes("FROM integrations")) return { rows: [{ id: INTEGRATION, public_config: { preset: "digistore24" }, status: "connected" }] };
      if (sql.includes("FROM credentials")) return { rows: [{ ciphertext }] };
      return { rows: [] };
    },
  } as unknown as Pool;
  const queue = new MemoryQueue();
  const app = createCollectorApp({ env, queue, sites: resolver, pool, logger: silentLogger(), vault });
  return { app, queue };
}

const ipn = (over: Record<string, string> = {}) => ({ event: "on_payment", api_mode: "test", order_id: "ABCDEF12", transaction_id: "3999938", transaction_amount: "37.99", transaction_currency: "EUR", product_id: "3323323", product_name: "Course", quantity: "1", email: "claus@domain-xyz.com", custom: "click-abc", affiliate_name: "partner1", billing_type: "single_payment", ...over });

describe("inbound affiliate postbacks (Digistore24 IPN)", () => {
  it("computes the documented SHA-512 signature", () => {
    const sig = digistoreSignature({ b: "2", a: "1", empty: "", sha_sign: "IGNORED" }, "pass");
    expect(sig).toMatch(/^[0-9A-F]{128}$/);
    expect(sig).toBe(digistoreSignature({ a: "1", b: "2" }, "pass"));
  });

  it("rejects unsigned or badly signed notifications and answers connection tests", async () => {
    const { app, queue } = await build();
    const bad = await app.request("/v1/affiliate/in/A7K2Q9/digistore24", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ ...ipn(), sha_sign: "0000" }).toString() });
    expect(bad.status).toBe(401);
    const test = { event: "connection_test", api_mode: "test" };
    const ok = await app.request("/v1/affiliate/in/A7K2Q9/digistore24", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ ...test, sha_sign: digistoreSignature(test, "ipn-passphrase-123") }).toString() });
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("OK");
    expect(await queue.receive(QUEUES.ingest)).toHaveLength(0);
  });

  it("turns a signed on_payment into a verified server purchase with the click id", async () => {
    const { app, queue } = await build();
    const params = ipn();
    const res = await app.request("/v1/affiliate/in/A7K2Q9/digistore24", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ ...params, sha_sign: digistoreSignature(params, "ipn-passphrase-123") }).toString() });
    expect(res.status).toBe(200);
    const msgs = await queue.receive<{ kind: string; source_key_id: string | null; events: Array<Record<string, unknown>> }>(QUEUES.ingest);
    expect(msgs).toHaveLength(1);
    const ev = msgs[0]!.body.events[0]!;
    expect(msgs[0]!.body.kind).toBe("server_batch");
    expect(ev).toMatchObject({ name: "purchase", source: "webhook", source_verified: true, click_ids: { aff_click_id: "click-abc" } });
    expect(ev.commerce).toMatchObject({ order_id: "ABCDEF12", currency: "EUR", value: 37.99 });
    expect((ev.props as Record<string, unknown>).offline).toBe(true);
    const refund = ipn({ event: "on_refund" });
    await app.request("/v1/affiliate/in/A7K2Q9/digistore24", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ ...refund, sha_sign: digistoreSignature(refund, "ipn-passphrase-123") }).toString() });
    const [m2] = await queue.receive<{ events: Array<{ name: string; commerce: { value: number } }> }>(QUEUES.ingest);
    expect(m2?.body.events[0]).toMatchObject({ name: "refund" });
    expect(m2?.body.events[0]?.commerce.value).toBe(-37.99);
  });

  it("returns 404 for unknown sites or presets without a destination", async () => {
    const { app } = await build();
    expect((await app.request("/v1/affiliate/in/ZZZZZZ/digistore24", { method: "POST" })).status).toBe(404);
    expect((await app.request("/v1/affiliate/in/A7K2Q9/awin", { method: "POST" })).status).toBe(404);
  });
});
