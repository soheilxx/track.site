import { afterAll, describe, expect, it } from "vitest";
import { testDb } from "@track-site/db/testing";
import { PgQueue } from "./pg-queue.ts";

const t = testDb();
const q = new PgQueue(t.pool);

afterAll(async () => {
  await t.close();
});

describe("PgQueue (durable)", () => {
  it("enqueue is durable and receive uses visibility timeouts", async () => {
    const r = await q.enqueue("ingest", [
      { body: { organization_id: "11111111-1111-4111-8111-111111111111", n: 1 }, partitionKey: "o1:s1", dedupKey: "d1" },
      { body: { organization_id: "11111111-1111-4111-8111-111111111111", n: 1 }, partitionKey: "o1:s1", dedupKey: "d1" },
      { body: { organization_id: "22222222-2222-4222-8222-222222222222", n: 2 }, partitionKey: "o2:s2", delayMs: 30_000 },
    ]);
    expect(r.ids).toHaveLength(2);
    expect(r.skipped).toBe(1);
    const stats = await q.stats("ingest");
    expect(stats.ready).toBe(1);
    expect(stats.delayed).toBe(1);

    const got = await q.receive<{ n: number }>("ingest", { visibilityMs: 200 });
    expect(got).toHaveLength(1);
    expect(got[0]?.attempts).toBe(1);
    expect(await q.receive("ingest")).toHaveLength(0);
    await new Promise((res) => setTimeout(res, 250));
    const again = await q.receive<{ n: number }>("ingest", { visibilityMs: 5_000 });
    expect(again[0]?.attempts).toBe(2);
    await q.nack(again[0]!, { delayMs: 0, error: "retry me" });
    const third = await q.receive<{ n: number }>("ingest");
    expect(third[0]?.attempts).toBe(3);
    await q.ack(third[0]!);
    expect((await q.stats("ingest")).ready).toBe(0);
  });

  it("dead-letters and replays with partition isolation", async () => {
    await q.enqueue("dest.meta", [
      { body: { organization_id: "11111111-1111-4111-8111-111111111111" }, partitionKey: "o1:s1" },
      { body: { organization_id: "33333333-3333-4333-8333-333333333333" }, partitionKey: "hot-tenant" },
    ]);
    const hot = await q.receive("dest.meta", { partitionKey: "hot-tenant" });
    expect(hot).toHaveLength(1);
    expect(hot[0]?.partitionKey).toBe("hot-tenant");
    await q.deadLetter(hot[0]!, "permanent: invalid credentials");
    const dead = await q.listDeadLetters("dest.meta");
    expect(dead.map((d) => d.organizationId)).toContain("33333333-3333-4333-8333-333333333333");
    expect(await q.replayDeadLetters("dest.meta", { ids: [hot[0]!.id] })).toBe(1);
    expect((await q.stats("dest.meta")).deadLetters).toBe(0);
    const replayed = await q.receive("dest.meta", { partitionKey: "hot-tenant" });
    expect(replayed[0]?.id).toBe(hot[0]!.id);
    expect(replayed[0]?.attempts).toBe(1);
  });

  it("many concurrent consumers never receive the same message twice", async () => {
    await q.enqueue("jobs", Array.from({ length: 50 }, (_, i) => ({ body: { i }, partitionKey: `p${i % 5}` })));
    const batches = await Promise.all(Array.from({ length: 10 }, () => q.receive<{ i: number }>("jobs", { max: 10 })));
    const ids = batches.flat().map((m) => m.id);
    expect(ids).toHaveLength(50);
    expect(new Set(ids).size).toBe(50);
  });
});
