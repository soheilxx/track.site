import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TRACKING_ID_REGEX, createWithUniqueTrackingId } from "@track-site/core";
import { isRlsViolation, isUniqueViolation, withTenant, withWorker } from "./client.ts";
import { createSite, listSites, recordAudit, softDeleteSite } from "./repositories/index.ts";
import { organization } from "./schema/auth.ts";
import { auditLog } from "./schema/platform.ts";
import { sites } from "./schema/tenancy.ts";
import { events } from "./schema/events.ts";
import { testDb } from "./testing.ts";

const t = testDb();
let orgA = "";
let orgB = "";

beforeAll(async () => {
  const rows = await t.db
    .insert(organization)
    .values([
      { name: "Org A", slug: `org-a-${Date.now()}` },
      { name: "Org B", slug: `org-b-${Date.now()}` },
    ])
    .returning({ id: organization.id });
  orgA = rows[0]!.id;
  orgB = rows[1]!.id;
});

afterAll(async () => {
  await t.close();
});

describe("row level security", () => {
  it("isolates tenants for select, update, insert and delete", async () => {
    const siteA = await withTenant(t.db, orgA, (tx) => createSite(tx, { organizationId: orgA, name: "A", primaryDomain: "a.test", createdBy: null }));
    const siteB = await withTenant(t.db, orgB, (tx) => createSite(tx, { organizationId: orgB, name: "B", primaryDomain: "b.test", createdBy: null }));

    const seenByA = await withTenant(t.db, orgA, (tx) => listSites(tx, orgA));
    expect(seenByA.map((s) => s.id)).toContain(siteA.id);
    expect(seenByA.map((s) => s.id)).not.toContain(siteB.id);

    // manipulated ids: tenant A asks for B's site explicitly
    const stolen = await withTenant(t.db, orgA, (tx) => tx.select().from(sites).where(eq(sites.id, siteB.id)));
    expect(stolen).toHaveLength(0);

    const updated = await withTenant(t.db, orgA, (tx) => tx.update(sites).set({ name: "hacked" }).where(eq(sites.id, siteB.id)).returning());
    expect(updated).toHaveLength(0);

    await expect(
      withTenant(t.db, orgA, (tx) => tx.insert(sites).values({ organizationId: orgB, trackingId: "ZZ1234", name: "x" })),
    ).rejects.toSatisfy(isRlsViolation);

    const deleted = await withTenant(t.db, orgA, (tx) => softDeleteSite(tx, orgB, siteB.id));
    expect(deleted).toBe(false);

    // unknown tenant context sees nothing
    const nothing = await withTenant(t.db, "00000000-0000-4000-8000-000000000000", (tx) => tx.select().from(sites));
    expect(nothing).toHaveLength(0);

    // the data-plane role sees both (server-resolved context only)
    const all = await withWorker(t.db, (tx) => tx.select({ id: sites.id }).from(sites));
    expect(all.map((s) => s.id)).toEqual(expect.arrayContaining([siteA.id, siteB.id]));
  });

  it("applies RLS to the partitioned event store", async () => {
    const site = await withTenant(t.db, orgA, (tx) => createSite(tx, { organizationId: orgA, name: "E", primaryDomain: null, createdBy: null }));
    const now = new Date();
    await withWorker(t.db, (tx) =>
      tx.insert(events).values({
        eventId: `01HEVENT${Date.now()}`,
        sourceEventId: `src-${Date.now()}`,
        organizationId: orgA,
        siteId: site.id,
        siteTrackingId: site.trackingId,
        environmentId: site.id,
        name: "page_view",
        isStandard: true,
        category: "engagement",
        serverTs: now,
        consent: { granted: ["necessary", "analytics"], source: "api" },
        source: "browser",
        sourceVerified: false,
        sdkVersion: "1.0.0",
        schemaVersion: "1.0.0",
        provenance: {},
        processingState: "normalized",
        isBillable: true,
        isBot: false,
      }),
    );
    const mine = await withTenant(t.db, orgA, (tx) => tx.select({ n: sql<number>`count(*)::int` }).from(events).where(eq(events.siteId, site.id)));
    const theirs = await withTenant(t.db, orgB, (tx) => tx.select({ n: sql<number>`count(*)::int` }).from(events).where(eq(events.siteId, site.id)));
    expect(mine[0]?.n).toBe(1);
    expect(theirs[0]?.n).toBe(0);
    const partition = await t.pool.query<{ tableoid: string }>(`SELECT tableoid::regclass::text AS tableoid FROM events WHERE site_id = $1`, [site.id]);
    expect(partition.rows[0]?.tableoid).toMatch(/^events_\d{6}$/);
  });
});

describe("tracking ids", () => {
  it("allocates unique, valid ids under concurrency and never recycles them", async () => {
    const created = await Promise.all(
      Array.from({ length: 40 }, (_, i) =>
        withTenant(t.db, orgA, (tx) => createSite(tx, { organizationId: orgA, name: `c${i}`, primaryDomain: null, createdBy: null })),
      ),
    );
    const ids = created.map((s) => s.trackingId);
    expect(new Set(ids).size).toBe(40);
    for (const id of ids) expect(id).toMatch(TRACKING_ID_REGEX);
    const victim = created[0]!;
    expect(await withTenant(t.db, orgA, (tx) => softDeleteSite(tx, orgA, victim.id))).toBe(true);
    await expect(
      withTenant(t.db, orgA, (tx) => tx.insert(sites).values({ organizationId: orgA, trackingId: victim.trackingId, name: "reuse" })),
    ).rejects.toSatisfy(isUniqueViolation);
  });

  it("retries atomically on a real unique-index collision", async () => {
    const existing = await withTenant(t.db, orgA, (tx) => createSite(tx, { organizationId: orgA, name: "x", primaryDomain: null, createdBy: null }));
    let calls = 0;
    const fresh = "Q9Z4K7";
    const site = await withTenant(t.db, orgA, (tx) =>
      createWithUniqueTrackingId(
        (trackingId) =>
          tx.transaction(async (sp) => {
            calls++;
            const rows = await sp.insert(sites).values({ organizationId: orgA, trackingId, name: "retry" }).returning();
            return rows[0]!;
          }),
        isUniqueViolation,
        { generate: () => (calls === 0 ? existing.trackingId : fresh) },
      ),
    );
    expect(site.trackingId).toBe(fresh);
    expect(calls).toBe(2);
  });
});

describe("audit log", () => {
  it("is append-only", async () => {
    const id = await withTenant(t.db, orgA, (tx) => recordAudit(tx, { organizationId: orgA, actor: { kind: "system", name: "test" }, action: "test.append", targetType: "test" }));
    await expect(t.pool.query(`UPDATE audit_log SET action = 'x' WHERE id = $1`, [id])).rejects.toSatisfy(isRlsViolation);
    await expect(t.pool.query(`DELETE FROM audit_log WHERE id = $1`, [id])).rejects.toSatisfy(isRlsViolation);
    const other = await withTenant(t.db, orgB, (tx) => tx.select().from(auditLog).where(eq(auditLog.id, id)));
    expect(other).toHaveLength(0);
  });
});
