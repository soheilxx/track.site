import type { CoreMotion, CoreTier } from "./types";

/**
 * Tier selection and the frame-budget monitor of the Living AI Core (supplement §9 "Technische
 * Progressive-Enhancement-Architektur"). Pure functions — feature detection happens in the
 * component, the decision here is testable without a browser.
 */

export type WebglStatus = "unknown" | "loading" | "ready" | "unavailable" | "failed";

export interface TierInput {
  motion: CoreMotion;
  /** `prefers-reduced-motion: reduce` */
  prefersReduced: boolean;
  /** false on the server and until hydration completed (the static gradient is what SSR paints) */
  hydrated: boolean;
  webgl: WebglStatus;
  /** the frame budget was missed persistently: stay on CSS for the rest of the mount */
  downgraded: boolean;
  /** mobile-class / constrained device (`isConstrainedDevice`): CSS tier unless the setting is explicitly `full` */
  constrained?: boolean;
}

/**
 * Device signals that keep a mobile-class or constrained device on the CSS tier (docs/15 §2). All are
 * feature detection, no user-agent sniffing; unknown values (`null`) never count as constrained.
 */
export interface DeviceHints {
  /** `(pointer: coarse)` */
  coarsePointer: boolean;
  /** `navigator.connection.saveData` */
  saveData: boolean;
  /** `navigator.deviceMemory` (GiB, Chromium only) */
  deviceMemory: number | null;
  /** `navigator.hardwareConcurrency` */
  hardwareConcurrency: number | null;
}

export const NO_DEVICE_HINTS: DeviceHints = { coarsePointer: false, saveData: false, deviceMemory: null, hardwareConcurrency: null };

/** Coarse pointer, data saver, ≤ 4 GiB of memory or ≤ 4 logical cores → constrained. */
export function isConstrainedDevice(hints: DeviceHints): boolean {
  return (
    hints.coarsePointer ||
    hints.saveData ||
    (hints.deviceMemory !== null && hints.deviceMemory <= 4) ||
    (hints.hardwareConcurrency !== null && hints.hardwareConcurrency <= 4)
  );
}

/** Whether the WebGL tier may be attempted at all: never on a constrained device unless the user chose `full` explicitly. */
export function webglPermitted(motion: CoreMotion, hints: DeviceHints): boolean {
  return motion === "full" || !isConstrainedDevice(hints);
}

/**
 * Whether continuous ambient motion is allowed at all:
 *  - `off` and `reduced` never morph (static accents, `reduced` keeps short state cross-fades);
 *  - `system` follows the operating-system preference;
 *  - `full` is the user's explicit choice and animates even under an OS `reduce` preference.
 */
export function effectiveMotion(motion: CoreMotion, prefersReduced: boolean): "animated" | "static" {
  if (motion === "off" || motion === "reduced") return "static";
  if (motion === "full") return "animated";
  return prefersReduced ? "static" : "animated";
}

export function selectTier(input: TierInput): CoreTier {
  if (!input.hydrated) return "static";
  if (effectiveMotion(input.motion, input.prefersReduced) === "static") return "static";
  if (input.downgraded) return "css";
  if (input.constrained && input.motion !== "full") return "css";
  return input.webgl === "ready" ? "webgl" : "css";
}

export interface FrameBudgetOptions {
  /** target interval between rendered frames (ms); ~33 for 30 fps */
  targetMs: number;
  /** frames ignored after (re)start while shaders warm up */
  warmup?: number;
  /** sliding window size */
  window?: number;
  /** a frame is "missed" when its interval exceeds targetMs × missFactor */
  missFactor?: number;
  /** downgrade when the miss ratio inside the window reaches this value */
  maxMissRatio?: number;
}

export interface FrameBudget {
  /** Records the interval since the previous rendered frame; returns true when the renderer should downgrade. */
  record(intervalMs: number): boolean;
  reset(): void;
}

export function createFrameBudget(options: FrameBudgetOptions): FrameBudget {
  const warmup = options.warmup ?? 12;
  const size = options.window ?? 30;
  const limit = options.targetMs * (options.missFactor ?? 2.5);
  const maxMissRatio = options.maxMissRatio ?? 0.4;
  let seen = 0;
  const ring: boolean[] = [];
  let head = 0;
  let misses = 0;
  return {
    record(intervalMs) {
      seen += 1;
      if (seen <= warmup) return false;
      const miss = intervalMs > limit;
      if (ring.length < size) {
        ring.push(miss);
      } else {
        if (ring[head]) misses -= 1;
        ring[head] = miss;
        head = (head + 1) % size;
      }
      if (miss) misses += 1;
      return ring.length === size && misses / size >= maxMissRatio;
    },
    reset() {
      seen = 0;
      ring.length = 0;
      head = 0;
      misses = 0;
    },
  };
}

/** Effect frame rate: ≤ ~30 fps, ~22 fps on coarse-pointer (mobile) devices. */
export function frameInterval(mobile: boolean): number {
  return mobile ? 1000 / 22 : 1000 / 30;
}

/** Internal render resolution: device pixel ratio capped at 1.5 (1.25 on mobile), upscaled by the browser. */
export function renderScale(devicePixelRatio: number, mobile: boolean): number {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return Math.min(dpr, mobile ? 1.25 : 1.5);
}
