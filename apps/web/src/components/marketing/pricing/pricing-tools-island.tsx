"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PricingToolsProps } from "./pricing-tools-view";

type Interactive = (props: PricingToolsProps) => React.JSX.Element;

/**
 * Client boundary of the finder/calculator stage. The server renders the initial state as
 * `placeholder`; this island imports the interactive tools (with the tariff catalogue) once the
 * stage comes near the viewport or the visitor touches it, then swaps them in place. The markup is
 * identical, so nothing moves; the interactive state starts from the same defaults the placeholder
 * shows (a value typed into the placeholder before the swap is not carried over — the load starts
 * 200 px before the stage is visible and on the first focus or pointer contact).
 */
export function PricingToolsIsland({ placeholder, ...props }: PricingToolsProps & { placeholder: ReactNode }) {
  const [Interactive, setInteractive] = useState<Interactive | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const requested = useRef(false);

  useEffect(() => {
    const root = rootRef.current;
    let cancelled = false;
    let observer: IntersectionObserver | null = null;
    const load = () => {
      if (requested.current) return;
      requested.current = true;
      observer?.disconnect();
      void import("./pricing-tools").then((m) => {
        if (!cancelled) setInteractive(() => m.PricingTools);
      });
    };
    if (root && typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) load();
        },
        { rootMargin: "200px 0px" },
      );
      observer.observe(root);
    } else {
      load();
    }
    const onEngage = () => load();
    root?.addEventListener("focusin", onEngage);
    root?.addEventListener("pointerdown", onEngage);
    return () => {
      cancelled = true;
      observer?.disconnect();
      root?.removeEventListener("focusin", onEngage);
      root?.removeEventListener("pointerdown", onEngage);
    };
  }, []);

  return <div ref={rootRef}>{Interactive ? <Interactive {...props} /> : placeholder}</div>;
}
