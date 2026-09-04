"use client";

import { useEffect, useRef } from "react";

/**
 * Reading-progress indicator: a hairline at the top of the viewport that fills as the article body
 * (`targetId`) scrolls past. Client island with no state — the bar is driven imperatively from a
 * rAF-throttled scroll listener (transform only, no layout). Reduced motion: no transition (the token
 * sheet neutralises it globally) and the value advances in 5 % steps instead of continuously, so the
 * bar never shimmers. Exposed as `role="progressbar"` with the current percentage; hidden in print.
 */
export function ReadingProgress({ targetId, label }: { targetId: string; label: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = document.getElementById(targetId);
    const box = boxRef.current;
    const bar = barRef.current;
    if (!target || !box || !bar) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let last = -1;
    const update = () => {
      frame = 0;
      const rect = target.getBoundingClientRect();
      const top = rect.top + window.scrollY;
      const span = Math.max(1, rect.height - window.innerHeight);
      const raw = Math.min(1, Math.max(0, (window.scrollY - top) / span));
      const step = reduced.matches ? 0.05 : 0.005;
      const value = Math.round(raw / step) * step;
      if (value === last) return;
      last = value;
      bar.style.transform = `scaleX(${value})`;
      box.setAttribute("aria-valuenow", String(Math.round(value * 100)));
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [targetId]);

  return (
    <div ref={boxRef} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={0} data-print="hide" className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5">
      <div ref={barRef} className="h-full w-full origin-left bg-primary motion-safe:transition-transform motion-safe:duration-[var(--motion-fast)] motion-safe:ease-out" style={{ transform: "scaleX(0)" }} />
    </div>
  );
}
