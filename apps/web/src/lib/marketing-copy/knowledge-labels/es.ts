import type { KnowledgeLabels } from "../types";

/**
 * Spanish (es, Spain) labels of the knowledge taxonomy and author records. Same shape as en.ts; see
 * docs/14-localization.md. "Tracking Knowledge" and "Track" never change.
 */

export const KNOWLEDGE_LABELS_ES: KnowledgeLabels = {
  topics: {
    "getting-started": "Primeros pasos",
    "pixel-platform-integrations": "Píxeles e integraciones de plataformas",
    "server-side-tracking": "Tracking server-side",
    "ecommerce-tracking": "Tracking de e-commerce",
    "consent-privacy": "Consentimiento y privacidad",
    "attribution-analytics": "Atribución y analítica",
    "ai-data-quality": "IA y calidad de datos",
    troubleshooting: "Resolución de problemas",
    "product-updates": "Novedades del producto",
  },
  contentTypes: { guide: "Guía", tutorial: "Tutorial", reference: "Referencia", explainer: "Explicación", update: "Novedad" },
  levels: { beginner: "Principiante", intermediate: "Intermedio", advanced: "Avanzado" },
  recency: { "30d": "Últimos 30 días", "90d": "Últimos 90 días", "365d": "Últimos 12 meses" },
  authors: {
    "track-editorial": {
      displayName: "Equipo editorial de Track",
      role: "Producto e ingeniería",
      bio: "Las personas que construyen Track: ingenieros y analistas que trabajan a diario en tracking server-side, herramientas de consentimiento e integraciones de conectores.",
    },
  },
  socialCardAlt: "Track Tracking Knowledge: {title}",
};
