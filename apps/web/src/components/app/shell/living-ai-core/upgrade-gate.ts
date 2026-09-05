/**
 * Timing gate of the WebGL upgrade (docs/15-living-ai-core.md §2 "tier selection", defect D17 of
 * docs/16): the CSS tier renders first, and the enhanced renderer is only *requested* once all
 * three conditions hold —
 *
 *  1. the document is fully loaded (`readyState === "complete"`, else the `load` event),
 *  2. at least `UPGRADE_MIN_ELAPSED_MS` have passed since navigation start on the injected clock
 *     (`performance.now()` by default, which counts from the navigation), and
 *  3. the main thread has been idle (`requestIdleCallback` with a timeout; a short timer where the
 *     API is missing, e.g. WebKit).
 *
 * So the renderer chunk, its shader compile and its first frames never run inside the first-paint /
 * load window that the mobile Lighthouse run measures. The gate is pure: every primitive is
 * injected, which makes it deterministic in tests; `browserUpgradeEnv` binds the DOM.
 */

/** Earliest moment after navigation start at which the WebGL upgrade may be requested. */
export const UPGRADE_MIN_ELAPSED_MS = 3000;
/** `requestIdleCallback` timeout after the other two conditions hold (a busy main thread still gets the upgrade eventually). */
export const UPGRADE_IDLE_TIMEOUT_MS = 4000;
/** Delay used instead of an idle callback where `requestIdleCallback` does not exist. */
export const UPGRADE_IDLE_FALLBACK_MS = 500;

export interface UpgradeGateEnv {
  /** milliseconds since navigation start */
  now(): number;
  /** `document.readyState === "complete"` */
  loaded(): boolean;
  /** subscribes to the document's `load` event once; returns the unsubscribe */
  onLoad(callback: () => void): () => void;
  /** idle callback with a timeout; returns the cancel */
  requestIdle(callback: () => void, timeoutMs: number): () => void;
  /** plain timer; returns the cancel */
  setTimer(callback: () => void, delayMs: number): () => void;
}

export interface UpgradeGateOptions {
  minElapsedMs?: number;
  idleTimeoutMs?: number;
}

const noop = () => {};

/**
 * Calls `start` once the gate opens; returns a cancel function that releases whatever the gate is
 * waiting on (load listener, timer or idle callback). `start` is never called after cancel.
 */
export function scheduleWebglUpgrade(env: UpgradeGateEnv, start: () => void, options: UpgradeGateOptions = {}): () => void {
  const minElapsed = options.minElapsedMs ?? UPGRADE_MIN_ELAPSED_MS;
  const idleTimeout = options.idleTimeoutMs ?? UPGRADE_IDLE_TIMEOUT_MS;
  let cancel: () => void = noop;
  let done = false;
  let loadSeen = false;

  const step = () => {
    if (done) return;
    cancel = noop;
    if (!loadSeen && !env.loaded()) {
      cancel = env.onLoad(() => {
        loadSeen = true;
        step();
      });
      return;
    }
    loadSeen = true;
    // re-checked when the timer fires: the clock is injected, so the remainder is measured, not assumed
    const remaining = minElapsed - env.now();
    if (remaining > 0) {
      cancel = env.setTimer(step, remaining);
      return;
    }
    cancel = env.requestIdle(() => {
      if (done) return;
      done = true;
      cancel = noop;
      start();
    }, idleTimeout);
  };

  step();
  return () => {
    done = true;
    cancel();
    cancel = noop;
  };
}

/** The gate's primitives bound to the browser; `now` is the component's injectable clock (defaults to `performance.now`). */
export function browserUpgradeEnv(now: () => number): UpgradeGateEnv {
  return {
    now,
    loaded: () => typeof document === "undefined" || document.readyState === "complete",
    onLoad: (callback) => {
      if (typeof window === "undefined") return noop;
      window.addEventListener("load", callback, { once: true });
      return () => window.removeEventListener("load", callback);
    },
    requestIdle: (callback, timeoutMs) => {
      if (typeof requestIdleCallback === "function") {
        const id = requestIdleCallback(() => callback(), { timeout: timeoutMs });
        return () => {
          if (typeof cancelIdleCallback === "function") cancelIdleCallback(id);
        };
      }
      const id = setTimeout(callback, UPGRADE_IDLE_FALLBACK_MS);
      return () => clearTimeout(id);
    },
    setTimer: (callback, delayMs) => {
      const id = setTimeout(callback, delayMs);
      return () => clearTimeout(id);
    },
  };
}
