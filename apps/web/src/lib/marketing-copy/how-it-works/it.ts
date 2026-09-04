import type { HowItWorksCopy } from "../types";
import { SNIPPET } from "./samples";

/**
 * Italian (it, "tu" register) copy of the how-it-works area. Same shape as en.ts; see docs/14-localization.md.
 */

export const HOW_IT_WORKS_IT: HowItWorksCopy = {
  eyebrow: "Come funziona",
  title: "Dal tuo dominio a conversioni verificate su ogni piattaforma",
  intro: "Uno snippet sul tuo sito, una sessione guidata con l'assistente, una configurazione firmata che approvi tu. Da lì in poi Track si occupa degli eventi — con il consenso valutato per ogni destinazione e un debugger che ti mostra cosa è successo.",
  cta: "Inizia con il tuo dominio",
  ctaSecondary: "Scopri le funzionalità",
  stage: {
    title: "Snippet → Track → piattaforme",
    description: "Lo snippet sul tuo sito web invia gli eventi dal browser; il tuo shop o il tuo server invia le stesse conversioni con un ID evento condiviso. Track valuta il consenso a un gate di policy e inoltra ogni evento a Meta, Google Ads, Google Analytics 4 e TikTok.",
    caption: "Snippet → Track → consenso/policy → piattaforme. La stessa immagine che vedi nel debugger per ogni evento reale.",
  },
  milestonesTitle: "Quattro traguardi, una sessione",
  milestonesText: "Questa è la prospettiva del cliente. Le verifiche tecniche dietro ogni traguardo sono elencate più in basso.",
  youLabel: "Tu",
  outcomeLabel: "Ottieni",
  steps: [
    { title: "Crea il tuo sito", text: "Registrati con il tuo dominio. Track crea il sito, un ID di tracking pubblico di sei caratteri e lo snippet di una riga.", you: "inserisci il dominio e incolli lo snippet — oppure installi l'app Shopify, WooCommerce o Shopware", outcome: "un'installazione verificata: Track vede la prima visualizzazione di pagina e conferma la proprietà tramite DNS, file o meta tag" },
    { title: "Lascia che l'assistente proponga la configurazione", text: "L'assistente rileva piattaforma e strumento di consenso, propone un piano eventi per il tuo tipo di attività e chiede gli ID pubblici delle piattaforme che usi.", you: "rispondi a qualche domanda e inserisci gli ID pixel in chat, i token di accesso nella scheda vault", outcome: "una bozza di configurazione con eventi mappati e un evento di test reale accettato dalla piattaforma" },
    { title: "Approva e pubblica", text: "Vedi il diff, i destinatari e il requisito di consenso di ogni destinazione. Una sola approvazione pubblica un bundle firmato e versionato.", you: "leggi il diff e clicchi su Approva", outcome: "una configurazione attiva con il suo numero di versione, rollback disponibile con un clic" },
    { title: "Osserva e migliora", text: "Il debugger mostra ogni evento con la sua decisione, l'health score segnala cosa correggere e l'assistente propone la correzione.", you: "controlli lo score quando cambia; approvi i miglioramenti", outcome: "conversioni verificate su ogni piattaforma, con evidenze per ogni evento" },
  ],
  snippet: { title: "Lo snippet", code: SNIPPET, copy: "Copia lo snippet", copied: "Copiato", note: "Servito da un host CDN first-party; la configurazione che carica è firmata con Ed25519 e verificata prima che qualsiasi cosa venga eseguita." },
  published: {
    title: "Configurazione · versione 13",
    state: "live",
    facts: [
      { label: "Approvata da", value: "te, vincolata al diff che hai letto" },
      { label: "Firma", value: "Ed25519, verificata dall'SDK" },
      { label: "Destinazioni", value: "Meta (browser + server), Google Ads (server)" },
      { label: "Rollback", value: "versione 12, un clic" },
    ],
  },
  flows: {
    title: "Da dove arrivano i tuoi eventi",
    text: "Passa da una modalità di consegna all'altra. Ogni destinazione può funzionare solo via browser, solo via server o in entrambi i modi; la modalità ibrida è quella di default perché i due percorsi coprono a vicenda le rispettive lacune.",
    tabsLabel: "Modalità di consegna",
    items: [
      {
        id: "browser",
        label: "Solo browser",
        title: "Eventi dall'SDK browser",
        text: "Lo snippet raccoglie visualizzazioni di pagina, visualizzazioni di prodotto ed eventi del carrello nel browser del visitatore e li invia all'host di ingest di Track. I tag delle piattaforme vengono caricati solo dopo il consenso. Questa modalità è rapida da installare ma dipende dal browser: script bloccati e schede chiuse fanno perdere eventi.",
        points: ["Installazione: uno snippet", "Consenso: valutato nel browser e di nuovo sul server", "Lacuna: nessun evento se lo script è bloccato o la scheda si chiude troppo presto"],
      },
      {
        id: "server",
        label: "Solo server",
        title: "Eventi dal tuo server o dal tuo shop",
        text: "La tua piattaforma e-commerce, il tuo backend o il tuo CRM invia le conversioni all'API server con una source key. Acquisti, rimborsi e conversioni offline arrivano in modo affidabile e non vengono mai bloccati nel browser. I dati di matching si limitano a ciò che il tuo server conosce.",
        points: ["Installazione: app per lo shop o una richiesta firmata dal tuo backend", "Affidabile per acquisti, rimborsi e lead dal tuo CRM", "Lacuna: meno segnali browser per il matching"],
      },
      {
        id: "hybrid",
        label: "Browser + server",
        title: "Entrambi i percorsi, un solo ID evento",
        text: "Browser e server inviano la stessa conversione con lo stesso ID evento. Track normalizza entrambi, applica la decisione sul consenso per ogni destinazione e li inoltra; le piattaforme deduplicano sull'ID evento o sull'ID ordine. Ottieni la copertura del percorso server con la qualità di matching del percorso browser.",
        points: ["Modalità di default per ogni destinazione che supporta entrambi", "Deduplicazione: ID evento (Meta, TikTok, Pinterest, Snapchat, Microsoft, LinkedIn …), ID ordine (Google Ads)", "Consenso: una decisione per evento e destinazione, per entrambi i percorsi"],
      },
    ],
  },
  checks: {
    title: "Cosa verifica Track lungo il percorso",
    summary: "Mostra le verifiche tecniche dietro i quattro traguardi",
    intro: "Queste verifiche vengono eseguite durante la sessione guidata e in seguito nel worker. Sono il motivo per cui i quattro traguardi bastano — non devi controllarle a mano.",
    groups: [
      { title: "Sito e installazione", items: ["Formato e raggiungibilità del dominio", "Proprietà tramite record DNS, file di verifica o meta tag", "Snippet presente e firma della configurazione verificata nel browser", "Prima visualizzazione di pagina ricevuta sull'host di ingest"] },
      { title: "Piattaforma, strumento di consenso e piano eventi", items: ["Piattaforma e-commerce o CMS rilevata con un livello di confidenza", "Strumento di consenso rilevato (TCF 2.2, GPP, Cookiebot, OneTrust, Usercentrics o API di consenso)", "Modello di piano eventi scelto per il tipo di attività (shop, lead generation, SaaS, publisher)", "Parametri obbligatori per ogni evento standard, regole di denominazione per gli eventi personalizzati, PII bloccate nelle proprietà"] },
      { title: "Destinazioni e credenziali", items: ["ID pubblici validati rispetto al formato della piattaforma", "Token di accesso salvati nel vault tramite scheda o OAuth; mai nella trascrizione", "Finalità di consenso richiesta da ogni destinazione registrata", "Matrice dei click ID verificata: ogni ID inoltrato solo alla sua piattaforma"] },
      { title: "Test, revisione e pubblicazione", items: ["Evento di test inviato attraverso la coda e il worker reali; verdetto della piattaforma registrato", "Diff, elenco dei destinatari e approvatore vincolati a un unico token di approvazione", "Bundle firmato con Ed25519, versionato e immutabile", "Voce di audit per ogni chiamata a un tool e per ogni approvazione"] },
      { title: "Dopo il go-live", items: ["Health score: copertura del consenso, eventi critici, qualità dello schema, duplicati, consegna, freschezza", "Retry con backoff, circuit breaker e dead-letter queue per ogni destinazione", "Problemi raggruppati per fingerprint, ognuno indica il tool che lo risolve", "Rollback a qualsiasi versione precedente"] },
    ],
  },
  architectureTitle: "Due piani, una configurazione firmata",
  architectureText: "Un control plane per le persone e l'assistente, un data plane per gli eventi. Non condividono nulla se non la configurazione firmata — una prova tecnica che viene dopo i traguardi, non un prerequisito per usare Track.",
  architectureColumns: { component: "Componente", responsibility: "Responsabilità" },
  architecture: [
    { title: "SDK browser", text: "Storage condizionato al consenso, adattatori CMP, trasporto in batch, tracking delle SPA, loader delle piattaforme con ID di deduplicazione condivisi. Mantenuto sotto i 30 KB gzip da un budget in CI." },
    { title: "Collector", text: "Allow-list delle origini, rate limit, richieste server firmate con HMAC, kill switch, passaggio a una coda durevole prima di restituire il 202." },
    { title: "Worker", text: "Normalizzazione, scansione PII, policy sul consenso, event store, deduplicazione delle conversioni, registro dei consumi, fan-out, consegna con retry e DLQ." },
    { title: "Control plane", text: "Dashboard e assistente: tool tipizzati, approvazioni, audit log, RBAC, fatturazione, centro privacy — separati dal data plane." },
  ],
  faqTitle: "Domande",
  faq: [
    { q: "Mi serve un tag manager?", a: "No. Il tracker carica da solo i tag delle piattaforme dopo il consenso. Le configurazioni GTM esistenti possono coesistere durante la migrazione." },
    { q: "Dove vengono trattati i dati?", a: "Nell'UE. Le API delle piattaforme ricevono solo ciò che hai configurato, sulla base di trasferimento documentata per ogni destinazione." },
    { q: "Come è protetta la configurazione?", a: "I bundle sono immutabili, versionati e firmati con Ed25519; l'SDK verifica la firma prima di applicare qualsiasi configurazione." },
    { q: "E se il provider AI non è disponibile?", a: "Gli stessi stati di configurazione sono disponibili come procedura guidata basata su regole. Nulla nella pipeline dipende dal fatto che un modello sia online." },
  ],
  closing: { title: "Pronti quando lo sei tu", text: "Crea il tuo sito, incolla lo snippet e lascia che l'assistente configuri la prima destinazione.", cta: "Inizia gratis", secondary: "Leggi la documentazione" },
};
