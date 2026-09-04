import type { HowItWorksCopy, LocalizedCopy } from "./types";

/*
 * /how-it-works. Keeps the `HowItWorksCopy` shape (title, intro, steps, architecture, faq) and adds
 * what the redesigned page needs. The customer sees four milestones (`steps`); the long list of
 * technical checks lives in the collapsible `checks` section and mirrors the setup state machine in
 * packages/ai (site, business type, platform, installation, consent, destinations, event plan,
 * test, review, publish, health) without turning it into a step count.
 */

/** Same shape as the real snippet in components/app/snippet.tsx; TRACKING_ID stands for the site's six-character id. */
const SNIPPET = `<script async src="https://cdn.track.site/v1/tracker.js" data-site-id="TRACKING_ID"></script>`;

export const HOW_IT_WORKS: LocalizedCopy<HowItWorksCopy> = {
  en: {
    eyebrow: "How it works",
    title: "From your domain to verified conversions on every platform",
    intro: "One snippet on your site, one guided session with the assistant, one signed configuration you approve. Track takes the events from there — with consent evaluated for every destination and a debugger that shows you what happened.",
    cta: "Start with your domain",
    ctaSecondary: "See the features",
    stage: {
      title: "Snippet → Track → platforms",
      description: "The snippet on your website sends events from the browser; your shop or server sends the same conversions with a shared event id. Track evaluates consent at a policy gate and forwards each event to Meta, Google Ads, Google Analytics 4 and TikTok.",
      caption: "Snippet → Track → Consent/Policy → platforms. The same picture you see in the debugger for every real event.",
    },
    milestonesTitle: "Four milestones, one session",
    milestonesText: "This is the customer's view. The technical checks behind each milestone are listed further down.",
    youLabel: "You",
    outcomeLabel: "You get",
    steps: [
      { title: "Create your site", text: "Sign up with your domain. Track creates the site, a public six-character tracking id and the one-line snippet.", you: "enter the domain and paste the snippet — or install the Shopify, WooCommerce or Shopware app", outcome: "a verified installation: Track sees the first page view and confirms ownership by DNS, file or meta tag" },
      { title: "Let the assistant propose the setup", text: "The assistant detects platform and consent tool, proposes an event plan for your business type and asks for the public ids of the platforms you use.", you: "answer a few questions and enter pixel ids in chat, access tokens in the vault card", outcome: "a drafted configuration with mapped events and a real test event accepted by the vendor" },
      { title: "Approve and publish", text: "You see the diff, the recipients and the consent requirement of every destination. One approval publishes a signed, versioned bundle.", you: "read the diff and click approve", outcome: "a live configuration with its version number, rollback available with one click" },
      { title: "Watch and improve", text: "The debugger shows every event with its decision, the health score reports what to fix, and the assistant proposes the fix.", you: "check the score when it changes; approve improvements", outcome: "verified conversions on every platform, with evidence per event" },
    ],
    snippet: { title: "The snippet", code: SNIPPET, copy: "Copy snippet", copied: "Copied", note: "Served from a first-party CDN host; the configuration it loads is Ed25519-signed and verified before anything runs." },
    published: {
      title: "Configuration · version 13",
      state: "live",
      facts: [
        { label: "Approved by", value: "you, bound to the diff you read" },
        { label: "Signature", value: "Ed25519, verified by the SDK" },
        { label: "Destinations", value: "Meta (browser + server), Google Ads (server)" },
        { label: "Rollback", value: "version 12, one click" },
      ],
    },
    flows: {
      title: "Where your events come from",
      text: "Switch between the delivery modes. Every destination can run browser-only, server-only or both; the hybrid mode is the default because the two paths cover each other's gaps.",
      tabsLabel: "Delivery modes",
      items: [
        {
          id: "browser",
          label: "Browser only",
          title: "Events from the browser SDK",
          text: "The snippet collects page views, product views and cart events in the visitor's browser and sends them to Track's ingest host. Vendor tags load only after consent. This mode is quick to install but depends on the browser: blocked scripts and closed tabs lose events.",
          points: ["Install: one snippet", "Consent: evaluated in the browser and again on the server", "Gap: no event when the script is blocked or the tab closes early"],
        },
        {
          id: "server",
          label: "Server only",
          title: "Events from your server or shop",
          text: "Your shop platform, backend or CRM sends conversions to the server API with a source key. Purchases, refunds and offline conversions arrive reliably and are never blocked in the browser. Match data is limited to what your server knows.",
          points: ["Install: shop app or a signed request from your backend", "Reliable for purchases, refunds, leads from your CRM", "Gap: fewer browser signals for matching"],
        },
        {
          id: "hybrid",
          label: "Browser + server",
          title: "Both paths, one event id",
          text: "Browser and server send the same conversion with the same event id. Track normalizes both, applies the consent decision per destination and forwards them; the vendors deduplicate on the event id or the order id. You get the reach of the server path with the match quality of the browser path.",
          points: ["Default mode for every destination that supports both", "Deduplication: event id (Meta, TikTok, Pinterest, Snapchat, Microsoft, LinkedIn …), order id (Google Ads)", "Consent: one decision per event and destination for both paths"],
        },
      ],
    },
    checks: {
      title: "What Track checks along the way",
      summary: "Show the technical checks behind the four milestones",
      intro: "These checks run inside the guided session and later in the worker. They are the reason the four milestones are enough — you do not have to verify them by hand.",
      groups: [
        { title: "Site and installation", items: ["Domain format and reachability", "Ownership by DNS record, verification file or meta tag", "Snippet present and configuration signature verified in the browser", "First page view received on the ingest host"] },
        { title: "Platform, consent tool and event plan", items: ["Shop or CMS platform detected with a confidence level", "Consent tool detected (TCF 2.2, GPP, Cookiebot, OneTrust, Usercentrics or consent API)", "Event plan template chosen for the business type (shop, lead generation, SaaS, publisher)", "Required parameters per standard event, naming rules for custom events, PII blocked in properties"] },
        { title: "Destinations and credentials", items: ["Public ids validated against the vendor's format", "Access tokens stored in the vault via card or OAuth; never in the transcript", "Consent purpose required by each destination recorded", "Click-id matrix checked: every id forwarded only to its platform"] },
        { title: "Test, review and publish", items: ["Test event sent through the real queue and worker; vendor verdict recorded", "Diff, recipient list and approver bound to one approval token", "Bundle signed with Ed25519, versioned and immutable", "Audit entry for every tool call and every approval"] },
        { title: "After go-live", items: ["Health score: consent coverage, critical events, schema quality, duplicates, delivery, freshness", "Retries with backoff, circuit breaker and dead-letter queue per destination", "Issues grouped by fingerprint, each naming the tool that fixes it", "Rollback to any earlier version"] },
      ],
    },
    architectureTitle: "Two planes, one signed configuration",
    architectureText: "A control plane for people and the assistant, a data plane for events. They share nothing but the signed configuration — a technical proof after the milestones, not a prerequisite for using Track.",
    architectureColumns: { component: "Component", responsibility: "Responsibility" },
    architecture: [
      { title: "Browser SDK", text: "Consent-gated storage, CMP adapters, batching transport, SPA tracking, vendor loaders with shared dedup ids. Kept under 30 KB gzip by a CI budget." },
      { title: "Collector", text: "Origin allow-list, rate limits, HMAC-signed server requests, kill switches, durable queue hand-off before the 202 is returned." },
      { title: "Worker", text: "Normalization, PII scan, consent policy, event store, conversion dedup, usage ledger, fan-out, delivery with retries and DLQ." },
      { title: "Control plane", text: "Dashboard and assistant: typed tools, approvals, audit log, RBAC, billing, privacy center — separated from the data plane." },
    ],
    faqTitle: "Questions",
    faq: [
      { q: "Do I need a tag manager?", a: "No. The tracker loads vendor tags itself after consent. Existing GTM setups can coexist during migration." },
      { q: "Where is data processed?", a: "In the EU. Vendor APIs receive only what you configured, under the documented transfer basis shown for each destination." },
      { q: "How is the configuration protected?", a: "Bundles are immutable, versioned and Ed25519-signed; the SDK verifies the signature before applying any configuration." },
      { q: "What if the AI provider is unavailable?", a: "The same setup states are available as a rule-based wizard. Nothing in the pipeline depends on a model being online." },
    ],
    closing: { title: "Ready when you are", text: "Create your site, paste the snippet and let the assistant configure the first destination.", cta: "Start free", secondary: "Read the docs" },
  },
  de: {
    eyebrow: "So funktioniert es",
    title: "Von deiner Domain zu verifizierten Conversions auf jeder Plattform",
    intro: "Ein Snippet auf deiner Site, eine geführte Sitzung mit dem Assistenten, eine signierte Konfiguration, die du freigibst. Ab da übernimmt Track die Events — mit Consent-Prüfung für jede Destination und einem Debugger, der dir zeigt, was passiert ist.",
    cta: "Mit deiner Domain starten",
    ctaSecondary: "Funktionen ansehen",
    stage: {
      title: "Snippet → Track → Plattformen",
      description: "Das Snippet auf deiner Website sendet Events aus dem Browser; dein Shop oder Server sendet dieselben Conversions mit einer gemeinsamen Event-ID. Track prüft Consent an einem Policy-Gate und leitet jedes Event an Meta, Google Ads, Google Analytics 4 und TikTok weiter.",
      caption: "Snippet → Track → Consent/Policy → Plattformen. Dasselbe Bild siehst du im Debugger für jedes echte Event.",
    },
    milestonesTitle: "Vier Meilensteine, eine Sitzung",
    milestonesText: "Das ist die Sicht des Kunden. Die technischen Prüfungen hinter jedem Meilenstein stehen weiter unten.",
    youLabel: "Du",
    outcomeLabel: "Du bekommst",
    steps: [
      { title: "Site anlegen", text: "Registriere dich mit deiner Domain. Track legt die Site, eine öffentliche sechsstellige Tracking-ID und das einzeilige Snippet an.", you: "Domain eingeben und Snippet einfügen — oder die Shopify-, WooCommerce- oder Shopware-App installieren", outcome: "eine verifizierte Installation: Track sieht den ersten Seitenaufruf und bestätigt die Inhaberschaft per DNS, Datei oder Meta-Tag" },
      { title: "Den Assistenten die Einrichtung vorschlagen lassen", text: "Der Assistent erkennt Plattform und Consent-Tool, schlägt einen Eventplan für deinen Geschäftstyp vor und fragt nach den öffentlichen IDs der Plattformen, die du nutzt.", you: "ein paar Fragen beantworten, Pixel-IDs im Chat und Access-Tokens in der Tresor-Karte eingeben", outcome: "eine entworfene Konfiguration mit gemappten Events und einen echten, vom Anbieter akzeptierten Testevent" },
      { title: "Freigeben und veröffentlichen", text: "Du siehst das Diff, die Empfänger und die Consent-Anforderung jeder Destination. Eine Freigabe veröffentlicht ein signiertes, versioniertes Bundle.", you: "das Diff lesen und auf Freigeben klicken", outcome: "eine live geschaltete Konfiguration mit Versionsnummer, Rollback per Klick" },
      { title: "Beobachten und verbessern", text: "Der Debugger zeigt jedes Event mit seiner Entscheidung, der Health-Score meldet, was zu tun ist, und der Assistent schlägt die Lösung vor.", you: "den Score prüfen, wenn er sich ändert; Verbesserungen freigeben", outcome: "verifizierte Conversions auf jeder Plattform, mit Nachweis pro Event" },
    ],
    snippet: { title: "Das Snippet", code: SNIPPET, copy: "Snippet kopieren", copied: "Kopiert", note: "Von einem First-Party-CDN-Host ausgeliefert; die geladene Konfiguration ist Ed25519-signiert und wird geprüft, bevor irgendetwas läuft." },
    published: {
      title: "Konfiguration · Version 13",
      state: "live",
      facts: [
        { label: "Freigegeben von", value: "dir, gebunden an das gelesene Diff" },
        { label: "Signatur", value: "Ed25519, vom SDK geprüft" },
        { label: "Destinationen", value: "Meta (Browser + Server), Google Ads (Server)" },
        { label: "Rollback", value: "Version 12, ein Klick" },
      ],
    },
    flows: {
      title: "Woher deine Events kommen",
      text: "Wechsle zwischen den Zustellmodi. Jede Destination kann nur per Browser, nur per Server oder mit beidem laufen; der hybride Modus ist der Standard, weil die beiden Wege die Lücken des jeweils anderen abdecken.",
      tabsLabel: "Zustellmodi",
      items: [
        {
          id: "browser",
          label: "Nur Browser",
          title: "Events aus dem Browser-SDK",
          text: "Das Snippet erfasst Seitenaufrufe, Produktansichten und Warenkorb-Events im Browser des Besuchers und sendet sie an den Ingest-Host von Track. Anbieter-Tags laden erst nach Consent. Dieser Modus ist schnell installiert, hängt aber vom Browser ab: blockierte Skripte und geschlossene Tabs verlieren Events.",
          points: ["Installation: ein Snippet", "Consent: im Browser geprüft und erneut auf dem Server", "Lücke: kein Event, wenn das Skript blockiert wird oder der Tab zu früh schließt"],
        },
        {
          id: "server",
          label: "Nur Server",
          title: "Events von deinem Server oder Shop",
          text: "Dein Shopsystem, Backend oder CRM sendet Conversions mit einem Source-Key an die Server-API. Käufe, Erstattungen und Offline-Conversions kommen zuverlässig an und werden im Browser nie blockiert. Matching-Daten sind auf das beschränkt, was dein Server weiß.",
          points: ["Installation: Shop-App oder eine signierte Anfrage aus deinem Backend", "Zuverlässig für Käufe, Erstattungen, Leads aus deinem CRM", "Lücke: weniger Browser-Signale fürs Matching"],
        },
        {
          id: "hybrid",
          label: "Browser + Server",
          title: "Beide Wege, eine Event-ID",
          text: "Browser und Server senden dieselbe Conversion mit derselben Event-ID. Track normalisiert beide, wendet die Consent-Entscheidung pro Destination an und leitet weiter; die Anbieter deduplizieren über Event-ID oder Bestellnummer. Du bekommst die Reichweite des Server-Wegs mit der Matching-Qualität des Browser-Wegs.",
          points: ["Standardmodus für jede Destination, die beides unterstützt", "Deduplizierung: Event-ID (Meta, TikTok, Pinterest, Snapchat, Microsoft, LinkedIn …), Bestellnummer (Google Ads)", "Consent: eine Entscheidung pro Event und Destination für beide Wege"],
        },
      ],
    },
    checks: {
      title: "Was Track unterwegs prüft",
      summary: "Technische Prüfungen hinter den vier Meilensteinen anzeigen",
      intro: "Diese Prüfungen laufen in der geführten Sitzung und später im Worker. Sie sind der Grund, warum die vier Meilensteine reichen — du musst sie nicht von Hand nachprüfen.",
      groups: [
        { title: "Site und Installation", items: ["Domain-Format und Erreichbarkeit", "Inhaberschaft per DNS-Eintrag, Verifikationsdatei oder Meta-Tag", "Snippet vorhanden und Konfigurationssignatur im Browser geprüft", "Erster Seitenaufruf auf dem Ingest-Host empfangen"] },
        { title: "Plattform, Consent-Tool und Eventplan", items: ["Shop- oder CMS-Plattform mit Konfidenzangabe erkannt", "Consent-Tool erkannt (TCF 2.2, GPP, Cookiebot, OneTrust, Usercentrics oder Consent-API)", "Eventplan-Vorlage für den Geschäftstyp gewählt (Shop, Leadgenerierung, SaaS, Publisher)", "Pflichtparameter pro Standardevent, Namensregeln für Custom-Events, PII in Properties blockiert"] },
        { title: "Destinationen und Zugangsdaten", items: ["Öffentliche IDs gegen das Format des Anbieters geprüft", "Access-Tokens per Karte oder OAuth im Tresor abgelegt; nie im Transkript", "Von jeder Destination benötigter Consent-Zweck erfasst", "Click-ID-Matrix geprüft: jede ID nur an ihre Plattform weitergegeben"] },
        { title: "Test, Review und Veröffentlichung", items: ["Testevent durch die echte Queue und den echten Worker gesendet; Anbieterurteil protokolliert", "Diff, Empfängerliste und Freigebende an ein Freigabe-Token gebunden", "Bundle mit Ed25519 signiert, versioniert und unveränderlich", "Audit-Eintrag für jeden Tool-Aufruf und jede Freigabe"] },
        { title: "Nach dem Go-live", items: ["Health-Score: Consent-Abdeckung, kritische Events, Schemaqualität, Duplikate, Zustellung, Aktualität", "Retries mit Backoff, Circuit Breaker und Dead-Letter-Queue pro Destination", "Probleme nach Fingerprint gruppiert, jedes benennt das Tool, das es löst", "Rollback auf jede frühere Version"] },
      ],
    },
    architectureTitle: "Zwei Ebenen, eine signierte Konfiguration",
    architectureText: "Eine Control Plane für Menschen und den Assistenten, eine Data Plane für Events. Sie teilen nichts außer der signierten Konfiguration — ein technischer Beleg nach den Meilensteinen, keine Voraussetzung, um Track zu nutzen.",
    architectureColumns: { component: "Komponente", responsibility: "Aufgabe" },
    architecture: [
      { title: "Browser-SDK", text: "Consent-gesteuerter Speicher, CMP-Adapter, gebündelter Transport, SPA-Tracking, Anbieter-Loader mit gemeinsamen Dedup-IDs. Durch ein CI-Budget unter 30 KB gzip gehalten." },
      { title: "Collector", text: "Origin-Allowlist, Rate-Limits, HMAC-signierte Server-Requests, Kill-Switches, Übergabe an die dauerhafte Queue vor der 202-Antwort." },
      { title: "Worker", text: "Normalisierung, PII-Scan, Consent-Policy, Event-Store, Conversion-Dedup, Usage-Ledger, Fan-out, Zustellung mit Retries und DLQ." },
      { title: "Control Plane", text: "Dashboard und Assistent: typisierte Tools, Freigaben, Audit-Log, RBAC, Abrechnung, Datenschutz-Center — getrennt von der Datenebene." },
    ],
    faqTitle: "Fragen",
    faq: [
      { q: "Brauche ich einen Tag-Manager?", a: "Nein. Der Tracker lädt Anbieter-Tags nach Consent selbst. Bestehende GTM-Setups können während der Migration parallel laufen." },
      { q: "Wo werden Daten verarbeitet?", a: "In der EU. Anbieter-APIs erhalten nur, was du konfiguriert hast, auf der bei jeder Destination dokumentierten Übermittlungsgrundlage." },
      { q: "Wie ist die Konfiguration geschützt?", a: "Bundles sind unveränderlich, versioniert und Ed25519-signiert; das SDK prüft die Signatur, bevor eine Konfiguration angewendet wird." },
      { q: "Was ist, wenn der KI-Anbieter nicht erreichbar ist?", a: "Dieselben Einrichtungszustände gibt es als regelbasierten Assistenten. Nichts in der Pipeline hängt davon ab, dass ein Modell online ist." },
    ],
    closing: { title: "Bereit, wenn du es bist", text: "Site anlegen, Snippet einfügen und den Assistenten die erste Destination einrichten lassen.", cta: "Kostenlos starten", secondary: "Dokumentation lesen" },
  },
};
