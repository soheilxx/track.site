import type { ConsentCopy, ContactFormCopy, FooterCopy, HeaderCopy } from "../types";

/**
 * Italian (it, "tu" register) copy of the shared area. Same shape as en.ts; see docs/14-localization.md.
 */

export const HEADER_COPY_IT: HeaderCopy = {
  brandHome: "Track – home",
  mainNav: "Navigazione principale",
  skipToContent: "Vai al contenuto",
  groups: [
    {
      key: "product",
      label: "Prodotto",
      columns: [
        {
          key: "overview",
          title: "Panoramica",
          links: [
            { href: "/features", label: "Funzionalità", description: "Tutto ciò che fa Track, dalla configurazione guidata alla consegna" },
            { href: "/how-it-works", label: "Come funziona", description: "Crea un sito, installa lo snippet, collega le destinazioni, pubblica" },
          ],
        },
        {
          key: "capabilities",
          title: "Nel dettaglio",
          wide: true,
          links: [
            { href: "/features/ai-setup", label: "Configurazione guidata dall'AI", description: "Descrivi il tuo sito, conferma ogni passaggio, pubblica una configurazione firmata" },
            { href: "/features/server-side-tracking", label: "Router di eventi server-side", description: "Consegna da browser e server con un unico ID evento condiviso per la deduplicazione" },
            { href: "/features/event-debugger", label: "Debugger degli eventi", description: "Ogni evento con il suo snapshot del consenso, la decisione di routing e la risposta della piattaforma" },
            { href: "/features/data-quality", label: "Qualità dei dati", description: "Un health score con componenti spiegabili; ogni problema rimanda alla sua soluzione" },
            { href: "/features/consent", label: "Consenso", description: "Opt-in rigoroso di default e Consent Mode v2; senza la finalità giusta non parte nulla" },
            { href: "/features/attribution", label: "Attribuzione", description: "Click ID solo per la destinazione che ne ha bisogno, e solo con il consenso" },
          ],
        },
      ],
    },
    {
      key: "integrations",
      label: "Integrazioni",
      columns: [
        {
          key: "ads",
          title: "Piattaforme pubblicitarie",
          links: [
            { href: "/integrations/meta", label: "Meta Ads" },
            { href: "/integrations/google-ads", label: "Google Ads" },
            { href: "/integrations/tiktok", label: "TikTok Ads" },
            { href: "/integrations/linkedin", label: "LinkedIn Ads" },
            { href: "/integrations/microsoft", label: "Microsoft Ads" },
            { href: "/integrations/reddit", label: "Reddit Ads" },
          ],
        },
        {
          key: "data",
          title: "Analytics e dati",
          links: [
            { href: "/integrations/google-analytics", label: "Google Analytics 4" },
            { href: "/integrations/webhook", label: "Webhook" },
            { href: "/integrations/affiliate-postbacks", label: "Postback di affiliazione" },
          ],
        },
        {
          key: "shops",
          title: "Sistemi e-commerce",
          links: [
            { href: "/integrations/shopify", label: "Shopify" },
            { href: "/integrations/woocommerce", label: "WooCommerce" },
            { href: "/integrations/shopware", label: "Shopware 6" },
          ],
        },
      ],
      more: { href: "/integrations", label: "Tutte le integrazioni", description: "Tag browser più API server-side per ogni piattaforma che ne offre una" },
    },
    {
      key: "resources",
      label: "Risorse",
      columns: [
        {
          key: "learn",
          title: "Impara",
          links: [
            { href: "/tracking-knowledge", label: "Tracking Knowledge", description: "Guide su tracking server-side, tracking e-commerce, consenso e attribuzione" },
            { href: "/docs", label: "Documentazione", description: "Installa lo snippet, invia eventi, integra il consenso, configura le destinazioni" },
          ],
        },
        {
          key: "docs",
          title: "Link rapidi alla documentazione",
          links: [
            { href: "/docs#install", label: "Installa lo snippet" },
            { href: "/docs#events", label: "Invia eventi dal browser" },
            { href: "/docs#server", label: "API server e conversioni offline" },
            { href: "/docs#consent", label: "Integrazione del consenso" },
          ],
        },
        {
          key: "help",
          title: "Aiuto",
          links: [
            { href: "/support", label: "Supporto" },
            { href: "/status", label: "Stato del sistema" },
            { href: "/security", label: "Sicurezza" },
            { href: "/contact", label: "Contatti" },
            { href: "/demo", label: "Prenota una demo" },
          ],
        },
      ],
    },
  ],
  pricing: { href: "/pricing", label: "Prezzi" },
  login: { href: "/login", label: "Accedi" },
  start: { href: "/signup", label: "Inizia gratis" },
  language: "Lingua",
  openMenu: "Apri il menu",
  closeMenu: "Chiudi il menu",
  menuTitle: "Menu",
};

