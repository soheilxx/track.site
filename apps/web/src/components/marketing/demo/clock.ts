/**
 * Injectable clock for time-based behaviour of the demo. The UI passes the real clock; tests pass a
 * fake one and advance it by hand, so every transition is deterministic.
 */
export interface DemoClock {
  now(): number;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const realClock: DemoClock = {
  now: () => (typeof performance !== "undefined" ? performance.now() : Date.now()),
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface FakeClock extends DemoClock {
  /** Move time forward, firing due timers in order. */
  advance(ms: number): void;
  /** Number of scheduled, not yet fired timers. */
  pending(): number;
}

export function createFakeClock(start = 0): FakeClock {
  let time = start;
  let nextId = 1;
  const timers = new Map<number, { at: number; callback: () => void }>();
  return {
    now: () => time,
    setTimeout: (callback, ms) => {
      const id = nextId;
      nextId += 1;
      timers.set(id, { at: time + Math.max(0, ms), callback });
      return id;
    },
    clearTimeout: (handle) => {
      if (typeof handle === "number") timers.delete(handle);
    },
    advance: (ms) => {
      const target = time + ms;
      for (;;) {
        let dueId: number | null = null;
        let dueAt = Number.POSITIVE_INFINITY;
        for (const [id, t] of timers) {
          if (t.at <= target && (t.at < dueAt || (t.at === dueAt && dueId !== null && id < dueId))) {
            dueAt = t.at;
            dueId = id;
          }
        }
        if (dueId === null) break;
        const timer = timers.get(dueId);
        timers.delete(dueId);
        time = dueAt;
        timer?.callback();
      }
      time = target;
    },
    pending: () => timers.size,
  };
}
