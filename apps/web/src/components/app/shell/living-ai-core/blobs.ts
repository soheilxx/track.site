import type { CoreSample } from "./state-machine";
import type { CoreMode } from "./types";

/**
 * Shape layout of the enhanced renderer: three to five soft translucent shapes in cobalt, violet
 * and cyan that rise, merge and separate slowly and asymmetrically. Pure and time-based — the
 * positions are a function of the machine's integrated phase and interpolated parameters, so the
 * same clock always produces the same picture (visual-regression tests with injected time).
 *
 * Coordinates are normalised to the core region (0..1, y down like CSS); the shader corrects the
 * aspect ratio so shapes stay round.
 */
export interface Blob {
  x: number;
  y: number;
  /** radius in units of the region height */
  r: number;
  /** colour index: 0 cobalt, 1 violet, 2 cyan */
  c: 0 | 1 | 2;
}

export const BLOB_COUNT = 5;

interface Anchor {
  x: number;
  y: number;
  r: number;
  c: 0 | 1 | 2;
  /** drift amplitudes and frequency multipliers (asymmetric per shape) */
  ax: number;
  ay: number;
  fx: number;
  fy: number;
  px: number;
  py: number;
}

// docked: concentrated on the AI core spot (top-left, next to the panel title) and the header
const DOCKED: Anchor[] = [
  { x: 0.16, y: 0.42, r: 0.36, c: 0, ax: 0.05, ay: 0.09, fx: 1, fy: 0.62, px: 0.0, py: 1.1 },
  { x: 0.34, y: 0.3, r: 0.3, c: 1, ax: 0.07, ay: 0.08, fx: 0.83, fy: 1.27, px: 2.1, py: 0.4 },
  { x: 0.28, y: 0.66, r: 0.27, c: 2, ax: 0.06, ay: 0.1, fx: 1.19, fy: 0.71, px: 4.0, py: 2.6 },
  { x: 0.56, y: 0.4, r: 0.24, c: 0, ax: 0.08, ay: 0.07, fx: 0.67, fy: 0.93, px: 1.3, py: 3.3 },
  { x: 0.78, y: 0.58, r: 0.22, c: 1, ax: 0.05, ay: 0.09, fx: 1.07, fy: 0.55, px: 3.4, py: 5.1 },
];

// onboarding: spatially more present, centred in the larger stage
const ONBOARDING: Anchor[] = [
  { x: 0.42, y: 0.5, r: 0.42, c: 0, ax: 0.07, ay: 0.1, fx: 1, fy: 0.62, px: 0.0, py: 1.1 },
  { x: 0.58, y: 0.4, r: 0.36, c: 1, ax: 0.08, ay: 0.09, fx: 0.83, fy: 1.27, px: 2.1, py: 0.4 },
  { x: 0.5, y: 0.64, r: 0.32, c: 2, ax: 0.07, ay: 0.11, fx: 1.19, fy: 0.71, px: 4.0, py: 2.6 },
  { x: 0.32, y: 0.6, r: 0.28, c: 0, ax: 0.09, ay: 0.08, fx: 0.67, fy: 0.93, px: 1.3, py: 3.3 },
  { x: 0.68, y: 0.6, r: 0.26, c: 1, ax: 0.06, ay: 0.1, fx: 1.07, fy: 0.55, px: 3.4, py: 5.1 },
];

const TAU = Math.PI * 2;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Lava-lamp rise: slow ascent, quicker settle (asymmetric waveform in -1..1). */
function rise(t: number): number {
  const s = Math.sin(t);
  return s * (0.7 + 0.3 * Math.sin(t * 0.5 + 0.8));
}

export function layoutBlobs(sample: CoreSample, mode: CoreMode): Blob[] {
  const anchors = mode === "onboarding" ? ONBOARDING : DOCKED;
  const { params, phase } = sample;
  const breath = params.amplitude;
  const centre = mode === "onboarding" ? { x: 0.5, y: 0.52 } : { x: 0.3, y: 0.46 };
  // directed flow (working): from the core spot towards the activity line on the right
  const flowA = mode === "onboarding" ? { x: 0.3, y: 0.55 } : { x: 0.18, y: 0.4 };
  const flowB = mode === "onboarding" ? { x: 0.7, y: 0.5 } : { x: 0.8, y: 0.68 };
  // listening: the first shape leans towards the composer (down, centre)
  const composer = { x: 0.5, y: 0.98 };

  return anchors.map((a, i) => {
    let x = a.x + a.ax * Math.sin(TAU * phase * a.fx + a.px);
    let y = a.y + a.ay * rise(TAU * phase * a.fy + a.py);
    let r = a.r * (1 + 0.12 * breath * Math.sin(TAU * phase + i * 1.3));

    if (params.merge > 0 && i >= 1 && i <= 3) {
      const s = ((i - 1) / 3 + phase * 0.35) % 1;
      const fx = lerp(flowA.x, flowB.x, s);
      const fy = lerp(flowA.y, flowB.y, s) + 0.05 * Math.sin(TAU * phase * 1.7 + i);
      x = lerp(x, fx, params.merge * 0.75);
      y = lerp(y, fy, params.merge * 0.75);
      r *= 1 + 0.1 * params.merge;
    }
    if (params.lean > 0 && i === 0) {
      x = lerp(x, composer.x, params.lean * 0.3);
      y = lerp(y, composer.y, params.lean * 0.3);
    }
    if (params.contract > 0) {
      x = lerp(x, centre.x, params.contract * 0.6);
      y = lerp(y, centre.y, params.contract * 0.6);
      r *= 1 - 0.35 * params.contract;
    }
    return { x: clamp01(x), y: clamp01(y), r, c: a.c };
  });
}
