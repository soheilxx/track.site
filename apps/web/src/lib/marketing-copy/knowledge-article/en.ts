import type { KnowledgeArticleCopy } from "../types";

/**
 * English (source language) copy of the knowledge-article area. Same shape as every other locale file; see docs/14-localization.md.
 */

export const KNOWLEDGE_ARTICLE_COPY_EN: KnowledgeArticleCopy = {
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
};
