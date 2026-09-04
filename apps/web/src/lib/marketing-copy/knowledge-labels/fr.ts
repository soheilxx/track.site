import type { KnowledgeLabels } from "../types";

/**
 * French (fr) labels of the knowledge taxonomy and author records. Same shape as en.ts; see
 * docs/14-localization.md. "Tracking Knowledge" and "Track" never change. Register: vous.
 */

export const KNOWLEDGE_LABELS_FR: KnowledgeLabels = {
  topics: {
    "getting-started": "Premiers pas",
    "pixel-platform-integrations": "Pixels et intégrations de plateformes",
    "server-side-tracking": "Tracking côté serveur",
    "ecommerce-tracking": "Tracking e-commerce",
    "consent-privacy": "Consentement et confidentialité",
    "attribution-analytics": "Attribution et analytics",
    "ai-data-quality": "IA et qualité des données",
    troubleshooting: "Dépannage",
    "product-updates": "Nouveautés produit",
  },
  contentTypes: { guide: "Guide", tutorial: "Tutoriel", reference: "Référence", explainer: "Explication", update: "Mise à jour" },
  levels: { beginner: "Débutant", intermediate: "Intermédiaire", advanced: "Avancé" },
  recency: { "30d": "30 derniers jours", "90d": "90 derniers jours", "365d": "12 derniers mois" },
  authors: {
    "track-editorial": {
      displayName: "Rédaction Track",
      role: "Produit et ingénierie",
      bio: "Les personnes qui construisent Track : des ingénieurs et des analystes qui travaillent chaque jour sur le tracking côté serveur, les outils de consentement et les intégrations de connecteurs.",
    },
  },
  socialCardAlt: "Track Tracking Knowledge : {title}",
};
