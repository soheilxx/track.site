import type { CoreState } from "./types";

/**
 * Deterministic UI state machine of the Living AI Core (supplement §9 "Ereignisgesteuerte
 * Zustandslogik"). Pure TypeScript with an injectable clock: no timers, no DOM, no React — the
 * renderer samples it once per frame and writes the result into shader uniforms or CSS variables.
 *
 *  - competing states resolve by the fixed priority
 *    `blocked > approval_required > working > streaming > success > listening > idle`;
 *  - a requested state is committed only after it persisted for `debounceMs` (hysteresis against
 *    bursts of backend events); repeating the current state never restarts anything (no per-token
 *    reaction while streaming);
 *  - a committed change interpolates every visual parameter from its *current* value to the target
 *    over `transitionMs` (400–700 ms window), so an interrupted transition never jumps or flickers;
 *  - `success` is a one-shot: an expansion wave of `successMs` (600–900 ms), then a soft return to idle;
 *  - the breathing phase is integrated over time with the state's speed factor, so slowing down
 *    (approval, blocked) never snaps a shape to a new position.
 */

export const CORE_STATE_PRIORITY: readonly CoreState[] = [
  "blocked",
  "approval_required",
  "working",
  "streaming",
  "success",
  "listening",
  "idle",
];

export interface CoreSignals {
  /** `activity.blocked` / `activity.failed` / chat error */
  blocked?: boolean;
  /** `approval.required` — a real approval card is pending */
  approvalRequired?: boolean;
  /** `activity.started` / `job.progress` / tools running / model thinking */
  working?: boolean;
  /** released assistant output is being transferred */
  streaming?: boolean;
  /** verified `activity.completed` / `ui.final` (held for the wave duration by the caller) */
  success?: boolean;
  /** focus in the composer or a deliberately started input */
  listening?: boolean;
}

const SIGNAL_KEY: Record<CoreState, keyof CoreSignals | null> = {
  blocked: "blocked",
  approval_required: "approvalRequired",
  working: "working",
  streaming: "streaming",
  success: "success",
  listening: "listening",
  idle: null,
};

/** Highest-priority state whose signal is set; `idle` when nothing is active. */
export function resolveCoreState(signals: CoreSignals): CoreState {
  for (const state of CORE_STATE_PRIORITY) {
    const key = SIGNAL_KEY[state];
    if (key && signals[key]) return state;
  }
  return "idle";
}

/**
 * Visual parameters of a state (all unit-less, 0..1 unless noted). They are what the state table
 * prescribes, expressed as numbers the renderers can interpolate.
 */
export interface CoreParams {
  /** seconds per breathing cycle */
  period: number;
  /** breathing amplitude */
  amplitude: number;
  /** drift speed factor (0 = frozen) */
  speed: number;
  /** attraction of two to three shapes into a directed flow */
  merge: number;
  /** one shape leans towards the composer */
  lean: number;
  /** shapes contract towards the centre */
  contract: number;
  /** cyan halo (attention) */
  halo: number;
  /** calm amber outline (approval) */
  outline: number;
  /** muted amber/red edge (blocked) */
  edge: number;
  /** light flow at the core (streaming / working) */
  glow: number;
  /** overall intensity */
  intensity: number;
}

export const STATE_PARAMS: Record<CoreState, CoreParams> = {
  // very slow breathing, ~14–18 s per cycle, low amplitude, calm open shapes
  idle: { period: 16, amplitude: 0.35, speed: 1, merge: 0, lean: 0, contract: 0, halo: 0, outline: 0, edge: 0, glow: 0, intensity: 0.8 },
  // one shape leans to the composer, subtle cyan halo; nothing reacts per keystroke
  listening: { period: 15, amplitude: 0.4, speed: 1, merge: 0, lean: 1, contract: 0, halo: 0.7, outline: 0, edge: 0, glow: 0.1, intensity: 0.85 },
  // two to three shapes merge into a calm directed flow, a little more energy, no fake progress
  working: { period: 11, amplitude: 0.5, speed: 1.6, merge: 1, lean: 0, contract: 0, halo: 0.15, outline: 0, edge: 0, glow: 0.35, intensity: 0.95 },
  // minimal light flow at the core; never a twitch per token
  streaming: { period: 14, amplitude: 0.3, speed: 1.1, merge: 0.3, lean: 0, contract: 0, halo: 0, outline: 0, edge: 0, glow: 0.6, intensity: 0.85 },
  // motion almost stops; a calm amber outline points to the real approval card
  approval_required: { period: 18, amplitude: 0.1, speed: 0.06, merge: 0, lean: 0, contract: 0.1, halo: 0, outline: 1, edge: 0, glow: 0, intensity: 0.7 },
  // idle-like base while the one-shot emerald wave runs
  success: { period: 16, amplitude: 0.35, speed: 1, merge: 0, lean: 0, contract: 0, halo: 0, outline: 0, edge: 0, glow: 0.2, intensity: 0.85 },
  // shapes contract and become almost static; muted amber/red edge, no shaking or strobing
  blocked: { period: 18, amplitude: 0.08, speed: 0.12, merge: 0, lean: 0, contract: 0.7, halo: 0, outline: 0, edge: 1, glow: 0, intensity: 0.65 },
};

