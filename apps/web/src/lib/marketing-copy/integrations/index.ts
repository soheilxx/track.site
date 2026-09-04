import type { IntegrationsCopy, LocalizedCopy } from "../types";
import { INTEGRATIONS_COPY_EN } from "./en";
import { INTEGRATIONS_COPY_DE } from "./de";
import { INTEGRATIONS_COPY_FR } from "./fr";
import { INTEGRATIONS_COPY_ES } from "./es";
import { INTEGRATIONS_COPY_IT } from "./it";
import { INTEGRATIONS_COPY_NL } from "./nl";

/**
 * Integrations area copy (overview with search + filters, detail pages; supplement §4).
 *
 * The shape is `IntegrationsCopy` in types.ts (overview with search + filters, detail pages).
 * Every fact rendered next to this copy comes from `@/lib/integrations-catalog` (verified against
 * the connector registry) — the copy only labels it.
 */

export const INTEGRATIONS_COPY: LocalizedCopy<IntegrationsCopy> = { en: INTEGRATIONS_COPY_EN, de: INTEGRATIONS_COPY_DE, fr: INTEGRATIONS_COPY_FR, es: INTEGRATIONS_COPY_ES, it: INTEGRATIONS_COPY_IT, nl: INTEGRATIONS_COPY_NL };