export const FOOTER_COPY_IT: FooterCopy = {
  tagline: "Tag manager AI-first, router di eventi server-side basato sul consenso e layer di eventi first-party.",
  region: "Regione dati UE di default. Responsabile del trattamento ai sensi dell'art. 28 GDPR.",
  rights: "Tutti i diritti riservati.",
  legalNote: "Le pagine legali sono fornite a titolo informativo e non costituiscono consulenza legale.",
  language: "Lingua",
  columns: [
    {
      key: "product",
      title: "Prodotto",
      links: [
        { href: "/features", label: "Funzionalità" },
        { href: "/how-it-works", label: "Come funziona" },
        { href: "/pricing", label: "Prezzi" },
        { href: "/docs", label: "Documentazione" },
      ],
    },
    {
      key: "integrations",
      title: "Integrazioni",
      links: [
        { href: "/integrations", label: "Tutte le integrazioni" },
        { href: "/integrations/meta", label: "Meta Ads" },
        { href: "/integrations/google-ads", label: "Google Ads" },
        { href: "/integrations/google-analytics", label: "Google Analytics 4" },
        { href: "/integrations/shopify", label: "Shopify" },
        { href: "/integrations/woocommerce", label: "WooCommerce" },
        { href: "/integrations/shopware", label: "Shopware 6" },
      ],
    },
    {
      key: "knowledge",
      title: "Conoscenza",
      links: [
        { href: "/tracking-knowledge", label: "Tracking Knowledge" },
        { href: "/docs#install", label: "Installa lo snippet" },
        { href: "/docs#server", label: "API server" },
        { href: "/docs#consent", label: "Integrazione del consenso" },
        { href: "/tracking-knowledge/feed.xml", label: "Feed RSS" },
      ],
    },
    {
      key: "company",
      title: "Azienda",
      links: [
        { href: "/contact", label: "Contatti" },
        { href: "/demo", label: "Prenota una demo" },
        { href: "/support", label: "Supporto" },
        { href: "/status", label: "Stato del sistema" },
        { href: "/security", label: "Sicurezza" },
      ],
    },
    {
      key: "legal",
      title: "Legale",
      links: [
        { href: "/privacy", label: "Privacy" },
        { href: "/terms", label: "Termini" },
        { href: "/data-processing", label: "Trattamento dei dati (DPA)" },
        { href: "/subprocessors", label: "Sub-responsabili" },
        { href: "/imprint", label: "Note legali" },
      ],
    },
  ],
};

export const CONSENT_COPY_IT: ConsentCopy = {
  title: "Cookie e tecnologie simili",
  description: "Questo sito web memorizza solo ciò che serve al suo funzionamento. Le categorie facoltative si attivano solo dopo il tuo consenso.",
  categories: {
    necessary: { label: "Strettamente necessari", text: "Scelta della lingua, tema, sessione e sicurezza. Sempre attivi." },
    analytics: { label: "Analisi", text: "Misurazione aggregata dell'utilizzo per migliorare il sito web." },
    marketing: { label: "Marketing", text: "Misurazione delle conversioni per le campagne pubblicitarie." },
  },
  acceptAll: "Accetta tutto",
  declineOptional: "Rifiuta quelli facoltativi",
  save: "Salva la selezione",
  close: "Chiudi",
  privacy: { href: "/privacy", label: "Informativa sulla privacy" },
};

export const FORM_COPY_IT: ContactFormCopy = { name: "Nome", email: "E-mail", company: "Azienda (facoltativo)", message: "Messaggio", submit: "Invia", sent: "Grazie — abbiamo ricevuto il tuo messaggio e ti risponderemo via e-mail.", invalid: "Controlla i campi: nome, un'e-mail valida e un messaggio di almeno 10 caratteri.", rateLimited: "Troppe richieste da questa rete; riprova più tardi.", generic: "Qualcosa è andato storto. Riprova.", privacy: "Conserviamo la tua richiesta per risponderti e la cancelliamo una volta gestita. Vedi l'informativa sulla privacy." };
