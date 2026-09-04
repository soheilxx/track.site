import type { IntegrationCatalogText } from "../types";
import { textFromCatalog } from "./from-catalog";

/** German text: the catalogue's own `de` strings (`@/lib/integrations-catalog`), never a copy of them. */
export const INTEGRATION_CATALOG_TEXT_DE: IntegrationCatalogText = textFromCatalog("de");
