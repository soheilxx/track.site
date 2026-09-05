/**
 * Windowing helpers of the Track AI message list (supplement §9: virtualise long conversations
 * from ~200 messages, keep the scroll position stable). Pure functions over measured heights so the
 * window for a given scroll offset is deterministic and unit-testable; the component owns the DOM
 * measurements (ResizeObserver) and applies the anchor correction below whenever an item above
 * the viewport changes size.
 */
export const VIRTUALIZE_FROM = 200;
/** Height assumed for a message that has not been measured yet (one short paragraph with its avatar row). */
export const ESTIMATED_ITEM_HEIGHT = 88;
/** Extra pixels rendered above and below the viewport so scrolling never shows a blank gap. */
export const OVERSCAN_PX = 480;

export interface VirtualLayout {
  /** prefix offsets, `offsets[i]` = top of item i, `offsets[n]` = total height */
  offsets: number[];
  total: number;
}

export function layoutItems(ids: readonly string[], heights: ReadonlyMap<string, number>, estimate = ESTIMATED_ITEM_HEIGHT): VirtualLayout {
  const offsets = new Array<number>(ids.length + 1);
  let y = 0;
  for (let i = 0; i < ids.length; i++) {
    offsets[i] = y;
    y += heights.get(ids[i]!) ?? estimate;
  }
  offsets[ids.length] = y;
  return { offsets, total: y };
}

/** First index whose bottom edge is below `y` (binary search over the prefix offsets). */
function indexAt(offsets: number[], y: number): number {
  const n = offsets.length - 1;
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid + 1]! > y) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/** Items to render for a viewport: `[start, end)`, clamped, with the overscan on both sides. */
export function visibleRange(layout: VirtualLayout, scrollTop: number, viewportHeight: number, overscan = OVERSCAN_PX): { start: number; end: number } {
  const n = layout.offsets.length - 1;
  if (n === 0) return { start: 0, end: 0 };
  const top = Math.max(0, scrollTop - overscan);
  const bottom = scrollTop + viewportHeight + overscan;
  const start = Math.min(indexAt(layout.offsets, top), n - 1);
  let end = start;
  while (end < n && layout.offsets[end]! < bottom) end++;
  return { start, end: Math.max(end, Math.min(start + 1, n)) };
}

/**
 * Scroll correction after a re-measurement: when an item that ends above the viewport grew or
 * shrank, the content below it moved by the same amount — the container's `scrollTop` must move
 * with it so what the reader looks at stays put. Items inside or below the viewport need none.
 */
export function anchorDelta(itemTop: number, previousHeight: number, nextHeight: number, scrollTop: number): number {
  if (itemTop + previousHeight > scrollTop) return 0;
  return nextHeight - previousHeight;
}
