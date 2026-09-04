import type { SecondaryCopy } from "../types";
import { CONSENT_CALL, SERVER_CALL, SNIPPET, browserEvents } from "./samples";

/**
 * Italian (it) copy of the secondary area (docs, support, contact, demo, status, security, legal frame).
 * Same shape as en.ts; see docs/14-localization.md. Register: tu. Endpoints, event names, parameter
 * names and platform names stay as in English; the imprint keeps the operator's statutory references.
 * Only the code comment passed to `browserEvents()` is translated; the snippets themselves are shared.
 */

export const SECONDARY_COPY_IT: SecondaryCopy = {
  common: { onThisPage: "In questa pagina", breadcrumb: "Percorso di navigazione", home: "Home", updated: "Ultimo aggiornamento", copy: "Copia il codice", copied: "Copiato", utc: "UTC", related: "Pagine correlate" },
  docs: {
    title: "Documentazione",
    intro: "Tutto ciò che serve per installare Track, inviare eventi server, integrare il consenso e configurare le destinazioni. L’assistente della dashboard rimanda qui per ogni passaggio.",
    toc: "In questa pagina",
    eyebrow: "Documentazione",
    links: { integrations: "Tutte le integrazioni", support: "Chiedi al supporto tecnico", knowledge: "Tracking Knowledge" },
    quickstart: {
      title: "Tre passaggi per una configurazione funzionante",
      text: "Installa una volta, invia i tuoi eventi, collega le piattaforme che usi. Ogni passaggio può essere verificato nella dashboard prima di proseguire.",
      outcomeLabel: "Puoi verificare",
      steps: [
        { title: "Installa lo snippet", text: "Aggiungi un tag script asincrono alle tue pagine. Carica la configurazione firmata per il tuo tracking ID e rispetta il consenso fin dalla prima visualizzazione di pagina.", outcome: "Le visualizzazioni di pagina compaiono nell’event debugger." },
        { title: "Invia i tuoi eventi", text: "Usa gli eventi standard dal browser, da un plugin dello shop o dal tuo server. Gli acquisti trasportano un ID ordine, così le copie browser e server vengono deduplicate.", outcome: "Ogni evento mostra il suo stato del consenso e il motivo per cui è stato consegnato o trattenuto." },
        { title: "Collega una destinazione", text: "La procedura guidata valida le credenziali, mappa gli eventi, invia un evento di test reale e pubblica solo dopo la tua approvazione.", outcome: "Lo stato delle consegne e l’ultima consegna riuscita vengono mostrati per ogni destinazione." },
      ],
    },
    flow: {
      title: "Il percorso di un evento",
      text: "Ogni evento segue lo stesso percorso, che arrivi dal browser, da un plugin dello shop o dal tuo server: Track lo valida e lo deduplica, valuta la policy di consenso e lo instrada alle destinazioni che hai configurato.",
      caption: "Sito web → Track → Consenso/Policy → Destinazioni. Un evento senza la finalità di consenso richiesta si ferma al gate: non viene né salvato né inoltrato.",
      nodes: { website: "Sito web", websiteSub: "browser · server", track: "Track", trackSub: "valida · deduplica · instrada", consent: "Consenso", destinations: "Destinazioni" },
      labels: { granted: "finalità concessa", held: "trattenuto: finalità assente" },
    },
    guidesTitle: "Guide",
    guides: [
      { id: "install", title: "Installa lo snippet", text: "Aggiungi lo script asincrono a ogni pagina, idealmente nell’head. Carica la configurazione firmata per il tuo tracking ID, rispetta il consenso e non blocca mai il rendering. Sostituisci TRACKING_ID con l’ID di sei caratteri della tua dashboard.", code: SNIPPET, language: "html", codeTitle: "Snippet" },
      { id: "events", title: "Invia eventi browser", text: "Gli eventi standard (page_view, view_item, add_to_cart, begin_checkout, purchase, generate_lead, sign_up, subscribe, start_trial, contact, book_appointment, download, search, login) trasportano parametri validati; gli eventi personalizzati usano nomi in snake_case minuscolo.", code: browserEvents("hash calcolato lato client prima dell'invio"), language: "js", codeTitle: "Browser" },
      { id: "server", title: "API server e conversioni offline", text: "Crea una source key in Impostazioni → Source key server e invia eventi dal tuo backend, CRM o POS. Fornisci lo stesso ID ordine dell’evento browser per la deduplicazione; aggiungi props.offline per le conversioni offline.", code: SERVER_CALL, language: "bash", codeTitle: "POST /v1/s" },
      { id: "consent", title: "Integrazione del consenso", text: "Usa una CMP supportata (TCF 2.2, GPP/GPC, Cookiebot, OneTrust, Usercentrics), che il tracker legge automaticamente, oppure chiama l’API di consenso dal tuo banner. Finalità: necessary, analytics, marketing, personalization. La revoca ferma tutto immediatamente.", code: CONSENT_CALL, language: "js", codeTitle: "API di consenso" },
      { id: "destinations", title: "Destinazioni", text: "Ogni destinazione ha una procedura guidata: identificatori, credenziali nel vault o OAuth, validazione del vendor, mappatura degli eventi con valori predefiniti verificati, un evento di test reale, lint, diff e pubblicazione soggetta ad approvazione. Browser e server condividono un unico ID evento; gli acquisti aggiungono l’ID ordine.", bullets: ["Meta, Google Ads/YouTube, GA4, TikTok, Microsoft, LinkedIn, Reddit, Pinterest, Snapchat", "X, Taboola, Outbrain, Amazon Ads, Spotify, Quora", "Yahoo DSP, The Trade Desk, Google Marketing Platform, AdRoll, Criteo, postback di affiliazione (13 preset), webhook"] },
      { id: "shops", title: "Piattaforme e-commerce", text: "Shopify (app con webhook degli ordini e web pixel), WooCommerce (plugin con webhook degli ordini firmati) e Shopware 6 (app con script storefront e webhook degli ordini) inviano eventi di acquisto e rimborso verificati con ID ordine. Installa il plugin, incolla tracking ID e chiave sorgente, fatto.", bullets: ["Sorgente verificata: gli eventi vengono contrassegnati come source_verified e usati come conversione autorevole", "I rimborsi creano eventi con valore negativo per i fornitori che li supportano", "Gli acquisti browser dal tema vengono deduplicati tramite l’ID ordine"] },
      { id: "privacy", title: "Centro privacy e DSAR", text: "Periodi di conservazione per tipo di dato, versioni della policy di consenso per sito e richieste degli interessati (esportazione, cancellazione, limitazione, rettifica, opposizione, portabilità) vengono gestiti in Consenso e privacy. Le richieste usano solo identificativi con hash e producono un report tracciato." },
    ],
    reference: {
      title: "Gli endpoint in sintesi",
      text: "Tutte le risposte sono JSON; 202 significa che il batch è stato messo in coda in modo durevole.",
      columns: { endpoint: "Endpoint", purpose: "Scopo", notes: "Note" },
      rows: [
        { endpoint: "POST /v1/e", purpose: "Batch browser", notes: "≤ 50 eventi per batch" },
        { endpoint: "POST /v1/s", purpose: "Batch server", notes: "≤ 100 eventi per batch, source key Bearer" },
        { endpoint: "POST /v1/affiliate/in/{trackingId}/{preset}", purpose: "Postback in entrata dai network di affiliazione", notes: "13 preset di network" },
        { endpoint: "GET /c/{trackingId}/manifest.json", purpose: "Manifest di configurazione e bundle firmato", notes: "Firmato con Ed25519, verificato dall’SDK browser" },
      ],
    },
  },
  support: {
    title: "Supporto",
    intro: "Qui i clienti raggiungono il supporto tecnico. Includi il tracking ID del tuo sito (sei caratteri, visibile nella dashboard) così possiamo guardare gli eventi giusti; non incollare mai token di accesso.",
    placeholder: "Tracking ID, destinazione, cosa ti aspettavi e cosa è successo.",
    eyebrow: "Supporto",
    formTitle: "Scrivi al supporto tecnico",
    before: {
      title: "Prima di scrivere",
      items: [
        { title: "Documentazione", text: "Installazione, eventi, consenso e destinazioni con esempi di codice.", href: "/docs" },
        { title: "Stato del sistema", text: "Stato in tempo reale di collector, coda e worker di consegna.", href: "/status" },
        { title: "Tracking Knowledge", text: "Guide su deduplicazione, Consent Mode e click ID.", href: "/tracking-knowledge" },
      ],
    },
    include: {
      title: "Cosa ci aiuta a rispondere in fretta",
      items: ["Il tuo tracking ID (sei caratteri, visibile nella dashboard)", "La destinazione e il nome dell’evento interessati", "Cosa ti aspettavi e cosa è successo, con l’orario", "Screenshot del debugger o del passaggio della procedura guidata; mai token di accesso o altri secret"],
    },
    reply: "Rispondiamo via e-mail all’indirizzo che inserisci.",
  },
  contact: {
    title: "Contatti",
    intro: "Domande su piani, volumi enterprise, accordi sul trattamento dei dati o partnership. Rispondiamo entro un giorno lavorativo.",
    enterprise: "Richiesta Enterprise: volumi personalizzati, SSO, SLA, elaborazione dedicata.",
    eyebrow: "Contatti",
    formTitle: "Invia un messaggio",
    topics: {
      title: "In cosa possiamo aiutarti",
      items: [
        { title: "Piani e fatturazione", text: "Quale piano si adatta al tuo volume di eventi, come funziona la fatturazione annuale, fatture." },
        { title: "Enterprise", text: "Volumi personalizzati, SSO, SLA ed elaborazione dedicata." },
        { title: "Trattamento dei dati", text: "L’accordo sul trattamento dei dati, i sub-responsabili e l’hosting in UE." },
        { title: "Partnership", text: "Agenzie, piattaforme e-commerce e provider di consent management." },
      ],
    },
    other: {
      title: "Cerchi qualcos’altro?",
      items: [
        { title: "Prenota una demo", text: "Trenta minuti con un ingegnere sul tuo sito reale.", href: "/demo" },
        { title: "Supporto", text: "Domande tecniche su una configurazione esistente.", href: "/support" },
      ],
    },
  },
  demo: {
    title: "Prenota una demo",
    intro: "Trenta minuti con un ingegnere: configuriamo una destinazione sul tuo sito reale, inviamo un evento di test e passiamo in rassegna consenso, deduplicazione e debugger.",
    agenda: ["Il tuo stack: piattaforma, CMP, tag attuali e punti critici", "Configurazione dal vivo di una destinazione con l’assistente", "Policy di consenso, click ID e conversioni offline per il tuo caso", "Prezzi, piano di migrazione e accordo sul trattamento dei dati"],
    placeholder: "Quali piattaforme e quale sistema e-commerce usi, e cosa vorresti vedere?",
    eyebrow: "Demo dal vivo",
    formTitle: "Richiedi un appuntamento",
    agendaTitle: "Cosa copriamo nei trenta minuti",
    duration: "30 minuti, online, con un ingegnere",
    prepare: { title: "Utile avere a portata di mano", items: ["Accesso al tuo sito web o a una copia di staging", "Le piattaforme su cui fai pubblicità", "La tua piattaforma di consent management, se ne usi una"] },
    honest: "Nessun copione di vendita: te ne vai con una destinazione configurata e una valutazione onesta di cosa Track può e non può fare per il tuo stack.",
  },
  status: {
    title: "Stato del sistema",
    intro: "Stato in tempo reale dei componenti di Track, controllato a ogni caricamento della pagina. La cronologia degli incidenti viene pubblicata qui quando se ne verifica uno.",
    component: "Componente",
    state: "Stato",
    checked: "Controllato",
    ok: "operativo",
    degraded: "degradato",
    down: "non disponibile",
    db: "Database del control plane",
    queue: "Backlog della coda eventi",
    worker: "Worker di consegna (ultimo tentativo di consegna)",
    collector: "Collector (ingest)",
    none: "ancora nessun dato",
    incidents: "Incidenti",
    noIncidents: "Nessun incidente registrato.",
    note: "Lo stato deriva dallo stesso database e dalla stessa coda usati dal prodotto; non esiste un servizio di stato separato che possa contraddirli.",
    eyebrow: "Stato",
    componentsTitle: "Componenti",
    detail: "Dettaglio",
    pending: "{n} in attesa",
    checkedAt: "Controllato alle",
    flow: { title: "Percorso degli eventi e stato attuale", caption: "Collector → coda → worker di consegna → destinazioni; il database del control plane conserva configurazione e record di consegna. Colore ed etichetta di ogni nodo corrispondono alla tabella sopra.", collector: "Collector", queue: "Coda", worker: "Worker di consegna", database: "Database", destinations: "Destinazioni" },
    incidentsText: "Quando un componente è degradato o non disponibile, l’incidente, il suo impatto e la risoluzione vengono registrati qui.",
  },
  security: {
    title: "Sicurezza",
    intro: "Come Track protegge i dati dei clienti: architettura, controlli e le garanzie che puoi verificare nel prodotto.",
    eyebrow: "Sicurezza",
    flow: {
      title: "Dove i dati vengono protetti lungo il percorso",
      text: "Dalla prima richiesta alla consegna, ogni passaggio ha un controllo: verifica dell’origine, rate limit e firme HMAC al collector, una coda durevole, la policy di consenso prima di qualsiasi instradamento e worker con retry, circuit breaker e una dead-letter queue. I kill switch fermano un sito o un’organizzazione in pochi secondi.",
      caption: "La configurazione firmata raggiunge il browser, gli eventi raggiungono il collector e solo gli eventi che superano la policy raggiungono una destinazione. Le credenziali dei vendor lasciano il vault solo all’interno del worker.",
      nodes: { website: "Sito web", config: "Config firmata", configSub: "Ed25519 · fail closed", collector: "Collector", collectorSub: "origine · rate limit · HMAC", queue: "Coda", queueSub: "durevole", policy: "Policy", worker: "Worker", workerSub: "retry · breaker · DLQ", destination: "Destinazione", vault: "Vault", vaultSub: "envelope KMS", kill: "Kill switch" },
    },
    controls: {
      title: "I controlli in sintesi",
      text: "Ogni controllo è descritto nelle sezioni sopra; questa tabella è la versione breve.",
      columns: { control: "Controllo", scope: "Ambito", mechanism: "Meccanismo" },
      rows: [
        { control: "Isolamento dei tenant", scope: "Ogni tabella tenant, ruolo applicativo", mechanism: "ID organizzazione su ogni riga, row-level security di PostgreSQL applicata" },
        { control: "Archiviazione dei secret", scope: "Credenziali dei vendor", mechanism: "Envelope encryption (chiavi dati AES-256-GCM avvolte da AWS KMS o da una master key locale); sono visibili solo un riferimento e gli ultimi quattro caratteri" },
        { control: "Configurazione firmata", scope: "SDK browser", mechanism: "Bundle immutabili, versionati e firmati con Ed25519, verificati con WebCrypto; fail closed" },
        { control: "Protezione dell’ingest", scope: "Collector", mechanism: "Validazione dell’origine, rate limit, richieste server firmate con HMAC, coda durevole prima della risposta" },
        { control: "Consegna", scope: "Worker", mechanism: "Retry, circuit breaker e una dead-letter queue" },
        { control: "Kill switch", scope: "Per sito o organizzazione", mechanism: "Fermano raccolta e consegna in pochi secondi" },
        { control: "Minimizzazione dei dati", scope: "Proprietà degli eventi, indirizzi IP", mechanism: "Lo scanner PII blocca i dati personali prima del salvataggio; gli IP vengono troncati all’ingresso; nessun fingerprinting" },
        { control: "Audit", scope: "Log di audit, registro dei consumi", mechanism: "Solo in append tramite trigger del database" },
        { control: "Accesso", scope: "Membri dell’organizzazione", mechanism: "Sei ruoli, MFA e passkey, accesso break-glass con motivazione obbligatoria e voce di audit" },
      ],
    },
    report: { title: "Segnala una vulnerabilità", text: "Ti chiediamo di segnalare le vulnerabilità in modo responsabile a", missing: "l’indirizzo pubblicato nelle note legali", ack: "Confermiamo la ricezione entro due giorni lavorativi e non nominiamo mai chi segnala senza il suo consenso." },
  },
  legal: {
    eyebrow: "Informazioni legali",
    operator: { title: "Gestore", company: "Azienda", address: "Indirizzo", representatives: "Rappresentato da", email: "E-mail", phone: "Telefono", register: "Registro", vatId: "Partita IVA", dpo: "Responsabile della protezione dei dati", missing: "Questi dati vengono pubblicati dal gestore prima del lancio (variabili d’ambiente LEGAL_*)." },
    related: { privacy: "Informativa sulla privacy", terms: "Termini di servizio", dpa: "Accordo sul trattamento dei dati", subprocessors: "Sub-responsabili", imprint: "Note legali", security: "Sicurezza" },
  },
  subprocessors: {
    title: "Sub-responsabili",
    intro: "Terze parti che trattano dati dei clienti per conto del gestore, e i fornitori pubblicitari che ricevono eventi solo quando un cliente li configura come destinazione.",
    processorsTitle: "Responsabili incaricati dal gestore",
    columns: { name: "Fornitore", purpose: "Scopo", region: "Regione", basis: "Base del trasferimento" },
    vendors: "Fornitori di destinazione (scelti dal cliente)",
    vendorsText: "Ogni destinazione mostra nella procedura guidata il destinatario dei dati, la regione e la base del trasferimento. I dati raggiungono un fornitore solo per le destinazioni che attivi e solo con la finalità di consenso richiesta dalla destinazione.",
    updated: "I clienti vengono informati 30 giorni prima di ogni modifica.",
  },
  imprint: {
    title: "Note legali",
    intro: "Informazioni legali sul gestore di questo sito ai sensi del § 5 DDG e del § 18 MStV.",
    dispute: "La Commissione europea mette a disposizione una piattaforma per la risoluzione delle controversie online (https://ec.europa.eu/consumers/odr). Il gestore non è obbligato né disposto a partecipare a procedure di risoluzione delle controversie davanti a un organismo di conciliazione per i consumatori.",
    liability: "Nonostante un controllo accurato, non ci assumiamo alcuna responsabilità per i contenuti dei link esterni; i gestori delle pagine collegate sono gli unici responsabili dei loro contenuti.",
  },
};
