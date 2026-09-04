import type { KnowledgeArticleCopy } from "../types";

/**
 * Italian (it) copy of the Tracking Knowledge article template. Same shape as en.ts; see docs/14-localization.md.
 * Register: tu. "Tracking Knowledge", "Track" and "Track AI" stay identical in every language; CTA keys unchanged.
 */

export const KNOWLEDGE_ARTICLE_COPY_IT: KnowledgeArticleCopy = {
  breadcrumbs: { label: "Percorso di navigazione", home: "Track" },
  meta: { by: "Di", published: "Pubblicato", updated: "Aggiornato", reviewed: "Ultima revisione", readingTime: "Tempo di lettura", minutes: "{n} min di lettura" },
  progress: "Avanzamento della lettura",
  toc: "Indice",
  takeaways: "Punti chiave",
  callouts: { note: "Nota", warning: "Attenzione", privacy: "Privacy", practice: "In pratica" },
  code: { copy: "Copia il codice", copied: "Copiato" },
  steps: "Passaggi",
  checklist: { open: "Da fare", done: "Fatto" },
  sources: { heading: "Fonti primarie", text: "Documentazione e standard su cui si basa questo articolo." },
  legal: "Questo articolo fornisce informazioni generali, non consulenza legale. Per la tua situazione specifica rivolgiti al tuo consulente in materia di protezione dei dati.",
  editor: "Redazione responsabile",
  cta: {
    eyebrow: "Track",
    items: {
      "ai-setup": { title: "Configura il tracking con Track AI", text: "Descrivi il tuo sito e le tue piattaforme; Track AI propone la configurazione degli eventi e tu approvi ogni modifica prima che vada in produzione.", label: "Scopri la configurazione AI" },
      integrations: { title: "Collega le tue piattaforme", text: "Meta, Google, TikTok, LinkedIn e altre: browser e server-side con lo stesso modello di eventi e un unico stato del consenso.", label: "Esplora le integrazioni" },
      "server-side": { title: "Tracking server-side senza l’infrastruttura da gestire", text: "Raccolta first-party, deduplicazione e consegna alle API server delle piattaforme sono integrate in Track.", label: "Come funziona il tracking server-side" },
      ecommerce: { title: "Eventi shop verificati", text: "Gli ordini di Shopify, WooCommerce e Shopware raggiungono Track come eventi server verificati, deduplicati rispetto al browser.", label: "Scopri le integrazioni e-commerce" },
      consent: { title: "Consenso applicato alla fonte", text: "Track fa passare ogni evento dal tuo stato del consenso prima che qualcosa lasci il browser o il server.", label: "Scopri la gestione del consenso" },
      attribution: { title: "Un’attribuzione che puoi verificare", text: "Track mostra per ogni piattaforma quali click ID sono stati acquisiti, inoltrati o bloccati.", label: "Scopri l’attribuzione" },
      "data-quality": { title: "Trova le lacune nei dati prima delle piattaforme", text: "La Data Quality Inbox segnala valori mancanti, acquisti duplicati e consegne fallite con una correzione spiegabile.", label: "Scopri la qualità dei dati" },
      debugger: { title: "Esegui il debug degli eventi in tempo reale", text: "L’event debugger mostra ogni evento con origine, stato del consenso, marcatore di dedup e risultato della consegna.", label: "Scopri l’event debugger" },
      product: { title: "Scopri come funziona Track", text: "Snippet, consegna server-side, consenso e configurazione AI in un’unica panoramica.", label: "Come funziona" },
    },
  },
  related: "Articoli correlati",
  feedback: { heading: "Questo articolo ti è stato utile?", yes: "Sì", no: "No", sending: "Invio in corso…", thanks: "Grazie per il tuo feedback.", error: "Non è stato possibile salvare il tuo feedback. Riprova più tardi." },
};
