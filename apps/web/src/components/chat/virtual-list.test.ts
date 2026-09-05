import { describe, expect, it } from "vitest";
import { ESTIMATED_ITEM_HEIGHT, VIRTUALIZE_FROM, anchorDelta, layoutItems, visibleRange } from "./virtual-list";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `m${i}`);

describe("virtual message list", () => {
  it("virtualises from about 200 messages", () => {
    expect(VIRTUALIZE_FROM).toBe(200);
  });

  it("lays items out from measured heights and the estimate for unmeasured ones", () => {
    const heights = new Map([
      ["m0", 40],
      ["m2", 120],
    ]);
    const layout = layoutItems(ids(4), heights);
    expect(layout.offsets).toEqual([0, 40, 40 + ESTIMATED_ITEM_HEIGHT, 40 + ESTIMATED_ITEM_HEIGHT + 120, 40 + ESTIMATED_ITEM_HEIGHT + 120 + ESTIMATED_ITEM_HEIGHT]);
    expect(layout.total).toBe(layout.offsets[4]);
    expect(layoutItems([], heights)).toEqual({ offsets: [0], total: 0 });
  });

  it("returns the window around the viewport with the overscan, clamped to the list", () => {
    const layout = layoutItems(ids(250), new Map(), 100);
    // top of the list
    expect(visibleRange(layout, 0, 600, 200)).toEqual({ start: 0, end: 8 });
    // middle: 480 px overscan on both sides of a 600 px viewport around 10 000 px
    const mid = visibleRange(layout, 10_000, 600, 480);
    expect(mid.start).toBe(95);
    expect(mid.end).toBe(111);
    expect(layout.offsets[mid.start]!).toBeLessThanOrEqual(10_000 - 480);
    expect(layout.offsets[mid.end - 1]!).toBeLessThan(10_000 + 600 + 480);
    // end of the list: the last item is included and the range never exceeds the list
    const end = visibleRange(layout, 25_000 - 600, 600, 480);
    expect(end.end).toBe(250);
    expect(end.start).toBe(239);
    // a window is never empty for a non-empty list
    expect(visibleRange(layout, 1_000_000, 600, 0)).toEqual({ start: 249, end: 250 });
    expect(visibleRange(layoutItems([], new Map()), 0, 600)).toEqual({ start: 0, end: 0 });
  });

  it("keeps the reader's position when an item above the viewport is re-measured", () => {
    // item at 100–188 (estimate) turns out to be 140 px tall while the viewport starts at 1 000 → scroll follows by +52
    expect(anchorDelta(100, 88, 140, 1_000)).toBe(52);
    expect(anchorDelta(100, 140, 88, 1_000)).toBe(-52);
    // an item inside or below the viewport never moves the scroll offset
    expect(anchorDelta(950, 88, 140, 1_000)).toBe(0);
    expect(anchorDelta(2_000, 88, 140, 1_000)).toBe(0);
  });
});
