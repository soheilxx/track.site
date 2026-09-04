import type { ContactFormCopy, LocalizedCopy, SharedCopy } from "./types";

/**
 * Copy shared by several pages: the site shell (header + mobile drawer, footer, consent dialog, skip
 * link), the trust strip, calls to action and the contact form.
 *
 * The shell reads `HEADER_COPY`, `FOOTER_COPY` and `CONSENT_COPY`. Their shapes are declared in this
 * file (not in types.ts) so the navigation model — groups, columns, links with a one-line benefit —
 * lives next to its texts. Every href is locale-neutral (next-intl's <Link> adds the prefix) and
 * points to a route that exists today; nothing links to a page that is not built.
 *
 * `SHARED_COPY` keeps the flat nav/footer keys that mirror messages/{en,de}/common.json for pages
 * that still read the trust strip and the CTAs through it; the shell no longer uses them.
 */

/* ---------------------------------------------------------------- navigation model */

export interface NavLink {
  /** Locale-neutral path; may carry a hash for in-page anchors (`/docs#install`). */
  href: string;
  label: string;
  /** One line of customer benefit under the label in mega panels (omit in dense lists). */
  description?: string;
}

export interface NavColumn {
  /** Stable id for markup ids and variants (footer: product | integrations | knowledge | company | legal). */
  key?: string;
  title: string;
  links: NavLink[];
  /** Spans two of the three panel columns and lays its links out in two sub-columns. */
  wide?: boolean;
}

export interface NavGroup {
  key: "product" | "integrations" | "resources";
  label: string;
  columns: NavColumn[];
  /** Panel-wide closing link ("All integrations →"). */
  more?: NavLink;
}

export interface HeaderCopy {
  /** Accessible name of the brand link. */
  brandHome: string;
  /** Accessible name of the main navigation landmark. */
  mainNav: string;
  skipToContent: string;
  groups: NavGroup[];
  pricing: NavLink;
  login: NavLink;
  start: NavLink;
  /** Accessible name of the language switcher. */
  language: string;
  openMenu: string;
  closeMenu: string;
  /** Title of the mobile drawer. */
  menuTitle: string;
}

export interface FooterCopy {
  tagline: string;
  /** Verifiable operating fact, no address (there is none to publish here). */
  region: string;
  rights: string;
  legalNote: string;
  language: string;
  columns: NavColumn[];
}

export interface ConsentCategoryCopy {
  label: string;
  text: string;
}

export interface ConsentCopy {
  title: string;
  description: string;
  categories: { necessary: ConsentCategoryCopy; analytics: ConsentCategoryCopy; marketing: ConsentCategoryCopy };
  acceptAll: string;
  declineOptional: string;
  save: string;
  close: string;
  privacy: NavLink;
}

/* ------------------------------------------------------------------------ header */

export const HEADER_COPY: LocalizedCopy<HeaderCopy> = {
  en: {
    brandHome: "Track – home",
    mainNav: "Main",
    skipToContent: "Skip to content",
    groups: [
      {
        key: "product",
        label: "Product",
        columns: [
          {
            key: "overview",
            title: "Overview",
            links: [
              { href: "/features", label: "Features", description: "What Track does, from guided setup to delivery" },
              { href: "/how-it-works", label: "How it works", description: "Create a site, install the snippet, connect destinations, publish" },
            ],
          },
          {
            key: "capabilities",
            title: "Capabilities",
            wide: true,
            links: [
              { href: "/features/ai-setup", label: "AI-guided setup", description: "Describe your site, confirm each step, publish a signed configuration" },
              { href: "/features/server-side-tracking", label: "Server-side event router", description: "Browser and server delivery with one shared event ID for deduplication" },
              { href: "/features/event-debugger", label: "Event debugger", description: "Every event with its consent snapshot, routing decision and vendor response" },
              { href: "/features/data-quality", label: "Data quality", description: "One health score with explainable parts; every issue links to its fix" },
              { href: "/features/consent", label: "Consent", description: "Strict opt-in defaults and Consent Mode v2; nothing is sent without the purpose" },
              { href: "/features/attribution", label: "Attribution", description: "Click IDs only for the destination that needs them, only with consent" },
            ],
          },
        ],
      },
      {
        key: "integrations",
        label: "Integrations",
        columns: [
          {
            key: "ads",
            title: "Ads platforms",
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
            title: "Analytics and data",
            links: [
              { href: "/integrations/google-analytics", label: "Google Analytics 4" },
              { href: "/integrations/webhook", label: "Webhooks" },
              { href: "/integrations/affiliate-postbacks", label: "Affiliate postbacks" },
            ],
          },
          {
            key: "shops",
            title: "Shop systems",
            links: [
              { href: "/integrations/shopify", label: "Shopify" },
              { href: "/integrations/woocommerce", label: "WooCommerce" },
              { href: "/integrations/shopware", label: "Shopware 6" },
            ],
          },
        ],
        more: { href: "/integrations", label: "All integrations", description: "Browser tag plus server-side API for every platform that offers one" },
      },
      {
        key: "resources",
        label: "Resources",
        columns: [
          {
            key: "learn",
            title: "Learn",
            links: [
              { href: "/tracking-knowledge", label: "Tracking Knowledge", description: "Guides on server-side tracking, e-commerce tracking, consent and attribution" },
              { href: "/docs", label: "Documentation", description: "Install the snippet, send events, integrate consent, configure destinations" },
            ],
          },
          {
            key: "docs",
            title: "Docs quick links",
            links: [
              { href: "/docs#install", label: "Install the snippet" },
              { href: "/docs#events", label: "Send browser events" },
              { href: "/docs#server", label: "Server API and offline conversions" },
              { href: "/docs#consent", label: "Consent integration" },
            ],
          },
          {
            key: "help",
            title: "Help",
            links: [
              { href: "/support", label: "Support" },
              { href: "/status", label: "System status" },
              { href: "/security", label: "Security" },
              { href: "/contact", label: "Contact" },
              { href: "/demo", label: "Book a demo" },
            ],
          },
        ],
      },
    ],
    pricing: { href: "/pricing", label: "Pricing" },
    login: { href: "/login", label: "Log in" },
    start: { href: "/signup", label: "Start free" },
    language: "Language",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    menuTitle: "Menu",
  },
  de: {
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
  },
};

