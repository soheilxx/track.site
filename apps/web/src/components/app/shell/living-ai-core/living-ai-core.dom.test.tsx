// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LivingAICore } from "./living-ai-core";
import { CORE_STATES, type CoreMotion, type CoreState } from "./types";
import { UPGRADE_MIN_ELAPSED_MS } from "./upgrade-gate";

/*
 * Client behaviour of the Living AI Core in a DOM without a GPU: tier selection, the upgrade timing
 * gate (load, ≥ 3 s, idle), constrained devices, the frame loop with an injected clock and a
 * hand-driven requestAnimationFrame, the frame-budget downgrade, context loss, pausing, lifecycle
 * cleanup and the geometry invariants (CLS 0). Timers are Vitest's fake timers (setTimeout only);
 * the injected clock is the navigation-start time base the gate measures against.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/* ------------------------------------------------------------------ fakes */

const raf = { queue: new Map<number, FrameRequestCallback>(), id: 0, cancelled: 0 };
function tick(ts = 0) {
  const callbacks = Array.from(raf.queue.values());
  raf.queue.clear();
  for (const cb of callbacks) cb(ts);
}

const idle = { callbacks: new Map<number, IdleRequestCallback>(), id: 0, cancelled: 0 };
function flushIdle() {
  const callbacks = Array.from(idle.callbacks.values());
  idle.callbacks.clear();
  for (const cb of callbacks) cb({ didTimeout: false, timeRemaining: () => 50 });
}

class FakeObserver {
  static instances: FakeObserver[] = [];
  disconnected = false;
  observed: Element[] = [];
  constructor(public callback: (entries: unknown[]) => void) {
    FakeObserver.instances.push(this);
  }
  observe(el: Element) {
    this.observed.push(el);
  }
  unobserve() {}
  disconnect() {
    this.disconnected = true;
  }
  takeRecords() {
    return [];
  }
}
class FakeIntersectionObserver extends FakeObserver {
  static list: FakeIntersectionObserver[] = [];
  constructor(cb: (entries: unknown[]) => void) {
    super(cb);
    FakeIntersectionObserver.list.push(this);
  }
}
class FakeResizeObserver extends FakeObserver {
  static list: FakeResizeObserver[] = [];
  constructor(cb: (entries: unknown[]) => void) {
    super(cb);
    FakeResizeObserver.list.push(this);
  }
}

const media = { reduced: false, coarse: false };
function fakeMatchMedia(query: string): MediaQueryList {
  const matches = query.includes("reduced-motion") ? media.reduced : query.includes("coarse") ? media.coarse : false;
  return { matches, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false } as MediaQueryList;
}

/** Device signals (`readDeviceHints`) and the document's load state; reset to an unconstrained, loaded desktop before every test. */
const device = { cores: 8 as number | undefined, deviceMemory: undefined as number | undefined, saveData: false, readyState: "complete" as DocumentReadyState };

interface FakeGl {
  calls: string[];
  [key: string]: unknown;
}
function fakeGl(): FakeGl {
  const calls: string[] = [];
  const rec = (name: string) => () => void calls.push(name);
  return {
    calls,
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    BLEND: 5,
    ONE: 6,
    ONE_MINUS_SRC_ALPHA: 7,
    COLOR_BUFFER_BIT: 8,
    TRIANGLES: 9,
    DEPTH_TEST: 10,
    createShader: () => ({}),
    shaderSource: rec("shaderSource"),
    compileShader: rec("compileShader"),
    getShaderParameter: () => true,
    getShaderInfoLog: () => "",
    deleteShader: rec("deleteShader"),
    createProgram: () => ({}),
    attachShader: rec("attachShader"),
    linkProgram: rec("linkProgram"),
    getProgramParameter: () => true,
    getProgramInfoLog: () => "",
    deleteProgram: rec("deleteProgram"),
    useProgram: rec("useProgram"),
    createVertexArray: () => ({}),
    bindVertexArray: rec("bindVertexArray"),
    deleteVertexArray: rec("deleteVertexArray"),
    getUniformLocation: () => ({}),
    viewport: rec("viewport"),
    enable: rec("enable"),
    disable: rec("disable"),
    blendFunc: rec("blendFunc"),
    clearColor: rec("clearColor"),
    clear: rec("clear"),
    uniform1f: rec("uniform1f"),
    uniform2f: rec("uniform2f"),
    uniform3fv: rec("uniform3fv"),
    uniform4fv: rec("uniform4fv"),
    drawArrays: rec("drawArrays"),
    getExtension: (name: string) => (name === "WEBGL_lose_context" ? { loseContext: rec("loseContext") } : null),
  };
}

