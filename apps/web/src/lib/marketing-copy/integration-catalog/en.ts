import type { IntegrationCatalogText } from "../types";
import { textFromCatalog } from "./from-catalog";

/** English source text: the catalogue's own `en` strings (`@/lib/integrations-catalog`), never a copy of them. */
export const INTEGRATION_CATALOG_TEXT_EN: IntegrationCatalogText = textFromCatalog("en");
