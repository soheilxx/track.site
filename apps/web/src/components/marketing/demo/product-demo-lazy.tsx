import type { DemoCopy } from "@/lib/marketing-copy/types";
import { ProductDemoIsland } from "./product-demo-island";
import { ProductDemoStatic } from "./product-demo-static";

/**
 * Lazy-hydrated hero demo (server component): the static Overview placeholder is rendered on the
 * server and handed to the client island as a ReactNode, so the initial HTML shows the product
 * without any demo JavaScript; the island loads the interactive demo when the frame comes into
 * view and replaces the placeholder in place (see product-demo-island.tsx).
 */
export function ProductDemoLazy({ copy, heading }: { copy: DemoCopy; heading: string }) {
  return <ProductDemoIsland copy={copy} heading={heading} placeholder={<ProductDemoStatic copy={copy} heading={heading} />} />;
}
