"use client";

import { useEffect, useRef, type HTMLAttributes } from "react";
import { cn } from "../cn.ts";

export interface ScrollRegionProps extends HTMLAttributes<HTMLDivElement> {
  /** Accessible name of the region while it scrolls (e.g. the table caption). */
  label?: string;
}

/*
 * Horizontal scroll container for wide content (tables, matrices). A scrollable region must be
 * reachable with the keyboard (WCAG 2.1.1, axe `scrollable-region-focusable`), but a tab stop on a
 * table that fits is noise — so the wrapper becomes `tabindex="0"` + `role="region"` only while its
 * content actually overflows, and drops both again when it fits (resize, data change, stacked rows).
 * Client component: it measures the DOM; server components render it like any other wrapper.
 */
export function ScrollRegion({ label, className, children, ...props }: ScrollRegionProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
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
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [label]);
  return (
    <div ref={ref} className={cn("w-full min-w-0 overflow-x-auto outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary", className)} {...props}>
      {children}
    </div>
  );
}
