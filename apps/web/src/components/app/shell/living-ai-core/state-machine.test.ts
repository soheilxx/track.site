import { describe, expect, it } from "vitest";
import { CORE_STATE_PRIORITY, PARAM_KEYS, STATE_PARAMS, createCoreStateMachine, resolveCoreState, type CoreSignals } from "./state-machine";
import { CORE_STATES, type CoreState } from "./types";

/** Injected clock: the machine never reads the wall clock. */
function clock(start = 0) {
  let t = start;
  return { now: () => t, set: (value: number) => void (t = value) };
}

const SIGNAL: Record<Exclude<CoreState, "idle">, keyof CoreSignals> = {
  blocked: "blocked",
  approval_required: "approvalRequired",
  working: "working",
  streaming: "streaming",
  success: "success",
  listening: "listening",
};

describe("resolveCoreState", () => {
  it("is idle without any signal", () => {
    expect(resolveCoreState({})).toBe("idle");
    expect(resolveCoreState({ working: false, listening: false })).toBe("idle");
  });

  it("maps every signal to its state", () => {
    for (const state of CORE_STATES) {
      if (state === "idle") continue;
      expect(resolveCoreState({ [SIGNAL[state]]: true })).toBe(state);
    }
  });

  it("applies the fixed priority error/blocked > approval > working > streaming > success > listening > idle for every pair", () => {
    expect(CORE_STATE_PRIORITY).toEqual(["blocked", "approval_required", "working", "streaming", "success", "listening", "idle"]);
    const ranked = CORE_STATE_PRIORITY.filter((s): s is Exclude<CoreState, "idle"> => s !== "idle");
    for (let i = 0; i < ranked.length; i++) {
      for (let j = i + 1; j < ranked.length; j++) {
        const higher = ranked[i]!;
        const lower = ranked[j]!;
        expect(resolveCoreState({ [SIGNAL[higher]]: true, [SIGNAL[lower]]: true })).toBe(higher);
      }
    }
  });
});

describe("state table", () => {
  it("idle breathes with 14–18 s per cycle at a low amplitude", () => {
    expect(STATE_PARAMS.idle.period).toBeGreaterThanOrEqual(14);
    expect(STATE_PARAMS.idle.period).toBeLessThanOrEqual(18);
    expect(STATE_PARAMS.idle.amplitude).toBeLessThanOrEqual(0.4);
  });

  it("approval nearly stops and shows the amber outline; blocked contracts with the edge accent; nothing strobes", () => {
    expect(STATE_PARAMS.approval_required.speed).toBeLessThan(0.1);
    expect(STATE_PARAMS.approval_required.outline).toBe(1);
    expect(STATE_PARAMS.blocked.speed).toBeLessThan(0.2);
    expect(STATE_PARAMS.blocked.contract).toBeGreaterThan(0.5);
    expect(STATE_PARAMS.blocked.edge).toBe(1);
    for (const state of CORE_STATES) expect(STATE_PARAMS[state].speed).toBeLessThanOrEqual(2);
  });

  it("listening leans one shape with a cyan halo; working merges; streaming only adds a light flow", () => {
    expect(STATE_PARAMS.listening.lean).toBe(1);
    expect(STATE_PARAMS.listening.halo).toBeGreaterThan(0.5);
    expect(STATE_PARAMS.working.merge).toBe(1);
    expect(STATE_PARAMS.streaming.glow).toBeGreaterThan(STATE_PARAMS.working.glow);
    expect(STATE_PARAMS.streaming.merge).toBeLessThan(0.5);
  });
});

