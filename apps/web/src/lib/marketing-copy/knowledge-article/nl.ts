import type { KnowledgeArticleCopy } from "../types";

/**
 * Dutch (nl) copy of the knowledge-article area, informal "je/jij" like the rest of the Dutch copy. Same shape as
 * en.ts; see docs/14-localization.md.
 */

export const KNOWLEDGE_ARTICLE_COPY_NL: KnowledgeArticleCopy = {
  breadcrumbs: { label: "Kruimelpad", home: "Track" },
  meta: { by: "Door", published: "Gepubliceerd", updated: "Bijgewerkt", reviewed: "Laatst gecontroleerd", readingTime: "Leestijd", minutes: "{n} min leestijd" },
  progress: "Leesvoortgang",
  toc: "Inhoud",
  takeaways: "Belangrijkste punten",
  callouts: { note: "Opmerking", warning: "Waarschuwing", privacy: "Privacy", practice: "In de praktijk" },
  code: { copy: "Code kopiëren", copied: "Gekopieerd" },
  steps: "Stappen",
  checklist: { open: "Te doen", done: "Gedaan" },
  sources: { heading: "Primaire bronnen", text: "Documentatie en standaarden waarop dit artikel is gebaseerd." },
  legal: "Dit artikel biedt algemene informatie, geen juridisch advies. Raadpleeg voor jouw specifieke situatie een jurist die gespecialiseerd is in gegevensbescherming.",
  editor: "Verantwoordelijke redactie",
  cta: {
    eyebrow: "Track",
    items: {
      "ai-setup": { title: "Tracking instellen met Track AI", text: "Beschrijf je site en platformen; Track AI stelt de eventsetup voor en jij keurt elke wijziging goed voordat die live gaat.", label: "Bekijk de AI-setup" },
      integrations: { title: "Koppel je platformen", text: "Meta, Google, TikTok, LinkedIn en meer — browser en server-side met hetzelfde eventmodel en één toestemmingsstatus.", label: "Bekijk de integraties" },
      "server-side": { title: "Server-side tracking zonder zelfbouw", text: "First-party-verzameling, deduplicatie en aflevering aan de server-API's van de platformen zijn in Track ingebouwd.", label: "Hoe server-side tracking werkt" },
      ecommerce: { title: "Geverifieerde shopevents", text: "Orders uit Shopify, WooCommerce en Shopware bereiken Track als geverifieerde serverevents, gededupliceerd tegen de browser.", label: "Bekijk de shopintegraties" },
      consent: { title: "Toestemming afgedwongen bij de bron", text: "Track leidt elk event door je toestemmingsstatus voordat er iets de browser of de server verlaat.", label: "Bekijk de toestemmingsafhandeling" },
      attribution: { title: "Attributie die je kunt controleren", text: "Track laat per platform zien welke click-ID's zijn vastgelegd, doorgestuurd of geblokkeerd.", label: "Bekijk attributie" },
      "data-quality": { title: "Vind datagaten voordat de platformen dat doen", text: "De Data Quality Inbox markeert ontbrekende waarden, dubbele aankopen en mislukte afleveringen met een uitlegbare fix.", label: "Bekijk datakwaliteit" },
      debugger: { title: "Debug events terwijl ze binnenkomen", text: "De event-debugger toont elk event met herkomst, toestemmingsstatus, dedup-markering en afleverresultaat.", label: "Bekijk de event-debugger" },
      product: { title: "Zie hoe Track werkt", text: "Snippet, server-side aflevering, toestemming en de AI-setup in één doorloop.", label: "Hoe het werkt" },
    },
  },
  related: "Gerelateerde artikelen",
  feedback: { heading: "Was dit artikel nuttig?", yes: "Ja", no: "Nee", sending: "Verzenden…", thanks: "Bedankt voor je feedback.", error: "Je feedback kon niet worden opgeslagen. Probeer het later opnieuw." },
};
