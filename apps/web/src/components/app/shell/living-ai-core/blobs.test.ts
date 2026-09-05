import { describe, expect, it } from "vitest";
import { BLOB_COUNT, layoutBlobs } from "./blobs";
import { STATE_PARAMS, type CoreSample } from "./state-machine";
import type { CoreState } from "./types";

function sampleFor(state: CoreState, phase = 0.37): CoreSample {
  return { state, from: state, progress: 1, params: { ...STATE_PARAMS[state] }, wave: -1, phase, time: 0 };
}

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

function spread(blobs: ReturnType<typeof layoutBlobs>, indices: number[]): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < indices.length; i++)
    for (let j = i + 1; j < indices.length; j++) {
      sum += distance(blobs[indices[i]!]!, blobs[indices[j]!]!);
      n += 1;
    }
  return sum / n;
}

describe("layoutBlobs", () => {
  it("is a pure function of the sample: identical input → identical shapes", () => {
    expect(layoutBlobs(sampleFor("working", 1.234), "docked")).toEqual(layoutBlobs(sampleFor("working", 1.234), "docked"));
    expect(layoutBlobs(sampleFor("idle", 0.2), "onboarding")).toEqual(layoutBlobs(sampleFor("idle", 0.2), "onboarding"));
  });

  it("draws three to five shapes in cobalt, violet and cyan inside the region", () => {
    for (const mode of ["docked", "onboarding"] as const) {
      for (const state of ["idle", "listening", "working", "streaming", "approval_required", "success", "blocked"] as const) {
        for (let phase = 0; phase < 3; phase += 0.21) {
          const blobs = layoutBlobs(sampleFor(state, phase), mode);
          expect(blobs).toHaveLength(BLOB_COUNT);
          expect(BLOB_COUNT).toBeGreaterThanOrEqual(3);
          expect(BLOB_COUNT).toBeLessThanOrEqual(5);
          for (const b of blobs) {
            expect(b.x).toBeGreaterThanOrEqual(0);
            expect(b.x).toBeLessThanOrEqual(1);
            expect(b.y).toBeGreaterThanOrEqual(0);
            expect(b.y).toBeLessThanOrEqual(1);
            expect(b.r).toBeGreaterThan(0.05);
            expect(b.r).toBeLessThan(0.6);
            expect([0, 1, 2]).toContain(b.c);
          }
          expect(new Set(blobs.map((b) => b.c)).size).toBe(3);
        }
      }
    }
  });

  it("moves slowly and asymmetrically: consecutive frames differ by small amounts only", () => {
    let previous = layoutBlobs(sampleFor("idle", 0), "docked");
    for (let phase = 1 / 480; phase < 1; phase += 1 / 480) {
      const next = layoutBlobs(sampleFor("idle", phase), "docked");
      for (let i = 0; i < BLOB_COUNT; i++) expect(distance(previous[i]!, next[i]!)).toBeLessThan(0.01);
      previous = next;
    }
  });

  it("working pulls two to three shapes together into a directed flow", () => {
    const idle = layoutBlobs(sampleFor("idle"), "docked");
    const working = layoutBlobs(sampleFor("working"), "docked");
    expect(spread(working, [1, 2, 3])).toBeLessThan(spread(idle, [1, 2, 3]));
  });

  it("listening leans the first shape towards the composer (down and to the centre)", () => {
    const idle = layoutBlobs(sampleFor("idle"), "docked");
    const listening = layoutBlobs(sampleFor("listening"), "docked");
    expect(listening[0]!.y).toBeGreaterThan(idle[0]!.y);
    expect(Math.abs(listening[0]!.x - 0.5)).toBeLessThan(Math.abs(idle[0]!.x - 0.5));
  });

  it("blocked contracts the shapes towards the centre and shrinks them", () => {
    const idle = layoutBlobs(sampleFor("idle"), "docked");
    const blocked = layoutBlobs(sampleFor("blocked"), "docked");
    const centre = { x: 0.3, y: 0.46 };
    for (let i = 0; i < BLOB_COUNT; i++) {
      expect(distance(blocked[i]!, centre)).toBeLessThan(distance(idle[i]!, centre) + 1e-9);
      expect(blocked[i]!.r).toBeLessThan(idle[i]!.r);
    }
  });

  it("is spatially more present in onboarding mode", () => {
    const docked = layoutBlobs(sampleFor("idle"), "docked");
    const onboarding = layoutBlobs(sampleFor("idle"), "onboarding");
    const total = (list: typeof docked) => list.reduce((sum, b) => sum + b.r, 0);
    expect(total(onboarding)).toBeGreaterThan(total(docked));
  });
});