let gl: FakeGl | null = null;
const listeners = { added: 0, removed: 0 };

/* ---------------------------------------------------------------- harness */

interface Mounted {
  container: HTMLDivElement;
  root: Root;
  render(props: { state: CoreState; motion: CoreMotion }): void;
  unmount(): void;
  core(): HTMLElement;
}

const clock = { t: 0 };
const now = () => clock.t;
/** The gate's 3 s mark on the injected clock. */
const T_UPGRADE = UPGRADE_MIN_ELAPSED_MS;

function mount(props: { state: CoreState; motion: CoreMotion; mode?: "docked" | "onboarding" }): Mounted {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const render = (p: { state: CoreState; motion: CoreMotion }) =>
    act(() => {
      root.render(<LivingAICore state={p.state} motion={p.motion} mode={props.mode ?? "docked"} now={now} />);
    });
  render(props);
  return {
    container,
    root,
    render,
    unmount: () =>
      act(() => {
        root.unmount();
        container.remove();
      }),
    core: () => container.querySelector<HTMLElement>('[data-testid="living-ai-core"]')!,
  };
}

const drawn = () => gl?.calls.filter((c) => c === "drawArrays").length ?? 0;

/**
 * Opens the upgrade gate (document loaded, the injected clock at ≥ 3 s, the bridging timer, the idle
 * callback) and lets the lazy renderer import, the first draw and the rAF-deferred tier flip settle:
 * while the renderer loads, the canvas is mounted and the tier is still `css`; loading ends with
 * `webgl` or with the canvas removed (unavailable / failed). Polls because the import time depends
 * on load. A mount that never requests the renderer (static tier, constrained device) passes through.
 */
async function settle(m: Mounted) {
  if (clock.t < T_UPGRADE) clock.t = T_UPGRADE;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(T_UPGRADE);
  });
  await act(async () => {
    flushIdle();
  });
  for (let i = 0; i < 500; i++) {
    const loading = m.container.querySelector("canvas") !== null && m.core().dataset.tier === "css";
    if (!loading) break;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      tick(clock.t);
    });
  }
}

beforeEach(() => {
  clock.t = 0;
  raf.queue.clear();
  raf.id = 0;
  raf.cancelled = 0;
  idle.callbacks.clear();
  idle.id = 0;
  idle.cancelled = 0;
  FakeObserver.instances = [];
  FakeIntersectionObserver.list = [];
  FakeResizeObserver.list = [];
  media.reduced = false;
  media.coarse = false;
  device.cores = 8;
  device.deviceMemory = undefined;
  device.saveData = false;
  device.readyState = "complete";
  gl = null;
  listeners.added = 0;
  listeners.removed = 0;

  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    raf.queue.set(++raf.id, cb);
    return raf.id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    if (raf.queue.delete(id)) raf.cancelled += 1;
  });
  vi.stubGlobal("requestIdleCallback", (cb: IdleRequestCallback) => {
    idle.callbacks.set(++idle.id, cb);
    return idle.id;
  });
  vi.stubGlobal("cancelIdleCallback", (id: number) => {
    if (idle.callbacks.delete(id)) idle.cancelled += 1;
  });
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  window.matchMedia = fakeMatchMedia;
  Object.defineProperty(navigator, "hardwareConcurrency", { configurable: true, get: () => device.cores });
  Object.defineProperty(navigator, "deviceMemory", { configurable: true, get: () => device.deviceMemory });
  Object.defineProperty(navigator, "connection", { configurable: true, get: () => (device.saveData ? { saveData: true } : undefined) });
  Object.defineProperty(document, "readyState", { configurable: true, get: () => device.readyState });
  HTMLCanvasElement.prototype.getContext = function getContext() {
    return gl as unknown as RenderingContext | null;
  } as typeof HTMLCanvasElement.prototype.getContext;
  const add = document.addEventListener.bind(document);
  const remove = document.removeEventListener.bind(document);
  vi.spyOn(document, "addEventListener").mockImplementation((...args: Parameters<typeof add>) => {
    if (args[0] === "visibilitychange") listeners.added += 1;
    return add(...args);
  });
  vi.spyOn(document, "removeEventListener").mockImplementation((...args: Parameters<typeof remove>) => {
    if (args[0] === "visibilitychange") listeners.removed += 1;
    return remove(...args);
  });
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.body.innerHTML = "";
});

