"use client";

import dynamic from "next/dynamic";
import { createContext, useContext, useMemo } from "react";
import type { DemoCopy } from "@/lib/marketing-copy/types";
import { ProductDemoStatic } from "./product-demo-static";

interface PlaceholderContextValue {
  copy: DemoCopy;
  heading: string;
}

const PlaceholderContext = createContext<PlaceholderContextValue | null>(null);

/** `loading` of the dynamic import: the same Overview state, server-rendered, no handlers. */
function Placeholder() {
  const ctx = useContext(PlaceholderContext);
  return ctx ? <ProductDemoStatic copy={ctx.copy} heading={ctx.heading} /> : null;
}

const ProductDemoInteractive = dynamic(() => import("./product-demo").then((m) => m.ProductDemo), { ssr: false, loading: Placeholder });

/**
 * Lazy-hydrated hero demo: the page (a server component) renders this boundary; the server output
 * is the static placeholder, the interactive chunk loads after hydration and replaces it in place.
 */
export function ProductDemoLazy({ copy, heading }: PlaceholderContextValue) {
  const value = useMemo(() => ({ copy, heading }), [copy, heading]);
  return (
    <PlaceholderContext.Provider value={value}>
      <ProductDemoInteractive copy={copy} heading={heading} />
    </PlaceholderContext.Provider>
  );
}
