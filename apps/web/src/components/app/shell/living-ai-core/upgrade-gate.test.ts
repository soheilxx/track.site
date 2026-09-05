import { describe, expect, it } from "vitest";
import { UPGRADE_IDLE_TIMEOUT_MS, UPGRADE_MIN_ELAPSED_MS, scheduleWebglUpgrade, type UpgradeGateEnv } from "./upgrade-gate";

/*
 * The timing gate of the WebGL upgrade (docs/15 §2, D17) with every primitive faked: the renderer is
 * requested only after load, ≥ 3 s since navigation start on the injected clock and an idle period —
 * in that order — and a cancel releases whatever the gate is waiting on.
 */
function fakeEnv(initial: { t?: number; loaded?: boolean } = {}) {
  const state = {
    t: initial.t ?? 0,
    loaded: initial.loaded ?? true,
    loadListeners: [] as Array<() => void>,
    timers: [] as Array<{ cb: () => void; delay: number; cancelled: boolean }>,
    idles: [] as Array<{ cb: () => void; timeout: number; cancelled: boolean }>,
  };
  const env: UpgradeGateEnv = {
    now: () => state.t,
    loaded: () => state.loaded,
    onLoad: (cb) => {
      state.loadListeners.push(cb);
      return () => {
        state.loadListeners = state.loadListeners.filter((l) => l !== cb);
      };
    },
    setTimer: (cb, delay) => {
      const timer = { cb, delay, cancelled: false };
      state.timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
    requestIdle: (cb, timeout) => {
      const idle = { cb, timeout, cancelled: false };
      state.idles.push(idle);
      return () => {
        idle.cancelled = true;
      };
    },
  };
  const pending = {
    timers: () => state.timers.filter((x) => !x.cancelled),
    idles: () => state.idles.filter((x) => !x.cancelled),
  };
  const fire = {
    load: () => {
      state.loaded = true;
      const listeners = state.loadListeners;
      state.loadListeners = [];
      for (const l of listeners) l();
    },
    timer: () => {
      const next = pending.timers()[0];
      if (!next) throw new Error("no pending timer");
      next.cancelled = true;
      next.cb();
    },
    idle: () => {
      const next = pending.idles()[0];
      if (!next) throw new Error("no pending idle callback");
      next.cancelled = true;
      next.cb();
    },
  };
  return { env, state, pending, fire };
}

describe("scheduleWebglUpgrade", () => {
  it("waits for the load event first, then the 3 s mark, then an idle period", () => {
    const f = fakeEnv({ t: 100, loaded: false });
    let started = 0;
    scheduleWebglUpgrade(f.env, () => started++);
    expect(f.state.loadListeners).toHaveLength(1);
    expect(f.pending.timers()).toHaveLength(0);
    expect(f.pending.idles()).toHaveLength(0);

    f.state.t = 900;
    f.fire.load();
    // load done at 0.9 s: a timer bridges the remaining 2.1 s
    expect(f.pending.timers()).toHaveLength(1);
    expect(f.pending.timers()[0]!.delay).toBe(UPGRADE_MIN_ELAPSED_MS - 900);
    expect(f.pending.idles()).toHaveLength(0);

    f.state.t = UPGRADE_MIN_ELAPSED_MS;
    f.fire.timer();
    expect(f.pending.idles()).toHaveLength(1);
    expect(f.pending.idles()[0]!.timeout).toBe(UPGRADE_IDLE_TIMEOUT_MS);
    expect(started).toBe(0);

    f.fire.idle();
    expect(started).toBe(1);
    expect(f.pending.timers()).toHaveLength(0);
    expect(f.pending.idles()).toHaveLength(0);
  });

  it("skips straight to the idle callback when the document is loaded and 3 s have passed", () => {
    const f = fakeEnv({ t: 12_000, loaded: true });
    let started = 0;
    scheduleWebglUpgrade(f.env, () => started++);
    expect(f.state.loadListeners).toHaveLength(0);
    expect(f.pending.timers()).toHaveLength(0);
    expect(f.pending.idles()).toHaveLength(1);
    f.fire.idle();
    expect(started).toBe(1);
  });

  it("re-measures the clock when the timer fires instead of trusting the delay", () => {
    const f = fakeEnv({ t: 0 });
    scheduleWebglUpgrade(f.env, () => {});
    expect(f.pending.timers()[0]!.delay).toBe(UPGRADE_MIN_ELAPSED_MS);
    // the timer fires but the injected clock only reached 2 s: wait for the rest
    f.state.t = 2000;
    f.fire.timer();
    expect(f.pending.idles()).toHaveLength(0);
    expect(f.pending.timers()).toHaveLength(1);
    expect(f.pending.timers()[0]!.delay).toBe(1000);
    f.state.t = 3000;
    f.fire.timer();
    expect(f.pending.idles()).toHaveLength(1);
  });

  it("honours custom thresholds", () => {
    const f = fakeEnv({ t: 0 });
    scheduleWebglUpgrade(f.env, () => {}, { minElapsedMs: 500, idleTimeoutMs: 50 });
    expect(f.pending.timers()[0]!.delay).toBe(500);
    f.state.t = 500;
    f.fire.timer();
    expect(f.pending.idles()[0]!.timeout).toBe(50);
  });

  it("cancel releases the load listener, the timer or the idle callback and never starts afterwards", () => {
    let started = 0;
    const a = fakeEnv({ t: 0, loaded: false });
    const cancelA = scheduleWebglUpgrade(a.env, () => started++);
    cancelA();
    expect(a.state.loadListeners).toHaveLength(0);
    a.fire.load();
    expect(a.pending.timers()).toHaveLength(0);

    const b = fakeEnv({ t: 0 });
    const cancelB = scheduleWebglUpgrade(b.env, () => started++);
    expect(b.pending.timers()).toHaveLength(1);
    cancelB();
    expect(b.pending.timers()).toHaveLength(0);

    const c = fakeEnv({ t: 5000 });
    const cancelC = scheduleWebglUpgrade(c.env, () => started++);
    expect(c.pending.idles()).toHaveLength(1);
    const idle = c.state.idles[0]!;
    cancelC();
    expect(idle.cancelled).toBe(true);
    idle.cb(); // a late callback from the platform must be ignored
    expect(started).toBe(0);
  });

  it("starts exactly once even when cancel is called from inside start", () => {
    const f = fakeEnv({ t: 5000 });
    let started = 0;
    const cancel = scheduleWebglUpgrade(f.env, () => {
      started++;
      cancel();
    });
    f.fire.idle();
    expect(started).toBe(1);
  });
});