export const PARAM_KEYS = Object.keys(STATE_PARAMS.idle) as (keyof CoreParams)[];

export interface CoreSample {
  /** committed target state */
  state: CoreState;
  /** state the current transition started from */
  from: CoreState;
  /** 0..1 progress of the current transition (1 = settled) */
  progress: number;
  /** interpolated parameters for this instant */
  params: CoreParams;
  /** success wave progress 0..1, or -1 when no wave is running */
  wave: number;
  /** integrated breathing phase in cycles (continuous across state changes) */
  phase: number;
  /** clock value of this sample (ms) */
  time: number;
}

export interface CoreMachineOptions {
  now: () => number;
  /** 400–700 ms per supplement; default 550 */
  transitionMs?: number;
  /** hysteresis before a requested state is committed; default 150 */
  debounceMs?: number;
  /** duration of the one-shot success wave, 600–900 ms; default 800 */
  successMs?: number;
}

export interface CoreStateMachine {
  /** Asks for a state; it is committed on the next `sample()` after `debounceMs`. Repeating the current target is a no-op. */
  request(state: CoreState): void;
  /** Advances the clock and returns the visual parameters for now. */
  sample(): CoreSample;
  /** The committed target state. */
  current(): CoreState;
}

export const easeInOut = (x: number): number => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export function lerpParams(a: CoreParams, b: CoreParams, t: number): CoreParams {
  const out = {} as CoreParams;
  for (const key of PARAM_KEYS) out[key] = a[key] + (b[key] - a[key]) * t;
  return out;
}

export function createCoreStateMachine(options: CoreMachineOptions): CoreStateMachine {
  const now = options.now;
  const transitionMs = options.transitionMs ?? 550;
  const debounceMs = options.debounceMs ?? 150;
  const successMs = options.successMs ?? 800;

  let target: CoreState = "idle";
  let from: CoreState = "idle";
  let fromParams: CoreParams = { ...STATE_PARAMS.idle };
  let startedAt = -Infinity;
  let pending: { state: CoreState; at: number } | null = null;
  let waveStart = -Infinity;
  let phase = 0;
  let lastTime: number | null = null;
  let current: CoreParams = { ...STATE_PARAMS.idle };

  const progressAt = (t: number) => (startedAt === -Infinity ? 1 : clamp01((t - startedAt) / transitionMs));

  const commit = (state: CoreState, t: number) => {
    // start from the interpolated values of this instant so an interrupted transition never jumps
    fromParams = lerpParams(fromParams, STATE_PARAMS[target], easeInOut(progressAt(t)));
    from = target;
    target = state;
    startedAt = t;
    if (state === "success") waveStart = t;
  };

  return {
    request(state) {
      if (state === target && !pending) return;
      if (pending?.state === state) return;
      if (state === target) {
        pending = null;
        return;
      }
      pending = { state, at: now() };
    },
    current: () => target,
    sample() {
      const t = now();
      if (pending && t - pending.at >= debounceMs) {
        commit(pending.state, t);
        pending = null;
      }
      let wave = -1;
      if (target === "success") {
        wave = clamp01((t - waveStart) / successMs);
        if (wave >= 1) {
          commit("idle", t);
          wave = -1;
        }
      }
      const progress = progressAt(t);
      current = lerpParams(fromParams, STATE_PARAMS[target], easeInOut(progress));
      const dt = lastTime === null ? 0 : Math.max(0, t - lastTime) / 1000;
      lastTime = t;
      phase += (dt * current.speed) / current.period;
      return { state: target, from, progress, params: current, wave, phase, time: t };
    },
  };
}
