import type { LocalizedCopy, SecondaryCopy, TitledText } from "./types";

/**
 * Copy of the secondary public pages: docs, support, contact, demo, status, security and the
 * frame of the legal pages (privacy, terms, data processing, subprocessors, imprint). The legal
 * texts themselves stay in lib/legal-copy.ts; this module only carries the page chrome around
 * them (eyebrows, table-of-contents labels, operator labels, related links).
 *
 * `SecondaryPagesCopy` extends the `SecondaryCopy` shape from types.ts so every existing reader of
 * `SECONDARY_COPY` keeps working; the extra fields are what the redesigned pages need. Only
 * verifiable product facts: every claim below mirrors docs, legal-copy.ts or the connector catalogue.
 */

export interface DocsGuide {
  id: string;
  title: string;
  text: string;
  code?: string;
  /** Language label of the code sample (html, js, bash). */
  language?: string;
  /** Title of the code block (file name, endpoint, tool). */
  codeTitle?: string;
  bullets?: string[];
}

export interface SecondaryLinkItem {
  title: string;
  text: string;
  /** Locale-neutral path; next-intl's Link adds the prefix. */
  href: string;
}

export interface QuickstartStep extends TitledText {
  /** What the customer can verify in the product after the step. */
  outcome: string;
}

export interface ReferenceRow {
  endpoint: string;
  purpose: string;
  notes: string;
}

export interface ControlRow {
  control: string;
  scope: string;
  mechanism: string;
}

export interface SecondaryPagesCopy extends SecondaryCopy {
  common: {
    onThisPage: string;
    breadcrumb: string;
    home: string;
    updated: string;
    copy: string;
    copied: string;
    utc: string;
    related: string;
  };
  docs: SecondaryCopy["docs"] & {
    eyebrow: string;
    links: { integrations: string; support: string; knowledge: string };
    quickstart: { title: string; text: string; outcomeLabel: string; steps: QuickstartStep[] };
    flow: {
      title: string;
      text: string;
      caption: string;
      nodes: { website: string; websiteSub: string; track: string; trackSub: string; consent: string; destinations: string };
      labels: { granted: string; held: string };
    };
    guidesTitle: string;
    guides: DocsGuide[];
    reference: { title: string; text: string; columns: { endpoint: string; purpose: string; notes: string }; rows: ReferenceRow[] };
  };
  support: SecondaryCopy["support"] & {
    eyebrow: string;
    formTitle: string;
    before: { title: string; items: SecondaryLinkItem[] };
    include: { title: string; items: string[] };
    reply: string;
  };
  contact: SecondaryCopy["contact"] & {
    eyebrow: string;
    formTitle: string;
    topics: { title: string; items: TitledText[] };
    other: { title: string; items: SecondaryLinkItem[] };
  };
  demo: SecondaryCopy["demo"] & {
    eyebrow: string;
    formTitle: string;
    agendaTitle: string;
    duration: string;
    prepare: { title: string; items: string[] };
    honest: string;
  };
  status: SecondaryCopy["status"] & {
    eyebrow: string;
    componentsTitle: string;
    detail: string;
    /** "{n} pending" */
    pending: string;
    checkedAt: string;
    /** Short node labels of the status diagram (the table carries the long names). */
    flow: { title: string; caption: string; collector: string; queue: string; worker: string; database: string; destinations: string };
    incidentsText: string;
  };
  security: SecondaryCopy["security"] & {
    eyebrow: string;
    flow: {
      title: string;
      text: string;
      caption: string;
      nodes: { website: string; config: string; configSub: string; collector: string; collectorSub: string; queue: string; queueSub: string; policy: string; worker: string; workerSub: string; destination: string; vault: string; vaultSub: string; kill: string };
    };
    controls: { title: string; text: string; columns: { control: string; scope: string; mechanism: string }; rows: ControlRow[] };
    report: { title: string; text: string; missing: string; ack: string };
  };
  legal: {
    eyebrow: string;
    operator: { title: string; company: string; address: string; representatives: string; email: string; phone: string; register: string; vatId: string; dpo: string; missing: string };
    related: { privacy: string; terms: string; dpa: string; subprocessors: string; imprint: string; security: string };
  };
  subprocessors: {
    title: string;
    intro: string;
    processorsTitle: string;
    columns: { name: string; purpose: string; region: string; basis: string };
    vendors: string;
    vendorsText: string;
    updated: string;
  };
  imprint: { title: string; intro: string; dispute: string; liability: string };
}

