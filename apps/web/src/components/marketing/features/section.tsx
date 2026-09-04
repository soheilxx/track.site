import type { ComponentProps } from "react";
import { PageSection, SectionHeading } from "@/components/marketing/page-shell";

/**
 * Compatibility re-exports: the section scaffolding merged into `@/components/marketing/page-shell`
 * (`MarketingSection` is `PageSection` with `spacing="lg"`). Only the Tracking Knowledge hub
 * (components/marketing/knowledge/hub/sections.tsx) still imports from here; point it at
 * page-shell and delete this file.
 */
export { SectionHeading };

export function MarketingSection(props: Omit<ComponentProps<typeof PageSection>, "spacing">) {
  return <PageSection spacing="lg" {...props} />;
}
