/**
 * Living AI Core — shared types (owner supplement §9 "Living AI Core").
 *
 * The component is decorative: it only communicates *that* Track AI waits, listens, works, streams,
 * needs an approval, finished or is blocked. The state it receives is derived from real UI/backend
 * events (chat status, approval cards, errors, composer focus) — never from model internals.
 */

export const CORE_STATES = [
  "idle",
  "listening",
  "working",
  "streaming",
  "approval_required",
  "success",
  "blocked",
] as const;

export type CoreState = (typeof CORE_STATES)[number];

/** Per-user preference (`workspace_preferences.ai_motion`, exposed as `data-ai-motion` on the dashboard root). */
export type CoreMotion = "system" | "full" | "reduced" | "off";

export const CORE_MOTIONS: readonly CoreMotion[] = ["system", "full", "reduced", "off"];

/** `docked` = the persistent assistant panel; `onboarding` = the large first-run presentation. */
export type CoreMode = "docked" | "onboarding";

/**
 * Rendering tiers (progressive enhancement):
 *  - `static`: SSR gradient + static state accents (also the accessibility mode);
 *  - `css`:    two to three radial-gradient layers moved by transform/opacity keyframes;
 *  - `webgl`:  WebGL2 fragment-shader metaballs, lazily loaded on the client.
 */
export type CoreTier = "static" | "css" | "webgl";

export interface LivingAICoreProps {
  state: CoreState;
  motion: CoreMotion;
  mode: CoreMode;
  /** Injectable clock in milliseconds (defaults to `performance.now`); makes every frame deterministic in tests. */
  now?: () => number;
}

export function isCoreState(value: unknown): value is CoreState {
  return typeof value === "string" && (CORE_STATES as readonly string[]).includes(value);
}

export function isCoreMotion(value: unknown): value is CoreMotion {
  return typeof value === "string" && (CORE_MOTIONS as readonly string[]).includes(value);
}
