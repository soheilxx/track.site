"use client";

import { useEffect, useRef, useState } from "react";
import { layoutBlobs } from "./blobs";
import { readDeviceHints, useHydrated, useReducedMotionPreference } from "./preference";
import { createCoreStateMachine, type CoreStateMachine } from "./state-machine";
import { createFrameBudget, effectiveMotion, frameInterval, isConstrainedDevice, renderScale, selectTier, webglPermitted, type WebglStatus } from "./tier";
import type { CoreMode, LivingAICoreProps } from "./types";
import { browserUpgradeEnv, scheduleWebglUpgrade } from "./upgrade-gate";
import type { WebglRenderer } from "./webgl-renderer";

/**
 * Living AI Core (owner supplement §9): the calm, state-bound ambient layer of the Track AI panel.
 * Purely decorative — `aria-hidden`, `pointer-events: none`, absolutely positioned inside the
 * panel's ambient slot with `contain: strict` and its own compositing layer, so it never changes
 * panel geometry, scroll position, focus or hit areas (CLS 0). The localized activity text remains
 * the authoritative status; this layer only conveys *that* Track AI waits, listens, works, streams,
 * needs an approval, finished or is blocked.
 *
 * Tiers (progressive enhancement, see docs/15-living-ai-core.md §2):
 *  1. static  — SSR gradient from the theme tokens, visible before hydration; also the accessibility
 *               mode (`prefers-reduced-motion`, setting `reduced` / `off`): no continuous morphing,
 *               states are static colour accents;
 *  2. css     — three radial-gradient shapes moved by transform/opacity keyframes (globals.css);
 *               always the first animated tier after hydration, and the final tier on constrained /
 *               mobile-class devices unless the setting is explicitly `full`;
 *  3. webgl   — WebGL2 metaballs, requested only after the page is fully loaded, ≥ 3 s after
 *               navigation start and an idle period (`upgrade-gate.ts`), cross-faded in over the
 *               CSS shapes (`--lac-t`, 600 ms); ≤ 30 fps (22 on coarse pointers), ≤ 1.5 DPR,
 *               uniforms only, paused when hidden or off-screen, downgraded silently on a
 *               persistently missed frame budget, context loss or init errors.
 *
 * No React state is touched per frame: the frame loop samples the pure state machine with the
 * injected clock and writes shader uniforms. State changes only update data attributes.
 */
const defaultNow = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/** Fade-out of the canvas before it is released after a downgrade (matches --lac-t in globals.css). */
const DOWNGRADE_FADE_MS = 700;

