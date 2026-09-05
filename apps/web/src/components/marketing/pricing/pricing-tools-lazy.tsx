import { PricingToolsIsland } from "./pricing-tools-island";
import { PricingToolsStatic } from "./pricing-tools-static";
import type { PricingToolsProps } from "./pricing-tools-view";

/**
 * Lazily hydrated finder/calculator stage (server component): the initial state is rendered on the
 * server and handed to the client island as a ReactNode; the interactive tools load when the stage
 * scrolls into view (see pricing-tools-island.tsx).
 */
export function PricingToolsLazy(props: PricingToolsProps) {
  return <PricingToolsIsland {...props} placeholder={<PricingToolsStatic {...props} />} />;
}