const SNIPPET = `<script async src="https://cdn.track.site/v1/tracker.js" data-site-id="TRACKING_ID"></script>`;
const CONSENT_CALL = `tsq.push(["consent", { granted: ["necessary", "analytics", "marketing"], source: "api", policy_version: "2026-09" }]);`;
const SERVER_CALL = `curl -X POST https://api.track.site/v1/s \\\n  -H "Authorization: Bearer tsk_..." -H "Content-Type: application/json" \\\n  -d '{"events":[{"name":"purchase","ts":1767225600000,"props":{"offline":true},"commerce":{"order_id":"A1001","currency":"EUR","value":129.9},"user_data":{"email":"customer@example.com"},"click_ids":{"gclid":"Cj0K..."},"consent":{"granted":["necessary","marketing"],"source":"crm"}}]}'`;
const browserEvents = (comment: string) => `window.tsq = window.tsq || [];\ntsq.push(["track", "purchase", { order_id: "A1001", currency: "EUR", value: 129.9, items: [{ item_id: "SKU-1", price: 99.9, quantity: 1 }] }]);\ntsq.push(["identify", { user_id: "u_42", email: "customer@example.com" }]); // ${comment}`;

export const SECONDARY_COPY: LocalizedCopy<SecondaryPagesCopy> = {
  en: {
    common: { onThisPage: "On this page", breadcrumb: "Breadcrumb", home: "Home", updated: "Last updated", copy: "Copy code", copied: "Copied", utc: "UTC", related: "Related pages" },
    docs: {
      title: "Documentation",
      intro: "Everything needed to install Track, send server events, integrate consent and configure destinations. The dashboard assistant links here for each step.",
      toc: "On this page",
      eyebrow: "Documentation",
      links: { integrations: "All integrations", support: "Ask engineering support", knowledge: "Tracking Knowledge" },
      quickstart: {
        title: "Three steps to a working setup",
        text: "Install once, send your events, connect the platforms you use. Each step can be verified in the dashboard before you move on.",
        outcomeLabel: "You can verify",
        steps: [
          { title: "Install the snippet", text: "Add one asynchronous script tag to your pages. It loads the signed configuration for your tracking ID and respects consent from the first page view.", outcome: "Page views appear in the event debugger." },
          { title: "Send your events", text: "Use the standard events from the browser, a shop plugin or your server. Purchases carry an order id so the browser and server copies are deduplicated.", outcome: "Every event shows its consent state and the reason it was delivered or held." },
          { title: "Connect a destination", text: "The guided wizard validates credentials, maps events, sends a real test event and publishes only after your approval.", outcome: "Delivery health and the last successful delivery are shown per destination." },
        ],
      },
      flow: {
        title: "How an event travels",
        text: "Every event takes the same route, whether it comes from the browser, a shop plugin or your server: Track validates and deduplicates it, evaluates the consent policy and routes it to the destinations you configured.",
        caption: "Website → Track → Consent/Policy → Destinations. An event without the required consent purpose stops at the gate; it is neither stored nor forwarded.",
        nodes: { website: "Website", websiteSub: "browser · server", track: "Track", trackSub: "validate · dedupe · route", consent: "Consent", destinations: "Destinations" },
        labels: { granted: "purpose granted", held: "held: no purpose" },
      },
      guidesTitle: "Guides",
      guides: [
        { id: "install", title: "Install the snippet", text: "Add the asynchronous script to every page, ideally in the head. It loads the signed configuration for your tracking ID, respects consent and never blocks rendering. Replace TRACKING_ID with the six-character ID from your dashboard.", code: SNIPPET, language: "html", codeTitle: "Snippet" },
        { id: "events", title: "Send browser events", text: "Standard events (page_view, view_item, add_to_cart, begin_checkout, purchase, generate_lead, sign_up, subscribe, start_trial, contact, book_appointment, download, search, login) carry validated parameters; custom events use lowercase snake_case names.", code: browserEvents("hashed client-side before transport"), language: "js", codeTitle: "Browser" },
        { id: "server", title: "Server API and offline conversions", text: "Create a source key in Settings → Server source keys and send events from your backend, CRM or POS. Provide the same order id as the browser event for deduplication; add props.offline for offline conversions.", code: SERVER_CALL, language: "bash", codeTitle: "POST /v1/s" },
        { id: "consent", title: "Consent integration", text: "Use a supported CMP (TCF 2.2, GPP/GPC, Cookiebot, OneTrust, Usercentrics) — the tracker reads it automatically — or call the consent API from your own banner. Purposes: necessary, analytics, marketing, personalization. Withdrawal stops everything immediately.", code: CONSENT_CALL, language: "js", codeTitle: "Consent API" },
        { id: "destinations", title: "Destinations", text: "Every destination has a guided wizard: identifiers, vault credentials or OAuth, vendor validation, event mapping with verified defaults, a real test event, lint, diff and approval-gated publish. Browser and server share one event id; purchases add the order id.", bullets: ["Meta, Google Ads/YouTube, GA4, TikTok, Microsoft, LinkedIn, Reddit, Pinterest, Snapchat", "X, Taboola, Outbrain, Amazon Ads, Spotify, Quora", "Yahoo DSP, The Trade Desk, Google Marketing Platform, AdRoll, Criteo, affiliate postbacks (13 presets), webhooks"] },
        { id: "shops", title: "Shop platforms", text: "Shopify (app with order webhooks and web pixel), WooCommerce (plugin with signed order webhooks) and Shopware 6 (app with storefront script and order webhooks) send verified purchase and refund events with order ids. Install the plugin, paste the tracking ID and source key, done.", bullets: ["Verified source: events are marked source_verified and used as the authoritative conversion", "Refunds create negative-value events for vendors that support them", "Browser purchases from the theme are deduplicated by order id"] },
        { id: "privacy", title: "Privacy center and DSAR", text: "Retention windows per data kind, consent policy versions per site and data subject requests (export, delete, restrict, rectify, object, portability) are handled in Consent & Privacy. Requests use hashed identifiers only and produce an audited report." },
      ],
      reference: {
        title: "Endpoints at a glance",
        text: "All responses are JSON; 202 means the batch is durably queued.",
        columns: { endpoint: "Endpoint", purpose: "Purpose", notes: "Notes" },
        rows: [
          { endpoint: "POST /v1/e", purpose: "Browser batches", notes: "≤ 50 events per batch" },
          { endpoint: "POST /v1/s", purpose: "Server batches", notes: "≤ 100 events per batch, Bearer source key" },
          { endpoint: "POST /v1/affiliate/in/{trackingId}/{preset}", purpose: "Inbound affiliate network postbacks", notes: "13 network presets" },
          { endpoint: "GET /c/{trackingId}/manifest.json", purpose: "Configuration manifest and signed bundle", notes: "Ed25519-signed, verified by the browser SDK" },
        ],
      },
    },
    support: {
      title: "Support",
      intro: "Customers reach engineering support here. Include your site's tracking ID (six characters, shown in the dashboard) so we can look at the right events — never paste access tokens.",
      docs: "Check the documentation first",
      status: "System status",
      placeholder: "Tracking ID, destination, what you expected and what happened.",
      eyebrow: "Support",
      formTitle: "Write to engineering support",
      before: {
        title: "Before you write",
        items: [
          { title: "Documentation", text: "Installation, events, consent and destinations with code samples.", href: "/docs" },
          { title: "System status", text: "Live health of collector, queue and delivery worker.", href: "/status" },
          { title: "Tracking Knowledge", text: "Guides on deduplication, consent mode and click ids.", href: "/tracking-knowledge" },
        ],
      },
      include: {
        title: "What helps us answer quickly",
        items: ["Your tracking ID (six characters, shown in the dashboard)", "The destination and the event name concerned", "What you expected and what happened, with a time", "Screenshots of the debugger or the wizard step — never access tokens or other secrets"],
      },
      reply: "We reply by e-mail to the address you enter.",
    },
    contact: {
      title: "Contact",
      intro: "Questions about plans, enterprise volume, data processing agreements or partnerships. We answer within one business day.",
      enterprise: "Enterprise request: individual volume, SSO, SLA, dedicated processing.",
      eyebrow: "Contact",
      formTitle: "Send a message",
      topics: {
        title: "What we can help with",
        items: [
          { title: "Plans and billing", text: "Which plan fits your event volume, how yearly billing works, invoices." },
          { title: "Enterprise", text: "Individual volume, SSO, SLA and dedicated processing." },
          { title: "Data processing", text: "The data processing agreement, subprocessors and EU hosting." },
          { title: "Partnerships", text: "Agencies, shop platforms and consent management providers." },
        ],
      },
      other: {
        title: "Looking for something else?",
        items: [
          { title: "Book a demo", text: "Thirty minutes with an engineer on your real site.", href: "/demo" },
          { title: "Support", text: "Technical questions about an existing setup.", href: "/support" },
        ],
      },
    },
    demo: {
      title: "Book a demo",
      intro: "Thirty minutes with an engineer: we set up a destination on your real site, send a test event and walk through consent, deduplication and the debugger.",
      agenda: ["Your stack: platform, CMP, current tags and pain points", "Live setup of one destination with the assistant", "Consent policy, click ids and offline conversions for your case", "Pricing, migration plan and data processing agreement"],
      placeholder: "Which platforms and shop system do you use, and what should we show?",
      eyebrow: "Live demo",
      formTitle: "Request a slot",
      agendaTitle: "What the thirty minutes cover",
      duration: "30 minutes, online, with an engineer",
      prepare: { title: "Useful to have ready", items: ["Access to your website or a staging copy", "The platforms you advertise on", "Your consent management platform, if you use one"] },
      honest: "No sales script: you leave with one configured destination and an honest assessment of what Track can and cannot do for your stack.",
    },
    status: {
      title: "System status",
      intro: "Live health of the Track components, checked on every page load. Incident history is published here when one occurs.",
      component: "Component",
      state: "State",
      checked: "Checked",
      ok: "operational",
      degraded: "degraded",
      down: "unavailable",
      db: "Control plane database",
      queue: "Event queue backlog",
      worker: "Delivery worker (last delivery attempt)",
      collector: "Collector (ingest)",
      none: "no data yet",
      incidents: "Incidents",
      noIncidents: "No incidents recorded.",
      note: "Status is derived from the same database and queue the product uses; there is no separate status service to disagree with.",
      eyebrow: "Status",
      componentsTitle: "Components",
      detail: "Detail",
      pending: "{n} pending",
      checkedAt: "Checked at",
      flow: { title: "Event path and current health", caption: "Collector → queue → delivery worker → destinations; the control plane database holds configuration and delivery records. Colour and label of every node match the table above.", collector: "Collector", queue: "Queue", worker: "Delivery worker", database: "Database", destinations: "Destinations" },
      incidentsText: "When a component is degraded or unavailable, the incident, its impact and the resolution are recorded here.",
    },
    security: {
      title: "Security",
      intro: "How Track protects customer data: architecture, controls and the guarantees you can verify in the product.",
      eyebrow: "Security",
      flow: {
        title: "Where data is protected on its way",
        text: "From the first request to the delivery, every hop has a control: origin checks, rate limits and HMAC signatures at the collector, a durable queue, the consent policy before any routing, and workers with retries, circuit breakers and a dead-letter queue. Kill switches stop a site or an organization within seconds.",
        caption: "Signed configuration reaches the browser, events reach the collector, and only events that pass the policy reach a destination. Vendor credentials leave the vault only inside the worker.",
        nodes: { website: "Website", config: "Signed config", configSub: "Ed25519 · fail closed", collector: "Collector", collectorSub: "origin · rate limit · HMAC", queue: "Queue", queueSub: "durable", policy: "Policy", worker: "Worker", workerSub: "retries · breaker · DLQ", destination: "Destination", vault: "Vault", vaultSub: "KMS envelope", kill: "Kill switch" },
      },
      controls: {
        title: "Controls at a glance",
        text: "Each control is described in the sections above; this table is the short version.",
        columns: { control: "Control", scope: "Scope", mechanism: "Mechanism" },
        rows: [
          { control: "Tenant isolation", scope: "Every tenant table, application role", mechanism: "Organization id on every row, PostgreSQL row-level security enforced" },
          { control: "Secret storage", scope: "Vendor credentials", mechanism: "Envelope encryption (AES-256-GCM data keys wrapped by AWS KMS or a local master key); only a reference and the last four characters are visible" },
          { control: "Signed configuration", scope: "Browser SDK", mechanism: "Immutable, versioned, Ed25519-signed bundles verified with WebCrypto; fail closed" },
          { control: "Ingest protection", scope: "Collector", mechanism: "Origin validation, rate limits, HMAC-signed server requests, durable queue before the response" },
          { control: "Delivery", scope: "Workers", mechanism: "Retries, circuit breakers and a dead-letter queue" },
          { control: "Kill switches", scope: "Per site or organization", mechanism: "Stop collection and delivery within seconds" },
          { control: "Data minimisation", scope: "Event properties, IP addresses", mechanism: "PII scanner blocks personal data before storage; IPs truncated on ingest; no fingerprinting" },
          { control: "Audit", scope: "Audit log, usage ledger", mechanism: "Append-only through database triggers" },
          { control: "Access", scope: "Organization members", mechanism: "Six roles, MFA and passkeys, break-glass access with mandatory reason and audit entry" },
        ],
      },
      report: { title: "Report a vulnerability", text: "Please report vulnerabilities responsibly to", missing: "the address published in the imprint", ack: "We acknowledge within two business days and never name reporters without consent." },
    },
    legal: {
      eyebrow: "Legal",
      operator: { title: "Operator", company: "Company", address: "Address", representatives: "Represented by", email: "E-mail", phone: "Phone", register: "Register", vatId: "VAT ID", dpo: "Data protection officer", missing: "These details are published by the operator before launch (LEGAL_* environment variables)." },
      related: { privacy: "Privacy policy", terms: "Terms of service", dpa: "Data processing agreement", subprocessors: "Subprocessors", imprint: "Imprint", security: "Security" },
    },
    subprocessors: {
      title: "Subprocessors",
      intro: "Third parties that process customer data on behalf of the operator, and the advertising vendors that receive events only when a customer configures them as a destination.",
      processorsTitle: "Processors engaged by the operator",
      columns: { name: "Provider", purpose: "Purpose", region: "Region", basis: "Transfer basis" },
      vendors: "Destination vendors (customer-selected)",
      vendorsText: "Each destination shows its data recipient, region and transfer basis in the setup wizard. Data reaches a vendor only for destinations you enable, only with the consent purpose the destination requires.",
      updated: "Customers are notified 30 days before changes.",
    },
    imprint: {
      title: "Imprint",
      intro: "Legal information about the operator of track.site pursuant to § 5 DDG and § 18 MStV.",
      dispute: "The European Commission provides a platform for online dispute resolution (https://ec.europa.eu/consumers/odr). The operator is neither obliged nor willing to participate in dispute resolution proceedings before a consumer arbitration board.",
      liability: "Despite careful control we assume no liability for the content of external links; the operators of the linked pages are solely responsible for their content.",
    },
  },
  de: {
    common: { onThisPage: "Auf dieser Seite", breadcrumb: "Navigationspfad", home: "Startseite", updated: "Stand", copy: "Code kopieren", copied: "Kopiert", utc: "UTC", related: "Verwandte Seiten" },
    docs: {
      title: "Dokumentation",
      intro: "Alles, was du brauchst, um Track zu installieren, Server-Events zu senden, Consent zu integrieren und Destinationen zu konfigurieren. Der Dashboard-Assistent verlinkt bei jedem Schritt hierher.",
      toc: "Auf dieser Seite",
      eyebrow: "Dokumentation",
      links: { integrations: "Alle Integrationen", support: "Engineering-Support fragen", knowledge: "Tracking Knowledge" },
      quickstart: {
        title: "Drei Schritte bis zum funktionierenden Setup",
        text: "Einmal installieren, Events senden, die genutzten Plattformen verbinden. Jeder Schritt lässt sich im Dashboard prüfen, bevor du weitergehst.",
        outcomeLabel: "Das kannst du prüfen",
        steps: [
          { title: "Snippet installieren", text: "Füge ein asynchrones Script-Tag in deine Seiten ein. Es lädt die signierte Konfiguration für deine Tracking-ID und respektiert Consent ab dem ersten Seitenaufruf.", outcome: "Seitenaufrufe erscheinen im Event-Debugger." },
          { title: "Events senden", text: "Nutze die Standardevents aus dem Browser, einem Shop-Plugin oder deinem Server. Käufe tragen eine Bestellnummer, damit Browser- und Server-Kopie dedupliziert werden.", outcome: "Jedes Event zeigt seinen Consent-Status und den Grund, warum es zugestellt oder zurückgehalten wurde." },
          { title: "Destination verbinden", text: "Der geführte Assistent prüft Zugangsdaten, mappt Events, sendet einen echten Testevent und veröffentlicht erst nach deiner Freigabe.", outcome: "Zustellzustand und letzte erfolgreiche Zustellung sind pro Destination sichtbar." },
        ],
      },
      flow: {
        title: "So reist ein Event",
        text: "Jedes Event nimmt denselben Weg, egal ob es aus dem Browser, einem Shop-Plugin oder deinem Server kommt: Track validiert und dedupliziert es, prüft die Consent-Policy und routet es zu den konfigurierten Destinationen.",
        caption: "Website → Track → Consent/Policy → Destinationen. Ein Event ohne den erforderlichen Consent-Zweck stoppt am Gate; es wird weder gespeichert noch weitergeleitet.",
        nodes: { website: "Website", websiteSub: "Browser · Server", track: "Track", trackSub: "validieren · dedupe · routen", consent: "Consent", destinations: "Destinationen" },
        labels: { granted: "Zweck erteilt", held: "zurückgehalten: kein Zweck" },
      },
      guidesTitle: "Anleitungen",
      guides: [
        { id: "install", title: "Snippet installieren", text: "Füge das asynchrone Script auf jeder Seite ein, idealerweise im Head. Es lädt die signierte Konfiguration für deine Tracking-ID, respektiert Consent und blockiert nie das Rendering. Ersetze TRACKING_ID durch die sechsstellige ID aus deinem Dashboard.", code: SNIPPET, language: "html", codeTitle: "Snippet" },
        { id: "events", title: "Browser-Events senden", text: "Standardevents (page_view, view_item, add_to_cart, begin_checkout, purchase, generate_lead, sign_up, subscribe, start_trial, contact, book_appointment, download, search, login) tragen validierte Parameter; Custom-Events verwenden Namen in lowercase snake_case.", code: browserEvents("wird clientseitig vor dem Transport gehasht"), language: "js", codeTitle: "Browser" },
        { id: "server", title: "Server-API und Offline-Conversions", text: "Lege in Einstellungen → Server-Source-Keys einen Key an und sende Events aus Backend, CRM oder Kasse. Übergib dieselbe Bestellnummer wie das Browser-Event zur Deduplizierung; setze props.offline für Offline-Conversions.", code: SERVER_CALL, language: "bash", codeTitle: "POST /v1/s" },
        { id: "consent", title: "Consent-Integration", text: "Nutze ein unterstütztes CMP (TCF 2.2, GPP/GPC, Cookiebot, OneTrust, Usercentrics) — der Tracker liest es automatisch — oder rufe die Consent-API aus deinem eigenen Banner auf. Zwecke: necessary, analytics, marketing, personalization. Ein Widerruf stoppt alles sofort.", code: CONSENT_CALL, language: "js", codeTitle: "Consent-API" },
        { id: "destinations", title: "Destinationen", text: "Jede Destination hat einen geführten Assistenten: Kennungen, Tresor-Zugangsdaten oder OAuth, Anbieter-Validierung, Event-Mapping mit geprüften Standards, echter Testevent, Lint, Diff und freigabepflichtige Veröffentlichung. Browser und Server teilen eine Event-ID; Käufe ergänzen die Bestellnummer.", bullets: ["Meta, Google Ads/YouTube, GA4, TikTok, Microsoft, LinkedIn, Reddit, Pinterest, Snapchat", "X, Taboola, Outbrain, Amazon Ads, Spotify, Quora", "Yahoo DSP, The Trade Desk, Google Marketing Platform, AdRoll, Criteo, Affiliate-Postbacks (13 Presets), Webhooks"] },
        { id: "shops", title: "Shopsysteme", text: "Shopify (App mit Order-Webhooks und Web Pixel), WooCommerce (Plugin mit signierten Order-Webhooks) und Shopware 6 (App mit Storefront-Script und Order-Webhooks) senden verifizierte Kauf- und Erstattungsevents mit Bestellnummern. Plugin installieren, Tracking-ID und Source-Key einfügen, fertig.", bullets: ["Verifizierte Quelle: Events sind source_verified und gelten als maßgebliche Conversion", "Erstattungen erzeugen Events mit negativem Wert für Anbieter, die das unterstützen", "Browser-Käufe aus dem Theme werden über die Bestellnummer dedupliziert"] },
        { id: "privacy", title: "Datenschutz-Center und DSAR", text: "Aufbewahrungsfristen pro Datenart, Consent-Policy-Versionen pro Site und Betroffenenanfragen (Export, Löschen, Einschränken, Berichtigen, Widerspruch, Übertragbarkeit) werden unter Consent & Datenschutz bearbeitet. Anfragen nutzen nur gehashte Kennungen und erzeugen einen auditierten Bericht." },
      ],
      reference: {
        title: "Endpunkte im Überblick",
        text: "Alle Antworten sind JSON; 202 bedeutet, dass der Batch dauerhaft in der Queue liegt.",
        columns: { endpoint: "Endpunkt", purpose: "Zweck", notes: "Hinweise" },
        rows: [
          { endpoint: "POST /v1/e", purpose: "Browser-Batches", notes: "≤ 50 Events pro Batch" },
          { endpoint: "POST /v1/s", purpose: "Server-Batches", notes: "≤ 100 Events pro Batch, Bearer-Source-Key" },
          { endpoint: "POST /v1/affiliate/in/{trackingId}/{preset}", purpose: "Eingehende Affiliate-Netzwerk-Postbacks", notes: "13 Netzwerk-Presets" },
          { endpoint: "GET /c/{trackingId}/manifest.json", purpose: "Konfigurations-Manifest und signiertes Bundle", notes: "Ed25519-signiert, vom Browser-SDK geprüft" },
        ],
      },
    },
    support: {
      title: "Support",
      intro: "Kunden erreichen hier den Engineering-Support. Gib die Tracking-ID deiner Site an (sechs Zeichen, im Dashboard sichtbar), damit wir die richtigen Events prüfen — niemals Access-Tokens einfügen.",
      docs: "Erst in die Dokumentation schauen",
      status: "Systemstatus",
      placeholder: "Tracking-ID, Destination, was du erwartet hast und was passiert ist.",
      eyebrow: "Support",
      formTitle: "An den Engineering-Support schreiben",
      before: {
        title: "Bevor du schreibst",
        items: [
          { title: "Dokumentation", text: "Installation, Events, Consent und Destinationen mit Codebeispielen.", href: "/docs" },
          { title: "Systemstatus", text: "Live-Zustand von Collector, Queue und Zustell-Worker.", href: "/status" },
          { title: "Tracking Knowledge", text: "Anleitungen zu Deduplizierung, Consent Mode und Click-IDs.", href: "/tracking-knowledge" },
        ],
      },
      include: {
        title: "Was uns schnell antworten lässt",
        items: ["Deine Tracking-ID (sechs Zeichen, im Dashboard sichtbar)", "Die betroffene Destination und der Eventname", "Was du erwartet hast und was passiert ist, mit Uhrzeit", "Screenshots aus Debugger oder Assistent — niemals Access-Tokens oder andere Geheimnisse"],
      },
      reply: "Wir antworten per E-Mail an die Adresse, die du angibst.",
    },
    contact: {
      title: "Kontakt",
      intro: "Fragen zu Tarifen, Enterprise-Volumen, Auftragsverarbeitung oder Partnerschaften. Wir antworten innerhalb eines Werktags.",
      enterprise: "Enterprise-Anfrage: individuelles Volumen, SSO, SLA, dedizierte Verarbeitung.",
      eyebrow: "Kontakt",
      formTitle: "Nachricht senden",
      topics: {
        title: "Wobei wir helfen",
        items: [
          { title: "Tarife und Abrechnung", text: "Welcher Tarif zu deinem Eventvolumen passt, wie die Jahresabrechnung funktioniert, Rechnungen." },
          { title: "Enterprise", text: "Individuelles Volumen, SSO, SLA und dedizierte Verarbeitung." },
          { title: "Auftragsverarbeitung", text: "Der Auftragsverarbeitungsvertrag, Unterauftragsverarbeiter und EU-Hosting." },
          { title: "Partnerschaften", text: "Agenturen, Shopsysteme und Consent-Management-Anbieter." },
        ],
      },
      other: {
        title: "Suchst du etwas anderes?",
        items: [
          { title: "Demo buchen", text: "Dreißig Minuten mit einem Engineer auf deiner echten Site.", href: "/demo" },
          { title: "Support", text: "Technische Fragen zu einem bestehenden Setup.", href: "/support" },
        ],
      },
    },
    demo: {
      title: "Demo buchen",
      intro: "Dreißig Minuten mit einem Engineer: Wir richten eine Destination auf deiner echten Site ein, senden einen Testevent und gehen Consent, Deduplizierung und den Debugger durch.",
      agenda: ["Dein Stack: Plattform, CMP, aktuelle Tags und Schmerzpunkte", "Live-Einrichtung einer Destination mit dem Assistenten", "Consent-Policy, Click-IDs und Offline-Conversions für deinen Fall", "Preise, Migrationsplan und Auftragsverarbeitungsvertrag"],
      placeholder: "Welche Plattformen und welches Shopsystem nutzt ihr, und was sollen wir zeigen?",
      eyebrow: "Live-Demo",
      formTitle: "Termin anfragen",
      agendaTitle: "Was die dreißig Minuten abdecken",
      duration: "30 Minuten, online, mit einem Engineer",
      prepare: { title: "Hilfreich, wenn du es bereithältst", items: ["Zugang zu deiner Website oder einer Staging-Kopie", "Die Plattformen, auf denen du wirbst", "Deine Consent-Management-Plattform, falls du eine nutzt"] },
      honest: "Kein Verkaufsskript: Du gehst mit einer konfigurierten Destination und einer ehrlichen Einschätzung, was Track für deinen Stack leisten kann und was nicht.",
    },
    status: {
      title: "Systemstatus",
      intro: "Live-Zustand der Track-Komponenten, bei jedem Seitenaufruf geprüft. Vorfälle werden hier veröffentlicht, wenn sie auftreten.",
      component: "Komponente",
      state: "Zustand",
      checked: "Geprüft",
      ok: "betriebsbereit",
      degraded: "eingeschränkt",
      down: "nicht verfügbar",
      db: "Control-Plane-Datenbank",
      queue: "Event-Queue-Rückstand",
      worker: "Zustell-Worker (letzter Zustellversuch)",
      collector: "Collector (Ingest)",
      none: "noch keine Daten",
      incidents: "Vorfälle",
      noIncidents: "Keine Vorfälle verzeichnet.",
      note: "Der Status wird aus derselben Datenbank und Queue abgeleitet, die das Produkt nutzt; es gibt keinen separaten Statusdienst, der abweichen könnte.",
      eyebrow: "Status",
      componentsTitle: "Komponenten",
      detail: "Detail",
      pending: "{n} ausstehend",
      checkedAt: "Geprüft um",
      flow: { title: "Eventpfad und aktueller Zustand", caption: "Collector → Queue → Zustell-Worker → Destinationen; die Control-Plane-Datenbank hält Konfiguration und Zustellprotokolle. Farbe und Beschriftung jedes Knotens entsprechen der Tabelle oben.", collector: "Collector", queue: "Queue", worker: "Zustell-Worker", database: "Datenbank", destinations: "Destinationen" },
      incidentsText: "Ist eine Komponente eingeschränkt oder nicht verfügbar, werden Vorfall, Auswirkung und Behebung hier festgehalten.",
    },
    security: {
      title: "Sicherheit",
      intro: "Wie Track Kundendaten schützt: Architektur, Kontrollen und die Garantien, die du im Produkt nachprüfen kannst.",
      eyebrow: "Sicherheit",
      flow: {
        title: "Wo Daten auf ihrem Weg geschützt sind",
        text: "Vom ersten Request bis zur Zustellung hat jeder Schritt eine Kontrolle: Origin-Prüfung, Rate-Limits und HMAC-Signaturen am Collector, eine dauerhafte Queue, die Consent-Policy vor jedem Routing und Worker mit Retries, Circuit Breakern und Dead-Letter-Queue. Kill-Switches stoppen eine Site oder Organisation in Sekunden.",
        caption: "Signierte Konfiguration erreicht den Browser, Events erreichen den Collector, und nur Events, die die Policy passieren, erreichen eine Destination. Anbieter-Zugangsdaten verlassen den Tresor nur innerhalb des Workers.",
        nodes: { website: "Website", config: "Signierte Config", configSub: "Ed25519 · fail closed", collector: "Collector", collectorSub: "Origin · Rate-Limit · HMAC", queue: "Queue", queueSub: "dauerhaft", policy: "Policy", worker: "Worker", workerSub: "Retries · Breaker · DLQ", destination: "Destination", vault: "Tresor", vaultSub: "KMS-Envelope", kill: "Kill-Switch" },
      },
      controls: {
        title: "Kontrollen im Überblick",
        text: "Jede Kontrolle ist in den Abschnitten oben beschrieben; diese Tabelle ist die Kurzfassung.",
        columns: { control: "Kontrolle", scope: "Geltungsbereich", mechanism: "Mechanismus" },
        rows: [
          { control: "Mandantentrennung", scope: "Jede Mandantentabelle, Anwendungsrolle", mechanism: "Organisations-ID auf jeder Zeile, PostgreSQL Row-Level Security erzwungen" },
          { control: "Geheimnisspeicher", scope: "Anbieter-Zugangsdaten", mechanism: "Envelope Encryption (AES-256-GCM-Datenschlüssel, umhüllt von AWS KMS oder einem lokalen Master-Key); sichtbar sind nur Referenz und die letzten vier Zeichen" },
          { control: "Signierte Konfiguration", scope: "Browser-SDK", mechanism: "Unveränderliche, versionierte, Ed25519-signierte Bundles, per WebCrypto geprüft; Fail-closed" },
          { control: "Ingest-Schutz", scope: "Collector", mechanism: "Origin-Prüfung, Rate-Limits, HMAC-signierte Server-Requests, dauerhafte Queue vor der Antwort" },
          { control: "Zustellung", scope: "Worker", mechanism: "Retries, Circuit Breaker und Dead-Letter-Queue" },
          { control: "Kill-Switches", scope: "Pro Site oder Organisation", mechanism: "Stoppen Erfassung und Zustellung in Sekunden" },
          { control: "Datensparsamkeit", scope: "Event-Properties, IP-Adressen", mechanism: "PII-Scanner blockiert personenbezogene Daten vor dem Speichern; IPs beim Empfang gekürzt; kein Fingerprinting" },
          { control: "Audit", scope: "Audit-Log, Usage-Ledger", mechanism: "Append-only über Datenbank-Trigger" },
          { control: "Zugriff", scope: "Organisationsmitglieder", mechanism: "Sechs Rollen, MFA und Passkeys, Break-Glass-Zugriff mit Pflichtbegründung und Audit-Eintrag" },
        ],
      },
      report: { title: "Sicherheitslücken melden", text: "Bitte melde Schwachstellen verantwortungsvoll an", missing: "die im Impressum veröffentlichte Adresse", ack: "Wir bestätigen innerhalb von zwei Werktagen und nennen Meldende nie ohne Zustimmung." },
    },
    legal: {
      eyebrow: "Rechtliches",
      operator: { title: "Betreiber", company: "Unternehmen", address: "Anschrift", representatives: "Vertretungsberechtigte", email: "E-Mail", phone: "Telefon", register: "Registereintrag", vatId: "USt-IdNr.", dpo: "Datenschutzbeauftragte:r", missing: "Diese Angaben werden vom Betreiber vor dem Start veröffentlicht (Umgebungsvariablen LEGAL_*)." },
      related: { privacy: "Datenschutzerklärung", terms: "Nutzungsbedingungen", dpa: "Auftragsverarbeitung", subprocessors: "Unterauftragsverarbeiter", imprint: "Impressum", security: "Sicherheit" },
    },
    subprocessors: {
      title: "Unterauftragsverarbeiter",
      intro: "Dritte, die Kundendaten im Auftrag des Betreibers verarbeiten, sowie die Werbeanbieter, die Events nur erhalten, wenn ein Kunde sie als Destination konfiguriert.",
      processorsTitle: "Vom Betreiber eingesetzte Auftragsverarbeiter",
      columns: { name: "Anbieter", purpose: "Zweck", region: "Region", basis: "Übermittlungsgrundlage" },
      vendors: "Destinationsanbieter (vom Kunden gewählt)",
      vendorsText: "Jede Destination zeigt im Einrichtungsassistenten Datenempfänger, Region und Übermittlungsgrundlage. Daten erreichen einen Anbieter nur für aktivierte Destinationen und nur mit dem erforderlichen Consent-Zweck.",
      updated: "Kunden werden 30 Tage vor Änderungen informiert.",
    },
    imprint: {
      title: "Impressum",
      intro: "Angaben gemäß § 5 DDG und § 18 MStV zum Betreiber von track.site.",
      dispute: "Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung bereit (https://ec.europa.eu/consumers/odr). Der Betreiber ist nicht verpflichtet und nicht bereit, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.",
      liability: "Trotz sorgfältiger Kontrolle übernehmen wir keine Haftung für die Inhalte externer Links; für deren Inhalt sind ausschließlich die Betreiber der verlinkten Seiten verantwortlich.",
    },
  },
};

/** Date the subprocessor list and the legal frame were last reviewed (shown as "Last updated"). */
export const SUBPROCESSORS_UPDATED = "2026-09-03";
