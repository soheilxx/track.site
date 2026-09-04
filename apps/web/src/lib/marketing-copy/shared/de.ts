import type { ConsentCopy, ContactFormCopy, FooterCopy, HeaderCopy } from "../types";

/**
 * German (de) copy of the shared area. Same shape as en.ts; see docs/14-localization.md.
 */

export const HEADER_COPY_DE: HeaderCopy = {
  brandHome: "Track – Startseite",
  mainNav: "Hauptnavigation",
  skipToContent: "Zum Inhalt springen",
  groups: [
    {
      key: "product",
      label: "Produkt",
      columns: [
        {
          key: "overview",
          title: "Überblick",
          links: [
            { href: "/features", label: "Funktionen", description: "Alles, was Track tut: von der geführten Einrichtung bis zur Zustellung" },
            { href: "/how-it-works", label: "So funktioniert es", description: "Site anlegen, Snippet einbauen, Ziele verbinden, veröffentlichen" },
          ],
        },
        {
          key: "capabilities",
          title: "Im Detail",
          wide: true,
          links: [
            { href: "/features/ai-setup", label: "KI-geführte Einrichtung", description: "Site beschreiben, jeden Schritt bestätigen, signierte Konfiguration veröffentlichen" },
            { href: "/features/server-side-tracking", label: "Serverseitiger Event-Router", description: "Browser- und Server-Zustellung mit einer gemeinsamen Event-ID zur Deduplizierung" },
            { href: "/features/event-debugger", label: "Event-Debugger", description: "Jedes Event mit Consent-Snapshot, Routing-Entscheidung und Anbieterantwort" },
            { href: "/features/data-quality", label: "Datenqualität", description: "Ein Health-Score mit erklärbaren Teilwerten; jedes Problem verlinkt auf seine Lösung" },
            { href: "/features/consent", label: "Consent", description: "Strikte Opt-in-Defaults und Consent Mode v2; ohne passenden Zweck wird nichts gesendet" },
            { href: "/features/attribution", label: "Attribution", description: "Click-IDs nur für das Ziel, das sie braucht, und nur mit Consent" },
          ],
        },
      ],
    },
    {
      key: "integrations",
      label: "Integrationen",
      columns: [
        {
          key: "ads",
          title: "Werbeplattformen",
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
          title: "Analytics und Daten",
          links: [
            { href: "/integrations/google-analytics", label: "Google Analytics 4" },
            { href: "/integrations/webhook", label: "Webhooks" },
            { href: "/integrations/affiliate-postbacks", label: "Affiliate-Postbacks" },
          ],
        },
        {
          key: "shops",
          title: "Shopsysteme",
          links: [
            { href: "/integrations/shopify", label: "Shopify" },
            { href: "/integrations/woocommerce", label: "WooCommerce" },
            { href: "/integrations/shopware", label: "Shopware 6" },
          ],
        },
      ],
      more: { href: "/integrations", label: "Alle Integrationen", description: "Browser-Tag plus serverseitige API für jede Plattform, die eine anbietet" },
    },
    {
      key: "resources",
      label: "Ressourcen",
      columns: [
        {
          key: "learn",
          title: "Lernen",
          links: [
            { href: "/tracking-knowledge", label: "Tracking Knowledge", description: "Guides zu Server-Side Tracking, E-Commerce-Tracking, Consent und Attribution" },
            { href: "/docs", label: "Dokumentation", description: "Snippet installieren, Events senden, Consent integrieren, Ziele konfigurieren" },
          ],
        },
        {
          key: "docs",
          title: "Doku-Schnellzugriff",
          links: [
            { href: "/docs#install", label: "Snippet installieren" },
            { href: "/docs#events", label: "Browser-Events senden" },
            { href: "/docs#server", label: "Server-API und Offline-Conversions" },
            { href: "/docs#consent", label: "Consent-Integration" },
          ],
        },
        {
          key: "help",
          title: "Hilfe",
          links: [
            { href: "/support", label: "Support" },
            { href: "/status", label: "Systemstatus" },
            { href: "/security", label: "Sicherheit" },
            { href: "/contact", label: "Kontakt" },
            { href: "/demo", label: "Demo buchen" },
          ],
        },
      ],
    },
  ],
  pricing: { href: "/pricing", label: "Preise" },
  login: { href: "/login", label: "Anmelden" },
  start: { href: "/signup", label: "Kostenlos starten" },
  language: "Sprache",
  openMenu: "Menü öffnen",
  closeMenu: "Menü schließen",
  menuTitle: "Menü",
};

