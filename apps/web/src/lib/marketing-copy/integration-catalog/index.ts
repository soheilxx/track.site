import type { IntegrationCatalogText, LocalizedCopy } from "../types";
import { INTEGRATION_CATALOG_TEXT_EN } from "./en";
import { INTEGRATION_CATALOG_TEXT_DE } from "./de";
import { INTEGRATION_CATALOG_TEXT_FR } from "./fr";
import { INTEGRATION_CATALOG_TEXT_ES } from "./es";
import { INTEGRATION_CATALOG_TEXT_IT } from "./it";
import { INTEGRATION_CATALOG_TEXT_NL } from "./nl";

/**
 * Localized text of the integration catalogue (summary, prerequisite note, public-id labels per
 * entry; supplement §7 "no silent English fallback"). English and German are projected from
 * `@/lib/integrations-catalog` (the catalogue keeps them next to the technical facts), the other
 * programme locales are translated here. `components/marketing/integrations/text.ts` resolves an
 * entry for a page; `catalog.test.ts` checks that every catalogue entry and every public id has a
 * text in every locale.
 */
export const INTEGRATION_CATALOG_TEXT: LocalizedCopy<IntegrationCatalogText> = {
  en: INTEGRATION_CATALOG_TEXT_EN,
  de: INTEGRATION_CATALOG_TEXT_DE,
  fr: INTEGRATION_CATALOG_TEXT_FR,
  es: INTEGRATION_CATALOG_TEXT_ES,
  it: INTEGRATION_CATALOG_TEXT_IT,
  nl: INTEGRATION_CATALOG_TEXT_NL,
};
