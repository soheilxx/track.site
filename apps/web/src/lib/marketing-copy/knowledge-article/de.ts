import type { KnowledgeArticleCopy } from "../types";

/**
 * German (de) copy of the knowledge-article area. Same shape as en.ts; see docs/14-localization.md.
 */

export const KNOWLEDGE_ARTICLE_COPY_DE: KnowledgeArticleCopy = {
  breadcrumbs: { label: "Navigationspfad", home: "Track" },
  meta: { by: "Von", published: "Veröffentlicht", updated: "Aktualisiert", reviewed: "Zuletzt fachlich geprüft", readingTime: "Lesedauer", minutes: "{n} Min. Lesezeit" },
  progress: "Lesefortschritt",
  toc: "Inhalt",
  takeaways: "Das Wichtigste in Kürze",
  callouts: { note: "Hinweis", warning: "Warnung", privacy: "Datenschutz", practice: "In der Praxis" },
  code: { copy: "Code kopieren", copied: "Kopiert" },
  steps: "Schritte",
  checklist: { open: "Offen", done: "Erledigt" },
  sources: { heading: "Primärquellen", text: "Dokumentationen und Standards, auf denen dieser Artikel beruht." },
  legal: "Dieser Artikel bietet allgemeine Informationen, keine Rechtsberatung. Wende dich für deinen konkreten Fall an deine Datenschutzberatung.",
  editor: "Fachlich verantwortlich",
  cta: {
    eyebrow: "Track",
    items: {
      "ai-setup": { title: "Tracking mit Track AI einrichten", text: "Beschreibe deine Website und Plattformen; Track AI schlägt das Event-Setup vor, und du gibst jede Änderung frei, bevor sie live geht.", label: "Zum AI-Setup" },
      integrations: { title: "Plattformen verbinden", text: "Meta, Google, TikTok, LinkedIn und mehr — Browser und Server-Side mit demselben Event-Modell und einem Consent-Zustand.", label: "Integrationen ansehen" },
      "server-side": { title: "Server-Side Tracking ohne Eigenbau", text: "First-Party-Erfassung, Deduplizierung und Auslieferung an die Server-APIs der Plattformen sind in Track eingebaut.", label: "So funktioniert Server-Side Tracking" },
      ecommerce: { title: "Verifizierte Shop-Events", text: "Bestellungen aus Shopify, WooCommerce und Shopware erreichen Track als verifizierte Server-Events, dedupliziert gegen den Browser.", label: "Shop-Integrationen ansehen" },
      consent: { title: "Consent an der Quelle durchgesetzt", text: "Track leitet jedes Event durch deinen Consent-Zustand, bevor etwas den Browser oder den Server verlässt.", label: "Consent-Handling ansehen" },
      attribution: { title: "Attribution, die du prüfen kannst", text: "Track zeigt pro Plattform, welche Click-IDs erfasst, weitergeleitet oder blockiert wurden.", label: "Attribution ansehen" },
      "data-quality": { title: "Datenlücken finden, bevor es die Plattformen tun", text: "Die Data-Quality-Inbox markiert fehlende Werte, doppelte Käufe und fehlgeschlagene Auslieferungen mit einem nachvollziehbaren Fix.", label: "Datenqualität ansehen" },
      debugger: { title: "Events live debuggen", text: "Der Event-Debugger zeigt jedes Event mit Herkunft, Consent-Zustand, Dedup-Marker und Auslieferungsergebnis.", label: "Zum Event-Debugger" },
      product: { title: "So funktioniert Track", text: "Snippet, Server-Side-Auslieferung, Consent und AI-Setup in einem Durchgang.", label: "So funktioniert es" },
    },
  },
  related: "Verwandte Artikel",
  feedback: { heading: "War dieser Artikel hilfreich?", yes: "Ja", no: "Nein", sending: "Wird gesendet …", thanks: "Danke für dein Feedback.", error: "Dein Feedback konnte nicht gespeichert werden. Bitte versuche es später noch einmal." },
};
