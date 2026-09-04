import type { ConsentCopy, ContactFormCopy, FooterCopy, HeaderCopy } from "../types";

/**
 * Dutch (nl, "je" register) copy of the shared area. Same shape as en.ts; see docs/14-localization.md.
 */

export const HEADER_COPY_NL: HeaderCopy = {
  brandHome: "Track – startpagina",
  mainNav: "Hoofdnavigatie",
  skipToContent: "Ga naar de inhoud",
  groups: [
    {
      key: "product",
      label: "Product",
      columns: [
        {
          key: "overview",
          title: "Overzicht",
          links: [
            { href: "/features", label: "Functies", description: "Wat Track doet, van begeleide setup tot aflevering" },
            { href: "/how-it-works", label: "Zo werkt het", description: "Site aanmaken, snippet plaatsen, destinations koppelen, publiceren" },
          ],
        },
        {
          key: "capabilities",
          title: "Mogelijkheden",
          wide: true,
          links: [
            { href: "/features/ai-setup", label: "AI-begeleide setup", description: "Beschrijf je site, bevestig elke stap, publiceer een ondertekende configuratie" },
            { href: "/features/server-side-tracking", label: "Server-side event router", description: "Aflevering via browser en server met één gedeelde event-ID voor deduplicatie" },
            { href: "/features/event-debugger", label: "Event Debugger", description: "Elk event met zijn toestemmingssnapshot, routingbeslissing en platformantwoord" },
            { href: "/features/data-quality", label: "Datakwaliteit", description: "Eén healthscore met verklaarbare onderdelen; elk probleem linkt naar de oplossing" },
            { href: "/features/consent", label: "Toestemming", description: "Strikte opt-in als standaard en Consent Mode v2; zonder het juiste doel wordt niets verstuurd" },
            { href: "/features/attribution", label: "Attributie", description: "Click-ID's alleen voor de destination die ze nodig heeft, en alleen met toestemming" },
          ],
        },
      ],
    },
    {
      key: "integrations",
      label: "Integraties",
      columns: [
        {
          key: "ads",
          title: "Advertentieplatformen",
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
          title: "Analytics en data",
          links: [
            { href: "/integrations/google-analytics", label: "Google Analytics 4" },
            { href: "/integrations/webhook", label: "Webhooks" },
            { href: "/integrations/affiliate-postbacks", label: "Affiliate-postbacks" },
          ],
        },
        {
          key: "shops",
          title: "Shopsystemen",
          links: [
            { href: "/integrations/shopify", label: "Shopify" },
            { href: "/integrations/woocommerce", label: "WooCommerce" },
            { href: "/integrations/shopware", label: "Shopware 6" },
          ],
        },
      ],
      more: { href: "/integrations", label: "Alle integraties", description: "Browsertag plus server-side API voor elk platform dat er een aanbiedt" },
    },
    {
      key: "resources",
      label: "Resources",
      columns: [
        {
          key: "learn",
          title: "Leren",
          links: [
            { href: "/tracking-knowledge", label: "Tracking Knowledge", description: "Gidsen over server-side tracking, e-commercetracking, toestemming en attributie" },
            { href: "/docs", label: "Documentatie", description: "Snippet installeren, events versturen, toestemming integreren, destinations configureren" },
          ],
        },
        {
          key: "docs",
          title: "Snel naar de docs",
          links: [
            { href: "/docs#install", label: "Snippet installeren" },
            { href: "/docs#events", label: "Browserevents versturen" },
            { href: "/docs#server", label: "Server-API en offline conversies" },
            { href: "/docs#consent", label: "Toestemmingsintegratie" },
          ],
        },
        {
          key: "help",
          title: "Hulp",
          links: [
            { href: "/support", label: "Support" },
            { href: "/status", label: "Systeemstatus" },
            { href: "/security", label: "Beveiliging" },
            { href: "/contact", label: "Contact" },
            { href: "/demo", label: "Plan een demo" },
          ],
        },
      ],
    },
  ],
  pricing: { href: "/pricing", label: "Prijzen" },
  login: { href: "/login", label: "Inloggen" },
  start: { href: "/signup", label: "Gratis starten" },
  language: "Taal",
  openMenu: "Menu openen",
  closeMenu: "Menu sluiten",
  menuTitle: "Menu",
};

