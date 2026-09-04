import type { ConsentPurposeId, CredentialKindId, IntegrationAccess, IntegrationCategory, IntegrationKind, IntegrationMode, IntegrationVerification } from "@/lib/integrations-catalog";
import type { FaqItem, IntegrationsCopy, LocalizedCopy, TitledText } from "./types";

/**
 * Integrations area copy (overview with search + filters, detail pages; supplement §4).
 *
 * `IntegrationsAreaCopy` extends the shared `IntegrationsCopy` shape from types.ts so existing
 * imports keep working; the additional keys belong to the redesigned overview and detail pages.
 * Every fact rendered next to this copy comes from `@/lib/integrations-catalog` (verified against
 * the connector registry) — the copy only labels it.
 */
export interface IntegrationsAreaCopy extends IntegrationsCopy {
  breadcrumbs: { home: string; label: string; nav: string };
  /** Verifiable counts computed from the catalogue at render time. */
  stats: { destinations: (n: number) => string; presets: (n: number) => string; shops: (n: number) => string };
  diagram: {
    title: string;
    description: string;
    caption: string;
    nodes: { website: string; websiteSub: string; server: string; serverSub: string; track: string; trackSub: string; consent: string; ads: string; analytics: string; own: string };
  };
  /** Rendered by a client component: plain strings only (templates with `{shown}`, `{total}`, `{n}`), no functions across the RSC boundary. */
  explorer: {
    heading: string;
    searchLabel: string;
    searchPlaceholder: string;
    clear: string;
    resultsAll: string;
    resultsSome: string;
    categoryFilter: string;
    modeFilter: string;
    allCategories: string;
    allModes: string;
    reset: string;
    emptyTitle: string;
    emptyText: string;
    resultsHeading: string;
    details: string;
    presets: string;
  };
  categories: Record<IntegrationCategory, string>;
  categoryText: Record<IntegrationCategory, string>;
  kinds: Record<IntegrationKind, string>;
  modes: Record<IntegrationMode, string>;
  modeText: Record<IntegrationMode, string>;
  modesSection: { title: string; text: string; hybridTitle: string; hybridText: string };
  verification: Record<IntegrationVerification, string>;
  /** Compact status for list rows. */
  verificationShort: Record<IntegrationVerification, string>;
  verifiedOn: (date: string) => string;
  access: Record<IntegrationAccess, string>;
  purposes: Record<ConsentPurposeId, string>;
  credentialKinds: Record<CredentialKindId, string>;
  oauthProviders: Record<string, string>;
  optional: string;
  detail: {
    eyebrow: Record<IntegrationKind, string>;
    flow: {
      title: (name: string) => string;
      text: Record<IntegrationKind, string>;
      diagramTitle: (name: string) => string;
      caption: Record<IntegrationKind, string>;
      nodes: { website: string; websiteSub: string; server: string; serverSub: string; offline: string; offlineSub: string; shop: string; shopSub: string; track: string; trackSub: string; trackPairing: string; consent: string; destinations: string };
      edges: Record<IntegrationMode, string> & { shop: string };
    };
    modeDetail: Record<IntegrationMode, string>;
    sourceModes: { browser: string; server: string };
    hybrid: (field: string) => string;
    hybridNoField: string;
    sends: {
      title: string;
      intro: string;
      event: string;
      eventId: (field: string) => string;
      eventIdNoField: string;
      clickIds: (ids: string) => string;
      noClickIds: string;
      order: string;
      hashed: string;
      noHashed: string;
      consent: string;
      neverTitle: string;
      never: string[];
    };
    receives: { title: string; intro: string; items: string[]; neverTitle: string; never: string[] };
    facts: { title: string; dedup: string; pairing: string; clickIds: string; purpose: string; apiVersion: string; verified: string; status: string; docs: string; docsLink: (name: string) => string; ownDocs: string; none: string; presets: string };
    ids: { title: string; intro: string; publicIds: string; credentials: string; vault: string; noCredentials: string; key: string; label: string };
    prerequisites: string;
    consent: { title: string; text: Record<ConsentPurposeId, string>; source: string };
    setup: { title: string; intro: string; destination: TitledText[]; source: TitledText[] };
    knowledge: { title: string; text: string; all: string; none: string; minutes: (n: number) => string };
    faq: { title: string; destination: FaqItem[]; source: FaqItem[] };
    cta: { title: (name: string) => string; text: string; start: string; all: string };
  };
}