export function LivingAICore({ state, motion, mode, now }: LivingAICoreProps) {
  const prefersReduced = useReducedMotionPreference();
  const hydrated = useHydrated();
  // device signals are read once per mount; SSR sees "unknown" and paints the static tier regardless
  const [hints] = useState(readDeviceHints);
  const [webgl, setWebgl] = useState<WebglStatus>("unknown");
  const [downgraded, setDowngraded] = useState(false);
  const animated = hydrated && effectiveMotion(motion, prefersReduced) === "animated";
  const constrained = isConstrainedDevice(hints);
  const webglAllowed = webglPermitted(motion, hints);
  const engineWanted = animated && webglAllowed;
  const engineLive = webgl === "loading" || webgl === "ready";
  // a preference change that turns the engine off (motion `off` / `reduced`, or `full` → `system` on a constrained
  // device) forgets the renderer status right here (React's "adjust state on a prop change" pattern: the setter runs
  // during render, once), so the engine effect's cleanup releases the renderer in this commit and a later change back
  // goes through the gate and the cross-fade again instead of flipping the tier the moment the canvas mounts;
  // failures (`unavailable`, `failed`) are kept — they are never retried within a mount
  if (!engineWanted && engineLive) setWebgl("unknown");
  const tier = selectTier({ motion, prefersReduced, hydrated, webgl, downgraded, constrained });
  const engineOn = engineWanted && engineLive;

  const rootRef = useRef<HTMLDivElement>(null);
  const coreRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modeRef = useRef<CoreMode>(mode);
  const clockRef = useRef<() => number>(now ?? defaultNow);
  // the machine lives for the whole mount and reads the clock through the ref, so an updated `now` applies without re-creating it;
  // refs are only touched inside effects (never during render)
  const machineRef = useRef<CoreStateMachine | null>(null);
  const getMachine = () => (machineRef.current ??= createCoreStateMachine({ now: () => clockRef.current() }));

  useEffect(() => {
    clockRef.current = now ?? defaultNow;
  }, [now]);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  // the state arrives already debounced from the panel's one source (`useAssistantUiState`, 500 ms hold):
  // the machine commits it at the next frame without a hold of its own and only lets a running success wave finish
  useEffect(() => {
    getMachine().request(state);
  }, [state]);

  // enhanced renderer: the CSS tier is on screen first; the upgrade is requested through the timing gate
  // (document loaded, ≥ 3 s since navigation start, main thread idle) and never on a constrained device
  // unless the setting is `full`
  useEffect(() => {
    if (!animated || !webglAllowed || downgraded || webgl !== "unknown") return;
    return scheduleWebglUpgrade(browserUpgradeEnv(() => clockRef.current()), () => setWebgl("loading"));
  }, [animated, webglAllowed, downgraded, webgl]);

  // after a frame-budget downgrade the canvas fades out on the CSS tier, then the context is released
  useEffect(() => {
    if (!downgraded) return;
    const timer = setTimeout(() => setWebgl("unavailable"), DOWNGRADE_FADE_MS);
    return () => clearTimeout(timer);
  }, [downgraded]);

  // the engine: renderer, frame loop, observers — everything is released in the cleanup
  useEffect(() => {
    if (!engineOn) return;
    const canvas = canvasRef.current;
    const core = coreRef.current;
    const root = rootRef.current;
    const machine = getMachine();
    if (!canvas || !core || !root) {
      setWebgl("unavailable");
      return;
    }
    let disposed = false;
    let renderer: WebglRenderer | null = null;
    let raf = 0;
    let readyRaf = 0;
    let running = false;
    let halted = false;
    let last = -Infinity;
    let visible = typeof document === "undefined" || document.visibilityState !== "hidden";
    let intersecting = true;
    const mobile = hints.coarsePointer;
    const interval = frameInterval(mobile);
    const budget = createFrameBudget({ targetMs: interval });
    const isDark = () => document.documentElement.getAttribute("data-theme") === "dark";

    const stop = () => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };
    const fail = (status: WebglStatus) => {
      stop();
      if (!disposed) setWebgl(status);
    };
    const downgrade = () => {
      // the canvas fades out on the CSS tier and is released afterwards; visibility or intersection changes must not restart the loop meanwhile
      halted = true;
      stop();
      if (!disposed) setDowngraded(true);
    };
    const draw = () => {
      if (!renderer) return;
      const sample = machine.sample();
      renderer.draw(sample, layoutBlobs(sample, modeRef.current), isDark());
    };
    const frame = () => {
      raf = 0;
      if (!running || !renderer) return;
      raf = requestAnimationFrame(frame);
      const t = clockRef.current();
      if (t - last < interval - 0.5) return;
      if (last !== -Infinity && budget.record(t - last)) {
        downgrade();
        return;
      }
      last = t;
      draw();
    };
    const start = () => {
      if (running || disposed || halted || !renderer) return;
      running = true;
      last = -Infinity;
      budget.reset();
      raf = requestAnimationFrame(frame);
    };
    const sync = () => {
      if (visible && intersecting) start();
      else stop();
    };
    const onVisibility = () => {
      visible = document.visibilityState !== "hidden";
      sync();
    };
    document.addEventListener("visibilitychange", onVisibility);

    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver((entries) => {
        intersecting = entries.some((entry) => entry.isIntersecting);
        sync();
      });
      io.observe(root);
    }
    const resize = () => {
      if (!renderer) return;
      const rect = core.getBoundingClientRect();
      renderer.resize(rect.width, rect.height, renderScale(window.devicePixelRatio, mobile));
    };
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(resize);
      ro.observe(core);
    }

    import("./webgl-renderer")
      .then((mod) => {
        if (disposed) return;
        renderer = mod.createWebglRenderer(canvas, () => fail("failed"));
        if (!renderer) {
          fail("unavailable");
          return;
        }
        resize();
        // no visible jump: the first picture is drawn while the canvas is still transparent, and the tier flips one
        // frame later so the browser has a computed style for the canvas — the CSS shapes and the canvas then
        // cross-fade over --lac-t (globals.css)
        draw();
        readyRaf = requestAnimationFrame(() => {
          readyRaf = 0;
          if (disposed) return;
          setWebgl("ready");
          sync();
        });
      })
      .catch(() => fail("unavailable"));

    return () => {
      disposed = true;
      stop();
      if (readyRaf) cancelAnimationFrame(readyRaf);
      readyRaf = 0;
      document.removeEventListener("visibilitychange", onVisibility);
      io?.disconnect();
      ro?.disconnect();
      renderer?.dispose();
      renderer = null;
    };
  }, [engineOn, hints.coarsePointer]);

  return (
    <div ref={rootRef} className="lac" data-state={state} data-tier={tier} data-mode={mode} data-pref={motion} data-motion="essential" aria-hidden="true" data-testid="living-ai-core">
      <div ref={coreRef} className="lac-core" data-motion="essential">
        <div className="lac-base" data-motion="essential" />
        <div className="lac-css" data-motion="essential">
          <div className="lac-blob lac-blob-a" data-motion="essential">
            <i data-motion="essential" />
          </div>
          <div className="lac-blob lac-blob-b" data-motion="essential">
            <i data-motion="essential" />
          </div>
          <div className="lac-blob lac-blob-c" data-motion="essential">
            <i data-motion="essential" />
          </div>
          <div className="lac-halo" data-motion="essential" />
          <div className="lac-wave" data-motion="essential" />
        </div>
        {engineOn ? <canvas ref={canvasRef} className="lac-gl" data-motion="essential" /> : null}
      </div>
      <div className="lac-edge" data-motion="essential" />
    </div>
  );
}
