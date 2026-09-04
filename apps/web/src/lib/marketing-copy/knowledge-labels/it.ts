import type { KnowledgeLabels } from "../types";

/**
 * Italian (it) labels of the knowledge taxonomy and author records. Same shape as en.ts; see
 * docs/14-localization.md. "Tracking Knowledge" and "Track" never change.
 */

export const KNOWLEDGE_LABELS_IT: KnowledgeLabels = {
  topics: {
    "getting-started": "Primi passi",
    "pixel-platform-integrations": "Pixel e integrazioni con le piattaforme",
    "server-side-tracking": "Server-Side Tracking",
    "ecommerce-tracking": "Tracking e-commerce",
    "consent-privacy": "Consenso e privacy",
    "attribution-analytics": "Attribuzione e analytics",
    "ai-data-quality": "AI e qualità dei dati",
    troubleshooting: "Risoluzione dei problemi",
    "product-updates": "Novità del prodotto",
  },
  contentTypes: { guide: "Guida", tutorial: "Tutorial", reference: "Riferimento", explainer: "Approfondimento", update: "Aggiornamento" },
  levels: { beginner: "Base", intermediate: "Intermedio", advanced: "Avanzato" },
  recency: { "30d": "Ultimi 30 giorni", "90d": "Ultimi 90 giorni", "365d": "Ultimi 12 mesi" },
  authors: {
    "track-editorial": {
      displayName: "Redazione Track",
      role: "Prodotto e engineering",
      bio: "Le persone che costruiscono Track: engineer e analyst che lavorano ogni giorno su server-side tracking, strumenti per il consenso e integrazioni con i connettori.",
    },
  },
  socialCardAlt: "Track Tracking Knowledge: {title}",
};
