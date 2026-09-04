import { KNOWLEDGE_NAME } from "@/lib/knowledge";

/**
 * Localized surrounding copy of the Tracking Knowledge area. The product name itself stays
 * "Tracking Knowledge" in every language (supplement §6); only descriptions, labels and empty
 * states are translated.
 */
export interface KnowledgeCopy {
  name: string;
  intro: string;
  cardAlt: string;
  feedDescription: string;
  all: string;
  minutes: string;
  rss: string;
  empty: string;
  emptyFiltered: string;
  filtered: string;
  reset: string;
  updated: string;
  published: string;
  reviewed: string;
  sources: string;
  related: string;
  by: string;
  topic: string;
  level: string;
  legal: string;
  breadcrumbHome: string;
}

export const KNOWLEDGE_COPY: Record<"en" | "de", KnowledgeCopy> = {
  en: {
    name: KNOWLEDGE_NAME,
    intro: "Practical guides on server-side tracking, consent, deduplication, attribution and the individual advertising platforms — written by the team that builds the connectors.",
    cardAlt: `Track ${KNOWLEDGE_NAME}: guides on server-side tracking, consent, deduplication and attribution`,
    feedDescription: "Server-side tracking, consent and attribution guides",
    all: "All topics",
    minutes: "{n} min read",
    rss: "RSS feed",
    empty: "No articles published yet.",
    emptyFiltered: "No articles match this selection yet.",
    filtered: "Filtered view",
    reset: "Show all articles",
    updated: "Updated",
    published: "Published",
    reviewed: "Reviewed",
    sources: "Sources",
    related: "Related articles",
    by: "By",
    topic: "Topic",
    level: "Level",
    legal: "This article provides general information, not legal advice. Consult your data protection counsel for your specific situation.",
    breadcrumbHome: "Track",
  },
  de: {
    name: KNOWLEDGE_NAME,
    intro: "Praxisnahe Anleitungen zu serverseitigem Tracking, Consent, Deduplizierung, Attribution und den einzelnen Werbeplattformen — geschrieben vom Team, das die Connectoren baut.",
    cardAlt: `Track ${KNOWLEDGE_NAME}: Anleitungen zu Server-Side Tracking, Consent, Deduplizierung und Attribution`,
    feedDescription: "Anleitungen zu Server-Side Tracking, Consent und Attribution",
    all: "Alle Themen",
    minutes: "{n} Min. Lesezeit",
    rss: "RSS-Feed",
    empty: "Noch keine Artikel veröffentlicht.",
    emptyFiltered: "Für diese Auswahl gibt es noch keine Artikel.",
    filtered: "Gefilterte Ansicht",
    reset: "Alle Artikel anzeigen",
    updated: "Aktualisiert",
    published: "Veröffentlicht",
    reviewed: "Geprüft",
    sources: "Quellen",
    related: "Verwandte Artikel",
    by: "Von",
    topic: "Thema",
    level: "Wissensstufe",
    legal: "Dieser Artikel bietet allgemeine Informationen, keine Rechtsberatung. Wende dich für deinen konkreten Fall an deine Datenschutzberatung.",
    breadcrumbHome: "Track",
  },
};

export function knowledgeCopy(locale: string): KnowledgeCopy {
  return locale === "de" ? KNOWLEDGE_COPY.de : KNOWLEDGE_COPY.en;
}

export function readingLabel(locale: string, minutes: number): string {
  return knowledgeCopy(locale).minutes.replace("{n}", String(minutes));
}

export function formatDate(locale: string, iso: string): string {
  return new Date(iso).toLocaleDateString(locale === "de" ? "de-DE" : "en-GB", { year: "numeric", month: "long", day: "numeric" });
}
