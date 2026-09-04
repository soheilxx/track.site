import type { KnowledgeCopy, KnowledgeHubCopy } from "../types";

/**
 * Italian (it) copy of the knowledge area (hub + index/feed/social-card copy). Same shape as en.ts;
 * see docs/14-localization.md. Register: tu. "Tracking Knowledge" and "Track" stay identical in every
 * language; topic ids and placeholders (`{n}`, `{total}`, `{q}`) are unchanged.
 */

export const KNOWLEDGE_HUB_COPY_IT: KnowledgeHubCopy = {
  meta: {
    description: "Guide, tutorial e riferimenti su tracking server-side, consenso, deduplicazione e attribuzione per ogni piattaforma pubblicitaria e sistema e-commerce.",
    searchTitle: "Ricerca «{q}»",
  },
  breadcrumbs: { label: "Percorso di navigazione", home: "Track" },
  hero: {
    eyebrow: "Track",
    lead: "Tracking server-side, consenso, deduplicazione e attribuzione, spiegati dal team che sviluppa i connettori. Cerca, esplora per argomento o segui un percorso di apprendimento.",
    articles: { one: "{n} articolo", other: "{n} articoli" },
    topics: { one: "{n} argomento", other: "{n} argomenti" },
    browse: "Sfoglia l’archivio",
    rss: "Feed RSS",
  },
  search: {
    label: "Cerca in Tracking Knowledge",
    placeholder: "Cerca, es. event_id, Consent Mode, Shopify …",
    clear: "Cancella la ricerca",
    submit: "Cerca",
    hint: "Errori di battitura e accenti sono tollerati. I risultati si aggiornano mentre digiti.",
    resultsAll: "Tutti i {total} articoli",
    resultsSome: "{n} di {total} articoli",
    resultsQuery: "{n} di {total} articoli per «{q}»",
  },
  featured: { eyebrow: "In evidenza", read: "Leggi l’articolo" },
  topics: {
    eyebrow: "Aree tematiche",
    title: "Nove argomenti, una sola tassonomia",
    text: "Ogni articolo appartiene esattamente a un argomento. Apri un argomento per vedere i suoi articoli nell’archivio.",
    articles: { one: "{n} articolo", other: "{n} articoli" },
    descriptions: {
      "getting-started": "Tassonomia degli eventi, prima configurazione e piani di migrazione: da dove parte il tracking con Track.",
      "pixel-platform-integrations": "Meta, Google, TikTok, LinkedIn, Microsoft e altri: pixel, Conversions API e i campi che ogni piattaforma si aspetta.",
      "server-side-tracking": "Cosa cambia quando gli eventi lasciano il browser: domini first-party, deduplicazione e consegna.",
      "ecommerce-tracking": "Shopify, WooCommerce e Shopware: ordini verificati, eventi di acquisto e abbinamento tramite ID ordine.",
      "consent-privacy": "Consent Mode, TCF, conservazione e richieste degli interessati: tracking che rispetta la scelta.",
      "attribution-analytics": "Click ID, finestre di attribuzione, conversioni offline e lead tracking senza doppio conteggio.",
      "ai-data-quality": "Il Tracking Health Score, strumenti AI tipizzati e i controlli che mantengono i dati onesti.",
      troubleshooting: "Ad blocker, ITP, playbook per gli incidenti e il kill switch: quando i numeri non tornano.",
      "product-updates": "Configurazione firmata, release e cosa è cambiato in Track.",
    },
  },
  paths: {
    eyebrow: "Percorsi di apprendimento",
    title: "Ordini di lettura curati",
    text: "Più articoli nell’ordine in cui si costruiscono l’uno sull’altro, con il tempo di lettura totale reale.",
    steps: { one: "{n} tappa", other: "{n} tappe" },
    minutes: "{n} min",
    step: "Tappa {n}",
  },
  guides: {
    eyebrow: "Piattaforme e sistemi e-commerce",
    title: "Guide per piattaforma e sistema e-commerce",
    text: "Ogni piattaforma e sistema e-commerce con almeno un articolo. Ogni link apre l’archivio filtrato di conseguenza.",
    platforms: "Piattaforme",
    shopSystems: "Sistemi e-commerce",
    articles: { one: "{n} articolo", other: "{n} articoli" },
  },
  fresh: {
    eyebrow: "Novità",
    newTitle: "Appena pubblicati",
    newText: "Gli articoli più recenti per data di pubblicazione.",
    updatedTitle: "Aggiornati di recente",
    updatedText: "Articoli rivisti dopo la pubblicazione, dalla revisione più recente.",
    updatedEmpty: "Nessun articolo è ancora stato rivisto dopo la pubblicazione. Le revisioni compaiono qui con la loro data.",
  },
  directory: {
    eyebrow: "Archivio",
    title: "Tutti gli articoli",
    text: "Filtra per argomento, piattaforma, sistema e-commerce, tipo di contenuto, livello e periodo. I numeri accanto a ogni filtro sono conteggi reali.",
    filtersTitle: "Filtri",
    facets: { topic: "Argomento", platform: "Piattaforma", shopSystem: "Sistema e-commerce", contentType: "Tipo di contenuto", level: "Livello", recency: "Periodo" },
    all: "Tutti",
    reset: "Reimposta i filtri",
    listLabel: "Articoli",
    emptyTitle: "Nessun articolo corrisponde ancora a questa ricerca.",
    emptyText: "Prova con una parola più breve, controlla l’ortografia o rimuovi un filtro. Ogni articolo pubblicato è elencato nell’archivio.",
    emptyAction: "Mostra tutti gli articoli",
    searching: "Ricerca in corso …",
  },
  card: { minutes: "{n} min di lettura", published: "Pubblicato", updated: "Aggiornato" },
  cta: {
    eyebrow: "Track",
    title: "Guarda il flusso sul tuo sito",
    text: "Aggiungi lo snippet, collega una destinazione e osserva eventi, stati del consenso e consegne nella dashboard di Track.",
    primary: "Inizia con il tuo dominio",
    secondary: "Come funziona Track",
  },
};

/** Index page metadata, feed and social-card copy; "Tracking Knowledge" is the fixed product name. */
export const KNOWLEDGE_COPY_IT: KnowledgeCopy = {
  name: "Tracking Knowledge",
  intro: "Guide pratiche su tracking server-side, consenso, deduplicazione, attribuzione e le singole piattaforme pubblicitarie, scritte dal team che sviluppa i connettori.",
  cardAlt: "Track Tracking Knowledge: guide su tracking server-side, consenso, deduplicazione e attribuzione",
  feedDescription: "Guide su tracking server-side, consenso e attribuzione",
  all: "Tutti gli argomenti",
  minutes: "{n} min di lettura",
  rss: "Feed RSS",
  empty: "Nessun articolo pubblicato per ora.",
  emptyFiltered: "Nessun articolo corrisponde ancora a questa selezione.",
  filtered: "Vista filtrata",
  reset: "Mostra tutti gli articoli",
  updated: "Aggiornato",
  published: "Pubblicato",
  reviewed: "Revisionato",
  sources: "Fonti",
  related: "Articoli correlati",
  by: "Di",
  topic: "Argomento",
  level: "Livello",
  legal: "Questo articolo fornisce informazioni generali, non consulenza legale. Per la tua situazione specifica rivolgiti al tuo consulente in materia di protezione dei dati.",
  breadcrumbHome: "Track",
};
