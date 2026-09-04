import type { IntegrationCatalogEntry } from "@/lib/integrations-catalog";
import { INTEGRATION_CATALOG_TEXT } from "@/lib/marketing-copy/integration-catalog";
import { pick } from "@/lib/marketing-copy/pick";
import type { IntegrationText } from "@/lib/marketing-copy/types";

/**
 * Summary, vendor prerequisite note and public-id labels of a catalogue entry in the page's
 * language, from the copy area `integration-catalog/` (English and German are the catalogue's own
 * strings, the other programme locales are translated there). Server side only — `catalog.ts`
 * stays free of copy imports because the explorer island imports it.
 *
 * Strict like `pick()`: an entry without text for an active locale throws instead of rendering
 * English on a localized page (`catalog.test.ts` checks every slug and public id in every locale,
 * and the static build renders every integration page in every locale before anything ships).
 */
export function integrationText(entry: Pick<IntegrationCatalogEntry, "slug">, locale: string): IntegrationText {
  const text = pick(locale, INTEGRATION_CATALOG_TEXT)[entry.slug];
  if (!text) throw new Error(`No catalogue text for integration "${entry.slug}" in locale "${locale}" (lib/marketing-copy/integration-catalog/<locale>.ts).`);
  return text;
}

/** Label of one public id (`pixel_id`, `shop_domain`, …); the key itself when the copy lacks it (a test fails first). */
export function publicIdLabel(text: IntegrationText, key: string): string {
  return text.publicIds[key] ?? key;
}