export const INTEGRATIONS_COPY: LocalizedCopy<IntegrationsAreaCopy> = {
  en: {
    eyebrow: "Integrations",
    title: "Every platform with browser tag, server API and shared deduplication",
    text: "Advertising platforms, analytics, affiliate networks, your own systems and three shop platforms — each implemented, documented and tested against the vendor contract. No “coming soon”.",
    groups: { 1: "Core advertising platforms", 2: "Reach and discovery", 3: "Programmatic, retargeting and affiliate", commerce: "Shop platforms" },
    browser: "Browser",
    server: "Server",
    offline: "Offline",
    cta: "Connect your first platform",
    ctaText: "The assistant walks through identifiers, credentials, mapping and a verified test event.",
    start: "Start free",
    how: "How it works",
    breadcrumbs: { home: "Track", label: "Integrations", nav: "Breadcrumb" },
    stats: {
      destinations: (n) => `${n} destination types`,
      presets: (n) => `${n} affiliate postback presets`,
      shops: (n) => `${n} shop platforms`,
    },
    diagram: {
      title: "How events reach a destination",
      description: "Browser events from the website and server or offline events from your systems arrive at Track, pass the consent and policy gate and are delivered to advertising platforms, analytics and your own systems.",
      caption: "One event, one consent decision, one delivery per destination. Browser and server paths share the same event id, so platforms count each conversion once.",
      nodes: { website: "Website", websiteSub: "browser tag", server: "Server · CRM", serverSub: "server · offline", track: "Track", trackSub: "policy · dedup", consent: "Consent", ads: "Ad platforms", analytics: "Analytics", own: "Own systems" },
    },
    explorer: {
      heading: "Find your platform",
      searchLabel: "Search integrations",
      searchPlaceholder: "Search by platform, product or click id (e.g. Meta, GA4, gclid)",
      clear: "Clear search",
      resultsAll: "{total} integrations",
      resultsSome: "{shown} of {total} integrations",
      categoryFilter: "Filter by category",
      modeFilter: "Filter by delivery mode",
      allCategories: "All categories",
      allModes: "All modes",
      reset: "Reset filters",
      emptyTitle: "No integration matches",
      emptyText: "Try a shorter search term or remove a filter. Every platform listed here is implemented today — there is no waiting list to search for.",
      resultsHeading: "Results",
      details: "Details",
      presets: "{n} network presets",
    },
    categories: { ads: "Ads", analytics: "Analytics", commerce: "Commerce", affiliate: "Affiliate", custom: "Own systems" },
    categoryText: {
      ads: "Pixel or tag in the browser plus the vendor's conversions API on the server, deduplicated on a shared event id.",
      analytics: "Browser measurement plus server-side collection with validation before anything is sent.",
      commerce: "Shop platforms deliver verified orders and refunds to Track; the browser adds consent and click ids.",
      affiliate: "Server-to-server postbacks to affiliate and performance networks, attributed by the captured click id.",
      custom: "Signed JSON events to your own endpoints — CRM, data warehouse, internal tools.",
    },
    kinds: { destination: "Destination", source: "Shop integration" },
    modes: { browser: "Browser", server: "Server", offline: "Offline" },
    modeText: {
      browser: "The Track snippet loads the vendor tag only after consent for its purpose. No vendor code lives in your template.",
      server: "The worker delivers the same event through the vendor's API — with retries, health checks and a redacted payload preview per attempt.",
      offline: "Server events flagged as offline (CRM deals, store purchases) reach platforms whose API accepts non-web action sources.",
    },
    modesSection: {
      title: "Three delivery modes, one event",
      text: "Which modes a platform supports is decided by its API, not by a plan. The catalogue below shows exactly what each connector implements.",
      hybridTitle: "Hybrid by default",
      hybridText: "When a platform supports both paths, browser tag and server request carry the same event id and purchases add the order id. The vendor deduplicates, and Track's own guard drops repeated source events before delivery.",
    },
    verification: {
      vendor_docs: "Implemented · verified against the vendor documentation",
      secondary_sources: "Implemented · verified against secondary references (vendor docs behind a login)",
      recorded_payloads: "Implemented · tested with signed, recorded webhook payloads",
    },
    verificationShort: { vendor_docs: "Implemented", secondary_sources: "Implemented (secondary sources)", recorded_payloads: "Implemented (recorded payloads)" },
    verifiedOn: (date) => `verified ${date}`,
    access: {
      open: "No vendor approval needed",
      vendor_setup: "Requires setup in the vendor account",
      vendor_approval: "Requires vendor approval",
      vendor_beta: "Vendor API in beta",
    },
    purposes: { necessary: "Necessary", analytics: "Analytics", marketing: "Marketing" },
    credentialKinds: {
      access_token: "API access token",
      api_secret: "API secret",
      oauth_refresh_token: "OAuth connection",
      oauth_access_token: "OAuth connection",
      oauth_token_secret: "OAuth token secret",
      client_id: "API client ID",
      client_secret: "API client secret",
      webhook_secret: "Webhook secret",
      signing_secret: "Signing secret (generated by Track)",
    },
    oauthProviders: { google: "Google", linkedin: "LinkedIn", amazon: "Amazon", x: "X" },
    optional: "optional",
    detail: {
      eyebrow: { destination: "Integration · destination", source: "Integration · shop platform" },
      flow: {
        title: (name) => `How events reach ${name}`,
        text: {
          destination: "Every path ends in the same place: the policy engine checks the consent purpose this destination requires, strips what may not leave, and the worker delivers with the shared event id.",
          source: "The shop's own webhooks are the authoritative source for purchases and refunds. Track verifies the signature, pairs the order with the browser purchase by order id and only then routes it on — consent is inherited, never assumed.",
        },
        diagramTitle: (name) => `Data flow from your website and systems through Track to ${name}`,
        caption: {
          destination: "Supported paths only. Unsupported modes are not drawn — and not claimed.",
          source: "Browser purchase and verified shop webhook are paired by order id; the shop record inherits the visitor's consent and click ids.",
        },
        nodes: {
          website: "Website",
          websiteSub: "browser tag",
          server: "Your server",
          serverSub: "server API",
          offline: "CRM · offline",
          offlineSub: "offline conversions",
          shop: "Shop webhooks",
          shopSub: "orders · refunds",
          track: "Track",
          trackSub: "policy · dedup",
          trackPairing: "pairing by order id",
          consent: "Consent",
          destinations: "Destinations",
        },
        edges: { browser: "browser", server: "server", offline: "offline", shop: "signed webhook" },
      },
      modeDetail: {
        browser: "Browser tag — loaded by the Track snippet after consent; the vendor script never sits in your template and is never loaded without the required purpose.",
        server: "Server API — delivered by the worker with retries, health checks, error classification and a redacted payload preview for every attempt.",
        offline: "Offline conversions — server events flagged as offline (CRM deals, phone orders, store purchases) reach this platform with the vendor's offline action source.",
      },
      sourceModes: {
        browser: "Browser — the storefront script sends standard events with the visitor's consent state and click ids; the purchase carries the order id for pairing.",
        server: "Server — the shop's signed webhooks deliver paid orders and refunds with totals and line items; Track verifies every signature before accepting a record.",
      },
      hybrid: (field) => `Hybrid — browser tag and server request share one event id; the platform deduplicates on ${field}.`,
      hybridNoField: "Hybrid — browser tag and server request share one event id; conversions are matched on the order id.",
      sends: {
        title: "What is sent",
        intro: "Only what you configure in the event mapping, and only after the policy engine has allowed the event for this destination.",
        event: "Event name and timestamp, mapped from Track's standard events to the platform's event names.",
        eventId: (field) => `The shared event id in the platform's ${field} field, so browser and server deliveries count once.`,
        eventIdNoField: "The shared event id, so browser and server deliveries can be matched.",
        clickIds: (ids) => `Click ids this platform may receive: ${ids}. Other vendors' click ids are never forwarded.`,
        noClickIds: "No vendor click ids — this destination is your own system, so attribution stays with you.",
        order: "Order id, value, currency and items for purchase-type events.",
        hashed: "SHA-256-hashed identifiers (e-mail, phone, external id) for matching — only with the required consent and only if captured.",
        noHashed: "No hashed identifiers — this platform attributes on its click id alone.",
        consent: "The consent state the event was collected under, where the platform accepts consent signals.",
        neverTitle: "Never sent",
        never: ["Raw e-mail addresses, phone numbers or names — identifiers are hashed on ingest.", "Inferred values: unknown stays unknown, nothing is guessed.", "Events collected without the purpose this destination requires.", "Secrets: tokens live in the encrypted vault and never reach the browser, the assistant or a log."],
      },
      receives: {
        title: "What Track receives",
        intro: "Two complementary paths, paired by order id in the ingest stage.",
        items: ["Paid orders and refunds from the shop's signed webhooks: order id, totals, currency, line items and the customer's matching data — hashed on ingest.", "Standard browser events from the storefront (view, add to cart, checkout, purchase) with the visitor's consent record and captured click ids.", "The order id on both paths, so the verified shop record supersedes the browser purchase without double counting."],
        neverTitle: "Never assumed",
        never: ["Marketing consent: a shop webhook carries no consent of its own. Without a paired browser purchase the record stays an operational record and reaches only destinations that need no consent.", "Raw customer data in ad platforms — matching data is hashed before it is stored.", "Unsigned or unverifiable webhooks — a failed signature check is recorded and dropped."],
      },
      facts: {
        title: "Technical facts",
        dedup: "Deduplication field",
        pairing: "Pairing key",
        clickIds: "Click ids",
        purpose: "Consent purpose",
        apiVersion: "Pinned API version",
        verified: "Verification",
        status: "Implementation status",
        docs: "Vendor documentation",
        docsLink: (name) => `${name} API documentation`,
        ownDocs: "Track documentation",
        none: "none",
        presets: "Network presets",
      },
      ids: {
        title: "What you need",
        intro: "Public identifiers can be typed in chat or the wizard; secrets go through the secure credential card or OAuth and are stored encrypted.",
        publicIds: "Public identifiers",
        credentials: "Credentials",
        vault: "stored in the encrypted vault",
        noCredentials: "No credentials — this platform accepts server events with the public identifiers alone.",
        key: "Key",
        label: "Description",
      },
      prerequisites: "Vendor prerequisite",
      consent: {
        title: "Consent",
        text: {
          marketing: "Requires the marketing purpose. Without it nothing is loaded in the browser and nothing is sent from the server. Inferred consent is never exported, and Global Privacy Control opt-outs block delivery.",
          analytics: "Requires the analytics purpose. Without it nothing is loaded in the browser and nothing is sent from the server. Inferred consent is never exported.",
          necessary: "Runs under the necessary purpose because it targets your own systems (controller-side processing). Identifiers are still stripped without analytics consent and click ids without marketing consent.",
        },
        source: "Shop webhooks carry no consent of their own. A verified order inherits the consent record of the paired browser purchase; without one it is stored as an operational record and never reaches an advertising platform.",
      },
      setup: {
        title: "Setup in a few steps",
        intro: "The assistant runs the detailed checks. You see the milestones that need a decision from you.",
        destination: [
          { title: "Enter identifiers", text: "Add the public IDs from the platform. Formats are validated against the vendor's documentation before anything is saved." },
          { title: "Connect credentials", text: "Paste the token into the secure card or connect the account via OAuth. Secrets go straight into the encrypted vault." },
          { title: "Map and test", text: "Standard events are pre-mapped to the platform's event names. A flagged test event runs through the real pipeline and shows the vendor's answer." },
          { title: "Publish", text: "Review the diff, approve, publish a signed configuration version. Roll back with one click if needed." },
        ],
        source: [
          { title: "Connect the shop", text: "Enter the shop domain and fallback currency. Track generates the webhook URL and the secret once." },
          { title: "Install the shop side", text: "Install the pixel extension, plugin or app and register the webhooks with the generated secret." },
          { title: "Verify with a test order", text: "The first signed webhook flips the connection to connected; the observed topics and the last webhook are shown live." },
        ],
      },
      knowledge: {
        title: "From Tracking Knowledge",
        text: "Guides written by the team that builds this connector.",
        all: "All Tracking Knowledge articles",
        none: "No dedicated article yet — the Tracking Knowledge hub covers server-side tracking, deduplication and consent in general.",
        minutes: (n) => `${n} min read`,
      },
      faq: {
        title: "Questions",
        destination: [
          { q: "Can I run server-only?", a: "Yes. Choose server mode in the wizard; the vendor script is never loaded and matching relies on hashed identifiers and click ids captured by the tracker." },
          { q: "How are duplicates avoided?", a: "The browser tag and the server request carry the same event id, and purchases add the order id. The worker also deduplicates repeated source events before delivery." },
          { q: "What if the vendor API changes?", a: "API versions are pinned centrally with the verification date; sunset warnings appear in the destination health long before an endpoint is retired." },
        ],
        source: [
          { q: "Do I still need the browser purchase?", a: "It is optional but valuable: it carries the visitor's consent record and click ids, which the server cannot know. The verified shop record supersedes it for value and items." },
          { q: "Is the same order counted twice?", a: "No. Browser purchase, server API and shop webhook share the order-derived event id, and the conversion record keeps one row per order." },
          { q: "What happens if a webhook is retried by the platform?", a: "Redeliveries produce deterministic event ids and hit the event-level dedup guard; nothing is counted again." },
        ],
      },
      cta: {
        title: (name) => `Connect ${name}`,
        text: "Set it up with the guided wizard or let the assistant do it in chat.",
        start: "Start free",
        all: "All integrations",
      },
    },
  },
  de: {
    eyebrow: "Integrationen",
    title: "Jede Plattform mit Browser-Tag, Server-API und gemeinsamer Deduplizierung",
    text: "Werbeplattformen, Analytics, Affiliate-Netzwerke, eigene Systeme und drei Shopsysteme — jeweils umgesetzt, dokumentiert und gegen den Anbieter-Vertrag getestet. Kein „Coming soon“.",
    groups: { 1: "Zentrale Werbeplattformen", 2: "Reichweite und Discovery", 3: "Programmatic, Retargeting und Affiliate", commerce: "Shopsysteme" },
    browser: "Browser",
    server: "Server",
    offline: "Offline",
    cta: "Erste Plattform verbinden",
    ctaText: "Der Assistent führt durch Kennungen, Zugangsdaten, Mapping und einen verifizierten Testevent.",
    start: "Kostenlos starten",
    how: "So funktioniert es",
    breadcrumbs: { home: "Track", label: "Integrationen", nav: "Navigationspfad" },
    stats: {
      destinations: (n) => `${n} Destinationstypen`,
      presets: (n) => `${n} Affiliate-Postback-Presets`,
      shops: (n) => `${n} Shopsysteme`,
    },
    diagram: {
      title: "So erreichen Events eine Destination",
      description: "Browser-Events von der Website sowie Server- oder Offline-Events aus deinen Systemen kommen bei Track an, passieren das Consent- und Policy-Gate und werden an Werbeplattformen, Analytics und eigene Systeme zugestellt.",
      caption: "Ein Event, eine Consent-Entscheidung, eine Zustellung pro Destination. Browser- und Serverpfad teilen dieselbe Event-ID, damit Plattformen jede Conversion nur einmal zählen.",
      nodes: { website: "Website", websiteSub: "Browser-Tag", server: "Server · CRM", serverSub: "Server · Offline", track: "Track", trackSub: "Policy · Dedup", consent: "Consent", ads: "Werbeplattformen", analytics: "Analytics", own: "Eigene Systeme" },
    },
    explorer: {
      heading: "Plattform finden",
      searchLabel: "Integrationen durchsuchen",
      searchPlaceholder: "Nach Plattform, Produkt oder Click-ID suchen (z. B. Meta, GA4, gclid)",
      clear: "Suche löschen",
      resultsAll: "{total} Integrationen",
      resultsSome: "{shown} von {total} Integrationen",
      categoryFilter: "Nach Kategorie filtern",
      modeFilter: "Nach Zustellmodus filtern",
      allCategories: "Alle Kategorien",
      allModes: "Alle Modi",
      reset: "Filter zurücksetzen",
      emptyTitle: "Keine passende Integration",
      emptyText: "Versuche einen kürzeren Suchbegriff oder entferne einen Filter. Jede hier gelistete Plattform ist heute umgesetzt — eine Warteliste gibt es nicht.",
      resultsHeading: "Ergebnisse",
      details: "Details",
      presets: "{n} Netzwerk-Presets",
    },
    categories: { ads: "Ads", analytics: "Analytics", commerce: "Commerce", affiliate: "Affiliate", custom: "Eigene Systeme" },
    categoryText: {
      ads: "Pixel oder Tag im Browser plus Conversions-API des Anbieters auf dem Server, dedupliziert über eine gemeinsame Event-ID.",
      analytics: "Browser-Messung plus serverseitige Erfassung mit Validierung, bevor etwas gesendet wird.",
      commerce: "Shopsysteme liefern verifizierte Bestellungen und Erstattungen an Track; der Browser ergänzt Consent und Click-IDs.",
      affiliate: "Server-to-Server-Postbacks an Affiliate- und Performance-Netzwerke, attribuiert über die erfasste Click-ID.",
      custom: "Signierte JSON-Events an deine eigenen Endpunkte — CRM, Data Warehouse, interne Tools.",
    },
    kinds: { destination: "Destination", source: "Shop-Integration" },
    modes: { browser: "Browser", server: "Server", offline: "Offline" },
    modeText: {
      browser: "Das Track-Snippet lädt das Anbieter-Tag erst nach Consent für seinen Zweck. Im Template liegt kein Anbieter-Code.",
      server: "Der Worker stellt dasselbe Event über die API des Anbieters zu — mit Retries, Health-Checks und geschwärzter Payload-Vorschau pro Versuch.",
      offline: "Als offline markierte Server-Events (CRM-Abschlüsse, Ladenkäufe) erreichen Plattformen, deren API Non-Web-Action-Sources akzeptiert.",
    },
    modesSection: {
      title: "Drei Zustellmodi, ein Event",
      text: "Welche Modi eine Plattform unterstützt, entscheidet ihre API, nicht ein Tarif. Der Katalog zeigt genau, was jeder Connector umsetzt.",
      hybridTitle: "Hybrid als Standard",
      hybridText: "Unterstützt eine Plattform beide Wege, tragen Browser-Tag und Server-Request dieselbe Event-ID, Käufe zusätzlich die Bestellnummer. Der Anbieter dedupliziert, und Tracks eigener Schutz verwirft wiederholte Quell-Events vor der Zustellung.",
    },
    verification: {
      vendor_docs: "Umgesetzt · gegen die Anbieter-Dokumentation verifiziert",
      secondary_sources: "Umgesetzt · gegen Sekundärquellen verifiziert (Anbieter-Doku nur nach Login)",
      recorded_payloads: "Umgesetzt · mit signierten, aufgezeichneten Webhook-Payloads getestet",
    },
    verificationShort: { vendor_docs: "Umgesetzt", secondary_sources: "Umgesetzt (Sekundärquellen)", recorded_payloads: "Umgesetzt (aufgezeichnete Payloads)" },
    verifiedOn: (date) => `verifiziert am ${date}`,
    access: {
      open: "Keine Freigabe durch den Anbieter nötig",
      vendor_setup: "Einrichtung im Anbieter-Konto erforderlich",
      vendor_approval: "Freigabe durch den Anbieter erforderlich",
      vendor_beta: "Anbieter-API in Beta",
    },
    purposes: { necessary: "Notwendig", analytics: "Analytics", marketing: "Marketing" },
    credentialKinds: {
      access_token: "API-Zugangstoken",
      api_secret: "API-Secret",
      oauth_refresh_token: "OAuth-Verbindung",
      oauth_access_token: "OAuth-Verbindung",
      oauth_token_secret: "OAuth-Token-Secret",
      client_id: "API-Client-ID",
      client_secret: "API-Client-Secret",
      webhook_secret: "Webhook-Secret",
      signing_secret: "Signatur-Secret (von Track erzeugt)",
    },
    oauthProviders: { google: "Google", linkedin: "LinkedIn", amazon: "Amazon", x: "X" },
    optional: "optional",
    detail: {
      eyebrow: { destination: "Integration · Destination", source: "Integration · Shopsystem" },
      flow: {
        title: (name) => `So erreichen Events ${name}`,
        text: {
          destination: "Jeder Pfad endet an derselben Stelle: Die Policy-Engine prüft den Consent-Zweck, den diese Destination benötigt, entfernt, was nicht hinaus darf, und der Worker stellt mit der gemeinsamen Event-ID zu.",
          source: "Die Webhooks des Shops sind die verbindliche Quelle für Käufe und Erstattungen. Track prüft die Signatur, paart die Bestellung über die Bestellnummer mit dem Browser-Kauf und leitet erst dann weiter — Consent wird geerbt, nie angenommen.",
        },
        diagramTitle: (name) => `Datenfluss von Website und Systemen über Track zu ${name}`,
        caption: {
          destination: "Nur unterstützte Pfade. Nicht unterstützte Modi werden nicht gezeichnet — und nicht behauptet.",
          source: "Browser-Kauf und verifizierter Shop-Webhook werden über die Bestellnummer gepaart; der Shop-Datensatz erbt Consent und Click-IDs des Besuchers.",
        },
        nodes: {
          website: "Website",
          websiteSub: "Browser-Tag",
          server: "Dein Server",
          serverSub: "Server-API",
          offline: "CRM · Offline",
          offlineSub: "Offline-Conversions",
          shop: "Shop-Webhooks",
          shopSub: "Orders · Refunds",
          track: "Track",
          trackSub: "Policy · Dedup",
          trackPairing: "Pairing über Bestellnummer",
          consent: "Consent",
          destinations: "Destinationen",
        },
        edges: { browser: "Browser", server: "Server", offline: "Offline", shop: "signierter Webhook" },
      },
      modeDetail: {
        browser: "Browser-Tag — vom Track-Snippet nach Consent geladen; das Anbieter-Skript liegt nie im Template und wird ohne den nötigen Zweck nie geladen.",
        server: "Server-API — vom Worker zugestellt, mit Retries, Health-Checks, Fehlerklassifikation und geschwärzter Payload-Vorschau für jeden Versuch.",
        offline: "Offline-Conversions — als offline markierte Server-Events (CRM-Abschlüsse, Telefonbestellungen, Ladenkäufe) erreichen diese Plattform mit der Offline-Action-Source des Anbieters.",
      },
      sourceModes: {
        browser: "Browser — das Storefront-Script sendet Standard-Events mit Consent-Zustand und Click-IDs des Besuchers; der Kauf trägt die Bestellnummer für das Pairing.",
        server: "Server — die signierten Webhooks des Shops liefern bezahlte Bestellungen und Erstattungen mit Summen und Positionen; Track prüft jede Signatur, bevor ein Datensatz angenommen wird.",
      },
      hybrid: (field) => `Hybrid — Browser-Tag und Server-Request teilen eine Event-ID; die Plattform dedupliziert über ${field}.`,
      hybridNoField: "Hybrid — Browser-Tag und Server-Request teilen eine Event-ID; Conversions werden über die Bestellnummer zusammengeführt.",
      sends: {
        title: "Was gesendet wird",
        intro: "Nur, was du im Event-Mapping konfigurierst — und erst, nachdem die Policy-Engine das Event für diese Destination freigegeben hat.",
        event: "Eventname und Zeitstempel, von Tracks Standard-Events auf die Eventnamen der Plattform abgebildet.",
        eventId: (field) => `Die gemeinsame Event-ID im Feld ${field} der Plattform, damit Browser- und Serverzustellung nur einmal zählen.`,
        eventIdNoField: "Die gemeinsame Event-ID, damit Browser- und Serverzustellung zusammengeführt werden können.",
        clickIds: (ids) => `Click-IDs, die diese Plattform erhalten darf: ${ids}. Click-IDs anderer Anbieter werden nie weitergegeben.`,
        noClickIds: "Keine Anbieter-Click-IDs — diese Destination ist dein eigenes System, die Attribution bleibt bei dir.",
        order: "Bestellnummer, Wert, Währung und Positionen bei Kauf-Events.",
        hashed: "SHA-256-gehashte Kennungen (E-Mail, Telefon, externe ID) für das Matching — nur mit dem nötigen Consent und nur, wenn erfasst.",
        noHashed: "Keine gehashten Kennungen — diese Plattform attribuiert allein über ihre Click-ID.",
        consent: "Der Consent-Zustand, unter dem das Event erfasst wurde, sofern die Plattform Consent-Signale annimmt.",
        neverTitle: "Nie gesendet",
        never: ["E-Mail-Adressen, Telefonnummern oder Namen im Klartext — Kennungen werden beim Ingest gehasht.", "Abgeleitete Werte: Unbekannt bleibt unbekannt, nichts wird geraten.", "Events, die ohne den von dieser Destination benötigten Zweck erfasst wurden.", "Geheimnisse: Tokens liegen im verschlüsselten Tresor und erreichen nie Browser, Assistent oder Log."],
      },
      receives: {
        title: "Was Track empfängt",
        intro: "Zwei sich ergänzende Pfade, im Ingest über die Bestellnummer gepaart.",
        items: ["Bezahlte Bestellungen und Erstattungen aus den signierten Webhooks des Shops: Bestellnummer, Summen, Währung, Positionen und die Matching-Daten des Kunden — beim Ingest gehasht.", "Standard-Browser-Events aus dem Storefront (Ansicht, In den Warenkorb, Checkout, Kauf) mit Consent-Datensatz und erfassten Click-IDs des Besuchers.", "Die Bestellnummer auf beiden Pfaden, damit der verifizierte Shop-Datensatz den Browser-Kauf ohne Doppelzählung ersetzt."],
        neverTitle: "Nie angenommen",
        never: ["Marketing-Consent: Ein Shop-Webhook trägt keinen eigenen Consent. Ohne gepaarten Browser-Kauf bleibt der Datensatz operativ und erreicht nur Destinationen, die keinen Consent benötigen.", "Kundendaten im Klartext in Werbeplattformen — Matching-Daten werden vor dem Speichern gehasht.", "Unsignierte oder nicht prüfbare Webhooks — eine fehlgeschlagene Signaturprüfung wird protokolliert und verworfen."],
      },
      facts: {
        title: "Technische Fakten",
        dedup: "Deduplizierungsfeld",
        pairing: "Pairing-Schlüssel",
        clickIds: "Click-IDs",
        purpose: "Consent-Zweck",
        apiVersion: "Gepinnte API-Version",
        verified: "Verifizierung",
        status: "Umsetzungsstatus",
        docs: "Anbieter-Dokumentation",
        docsLink: (name) => `API-Dokumentation von ${name}`,
        ownDocs: "Track-Dokumentation",
        none: "keine",
        presets: "Netzwerk-Presets",
      },
      ids: {
        title: "Was du brauchst",
        intro: "Öffentliche Kennungen kannst du im Chat oder Assistenten eingeben; Geheimnisse gehen über die sichere Zugangsdaten-Karte oder OAuth und werden verschlüsselt gespeichert.",
        publicIds: "Öffentliche Kennungen",
        credentials: "Zugangsdaten",
        vault: "im verschlüsselten Tresor gespeichert",
        noCredentials: "Keine Zugangsdaten — diese Plattform nimmt Server-Events allein mit den öffentlichen Kennungen an.",
        key: "Schlüssel",
        label: "Beschreibung",
      },
      prerequisites: "Voraussetzung beim Anbieter",
      consent: {
        title: "Consent",
        text: {
          marketing: "Benötigt den Zweck Marketing. Ohne ihn wird im Browser nichts geladen und vom Server nichts gesendet. Abgeleiteter Consent wird nie exportiert, und Global-Privacy-Control-Opt-outs blockieren die Zustellung.",
          analytics: "Benötigt den Zweck Analytics. Ohne ihn wird im Browser nichts geladen und vom Server nichts gesendet. Abgeleiteter Consent wird nie exportiert.",
          necessary: "Läuft unter dem Zweck Notwendig, weil das Ziel deine eigenen Systeme sind (Verarbeitung auf Verantwortlichenseite). Kennungen werden trotzdem ohne Analytics-Consent entfernt, Click-IDs ohne Marketing-Consent.",
        },
        source: "Shop-Webhooks tragen keinen eigenen Consent. Eine verifizierte Bestellung erbt den Consent-Datensatz des gepaarten Browser-Kaufs; ohne ihn wird sie als operativer Datensatz gespeichert und erreicht nie eine Werbeplattform.",
      },
      setup: {
        title: "Einrichtung in wenigen Schritten",
        intro: "Die detaillierten Prüfungen übernimmt der Assistent. Du siehst die Meilensteine, die eine Entscheidung von dir brauchen.",
        destination: [
          { title: "Kennungen eingeben", text: "Die öffentlichen IDs der Plattform hinzufügen. Formate werden gegen die Anbieter-Dokumentation validiert, bevor etwas gespeichert wird." },
          { title: "Zugangsdaten verbinden", text: "Token in die sichere Karte einfügen oder das Konto per OAuth verbinden. Geheimnisse wandern direkt in den verschlüsselten Tresor." },
          { title: "Mappen und testen", text: "Standard-Events sind auf die Eventnamen der Plattform vorgemappt. Ein markierter Testevent läuft durch die echte Pipeline und zeigt die Antwort des Anbieters." },
          { title: "Veröffentlichen", text: "Diff prüfen, freigeben, signierte Konfigurationsversion veröffentlichen. Bei Bedarf Rollback per Klick." },
        ],
        source: [
          { title: "Shop verbinden", text: "Shop-Domain und Fallback-Währung eingeben. Track erzeugt Webhook-URL und Secret — einmalig sichtbar." },
          { title: "Shop-Seite installieren", text: "Pixel-Extension, Plugin oder App installieren und die Webhooks mit dem erzeugten Secret registrieren." },
          { title: "Mit Testbestellung prüfen", text: "Der erste signierte Webhook schaltet die Verbindung auf verbunden; beobachtete Topics und letzter Webhook werden live angezeigt." },
        ],
      },
      knowledge: {
        title: "Aus Tracking Knowledge",
        text: "Leitfäden vom Team, das diesen Connector baut.",
        all: "Alle Tracking-Knowledge-Artikel",
        none: "Noch kein eigener Artikel — der Tracking-Knowledge-Hub behandelt Server-Side Tracking, Deduplizierung und Consent allgemein.",
        minutes: (n) => `${n} Min. Lesezeit`,
      },
      faq: {
        title: "Fragen",
        destination: [
          { q: "Kann ich nur serverseitig senden?", a: "Ja. Wähle im Assistenten den Servermodus; das Anbieter-Skript wird nie geladen und das Matching stützt sich auf gehashte Kennungen und vom Tracker erfasste Click-IDs." },
          { q: "Wie werden Duplikate vermieden?", a: "Browser-Tag und Server-Request tragen dieselbe Event-ID, Käufe zusätzlich die Bestellnummer. Der Worker dedupliziert wiederholte Quell-Events zudem vor der Zustellung." },
          { q: "Was, wenn sich die Anbieter-API ändert?", a: "API-Versionen sind zentral mit Prüfdatum gepinnt; Sunset-Warnungen erscheinen im Destination-Zustand lange bevor ein Endpunkt abgeschaltet wird." },
        ],
        source: [
          { q: "Brauche ich den Browser-Kauf trotzdem?", a: "Er ist optional, aber wertvoll: Er trägt Consent-Datensatz und Click-IDs des Besuchers, die der Server nicht kennen kann. Der verifizierte Shop-Datensatz ersetzt ihn bei Wert und Positionen." },
          { q: "Wird dieselbe Bestellung doppelt gezählt?", a: "Nein. Browser-Kauf, Server-API und Shop-Webhook teilen die aus der Bestellnummer abgeleitete Event-ID, und der Conversion-Datensatz hält eine Zeile pro Bestellung." },
          { q: "Was passiert, wenn die Plattform einen Webhook erneut sendet?", a: "Wiederholte Zustellungen erzeugen deterministische Event-IDs und laufen in den Dedup-Schutz auf Eventebene; nichts wird erneut gezählt." },
        ],
      },
      cta: {
        title: (name) => `${name} verbinden`,
        text: "Mit dem geführten Assistenten einrichten oder den Chat-Assistenten machen lassen.",
        start: "Kostenlos starten",
        all: "Alle Integrationen",
      },
    },
  },
};
