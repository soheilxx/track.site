import { INTEGRATIONS, type LocalizedText } from "@/lib/integrations-catalog";
import type { IntegrationCatalogText } from "../types";

/**
 * English and German catalogue text projected from `@/lib/integrations-catalog` itself, so the
 * source language of this copy area can never drift from the catalogue (the catalogue keeps `en`
 * and `de` next to the technical facts; the other programme locales live in `<locale>.ts` here).
 */
export function textFromCatalog(lang: keyof LocalizedText): IntegrationCatalogText {
  const out: IntegrationCatalogText = {};
  for (const i of INTEGRATIONS) {
    out[i.slug] = {
      summary: i.summary[lang],
      accessNote: i.accessNote ? i.accessNote[lang] : null,
      publicIds: Object.fromEntries(i.publicIds.map((p) => [p.key, p.label[lang]])),
    };
  }
  return out;
}