/* ------------------------------------------------------------------------ footer */

export const FOOTER_COPY: LocalizedCopy<FooterCopy> = {
  en: {
    tagline: "AI-first tag manager, consent-aware server-side event router and first-party event layer.",
    region: "EU data region by default. Processor under Art. 28 GDPR.",
    rights: "All rights reserved.",
    legalNote: "Legal pages are provided as information, not legal advice.",
    language: "Language",
    columns: [
      {
        key: "product",
        title: "Product",
        links: [
          { href: "/features", label: "Features" },
          { href: "/how-it-works", label: "How it works" },
          { href: "/pricing", label: "Pricing" },
          { href: "/docs", label: "Documentation" },
        ],
      },
      {
        key: "integrations",
        title: "Integrations",
        links: [
          { href: "/integrations", label: "All integrations" },
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
        title: "Knowledge",
        links: [
          { href: "/tracking-knowledge", label: "Tracking Knowledge" },
          { href: "/docs#install", label: "Install the snippet" },
          { href: "/docs#server", label: "Server API" },
          { href: "/docs#consent", label: "Consent integration" },
          { href: "/tracking-knowledge/feed.xml", label: "RSS feed" },
        ],
      },
      {
        key: "company",
        title: "Company",
        links: [
          { href: "/contact", label: "Contact" },
          { href: "/demo", label: "Book a demo" },
          { href: "/support", label: "Support" },
          { href: "/status", label: "System status" },
          { href: "/security", label: "Security" },
        ],
      },
      {
        key: "legal",
        title: "Legal",
        links: [
          { href: "/privacy", label: "Privacy" },
          { href: "/terms", label: "Terms" },
          { href: "/data-processing", label: "Data processing (DPA)" },
          { href: "/subprocessors", label: "Subprocessors" },
          { href: "/imprint", label: "Imprint" },
        ],
      },
    ],
  },
  de: {
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
  },
};

/* ----------------------------------------------------------------------- consent */

/** Consent dialog texts (components/marketing/consent-dialog.tsx). Not mounted today — see that file. */
export const CONSENT_COPY: LocalizedCopy<ConsentCopy> = {
  en: {
    title: "Cookies and similar technologies",
    description: "This website only stores what it needs to run. Optional categories become active only after you allow them.",
    categories: {
      necessary: { label: "Strictly necessary", text: "Language choice, theme, session and security. Always on." },
      analytics: { label: "Analytics", text: "Aggregated usage measurement to improve the website." },
      marketing: { label: "Marketing", text: "Conversion measurement for advertising campaigns." },
    },
    acceptAll: "Accept all",
    declineOptional: "Decline optional",
    save: "Save selection",
    close: "Close",
    privacy: { href: "/privacy", label: "Privacy policy" },
  },
  de: {
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
  },
};

/* ------------------------------------------------------------------ flat shared copy */

/**
 * Flat nav/footer keys mirroring messages/{en,de}/common.json (`nav`, `footer`, `home.trust`,
 * `home.cta*`, `home.finalCta`) for pages that read the trust strip and CTAs. The shell itself reads
 * HEADER_COPY / FOOTER_COPY above; once no page uses `nav`/`footer` here they can be dropped together
 * with the duplicated catalog keys.
 */
export const SHARED_COPY: LocalizedCopy<SharedCopy> = {
  en: {
    nav: {
      brandHome: "Track – home",
      features: "Features",
      integrations: "Integrations",
      howItWorks: "How it works",
      pricing: "Pricing",
      docs: "Docs",
      trackingKnowledge: "Tracking Knowledge",
      login: "Log in",
      signup: "Start free",
      openMenu: "Open menu",
      closeMenu: "Close menu",
      language: "Language",
      skipToContent: "Skip to content",
    },
    footer: {
      tagline: "AI-first tag manager, consent-aware server-side event router and first-party event layer.",
      region: "EU data region by default. Processor under Art. 28 GDPR.",
      rights: "All rights reserved.",
      legalNote: "Legal pages are provided as information, not legal advice.",
      columns: { product: "Product", integrations: "Integrations", trust: "Trust", company: "Company" },
      links: {
        features: "Features",
        howItWorks: "How it works",
        integrations: "All integrations",
        pricing: "Pricing",
        docs: "Documentation",
        meta: "Meta Pixel + CAPI",
        ga4: "Google Analytics 4",
        googleAds: "Google Ads",
        shopify: "Shopify",
        woocommerce: "WooCommerce",
        shopware: "Shopware 6",
        security: "Security",
        privacy: "Privacy",
        dataProcessing: "Data processing (DPA)",
        subprocessors: "Subprocessors",
        terms: "Terms",
        imprint: "Imprint",
        trackingKnowledge: "Tracking Knowledge",
        contact: "Contact",
        demo: "Book a demo",
        support: "Support",
        status: "Status",
      },
    },
    trust: {
      eu: "EU data region",
      consent: "Strict opt-in consent engine",
      signed: "Signed, versioned configs",
      noCode: "No custom HTML or JavaScript",
    },
    cta: {
      primary: "Start with your domain",
      secondary: "See how it works",
      final: {
        title: "Ready for verified events in minutes?",
        text: "Create your site, paste the snippet and let the assistant do the rest.",
        cta: "Create your site",
      },
    },
  },
  de: {
    nav: {
      brandHome: "Track – Startseite",
      features: "Funktionen",
      integrations: "Integrationen",
      howItWorks: "So funktioniert es",
      pricing: "Preise",
      docs: "Doku",
      trackingKnowledge: "Tracking Knowledge",
      login: "Anmelden",
      signup: "Kostenlos starten",
      openMenu: "Menü öffnen",
      closeMenu: "Menü schließen",
      language: "Sprache",
      skipToContent: "Zum Inhalt springen",
    },
    footer: {
      tagline: "AI-first Tag Manager, consent-basierter Server-Side Event Router und First-Party Event Layer.",
      region: "EU-Datenregion als Standard. Auftragsverarbeiter nach Art. 28 DSGVO.",
      rights: "Alle Rechte vorbehalten.",
      legalNote: "Rechtsseiten sind allgemeine Informationen, keine Rechtsberatung.",
      columns: { product: "Produkt", integrations: "Integrationen", trust: "Vertrauen", company: "Unternehmen" },
      links: {
        features: "Funktionen",
        howItWorks: "So funktioniert es",
        integrations: "Alle Integrationen",
        pricing: "Preise",
        docs: "Dokumentation",
        meta: "Meta Pixel + CAPI",
        ga4: "Google Analytics 4",
        googleAds: "Google Ads",
        shopify: "Shopify",
        woocommerce: "WooCommerce",
        shopware: "Shopware 6",
        security: "Sicherheit",
        privacy: "Datenschutz",
        dataProcessing: "Auftragsverarbeitung (AVV)",
        subprocessors: "Subunternehmer",
        terms: "AGB",
        imprint: "Impressum",
        trackingKnowledge: "Tracking Knowledge",
        contact: "Kontakt",
        demo: "Demo buchen",
        support: "Support",
        status: "Status",
      },
    },
    trust: {
      eu: "EU-Datenregion",
      consent: "Strikte Opt-in-Consent-Engine",
      signed: "Signierte, versionierte Konfigurationen",
      noCode: "Kein Custom HTML oder JavaScript",
    },
    cta: {
      primary: "Mit deiner Domain starten",
      secondary: "So funktioniert es",
      final: {
        title: "Bereit für verifizierte Events in Minuten?",
        text: "Site anlegen, Snippet einfügen und den Assistenten den Rest erledigen lassen.",
        cta: "Site anlegen",
      },
    },
  },
};

/** Contact form labels and messages, shared by /contact, /demo and /support. */
export const FORM_COPY: LocalizedCopy<ContactFormCopy> = {
  en: { name: "Name", email: "E-mail", company: "Company (optional)", message: "Message", submit: "Send", sent: "Thank you — we received your message and reply by e-mail.", invalid: "Please check the fields: name, a valid e-mail and a message of at least 10 characters.", rateLimited: "Too many requests from this network; please try again later.", generic: "Something went wrong. Please try again.", privacy: "We store your request to answer it and delete it after handling. See the privacy policy." },
  de: { name: "Name", email: "E-Mail", company: "Unternehmen (optional)", message: "Nachricht", submit: "Senden", sent: "Danke — wir haben deine Nachricht erhalten und antworten per E-Mail.", invalid: "Bitte prüfe die Felder: Name, eine gültige E-Mail und eine Nachricht mit mindestens 10 Zeichen.", rateLimited: "Zu viele Anfragen aus diesem Netzwerk; bitte später erneut versuchen.", generic: "Etwas ist schiefgelaufen. Bitte erneut versuchen.", privacy: "Wir speichern deine Anfrage zur Beantwortung und löschen sie nach Bearbeitung. Siehe Datenschutzerklärung." },
};
