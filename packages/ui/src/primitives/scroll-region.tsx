"use client";

import { useEffect, useRef, type HTMLAttributes } from "react";
import { cn } from "../cn.ts";

export interface ScrollRegionProps extends HTMLAttributes<HTMLDivElement> {
  /** Accessible name of the region while it scrolls (e.g. the table caption). */
  label?: string;
  /** Classes of the scroll container itself; `className` styles the outer frame (border, radius, background). */
  scrollClassName?: string;
}

/*
 * Horizontal scroll container for wide content (tables, matrices). A scrollable region must be
 * reachable with the keyboard (WCAG 2.1.1, axe `scrollable-region-focusable`), but a tab stop on a
 * table that fits is noise — so the scroller becomes `tabindex="0"` + `role="region"` only while its
 * content actually overflows, and drops both again when it fits (resize, data change, stacked rows).
 *
 * Both boxes are `relative`: the scroller is the containing block of its absolutely positioned
 * descendants (`sr-only` captions, cell text, tooltips). Without it those 1 × 1 px boxes resolve
 * against the initial containing block, escape the clip and extend the document's scrollable
 * overflow — a horizontal page scroll caused by invisible content.
 *
 * While the content overflows and the scroller is not at its end, a fade at the right edge of the
 * frame signals that more columns follow (a visible affordance next to the scrollbar, which overlay
 * scrollbars hide until the first scroll). The frame clips it to its own radius.
 *
 * Client component: it measures the DOM; server components render it like any other wrapper.
 */
export function ScrollRegion({ label, className, scrollClassName, children, ...props }: ScrollRegionProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    const frame = frameRef.current;
    if (!el || !frame) return;
    const update = () => {
      const scrolls = el.scrollWidth > el.clientWidth + 1;
      if (scrolls) {
        el.tabIndex = 0;
        el.setAttribute("role", "region");
        if (label) el.setAttribute("aria-label", label);
      } else {
        el.removeAttribute("tabindex");
        el.removeAttribute("role");
        el.removeAttribute("aria-label");
      }
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
      if (scrolls && !atEnd) frame.setAttribute("data-scroll", "more");
      else frame.removeAttribute("data-scroll");
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(update);
      observer.observe(el);
      for (const child of Array.from(el.children)) observer.observe(child);
    }
    return () => {
      el.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, [label]);
  return (
    <div ref={frameRef} className={cn("group/scroll relative w-full min-w-0 overflow-clip", className)}>
      <div ref={ref} className={cn("relative w-full min-w-0 overflow-x-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary", scrollClassName)} {...props}>
        {children}
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-linear-to-l from-ink/10 to-transparent opacity-0 transition-opacity duration-[var(--motion-fast)] ease-out group-data-[scroll=more]/scroll:opacity-100 motion-reduce:transition-none" />
    </div>
  );
}
