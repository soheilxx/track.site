import { describe, expect, it } from "vitest";
import { MemoryQueue } from "./memory-queue.ts";
import { SqsQueue } from "./sqs-queue.ts";
import { partitionKeyFor } from "./queue.ts";

describe("MemoryQueue", () => {
  it("enqueues, receives with visibility, acks and nacks", async () => {
    let t = 0;
    const q = new MemoryQueue(() => t);
    await q.enqueue("ingest", [
      { body: { n: 1 }, partitionKey: "a" },
      { body: { n: 2 }, partitionKey: "b", delayMs: 500 },
    ]);
    let got = await q.receive<{ n: number }>("ingest", { visibilityMs: 100 });
    expect(got.map((m) => m.body.n)).toEqual([1]);
    expect((await q.stats("ingest")).inFlight).toBe(1);
    t = 150; // visibility expired -> message visible again with attempts 2
    got = await q.receive<{ n: number }>("ingest", { visibilityMs: 100 });
    expect(got[0]?.attempts).toBe(2);
    await q.nack(got[0]!, { delayMs: 1000, error: "boom" });
    t = 600;
    got = await q.receive<{ n: number }>("ingest");
    expect(got.map((m) => m.body.n)).toEqual([2]);
    await q.ack(got[0]!);
    t = 2000;
    got = await q.receive<{ n: number }>("ingest");
    expect(got.map((m) => m.body.n)).toEqual([1]);
  });

  it("deduplicates, isolates partitions and dead-letters with replay", async () => {
    const q = new MemoryQueue();
    const r = await q.enqueue("dest.meta", [
      { body: { organization_id: "o1" }, partitionKey: "o1:s1", dedupKey: "e1" },
      { body: { organization_id: "o1" }, partitionKey: "o1:s1", dedupKey: "e1" },
      { body: { organization_id: "o2" }, partitionKey: "o2:s9" },
    ]);
    expect(r.skipped).toBe(1);
    const hot = await q.receive("dest.meta", { partitionKey: "o2:s9" });
    expect(hot).toHaveLength(1);
    await q.deadLetter(hot[0]!, "permanent_error");
    const dead = await q.listDeadLetters("dest.meta");
    expect(dead).toHaveLength(1);
    expect(dead[0]?.organizationId).toBe("o2");
    expect(await q.replayDeadLetters("dest.meta")).toBe(1);
    expect((await q.stats("dest.meta")).deadLetters).toBe(0);
    expect((await q.stats("dest.meta")).ready).toBe(2);
  });

  it("builds partition keys with hot-tenant override", () => {
    expect(partitionKeyFor("o", "s")).toBe("o:s");
    expect(partitionKeyFor("o", "s", "hot-1")).toBe("hot-1");
  });
});

describe("SqsQueue (fake client contract)", () => {
  it("maps enqueue/receive/ack to SQS commands", async () => {
    const sent: Array<{ name: string; input: Record<string, unknown> }> = [];
    const fake = {
      send: async (cmd: { constructor: { name: string }; input: Record<string, unknown> }) => {
        sent.push({ name: cmd.constructor.name, input: cmd.input });
        if (cmd.constructor.name === "SendMessageBatchCommand") return { Successful: [], Failed: [] };
        if (cmd.constructor.name === "ReceiveMessageCommand") {
          return {
            Messages: [
              {
                Body: JSON.stringify({ id: "m1", body: { x: 1 }, partitionKey: "o:s" }),
                ReceiptHandle: "rh",
                Attributes: { ApproximateReceiveCount: "2", SentTimestamp: "1700000000000" },
              },
            ],
          };
        }
        return {};
      },
      destroy() {},
    };
    const q = new SqsQueue({ queueUrlPrefix: "https://sqs.eu-central-1.amazonaws.com/1/tracksite-", client: fake as never });
    const r = await q.enqueue("dest.meta", [{ body: { x: 1 }, partitionKey: "o:s", dedupKey: "e1" }]);
    expect(r.ids).toHaveLength(1);
    expect(sent[0]?.name).toBe("SendMessageBatchCommand");
    expect(sent[0]?.input.QueueUrl).toBe("https://sqs.eu-central-1.amazonaws.com/1/tracksite-dest-meta.fifo");
    const msgs = await q.receive<{ x: number }>("dest.meta");
    expect(msgs[0]).toMatchObject({ id: "m1", attempts: 2, receipt: "rh" });
    await q.ack(msgs[0]!);
    expect(sent.at(-1)?.name).toBe("DeleteMessageCommand");
  });
});
