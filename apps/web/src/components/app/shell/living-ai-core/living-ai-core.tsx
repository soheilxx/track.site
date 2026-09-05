"use client";

import { useEffect, useRef, useState } from "react";
import { layoutBlobs } from "./blobs";
import { isCoarsePointer, useHydrated, useReducedMotionPreference } from "./preference";
import { createCoreStateMachine, type CoreStateMachine } from "./state-machine";
import { createFrameBudget, effectiveMotion, frameInterval, renderScale, selectTier, type WebglStatus } from "./tier";
import type { CoreMode, LivingAICoreProps } from "./types";
import type { WebglRenderer } from "./webgl-renderer";

/**
 * Living AI Core (owner supplement §9): the calm, state-bound ambient layer of the Track AI panel.
 * Purely decorative — `aria-hidden`, `pointer-events: none`, absolutely positioned inside the
 * panel's ambient slot with `contain: strict` and its own compositing layer, so it never changes
 * panel geometry, scroll position, focus or hit areas (CLS 0). The localized activity text remains
 * the authoritative status; this layer only conveys *that* Track AI waits, listens, works, streams,
 * needs an approval, finished or is blocked.
 *
 * Tiers (progressive enhancement, see docs/15-living-ai-core.md):
 *  1. static  — SSR gradient from the theme tokens, visible before hydration; also the accessibility
 *               mode (`prefers-reduced-motion`, setting `reduced` / `off`): no continuous morphing,
 *               states are static colour accents;
 *  2. css     — three radial-gradient shapes moved by transform/opacity keyframes (globals.css);
 *  3. webgl   — WebGL2 metaballs, lazily loaded after idle, ≤ 30 fps (22 on coarse pointers),
 *               ≤ 1.5 DPR, uniforms only, paused when hidden or off-screen, downgraded silently on
 *               a persistently missed frame budget, context loss or init errors.
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
  const [webgl, setWebgl] = useState<WebglStatus>("unknown");
  const [downgraded, setDowngraded] = useState(false);
  const animated = hydrated && effectiveMotion(motion, prefersReduced) === "animated";
  const tier = selectTier({ motion, prefersReduced, hydrated, webgl, downgraded });
  const engineOn = animated && (webgl === "loading" || webgl === "ready");

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
  useEffect(() => {
    getMachine().request(state);
  }, [state]);

  // enhanced renderer: requested lazily after the browser is idle, never before hydration
  useEffect(() => {
    if (!animated || downgraded || webgl !== "unknown") return;
    let cancelled = false;
    const start = () => {
      if (!cancelled) setWebgl("loading");
    };
    let idle: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (typeof requestIdleCallback === "function") idle = requestIdleCallback(start, { timeout: 1500 });
    else timer = setTimeout(start, 300);
    return () => {
      cancelled = true;
      if (idle !== undefined && typeof cancelIdleCallback === "function") cancelIdleCallback(idle);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [animated, downgraded, webgl]);

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
    let running = false;
    let halted = false;
    let last = -Infinity;
    let visible = typeof document === "undefined" || document.visibilityState !== "hidden";
    let intersecting = true;
    const mobile = isCoarsePointer();
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
      const sample = machine.sample();
      renderer.draw(sample, layoutBlobs(sample, modeRef.current), isDark());
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
        setWebgl("ready");
        sync();
      })
      .catch(() => fail("unavailable"));

    return () => {
      disposed = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      io?.disconnect();
      ro?.disconnect();
      renderer?.dispose();
      renderer = null;
    };
  }, [engineOn]);

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
