import type { KnowledgeLabels } from "../types";

/**
 * Dutch (nl) labels of the knowledge taxonomy and author records. Same shape as en.ts; see
 * docs/14-localization.md. "Tracking Knowledge" and "Track" never change.
 */

export const KNOWLEDGE_LABELS_NL: KnowledgeLabels = {
  topics: {
    "getting-started": "Aan de slag",
    "pixel-platform-integrations": "Pixel- & platformintegraties",
    "server-side-tracking": "Server-side tracking",
    "ecommerce-tracking": "E-commercetracking",
    "consent-privacy": "Toestemming & privacy",
    "attribution-analytics": "Attributie & analytics",
    "ai-data-quality": "AI & datakwaliteit",
    troubleshooting: "Probleemoplossing",
    "product-updates": "Productupdates",
  },
  contentTypes: { guide: "Gids", tutorial: "Tutorial", reference: "Referentie", explainer: "Uitleg", update: "Update" },
  levels: { beginner: "Beginner", intermediate: "Gevorderd", advanced: "Expert" },
  recency: { "30d": "Laatste 30 dagen", "90d": "Laatste 90 dagen", "365d": "Laatste 12 maanden" },
  authors: {
    "track-editorial": {
      displayName: "Track-redactie",
      role: "Product & engineering",
      bio: "De mensen achter Track: engineers en analisten die dagelijks werken aan server-side tracking, toestemmingstooling en connectorintegraties.",
    },
  },
  socialCardAlt: "Track Tracking Knowledge: {title}",
};