export const FOOTER_COPY_NL: FooterCopy = {
  tagline: "AI-first tagmanager, toestemmingsbewuste server-side event router en first-party eventlaag.",
  region: "EU-dataregio als standaard. Verwerker volgens art. 28 AVG.",
  rights: "Alle rechten voorbehouden.",
  legalNote: "Juridische pagina's zijn bedoeld als informatie, niet als juridisch advies.",
  language: "Taal",
  columns: [
    {
      key: "product",
      title: "Product",
      links: [
        { href: "/features", label: "Functies" },
        { href: "/how-it-works", label: "Zo werkt het" },
        { href: "/pricing", label: "Prijzen" },
        { href: "/docs", label: "Documentatie" },
      ],
    },
    {
      key: "integrations",
      title: "Integraties",
      links: [
        { href: "/integrations", label: "Alle integraties" },
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
      title: "Kennis",
      links: [
        { href: "/tracking-knowledge", label: "Tracking Knowledge" },
        { href: "/docs#install", label: "Snippet installeren" },
        { href: "/docs#server", label: "Server-API" },
        { href: "/docs#consent", label: "Toestemmingsintegratie" },
        { href: "/tracking-knowledge/feed.xml", label: "RSS-feed" },
      ],
    },
    {
      key: "company",
      title: "Bedrijf",
      links: [
        { href: "/contact", label: "Contact" },
        { href: "/demo", label: "Plan een demo" },
        { href: "/support", label: "Support" },
        { href: "/status", label: "Systeemstatus" },
        { href: "/security", label: "Beveiliging" },
      ],
    },
    {
      key: "legal",
      title: "Juridisch",
      links: [
        { href: "/privacy", label: "Privacy" },
        { href: "/terms", label: "Voorwaarden" },
        { href: "/data-processing", label: "Verwerkersovereenkomst" },
        { href: "/subprocessors", label: "Subverwerkers" },
        { href: "/imprint", label: "Colofon" },
      ],
    },
  ],
};

export const CONSENT_COPY_NL: ConsentCopy = {
  title: "Cookies en vergelijkbare technologieën",
  description: "Deze website slaat alleen op wat nodig is om te werken. Optionele categorieën worden pas actief nadat je ze toestaat.",
  categories: {
    necessary: { label: "Strikt noodzakelijk", text: "Taalkeuze, thema, sessie en beveiliging. Altijd aan." },
    analytics: { label: "Analytics", text: "Geaggregeerde gebruiksmeting om de website te verbeteren." },
    marketing: { label: "Marketing", text: "Conversiemeting voor advertentiecampagnes." },
  },
  acceptAll: "Alles accepteren",
  declineOptional: "Optionele categorieën weigeren",
  save: "Selectie opslaan",
  close: "Sluiten",
  privacy: { href: "/privacy", label: "Privacyverklaring" },
};

export const FORM_COPY_NL: ContactFormCopy = { name: "Naam", email: "E-mail", company: "Bedrijf (optioneel)", message: "Bericht", submit: "Versturen", sent: "Bedankt – we hebben je bericht ontvangen en antwoorden per e-mail.", invalid: "Controleer de velden: naam, een geldig e-mailadres en een bericht van minimaal 10 tekens.", rateLimited: "Te veel verzoeken vanaf dit netwerk; probeer het later opnieuw.", generic: "Er is iets misgegaan. Probeer het opnieuw.", privacy: "We bewaren je aanvraag om die te beantwoorden en verwijderen hem na afhandeling. Zie de privacyverklaring." };
