import { describe, expect, it } from "vitest";
import { NO_DEVICE_HINTS, createFrameBudget, effectiveMotion, frameInterval, isConstrainedDevice, renderScale, selectTier, webglPermitted, type DeviceHints, type TierInput } from "./tier";
import { CORE_MOTIONS } from "./types";

const base: TierInput = { motion: "system", prefersReduced: false, hydrated: true, webgl: "ready", downgraded: false };

describe("isConstrainedDevice / webglPermitted", () => {
  const cases: Array<[label: string, hints: Partial<DeviceHints>, constrained: boolean]> = [
    ["no signals", {}, false],
    ["coarse pointer", { coarsePointer: true }, true],
    ["data saver", { saveData: true }, true],
    ["4 GiB", { deviceMemory: 4 }, true],
    ["2 GiB", { deviceMemory: 2 }, true],
    ["8 GiB", { deviceMemory: 8 }, false],
    ["4 cores", { hardwareConcurrency: 4 }, true],
    ["8 cores", { hardwareConcurrency: 8 }, false],
    ["unknown memory and cores", { deviceMemory: null, hardwareConcurrency: null }, false],
  ];
  it.each(cases)("%s", (_label, hints, constrained) => {
    expect(isConstrainedDevice({ ...NO_DEVICE_HINTS, ...hints })).toBe(constrained);
  });

  it("permits the WebGL tier on unconstrained devices and, for `full` only, on constrained ones", () => {
    const mobile: DeviceHints = { ...NO_DEVICE_HINTS, coarsePointer: true };
    for (const motion of CORE_MOTIONS) expect(webglPermitted(motion, NO_DEVICE_HINTS)).toBe(true);
    expect(webglPermitted("full", mobile)).toBe(true);
    expect(webglPermitted("system", mobile)).toBe(false);
    expect(webglPermitted("reduced", mobile)).toBe(false);
    expect(webglPermitted("off", mobile)).toBe(false);
  });
});

describe("effectiveMotion", () => {
  it("follows the OS for `system`, is static for `reduced` and `off`, animated for `full` even under an OS reduce", () => {
    expect(effectiveMotion("system", false)).toBe("animated");
    expect(effectiveMotion("system", true)).toBe("static");
    expect(effectiveMotion("reduced", false)).toBe("static");
    expect(effectiveMotion("off", false)).toBe("static");
    expect(effectiveMotion("full", true)).toBe("animated");
  });
});

describe("selectTier", () => {
  it("is static on the server and until hydration, whatever else is true", () => {
    for (const motion of CORE_MOTIONS) expect(selectTier({ ...base, motion, hydrated: false })).toBe("static");
  });

  it("reduced motion (OS or setting) and `off` select the static accessibility mode", () => {
    expect(selectTier({ ...base, prefersReduced: true })).toBe("static");
    expect(selectTier({ ...base, motion: "reduced" })).toBe("static");
    expect(selectTier({ ...base, motion: "off" })).toBe("static");
  });

  it("falls back to CSS while WebGL is unknown, loading, unavailable, failed or lost", () => {
    for (const webgl of ["unknown", "loading", "unavailable", "failed"] as const) expect(selectTier({ ...base, webgl })).toBe("css");
  });

  it("uses WebGL only when the renderer is ready and the frame budget holds", () => {
    expect(selectTier(base)).toBe("webgl");
    expect(selectTier({ ...base, downgraded: true })).toBe("css");
    expect(selectTier({ ...base, motion: "full", prefersReduced: true })).toBe("webgl");
  });

  it("keeps constrained (mobile-class) devices on CSS unless the setting is explicitly `full`", () => {
    expect(selectTier({ ...base, constrained: true })).toBe("css");
    expect(selectTier({ ...base, constrained: true, motion: "full" })).toBe("webgl");
    expect(selectTier({ ...base, constrained: true, motion: "full", downgraded: true })).toBe("css");
    expect(selectTier({ ...base, constrained: true, motion: "off" })).toBe("static");
    expect(selectTier({ ...base, constrained: false })).toBe("webgl");
  });
});

describe("createFrameBudget", () => {
  it("ignores warm-up frames and downgrades only on persistent misses", () => {
    const budget = createFrameBudget({ targetMs: 33.3 });
    for (let i = 0; i < 12; i++) expect(budget.record(500)).toBe(false); // warm-up
    for (let i = 0; i < 29; i++) expect(budget.record(33)).toBe(false);
    expect(budget.record(33)).toBe(false); // window full, no misses
    // a few slow frames are tolerated
    for (let i = 0; i < 8; i++) expect(budget.record(200)).toBe(false);
    // persistent misses (≥ 40 % of the window) trigger the downgrade
    let downgraded = false;
    for (let i = 0; i < 10 && !downgraded; i++) downgraded = budget.record(200);
    expect(downgraded).toBe(true);
  });

  it("recovers after reset (a resumed tab starts a fresh window)", () => {
    const budget = createFrameBudget({ targetMs: 33.3, warmup: 0, window: 5, maxMissRatio: 0.4 });
    expect(budget.record(500)).toBe(false);
    expect(budget.record(500)).toBe(false);
    for (let i = 0; i < 3; i++) budget.record(33);
    expect(budget.record(500)).toBe(true);
    budget.reset();
    for (let i = 0; i < 5; i++) expect(budget.record(33)).toBe(false);
  });
});

describe("frame pacing and resolution", () => {
  it("caps the effect at ~30 fps and ~22 fps on coarse-pointer devices", () => {
    expect(frameInterval(false)).toBeGreaterThanOrEqual(1000 / 30 - 0.01);
    expect(frameInterval(true)).toBeGreaterThanOrEqual(1000 / 24);
    expect(frameInterval(true)).toBeLessThanOrEqual(1000 / 20);
  });

  it("limits the internal resolution to 1.5 DPR (1.25 on mobile) and tolerates bad values", () => {
    expect(renderScale(3, false)).toBe(1.5);
    expect(renderScale(3, true)).toBe(1.25);
    expect(renderScale(1, false)).toBe(1);
    expect(renderScale(Number.NaN, false)).toBe(1);
    expect(renderScale(0, true)).toBe(1);
  });
});
