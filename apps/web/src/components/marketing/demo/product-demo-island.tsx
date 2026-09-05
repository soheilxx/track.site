"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { DemoCopy } from "@/lib/marketing-copy/types";
import type { ProductDemoProps } from "./product-demo";

type Interactive = (props: ProductDemoProps) => React.JSX.Element;

/**
 * Client boundary of the hero demo. The server renders the static Overview state as `placeholder`
 * (a server component tree, no JavaScript of its own); this island only imports the interactive
 * demo once the frame comes near the viewport or the visitor touches it, then swaps it in place —
 * identical markup, so nothing moves. Until then the page's hydration bundle carries none of the
 * demo code (state machine, views, fixtures, diagram primitives).
 */
export function ProductDemoIsland({ copy, heading, placeholder }: { copy: DemoCopy; heading: string; placeholder: ReactNode }) {
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
      void import("./product-demo").then((m) => {
        if (!cancelled) setInteractive(() => m.ProductDemo);
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
    // a visitor who reaches the demo before the observer fired (keyboard, fast scroll) triggers the load directly
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

  return (
    <div ref={rootRef} className="min-w-0">
      {Interactive ? <Interactive copy={copy} heading={heading} /> : placeholder}
    </div>
  );
}
