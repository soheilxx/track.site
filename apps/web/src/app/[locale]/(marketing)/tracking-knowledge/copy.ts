import { formatDate as formatLocaleDate } from "@/lib/format";
import { KNOWLEDGE_COPY, type KnowledgeCopy } from "@/lib/marketing-copy/knowledge";
import { pick } from "@/lib/marketing-copy/pick";

/**
 * Localized surrounding copy of the Tracking Knowledge area. The texts live in the copy area
 * `lib/marketing-copy/knowledge/<locale>.ts` (`KNOWLEDGE_COPY`); the product name itself stays
 * "Tracking Knowledge" in every language (supplement §6); only descriptions, labels and empty
 * states are translated.
 */
export type { KnowledgeCopy };

export function knowledgeCopy(locale: string): KnowledgeCopy {
  return pick(locale, KNOWLEDGE_COPY);
}

export function readingLabel(locale: string, minutes: number): string {
  return knowledgeCopy(locale).minutes.replace("{n}", String(minutes));
}

export function formatDate(locale: string, iso: string): string {
  return formatLocaleDate(iso, locale);
}
