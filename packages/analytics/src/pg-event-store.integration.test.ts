import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newUlid } from "@track-site/core";
import { organization, sites, withTenant } from "@track-site/db";
import { testDb } from "@track-site/db/testing";
import type { CanonicalEvent } from "@track-site/events";
import { PgEventStore } from "./pg-event-store.ts";

const t = testDb();
const store = new PgEventStore(t.pool);
let orgId = "";
let siteId = "";

function ev(over: Partial<CanonicalEvent> = {}): CanonicalEvent {
  const now = new Date().toISOString();
  return {
    event_id: newUlid(),
    source_event_id: newUlid(),
    organization_id: orgId,
    site_id: siteId,
    site_tracking_id: "AB12CD",
    environment_id: siteId,
    name: "page_view",
    is_standard: true,
    category: "engagement",
    client_ts: now,
    server_ts: now,
    anonymous_id: "anon-1",
    session_id: "s1",
    user_id: null,
    url: "https://shop.test/",
    host: "shop.test",
    path: "/",
    referrer: null,
    title: null,
    utm: null,
    click_ids: null,
    vendor_ids: null,
    consent: { granted: ["necessary", "analytics"], source: "api", policy_version: "v1", ts: Date.now(), region: "DE", gpc: false },
    consent_snapshot_id: null,
    props: { a: 1 },
    commerce: null,
    user_data: null,
    ip_truncated: "1.2.3.0",
    ua_family: "chrome",
    locale: "de",
    source: "browser",
    source_verified: false,
    sdk_version: "1.0.0",
    config_version: 1,
    schema_version: "1.0.0",
    provenance: {},
    processing_state: "normalized",
    drop_reason: null,
    is_billable: true,
    is_bot: false,
    ...over,
  };
}

beforeAll(async () => {
  const [org] = await t.db.insert(organization).values({ name: "ES", slug: `es-${Date.now()}` }).returning();
  orgId = org!.id;
  const [site] = await withTenant(t.db, orgId, (tx) => tx.insert(sites).values({ organizationId: orgId, trackingId: "AB12CD", name: "es" }).returning());
  siteId = site!.id;
});

afterAll(async () => {
  await t.close();
});

describe("PgEventStore", () => {
  it("inserts, deduplicates on (site, source_event_id) and queries", async () => {
    const a = ev();
    const dup = ev({ source_event_id: a.source_event_id });
    const r = await store.insert([a, dup, ev({ name: "add_to_cart", category: "commerce" })]);
    expect(r).toMatchObject({ inserted: 2, duplicates: 1, duplicateEventIds: [dup.event_id] });
    const got = await store.getById(siteId, a.event_id);
    expect(got?.props).toEqual({ a: 1 });
    expect(got?.server_ts).toBe(a.server_ts);
    const list = await store.query({ siteId, name: "add_to_cart" });
    expect(list).toHaveLength(1);
    const counts = await store.counts(siteId, new Date(Date.now() - 3_600_000), new Date(Date.now() + 3_600_000), "hour");
    expect(counts.reduce((s, c) => s + c.count, 0)).toBe(2);
  });

  it("marks deliveries, updates state and supports deletion", async () => {
    const a = ev({ anonymous_id: "to-delete" });
    await store.insert([a]);
    await store.markDelivery(siteId, a.event_id, { integrationId: "int1", status: "delivered", attempts: 1, at: new Date().toISOString() });
    const raw = await t.pool.query(`SELECT deliveries, processing_state FROM events WHERE site_id = $1 AND event_id = $2`, [siteId, a.event_id]);
    expect(raw.rows[0]?.deliveries?.int1?.status).toBe("delivered");
    expect(raw.rows[0]?.processing_state).toBe("delivered");
    await store.updateState(siteId, a.event_id, "rejected", "test");
    expect((await store.getById(siteId, a.event_id))?.drop_reason).toBe("test");
    expect(await store.lastEventAt(siteId, "browser")).toBeInstanceOf(Date);
    expect(await store.deleteSubject(siteId, { anonymousId: "to-delete" })).toBe(1);
    expect(await store.getById(siteId, a.event_id)).toBeNull();
  });
});
