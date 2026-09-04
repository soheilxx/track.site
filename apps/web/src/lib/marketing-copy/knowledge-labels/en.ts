import type { KnowledgeLabels } from "../types";

/**
 * English (source language) labels of the knowledge taxonomy and author records. Same shape as
 * every other locale file; see docs/14-localization.md. "Tracking Knowledge" and "Track" never change.
 */

export const KNOWLEDGE_LABELS_EN: KnowledgeLabels = {
  topics: {
    "getting-started": "Getting Started",
    "pixel-platform-integrations": "Pixel & Platform Integrations",
    "server-side-tracking": "Server-Side Tracking",
    "ecommerce-tracking": "Ecommerce Tracking",
    "consent-privacy": "Consent & Privacy",
    "attribution-analytics": "Attribution & Analytics",
    "ai-data-quality": "AI & Data Quality",
    troubleshooting: "Troubleshooting",
    "product-updates": "Product Updates",
  },
  contentTypes: { guide: "Guide", tutorial: "Tutorial", reference: "Reference", explainer: "Explainer", update: "Update" },
  levels: { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" },
  recency: { "30d": "Last 30 days", "90d": "Last 90 days", "365d": "Last 12 months" },
  authors: {
    "track-editorial": {
      displayName: "Track editorial team",
      role: "Product & engineering",
      bio: "The people building Track: engineers and analysts who work on server-side tracking, consent tooling and connector integrations every day.",
    },
  },
  socialCardAlt: "Track Tracking Knowledge: {title}",
};
