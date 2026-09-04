import type { KnowledgeLabels } from "../types";

/**
 * German (de) labels of the knowledge taxonomy and author records. Same shape as en.ts; see
 * docs/14-localization.md. "Tracking Knowledge" and "Track" never change.
 */

export const KNOWLEDGE_LABELS_DE: KnowledgeLabels = {
  topics: {
    "getting-started": "Erste Schritte",
    "pixel-platform-integrations": "Pixel- & Plattform-Integrationen",
    "server-side-tracking": "Server-Side Tracking",
    "ecommerce-tracking": "E-Commerce-Tracking",
    "consent-privacy": "Consent & Datenschutz",
    "attribution-analytics": "Attribution & Analytics",
    "ai-data-quality": "KI & Datenqualität",
    troubleshooting: "Fehlerbehebung",
    "product-updates": "Produkt-Updates",
  },
  contentTypes: { guide: "Leitfaden", tutorial: "Tutorial", reference: "Referenz", explainer: "Erklärung", update: "Update" },
  levels: { beginner: "Einsteiger", intermediate: "Fortgeschrittene", advanced: "Experten" },
  recency: { "30d": "Letzte 30 Tage", "90d": "Letzte 90 Tage", "365d": "Letzte 12 Monate" },
  authors: {
    "track-editorial": {
      displayName: "Track-Redaktion",
      role: "Produkt & Engineering",
      bio: "Die Menschen hinter Track: Engineers und Analysts, die täglich an Server-Side Tracking, Consent-Tooling und Connector-Integrationen arbeiten.",
    },
  },
  socialCardAlt: "Track Tracking Knowledge: {title}",
};