describe("createCoreStateMachine", () => {
  it("commits a requested state on the next sample and adds no hold of its own (hysteresis belongs to the panel's state source)", () => {
    const c = clock();
    const m = createCoreStateMachine({ now: c.now });
    expect(m.sample().state).toBe("idle");
    m.request("working");
    // a request alone changes nothing: the frame loop samples the machine
    expect(m.current()).toBe("idle");
    expect(m.sample().state).toBe("working");
    expect(m.current()).toBe("working");
    // the source already debounced the state, so a further request is likewise committed at once
    c.set(20);
    m.request("streaming");
    expect(m.sample().state).toBe("streaming");
    expect(m.current()).toBe("streaming");
  });

  it("drops a request that returns to the committed state before it was sampled", () => {
    const c = clock();
    const m = createCoreStateMachine({ now: c.now });
    m.request("working");
    m.request("idle"); // back to the committed state → nothing pending
    c.set(50);
    const s = m.sample();
    expect(s.state).toBe("idle");
    expect(s.from).toBe("idle");
    expect(s.progress).toBe(1);
  });

  it("interpolates every parameter over 400–700 ms without a jump", () => {
    const c = clock();
    const m = createCoreStateMachine({ now: c.now });
    m.request("working");
    const start = m.sample();
    expect(start.state).toBe("working");
    expect(start.progress).toBe(0);
    for (const key of PARAM_KEYS) expect(start.params[key]).toBeCloseTo(STATE_PARAMS.idle[key], 6);

    let previous = start.params.merge;
    for (let t = 25; t < 550; t += 25) {
      c.set(t);
      const s = m.sample();
      expect(s.progress).toBeGreaterThan(0);
      expect(s.progress).toBeLessThan(1);
      expect(s.params.merge).toBeGreaterThanOrEqual(previous);
      previous = s.params.merge;
    }
    c.set(399);
    expect(m.sample().progress).toBeLessThan(1);
    c.set(550);
    const done = m.sample();
    expect(done.progress).toBe(1);
    for (const key of PARAM_KEYS) expect(done.params[key]).toBeCloseTo(STATE_PARAMS.working[key], 6);
    c.set(700);
    expect(m.sample().progress).toBe(1);
  });

  it("continues an interrupted transition from the current values (no flicker)", () => {
    const c = clock();
    const m = createCoreStateMachine({ now: c.now });
    m.request("working");
    m.sample();
    c.set(275); // half-way
    const mid = m.sample();
    expect(mid.params.merge).toBeGreaterThan(0.3);
    expect(mid.params.merge).toBeLessThan(0.7);
    m.request("idle");
    const afterCommit = m.sample();
    expect(afterCommit.state).toBe("idle");
    expect(afterCommit.from).toBe("working");
    expect(afterCommit.params.merge).toBeCloseTo(mid.params.merge, 6);
    c.set(275 + 550);
    expect(m.sample().params.merge).toBeCloseTo(0, 6);
  });

  it("never restarts a transition on repeated identical requests (no per-token reaction while streaming)", () => {
    const c = clock();
    const m = createCoreStateMachine({ now: c.now });
    m.request("streaming");
    m.sample();
    let last = 0;
    for (let t = 10; t <= 540; t += 10) {
      c.set(t);
      m.request("streaming");
      const s = m.sample();
      expect(s.progress).toBeGreaterThanOrEqual(last);
      last = s.progress;
    }
    c.set(550);
    expect(m.sample().progress).toBe(1);
    expect(m.sample().from).toBe("idle");
  });

  it("runs success as a one-shot wave of 600–900 ms and then returns to idle", () => {
    const c = clock();
    const m = createCoreStateMachine({ now: c.now });
    m.request("success");
    const s0 = m.sample();
    expect(s0.state).toBe("success");
    expect(s0.wave).toBe(0);
    c.set(400);
    expect(m.sample().wave).toBeCloseTo(0.5, 6);
    c.set(799);
    const almost = m.sample();
    expect(almost.state).toBe("success");
    expect(almost.wave).toBeLessThan(1);
    c.set(800);
    const back = m.sample();
    expect(back.state).toBe("idle");
    expect(back.from).toBe("success");
    expect(back.wave).toBe(-1);
    c.set(800 + 550);
    const settled = m.sample();
    expect(settled.progress).toBe(1);
    for (const key of PARAM_KEYS) expect(settled.params[key]).toBeCloseTo(STATE_PARAMS.idle[key], 6);
  });

  it("lets the success wave complete before a state requested meanwhile applies (the source may release success after 500 ms)", () => {
    const c = clock();
    const m = createCoreStateMachine({ now: c.now });
    m.request("success");
    m.sample();
    c.set(300);
    m.request("idle");
    const held = m.sample();
    expect(held.state).toBe("success");
    expect(held.wave).toBeCloseTo(0.375, 6);
    c.set(600);
    m.request("listening"); // the latest request wins once the wave has completed
    expect(m.sample().state).toBe("success");
    c.set(800);
    const after = m.sample();
    expect(after.state).toBe("listening");
    expect(after.from).toBe("success");
    expect(after.wave).toBe(-1);
    expect(after.progress).toBe(0);
    c.set(800 + 550);
    const settled = m.sample();
    expect(settled.progress).toBe(1);
    for (const key of PARAM_KEYS) expect(settled.params[key]).toBeCloseTo(STATE_PARAMS.listening[key], 6);
  });

  it("returns to idle after the wave when a request made during it was withdrawn", () => {
    const c = clock();
    const m = createCoreStateMachine({ now: c.now });
    m.request("success");
    m.sample();
    c.set(200);
    m.request("blocked");
    m.request("success"); // back to the committed state → the pending leave is cancelled
    c.set(800);
    const after = m.sample();
    expect(after.state).toBe("idle");
    expect(after.from).toBe("success");
  });

  it("integrates the breathing phase with the state's speed (approval almost stops, never snaps)", () => {
    const idle = clock();
    const busy = clock();
    const a = createCoreStateMachine({ now: idle.now });
    const b = createCoreStateMachine({ now: busy.now });
    b.request("approval_required");
    let phaseA = 0;
    let phaseB = 0;
    let previousB = 0;
    for (let t = 0; t <= 10_000; t += 50) {
      idle.set(t);
      busy.set(t);
      phaseA = a.sample().phase;
      phaseB = b.sample().phase;
      expect(phaseB).toBeGreaterThanOrEqual(previousB);
      expect(phaseB - previousB).toBeLessThan(0.01);
      previousB = phaseB;
    }
    expect(phaseA).toBeCloseTo(10 / STATE_PARAMS.idle.period, 2);
    expect(phaseB / phaseA).toBeLessThan(0.1);
  });

  it("is deterministic for the same clock sequence", () => {
    const run = () => {
      const c = clock();
      const m = createCoreStateMachine({ now: c.now });
      const out: number[] = [];
      const steps: [number, CoreState][] = [
        [0, "listening"],
        [300, "working"],
        [900, "streaming"],
        [1600, "success"],
        [2600, "idle"],
      ];
      for (const [t, state] of steps) {
        c.set(t);
        m.request(state);
        for (let dt = 0; dt < 300; dt += 33) {
          c.set(t + dt);
          const s = m.sample();
          out.push(s.params.merge, s.params.glow, s.phase, s.wave);
        }
      }
      return out;
    };
    expect(run()).toEqual(run());
  });
});