export const FOOTER_COPY_DE: FooterCopy = {
  tagline: "AI-first Tag Manager, consent-basierter Server-Side Event Router und First-Party Event Layer.",
  region: "EU-Datenregion als Standard. Auftragsverarbeiter nach Art. 28 DSGVO.",
  rights: "Alle Rechte vorbehalten.",
  legalNote: "Rechtsseiten sind allgemeine Informationen, keine Rechtsberatung.",
  language: "Sprache",
  columns: [
    {
      key: "product",
      title: "Produkt",
      links: [
        { href: "/features", label: "Funktionen" },
        { href: "/how-it-works", label: "So funktioniert es" },
        { href: "/pricing", label: "Preise" },
        { href: "/docs", label: "Dokumentation" },
      ],
    },
    {
      key: "integrations",
      title: "Integrationen",
      links: [
        { href: "/integrations", label: "Alle Integrationen" },
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
      title: "Wissen",
      links: [
        { href: "/tracking-knowledge", label: "Tracking Knowledge" },
        { href: "/docs#install", label: "Snippet installieren" },
        { href: "/docs#server", label: "Server-API" },
        { href: "/docs#consent", label: "Consent-Integration" },
        { href: "/tracking-knowledge/feed.xml", label: "RSS-Feed" },
      ],
    },
    {
      key: "company",
      title: "Unternehmen",
      links: [
        { href: "/contact", label: "Kontakt" },
        { href: "/demo", label: "Demo buchen" },
        { href: "/support", label: "Support" },
        { href: "/status", label: "Systemstatus" },
        { href: "/security", label: "Sicherheit" },
      ],
    },
    {
      key: "legal",
      title: "Rechtliches",
      links: [
        { href: "/privacy", label: "Datenschutz" },
        { href: "/terms", label: "AGB" },
        { href: "/data-processing", label: "Auftragsverarbeitung (AVV)" },
        { href: "/subprocessors", label: "Subunternehmer" },
        { href: "/imprint", label: "Impressum" },
      ],
    },
  ],
};

export const CONSENT_COPY_DE: ConsentCopy = {
  title: "Cookies und ähnliche Technologien",
  description: "Diese Website speichert nur, was für ihren Betrieb nötig ist. Optionale Kategorien werden erst nach deiner Zustimmung aktiv.",
  categories: {
    necessary: { label: "Unbedingt erforderlich", text: "Sprachwahl, Design, Sitzung und Sicherheit. Immer aktiv." },
    analytics: { label: "Analyse", text: "Aggregierte Nutzungsmessung zur Verbesserung der Website." },
    marketing: { label: "Marketing", text: "Conversion-Messung für Werbekampagnen." },
  },
  acceptAll: "Alle akzeptieren",
  declineOptional: "Optionale ablehnen",
  save: "Auswahl speichern",
  close: "Schließen",
  privacy: { href: "/privacy", label: "Datenschutzerklärung" },
};

export const FORM_COPY_DE: ContactFormCopy = { name: "Name", email: "E-Mail", company: "Unternehmen (optional)", message: "Nachricht", submit: "Senden", sent: "Danke — wir haben deine Nachricht erhalten und antworten per E-Mail.", invalid: "Bitte prüfe die Felder: Name, eine gültige E-Mail und eine Nachricht mit mindestens 10 Zeichen.", rateLimited: "Zu viele Anfragen aus diesem Netzwerk; bitte später erneut versuchen.", generic: "Etwas ist schiefgelaufen. Bitte erneut versuchen.", privacy: "Wir speichern deine Anfrage zur Beantwortung und löschen sie nach Bearbeitung. Siehe Datenschutzerklärung." };
