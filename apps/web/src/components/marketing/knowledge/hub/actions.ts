"use server";

import { isLocale } from "@/i18n/routing";
import { KNOWLEDGE_TAXONOMY } from "@/lib/knowledge";
import { parseHubQuery, type HubQuery } from "@/lib/knowledge-search";
import { buildHubSearchResponse } from "./server";
import type { HubSearchResponse } from "./types";

/**
 * Live search of the hub island: the index stays on the server (built from the loader, cached per
 * locale), the client sends the query and receives the ranked items, the real hit count and the
 * facet counts. Inputs are re-validated here — the island's state is never trusted.
 */
export async function searchKnowledgeAction(locale: string, raw: HubQuery): Promise<HubSearchResponse> {
  if (!isLocale(locale)) throw new Error("Unknown locale");
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  const query = parseHubQuery({ q: str(raw?.q), topic: str(raw?.topic), platform: str(raw?.platform), shop: str(raw?.shopSystem), type: str(raw?.contentType), level: str(raw?.level), recency: str(raw?.recency) }, KNOWLEDGE_TAXONOMY);
  return buildHubSearchResponse(locale, query, new Date());
}
