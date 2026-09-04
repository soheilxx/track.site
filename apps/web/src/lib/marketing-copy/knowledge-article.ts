import type { KnowledgeArticleCopy, LocalizedCopy } from "./types";

export type { KnowledgeArticleCopy, KnowledgeCtaItem, KnowledgeCtaKey } from "./types";

/**
 * Copy of the Tracking Knowledge article template (redesign supplement §6 "Neues Artikeltemplate"):
 * breadcrumbs, meta labels, table of contents, callout titles, sources, the contextual Track CTA,
 * related articles and the feedback question. The product name "Tracking Knowledge" and the brand
 * "Track" stay identical in every language; everything else is translated. CTA texts only repeat
 * what the linked feature pages state — no numbers, no social proof, no invented outcomes.
 */
export const KNOWLEDGE_ARTICLE_COPY: LocalizedCopy<KnowledgeArticleCopy> = {
  en: {
    breadcrumbs: { label: "Breadcrumb", home: "Track" },
    meta: { by: "By", published: "Published", updated: "Updated", reviewed: "Last reviewed", readingTime: "Reading time", minutes: "{n} min read" },
    progress: "Reading progress",
    toc: "Contents",
    takeaways: "Key takeaways",
    callouts: { note: "Note", warning: "Warning", privacy: "Privacy", practice: "In practice" },
    code: { copy: "Copy code", copied: "Copied" },
    steps: "Steps",
    checklist: { open: "To do", done: "Done" },
    sources: { heading: "Primary sources", text: "Documentation and standards this article is based on." },
    legal: "This article provides general information, not legal advice. Consult your data protection counsel for your specific situation.",
    editor: "Responsible editor",
    cta: {
      eyebrow: "Track",
      items: {
        "ai-setup": { title: "Set up tracking with Track AI", text: "Describe your site and platforms; Track AI proposes the event setup and you approve every change before it goes live.", label: "See the AI setup" },
        integrations: { title: "Connect your platforms", text: "Meta, Google, TikTok, LinkedIn and more — browser and server-side with the same event model and one consent state.", label: "Browse integrations" },
        "server-side": { title: "Server-side tracking without the plumbing", text: "First-party collection, deduplication and delivery to the platforms' server APIs are built into Track.", label: "How server-side tracking works" },
        ecommerce: { title: "Verified shop events", text: "Shopify, WooCommerce and Shopware orders reach Track as verified server events, deduplicated against the browser.", label: "See the shop integrations" },
        consent: { title: "Consent enforced at the source", text: "Track routes every event through your consent state before anything leaves the browser or the server.", label: "See consent handling" },
        attribution: { title: "Attribution you can check", text: "Track shows per platform which click identifiers were captured, forwarded or blocked.", label: "See attribution" },
        "data-quality": { title: "Find data gaps before the platforms do", text: "The data quality inbox flags missing values, duplicate purchases and failed deliveries with an explainable fix.", label: "See data quality" },
        debugger: { title: "Debug events as they happen", text: "The event debugger shows every event with its origin, consent state, dedup marker and delivery result.", label: "See the event debugger" },
        product: { title: "See how Track works", text: "Snippet, server-side delivery, consent and the AI setup in one walkthrough.", label: "How it works" },
      },
    },
    related: "Related articles",
    feedback: { heading: "Was this article helpful?", yes: "Yes", no: "No", sending: "Sending…", thanks: "Thank you for your feedback.", error: "Your feedback could not be saved. Please try again later." },
  },
  de: {
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
  },
};