/* ------------------------------------------------------------------ tests */

describe("tier selection in the DOM", () => {
  it("hydrates on the CSS tier and stays there when WebGL is unavailable", async () => {
    const m = mount({ state: "idle", motion: "full" });
    expect(m.core().dataset.tier).toBe("css"); // hydrated, renderer not requested yet → CSS
    expect(idle.callbacks.size).toBe(0); // the gate waits for the 3 s mark first
    expect(vi.getTimerCount()).toBe(1);
    await settle(m);
    expect(m.core().dataset.tier).toBe("css");
    expect(m.container.querySelector("canvas")).toBeNull();
    expect(raf.queue.size).toBe(0);
    m.unmount();
  });

  it("stays static under prefers-reduced-motion, `reduced` and `off` without arming the gate or requesting a single frame", async () => {
    media.reduced = true;
    const a = mount({ state: "working", motion: "system" });
    expect(a.core().dataset.tier).toBe("static");
    expect(idle.callbacks.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    a.unmount();
    media.reduced = false;
    for (const motion of ["reduced", "off"] as const) {
      const m = mount({ state: "working", motion });
      expect(m.core().dataset.tier).toBe("static");
      expect(idle.callbacks.size).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
      expect(m.container.querySelector("canvas")).toBeNull();
      m.unmount();
    }
    expect(raf.id).toBe(0);
  });

  it("`full` animates even when the OS asks for reduced motion", async () => {
    media.reduced = true;
    const m = mount({ state: "idle", motion: "full" });
    expect(m.core().dataset.tier).toBe("css");
    m.unmount();
  });

  it("switches to static at once when the preference changes to off, and back", async () => {
    const m = mount({ state: "idle", motion: "full" });
    m.render({ state: "idle", motion: "off" });
    expect(m.core().dataset.tier).toBe("static");
    expect(m.core().dataset.pref).toBe("off");
    m.render({ state: "idle", motion: "system" });
    expect(m.core().dataset.tier).toBe("css");
    m.unmount();
  });
});

describe("upgrade timing gate (D17)", () => {
  it("keeps the CSS tier through the load window: no renderer request before the load event, the 3 s mark and an idle period", async () => {
    gl = fakeGl();
    device.readyState = "loading";
    clock.t = 3500;
    const m = mount({ state: "idle", motion: "system" });
    expect(m.core().dataset.tier).toBe("css");
    expect(idle.callbacks.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(m.container.querySelector("canvas")).toBeNull();
    // the load event arrives after the 3 s mark: the idle callback is requested, nothing is loaded yet
    device.readyState = "complete";
    act(() => {
      window.dispatchEvent(new Event("load"));
    });
    expect(idle.callbacks.size).toBe(1);
    expect(m.container.querySelector("canvas")).toBeNull();
    expect(gl.calls).toHaveLength(0);
    await settle(m);
    expect(m.core().dataset.tier).toBe("webgl");
    m.unmount();
  });

  it("bridges the time to the 3 s mark with a timer and re-checks the injected clock when it fires", () => {
    const m = mount({ state: "idle", motion: "system" }); // navigation start: t = 0, document loaded
    expect(vi.getTimerCount()).toBe(1);
    expect(idle.callbacks.size).toBe(0);
    // the timer fires but the clock has not reached 3 s: re-armed, still no idle request
    act(() => {
      vi.advanceTimersByTime(T_UPGRADE);
    });
    expect(idle.callbacks.size).toBe(0);
    expect(vi.getTimerCount()).toBe(1);
    clock.t = T_UPGRADE;
    act(() => {
      vi.advanceTimersByTime(T_UPGRADE);
    });
    expect(idle.callbacks.size).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(m.container.querySelector("canvas")).toBeNull(); // only the idle callback starts the load
    m.unmount();
    expect(idle.callbacks.size).toBe(0);
    expect(idle.cancelled).toBe(1);
  });

  it("draws the first WebGL frame before the tier flips one frame later, so the cross-fade starts from a painted canvas", async () => {
    gl = fakeGl();
    clock.t = T_UPGRADE;
    const m = mount({ state: "working", motion: "full" });
    expect(idle.callbacks.size).toBe(1);
    await act(async () => {
      flushIdle();
    });
    // loading: canvas mounted (transparent), tier still css
    expect(m.container.querySelector("canvas")).not.toBeNull();
    expect(m.core().dataset.tier).toBe("css");
    for (let i = 0; i < 500 && raf.queue.size === 0; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
    }
    expect(drawn()).toBe(1); // the first picture, before any tier change
    expect(m.core().dataset.tier).toBe("css");
    expect(raf.queue.size).toBe(1); // the deferred flip
    act(() => tick(clock.t));
    expect(m.core().dataset.tier).toBe("webgl");
    expect(raf.queue.size).toBe(1); // the frame loop
    m.unmount();
  });
});

describe("constrained devices", () => {
  const cases: Array<[label: string, apply: () => void]> = [
    ["coarse pointer", () => void (media.coarse = true)],
    ["data saver", () => void (device.saveData = true)],
    ["≤ 4 GiB memory", () => void (device.deviceMemory = 4)],
    ["≤ 4 cores", () => void (device.cores = 4)],
  ];

  it.each(cases)("%s: `system` stays on CSS without arming the gate, `full` upgrades", async (_label, apply) => {
    apply();
    gl = fakeGl();
    clock.t = T_UPGRADE;
    const a = mount({ state: "idle", motion: "system" });
    expect(a.core().dataset.tier).toBe("css");
    expect(idle.callbacks.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    await settle(a);
    expect(a.core().dataset.tier).toBe("css");
    expect(a.container.querySelector("canvas")).toBeNull();
    expect(gl.calls).toHaveLength(0);
    a.unmount();

    const b = mount({ state: "idle", motion: "full" });
    expect(idle.callbacks.size).toBe(1);
    await settle(b);
    expect(b.core().dataset.tier).toBe("webgl");
    b.unmount();
  });

  it("unknown memory / core counts do not count as constrained", async () => {
    device.cores = undefined;
    device.deviceMemory = undefined;
    gl = fakeGl();
    clock.t = T_UPGRADE;
    const m = mount({ state: "idle", motion: "system" });
    await settle(m);
    expect(m.core().dataset.tier).toBe("webgl");
    m.unmount();
  });

  it("releases the renderer when `full` becomes `system` on a constrained device and gates a later `full` again", async () => {
    media.coarse = true;
    gl = fakeGl();
    clock.t = T_UPGRADE;
    const m = mount({ state: "idle", motion: "full" });
    await settle(m);
    expect(m.core().dataset.tier).toBe("webgl");
    m.render({ state: "idle", motion: "system" });
    expect(m.core().dataset.tier).toBe("css");
    expect(m.container.querySelector("canvas")).toBeNull();
    expect(gl.calls).toContain("loseContext");
    expect(raf.queue.size).toBe(0);
    expect(idle.callbacks.size).toBe(0);
    // back to `full`: the idle gate runs again and the canvas cross-fades in from the CSS tier
    m.render({ state: "idle", motion: "full" });
    expect(m.core().dataset.tier).toBe("css");
    expect(idle.callbacks.size).toBe(1);
    gl = fakeGl();
    await settle(m);
    expect(m.core().dataset.tier).toBe("webgl");
    m.unmount();
  });
});

describe("enhanced renderer", () => {
  it("loads WebGL after the gate, draws with the injected clock and caps the effect at ~30 fps", async () => {
    gl = fakeGl();
    const m = mount({ state: "working", motion: "full" });
    await settle(m);
    expect(m.core().dataset.tier).toBe("webgl");
    expect(m.container.querySelector("canvas")).not.toBeNull();
    expect(gl.calls.filter((c) => c === "linkProgram")).toHaveLength(1);
    const before = drawn();
    // 60 Hz display for one second: at most ~30 rendered frames
    const t0 = clock.t;
    for (let i = 1; i <= 60; i++) {
      clock.t = t0 + i * (1000 / 60);
      tick(clock.t);
    }
    const frames = drawn() - before;
    expect(frames).toBeGreaterThanOrEqual(25);
    expect(frames).toBeLessThanOrEqual(31);
    m.unmount();
  });

  it("falls back to CSS silently when the frame budget is missed persistently, then releases the context", async () => {
    gl = fakeGl();
    const m = mount({ state: "idle", motion: "full" });
    await settle(m);
    expect(m.core().dataset.tier).toBe("webgl");
    // every frame arrives 200 ms late (main thread contention)
    for (let i = 1; i <= 60 && m.core().dataset.tier === "webgl"; i++) {
      clock.t += 200;
      act(() => tick(clock.t));
    }
    expect(m.core().dataset.tier).toBe("css");
    expect(raf.queue.size).toBe(0); // loop stopped
    expect(m.container.querySelector("canvas")).not.toBeNull(); // fading out
    expect(gl.calls).not.toContain("loseContext");
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(m.container.querySelector("canvas")).toBeNull();
    expect(gl.calls).toContain("loseContext");
    expect(gl.calls).toContain("deleteProgram");
    // no further attempt in this mount
    expect(idle.callbacks.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    m.unmount();
  });

  it("switches to CSS instantly on webglcontextlost", async () => {
    gl = fakeGl();
    const m = mount({ state: "idle", motion: "full" });
    await settle(m);
    const canvas = m.container.querySelector("canvas")!;
    act(() => {
      canvas.dispatchEvent(new Event("webglcontextlost"));
    });
    expect(m.core().dataset.tier).toBe("css");
    expect(m.container.querySelector("canvas")).toBeNull();
    expect(raf.queue.size).toBe(0);
    expect(idle.callbacks.size).toBe(0); // no retry in this mount
    m.unmount();
  });

  it("uses CSS when the renderer cannot be initialised (shader compile failure)", async () => {
    gl = fakeGl();
    gl.getShaderParameter = () => false;
    const m = mount({ state: "idle", motion: "full" });
    await settle(m);
    expect(m.core().dataset.tier).toBe("css");
    expect(m.container.querySelector("canvas")).toBeNull();
    expect(gl.calls).toContain("deleteShader");
    m.unmount();
  });

  it("pauses completely while the tab is hidden or the panel is off-screen and resumes afterwards", async () => {
    gl = fakeGl();
    const m = mount({ state: "idle", motion: "full" });
    await settle(m);
    clock.t += 40;
    tick(clock.t);
    const visibleFrames = drawn();
    expect(visibleFrames).toBeGreaterThan(0);

    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(raf.queue.size).toBe(0);
    for (let i = 0; i < 10; i++) {
      clock.t += 40;
      tick(clock.t);
    }
    expect(drawn()).toBe(visibleFrames);

    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(raf.queue.size).toBe(1);
    clock.t += 40;
    tick(clock.t);
    clock.t += 40;
    tick(clock.t);
    expect(drawn()).toBeGreaterThan(visibleFrames);

    const io = FakeIntersectionObserver.list[0]!;
    io.callback([{ isIntersecting: false }]);
    expect(raf.queue.size).toBe(0);
    io.callback([{ isIntersecting: true }]);
    expect(raf.queue.size).toBe(1);
    m.unmount();
  });

  it("changes state through the machine without touching the canvas or React per frame", async () => {
    gl = fakeGl();
    const m = mount({ state: "idle", motion: "full" });
    await settle(m);
    const canvas = m.container.querySelector("canvas");
    for (const state of CORE_STATES) {
      m.render({ state, motion: "full" });
      expect(m.core().dataset.state).toBe(state);
      expect(m.container.querySelector("canvas")).toBe(canvas);
    }
    m.unmount();
  });
});

describe("lifecycle cleanup", () => {
  it("releases rAF, idle callback, observers, listeners, timers, shaders, program and the context on unmount", async () => {
    gl = fakeGl();
    const canvasListeners = { added: 0, removed: 0 };
    const addCanvas = HTMLCanvasElement.prototype.addEventListener;
    const removeCanvas = HTMLCanvasElement.prototype.removeEventListener;
    HTMLCanvasElement.prototype.addEventListener = function (this: HTMLCanvasElement, ...args: Parameters<typeof addCanvas>) {
      if (args[0] === "webglcontextlost") canvasListeners.added += 1;
      return addCanvas.apply(this, args);
    } as typeof addCanvas;
    HTMLCanvasElement.prototype.removeEventListener = function (this: HTMLCanvasElement, ...args: Parameters<typeof removeCanvas>) {
      if (args[0] === "webglcontextlost") canvasListeners.removed += 1;
      return removeCanvas.apply(this, args);
    } as typeof removeCanvas;
    try {
      const m = mount({ state: "working", motion: "full" });
      await settle(m);
      expect(m.core().dataset.tier).toBe("webgl");
      expect(raf.queue.size).toBe(1);
      expect(FakeIntersectionObserver.list).toHaveLength(1);
      expect(FakeResizeObserver.list).toHaveLength(1);
      expect(listeners.added).toBe(1);
      expect(canvasListeners.added).toBe(1);

      m.unmount();

      expect(raf.queue.size).toBe(0);
      expect(raf.cancelled).toBe(1);
      expect(FakeIntersectionObserver.list[0]!.disconnected).toBe(true);
      expect(FakeResizeObserver.list[0]!.disconnected).toBe(true);
      expect(listeners.removed).toBe(listeners.added);
      expect(canvasListeners.removed).toBe(canvasListeners.added);
      expect(gl.calls).toContain("deleteProgram");
      expect(gl.calls.filter((c) => c === "deleteShader")).toHaveLength(2);
      expect(gl.calls).toContain("deleteVertexArray");
      expect(gl.calls).toContain("loseContext");
      expect(vi.getTimerCount()).toBe(0);
      // frames requested after unmount would be a leak
      tick(clock.t + 100);
      expect(raf.queue.size).toBe(0);
    } finally {
      HTMLCanvasElement.prototype.addEventListener = addCanvas;
      HTMLCanvasElement.prototype.removeEventListener = removeCanvas;
    }
  });

  it("cancels the gate's timer, load listener or idle request when unmounted before the renderer loaded", () => {
    // waiting for the 3 s mark
    const a = mount({ state: "idle", motion: "full" });
    expect(vi.getTimerCount()).toBe(1);
    a.unmount();
    expect(vi.getTimerCount()).toBe(0);

    // waiting for the load event
    device.readyState = "loading";
    clock.t = T_UPGRADE;
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const b = mount({ state: "idle", motion: "full" });
    expect(idle.callbacks.size).toBe(0);
    b.unmount();
    expect(removeSpy.mock.calls.some((call) => call[0] === "load")).toBe(true);
    act(() => {
      window.dispatchEvent(new Event("load"));
    });
    expect(idle.callbacks.size).toBe(0);
    device.readyState = "complete";

    // waiting for the idle callback
    const c = mount({ state: "idle", motion: "full" });
    expect(idle.callbacks.size).toBe(1);
    c.unmount();
    expect(idle.callbacks.size).toBe(0);
    expect(idle.cancelled).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels the deferred tier flip when unmounted between the first draw and the next frame", async () => {
    gl = fakeGl();
    clock.t = T_UPGRADE;
    const m = mount({ state: "idle", motion: "full" });
    await act(async () => {
      flushIdle();
    });
    for (let i = 0; i < 500 && raf.queue.size === 0; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
    }
    expect(raf.queue.size).toBe(1);
    m.unmount();
    expect(raf.queue.size).toBe(0);
    expect(raf.cancelled).toBe(1);
    expect(gl.calls).toContain("loseContext");
  });
});

describe("geometry invariants (CLS 0)", () => {
  const signature = (el: HTMLElement) =>
    Array.from(el.querySelectorAll<HTMLElement>("*"))
      .concat(el)
      .map((node) => `${node.tagName}.${node.className}|${node.getAttribute("style") ?? ""}`)
      .join("\n");

  it("keeps the element tree, classes and inline styles identical across every state on the static and CSS tiers", () => {
    for (const motion of ["off", "full"] as const) {
      const m = mount({ state: "idle", motion });
      const base = signature(m.core());
      expect(base).not.toContain("|px");
      expect(m.core().getAttribute("style")).toBeNull();
      for (const state of CORE_STATES) {
        m.render({ state, motion });
        expect(signature(m.core())).toBe(base);
        expect(m.core().getAttribute("aria-hidden")).toBe("true");
      }
      m.unmount();
    }
  });

  it("never gives the layer or its children inline geometry; the canvas only carries its backing-store size", async () => {
    gl = fakeGl();
    const m = mount({ state: "idle", motion: "full" });
    await settle(m);
    for (const node of Array.from(m.core().querySelectorAll<HTMLElement>("*")).concat(m.core())) {
      expect(node.getAttribute("style")).toBeNull();
      if (node.tagName !== "CANVAS") {
        expect(node.getAttribute("width")).toBeNull();
        expect(node.getAttribute("height")).toBeNull();
      }
    }
    m.unmount();
  });
});
