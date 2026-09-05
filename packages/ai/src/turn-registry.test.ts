import { describe, expect, it } from "vitest";
import { TurnRegistry, type TurnEnvelope } from "./turn-registry.ts";

type E = { type: string; n?: number };

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("turn registry (reconnectable stream, single execution)", () => {
  it("runs a turn once per key and lets later requests attach instead of re-running", async () => {
    const registry = new TurnRegistry<E>();
    let runs = 0;
    const gate = deferred();
    const run = async (emit: (e: E) => void) => {
      runs++;
      emit({ type: "a", n: 1 });
      await gate.promise;
      emit({ type: "b", n: 2 });
    };
    const first = registry.start("k", run);
    const second = registry.start("k", run);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(runs).toBe(1);
    expect(first.record).toBe(second.record);

    const seen: TurnEnvelope<E>[] = [];
    let ended = 0;
    const unsubscribe = registry.subscribe("k", 0, { onEvent: (e) => seen.push(e), onEnd: () => ended++ });
    expect(seen).toEqual([{ seq: 1, event: { type: "a", n: 1 } }]);
    gate.resolve();
    await flush();
    expect(seen.map((e) => e.seq)).toEqual([1, 2]);
    expect(ended).toBe(1);
    expect(registry.get("k")?.status).toBe("done");
    unsubscribe();
  });

  it("resumes after a given sequence number with exactly the unseen events", async () => {
    const registry = new TurnRegistry<E>();
    const gate = deferred();
    registry.start("k", async (emit) => {
      emit({ type: "a" });
      emit({ type: "b" });
      await gate.promise;
      emit({ type: "c" });
    });
    const late: number[] = [];
    let ended = 0;
    registry.subscribe("k", 1, { onEvent: (e) => late.push(e.seq), onEnd: () => ended++ });
    expect(late).toEqual([2]);
    gate.resolve();
    await flush();
    expect(late).toEqual([2, 3]);
    expect(ended).toBe(1);
    // a subscriber that arrives after the end still gets the replay and an immediate end
    const afterEnd: number[] = [];
    let endedLate = 0;
    registry.subscribe("k", 2, { onEvent: (e) => afterEnd.push(e.seq), onEnd: () => endedLate++ });
    expect(afterEnd).toEqual([3]);
    expect(endedLate).toBe(1);
  });

  it("unsubscribing stops live delivery without stopping the turn", async () => {
    const registry = new TurnRegistry<E>();
    const gate = deferred();
    registry.start("k", async (emit) => {
      emit({ type: "a" });
      await gate.promise;
      emit({ type: "b" });
    });
    const seen: number[] = [];
    const unsubscribe = registry.subscribe("k", 0, { onEvent: (e) => seen.push(e.seq), onEnd: () => undefined });
    unsubscribe();
    gate.resolve();
    await flush();
    expect(seen).toEqual([1]);
    expect(registry.get("k")?.events.map((e) => e.seq)).toEqual([1, 2]);
  });

  it("ends the turn when the run rejects and ignores emits afterwards", async () => {
    const registry = new TurnRegistry<E>();
    let leaked: ((e: E) => void) | null = null;
    registry.start("k", async (emit) => {
      leaked = emit;
      emit({ type: "a" });
      throw new Error("boom");
    });
    await flush();
    expect(registry.get("k")?.status).toBe("done");
    leaked!({ type: "late" });
    expect(registry.get("k")?.events).toHaveLength(1);
  });

  it("forgets finished turns after the ttl, caps the remembered turns and answers unknown keys with an immediate end", async () => {
    let now = 1_000;
    const registry = new TurnRegistry<E>({ ttlMs: 500, maxTurns: 2, now: () => now });
    registry.start("a", async () => undefined);
    registry.start("b", async () => undefined);
    registry.start("c", async () => undefined);
    await flush();
    expect(registry.size).toBe(2);
    now = 2_000;
    expect(registry.get("b")).toBeUndefined();
    expect(registry.size).toBe(0);
    let ended = 0;
    registry.subscribe("nope", 0, { onEvent: () => undefined, onEnd: () => ended++ });
    expect(ended).toBe(1);
  });

  it("caps the number of buffered events per turn", async () => {
    const registry = new TurnRegistry<E>({ maxEvents: 3 });
    registry.start("k", async (emit) => {
      for (let i = 0; i < 5; i++) emit({ type: "x", n: i });
    });
    await flush();
    expect(registry.get("k")?.events.map((e) => e.event.n)).toEqual([0, 1, 2]);
  });
});
