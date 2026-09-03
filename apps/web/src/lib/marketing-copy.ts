/**
 * Localized copy for the marketing pages. Kept in code (typed, reviewed in PRs) instead of the
 * message catalogs because each page is a self-contained document.
 */
export type Locale = "en" | "de";
export const pick = <T,>(locale: string, copy: Record<Locale, T>): T => copy[(locale === "de" ? "de" : "en") as Locale];

export interface FeatureCopy {
  slug: string;
  title: string;
  short: string;
  intro: string;
  sections: Array<{ title: string; text: string }>;
  bullets: string[];
  faq: Array<{ q: string; a: string }>;
}

export const FEATURES: Record<Locale, FeatureCopy[]> = {
  en: [
    {
      slug: "ai-setup",
      title: "AI-guided setup",
      short: "Describe your site, confirm each step, publish a signed configuration.",
      intro: "The assistant turns a domain into a working measurement setup: it detects the platform and consent tool, proposes an event plan for your business type, collects public identifiers in chat and secrets in a vault card, sends a real test event and prepares a publish diff you approve.",
      sections: [
        { title: "Typed tools instead of free-form actions", text: "Every action the assistant takes is a server-validated tool call with role checks, an audit entry and, for anything irreversible, an approval token bound to the exact diff you saw." },
        { title: "Secrets never reach the model", text: "Access tokens go straight into the encrypted vault through a dedicated card or OAuth. The transcript, the model and the browser never see them; a DLP layer redacts pasted secrets and PII." },
        { title: "Deterministic state machine", text: "Nine setup steps with explicit requirements and evidence. The same steps are available as a rule-based wizard when the AI provider is unavailable — nothing depends on a model being online." },
      ],
      bullets: ["Business type and platform detection with confidence", "Event plan templates for shops, lead generation, SaaS and publishers", "Public IDs validated against vendor formats", "Publish only after a diff, recipient list and explicit confirmation"],
      faq: [
        { q: "Can the assistant publish without me?", a: "No. Publishing, rollbacks, credential rotation and destination activation always require your click on an approval card that is bound to the exact change." },
        { q: "Which model is used?", a: "OpenAI Responses API with structured outputs and strict function calling. Model names are configured server-side and verified at start; the UI never hard-codes them." },
      ],
    },
    {
      slug: "server-side-tracking",
      title: "Server-side event router",
      short: "One event, every platform: browser and server delivery with shared deduplication.",
      intro: "track.site receives events from the browser SDK, your server, shop platforms and affiliate networks, normalizes them into one schema, applies consent, and routes them to 22 destination types with retries, circuit breakers, a dead-letter queue and replay.",
      sections: [
        { title: "Hybrid by default", text: "Every destination can run browser tag, server API or both. Both paths share one event id, so Meta, TikTok, Pinterest, Snapchat, Microsoft, LinkedIn and the others deduplicate reliably." },
        { title: "Durable and observable", text: "A durable queue with idempotent messages, per-destination retries with jittered backoff, circuit breakers on failing vendors, dead-letter storage and one-click replay. Every attempt is recorded with a redacted payload preview." },
        { title: "First-party by design", text: "The tracker is served from your CDN host, events go to your ingest host, configuration bundles are Ed25519-signed and verified in the browser before anything loads." },
      ],
      bullets: ["Browser SDK under 30 KB gzip with consent-gated storage", "Server API with source keys for CRM and offline conversions", "Kill switches per site and organization", "EU data plane with row-level tenant isolation"],
      faq: [
        { q: "Does server-side tracking bypass consent?", a: "No. Consent is evaluated for every event and destination; without the required purpose nothing is stored, sent or replayed later." },
        { q: "What happens when a vendor is down?", a: "Deliveries are retried with backoff, the circuit breaker pauses the destination, failed events land in the dead-letter queue and can be replayed once the vendor recovers." },
      ],
    },
    {
      slug: "event-debugger",
      title: "Event debugger and lineage",
      short: "See every event with its consent snapshot, routing decision and vendor response.",
      intro: "Open any event and read its story: source and SDK version, the consent that was granted at that moment, captured click ids, the configuration version that routed it, and the delivery attempt per destination including the redacted payload and vendor answer.",
      sections: [
        { title: "Redacted, not hidden", text: "Payload previews show structure and hashed identifiers so you can verify mappings without exposing personal data or tokens." },
        { title: "Test events through the real pipeline", text: "Test events are flagged, run through the same queue and worker, and report the vendor's verdict — no simulated success." },
        { title: "Drops are explained", text: "Every dropped event carries a reason: missing consent, PII blocked, invalid name, duplicate, paused destination or policy block." },
      ],
      bullets: ["Filter by event name, state and source", "Per-destination attempt history with HTTP status and error class", "Vendor test-mode hints per platform", "Links straight into the destination wizard"],
      faq: [{ q: "How long are debugger records kept?", a: "Delivery attempts default to 90 days and events to 13 months; both are configurable per organization in the privacy center." }],
    },
    {
      slug: "data-quality",
      title: "Data quality and health score",
      short: "A single score with explainable components and issues that link to their fix.",
      intro: "The worker computes a tracking health score from consent coverage, critical event coverage, schema quality, duplicate rate, delivery success and freshness. Each detected issue names the assistant tool that resolves it.",
      sections: [
        { title: "Issues with fingerprints", text: "Recurring problems are grouped, counted and timestamped so you see trends instead of noise." },
        { title: "Schema guardrails", text: "Standard events have required parameters; custom events follow naming rules; PII in properties is blocked before storage." },
        { title: "Benchmarks only with opt-in", text: "Anonymised, aggregated benchmarks are available only for organizations that opt in." },
      ],
      bullets: ["Hourly snapshots per site", "Resolve or ignore issues with an audit trail", "Consent coverage and duplicate rate as first-class metrics"],
      faq: [{ q: "Is the score comparable across sites?", a: "The components are identical for every site; weights are documented in the score card so teams can reason about differences." }],
    },
    {
      slug: "consent",
      title: "Consent-aware by construction",
      short: "Strict opt-in defaults, Consent Mode v2, purpose-based destinations, no replay after consent.",
      intro: "Consent is not a banner integration but a policy engine: purposes, regions, destination requirements and click-id capture are evaluated for every event in the browser and again on the server.",
      sections: [
        { title: "CMP adapters and API", text: "TCF 2.2, GPP and Global Privacy Control, Cookiebot, OneTrust and Usercentrics adapters, plus a consent API for custom banners." },
        { title: "Consent Mode v2, purpose-based", text: "Google consent signals are derived from purposes; advanced mode is available only with a documented legal review note." },
        { title: "Evidence", text: "Deduplicated consent snapshots are stored with each event so you can prove what was granted when." },
      ],
      bullets: ["Inferred consent is never exported to advertising platforms", "Withdrawal stops sends immediately", "Server purchases stay operational, never advertising without consent"],
      faq: [{ q: "Which regions are supported?", a: "Strict opt-in for the EU/EEA/UK/CH by default; per-region policies can be configured, but never weaker than the legal baseline without an explicit decision." }],
    },
    {
      slug: "attribution",
      title: "Click ids and attribution done right",
      short: "Capture only the ids the destination needs, only with consent, only for the documented window.",
      intro: "The tracker captures gclid, fbclid, ttclid, msclkid, li_fat_id and the other platform click ids on landing pages after marketing consent, stores them first-party for the vendor's window and forwards each id only to the platform it belongs to.",
      sections: [
        { title: "Destination-scoped forwarding", text: "Meta never sees your gclid and Google never sees your fbclid. The policy matrix is machine-checked." },
        { title: "Order-level deduplication", text: "Purchases carry the order id to every vendor that supports it, so browser and server conversions merge correctly." },
        { title: "Offline and CRM", text: "Server events with an offline flag reach Google Ads, CM360, Microsoft, Meta, TikTok, Pinterest, Snapchat, Amazon, Yahoo and LinkedIn as offline conversions." },
      ],
      bullets: ["Documented retention per click id (90 days by default)", "Enhanced Conversions with normalized hashing", "Affiliate networks with per-network click ids"],
      faq: [{ q: "Do you build cross-site profiles?", a: "No. There is no fingerprinting and no cross-site identity; identifiers stay within the site and the consented purposes." }],
    },
  ],
  de: [
    {
      slug: "ai-setup",
      title: "KI-geführte Einrichtung",
      short: "Site beschreiben, jeden Schritt bestätigen, signierte Konfiguration veröffentlichen.",
      intro: "Der Assistent macht aus einer Domain ein funktionierendes Messsetup: Er erkennt Plattform und Consent-Tool, schlägt einen Eventplan für deinen Geschäftstyp vor, sammelt öffentliche IDs im Chat und Geheimnisse in einer Tresor-Karte, sendet einen echten Testevent und bereitet ein Publish-Diff vor, das du freigibst.",
      sections: [
        { title: "Typisierte Tools statt freier Aktionen", text: "Jede Aktion des Assistenten ist ein serverseitig validierter Tool-Aufruf mit Rollenprüfung, Audit-Eintrag und — bei allem Unumkehrbaren — einem Freigabe-Token, das an das exakte Diff gebunden ist." },
        { title: "Geheimnisse erreichen das Modell nie", text: "Access-Tokens gehen über eine eigene Karte oder OAuth direkt in den verschlüsselten Tresor. Transkript, Modell und Browser sehen sie nie; eine DLP-Schicht schwärzt eingefügte Secrets und PII." },
        { title: "Deterministische State Machine", text: "Neun Einrichtungsschritte mit expliziten Anforderungen und Evidenz. Dieselben Schritte gibt es als regelbasierten Assistenten, wenn der KI-Anbieter nicht erreichbar ist — nichts hängt davon ab, dass ein Modell online ist." },
      ],
      bullets: ["Erkennung von Geschäftstyp und Plattform mit Konfidenz", "Eventplan-Vorlagen für Shops, Leadgenerierung, SaaS und Publisher", "Öffentliche IDs gegen Anbieterformate validiert", "Veröffentlichung nur nach Diff, Empfängerliste und expliziter Bestätigung"],
      faq: [
        { q: "Kann der Assistent ohne mich veröffentlichen?", a: "Nein. Veröffentlichen, Rollbacks, Credential-Rotation und Aktivierung von Destinationen erfordern immer deinen Klick auf eine Freigabe-Karte, die an die exakte Änderung gebunden ist." },
        { q: "Welches Modell wird genutzt?", a: "OpenAI Responses API mit Structured Outputs und striktem Function Calling. Modellnamen werden serverseitig konfiguriert und beim Start geprüft; die Oberfläche kodiert sie nie fest." },
      ],
    },
    {
      slug: "server-side-tracking",
      title: "Serverseitiger Event-Router",
      short: "Ein Event, jede Plattform: Browser- und Server-Zustellung mit gemeinsamer Deduplizierung.",
      intro: "track.site empfängt Events aus dem Browser-SDK, deinem Server, Shopsystemen und Affiliate-Netzwerken, normalisiert sie in ein Schema, wendet Consent an und leitet sie mit Retries, Circuit Breakern, Dead-Letter-Queue und Replay an 22 Destinationstypen weiter.",
      sections: [
        { title: "Hybrid als Standard", text: "Jede Destination kann per Browser-Tag, Server-API oder beidem laufen. Beide Wege teilen eine Event-ID, sodass Meta, TikTok, Pinterest, Snapchat, Microsoft, LinkedIn und die anderen zuverlässig deduplizieren." },
        { title: "Dauerhaft und beobachtbar", text: "Dauerhafte Queue mit idempotenten Nachrichten, Retries pro Destination mit Jitter-Backoff, Circuit Breaker bei ausfallenden Anbietern, Dead-Letter-Speicher und Replay per Klick. Jeder Versuch wird mit geschwärzter Payload-Vorschau protokolliert." },
        { title: "First-Party by Design", text: "Der Tracker kommt von deinem CDN-Host, Events gehen an deinen Ingest-Host, Konfigurationsbundles sind Ed25519-signiert und werden im Browser geprüft, bevor irgendetwas lädt." },
      ],
      bullets: ["Browser-SDK unter 30 KB gzip mit consent-gesteuertem Speicher", "Server-API mit Source-Keys für CRM- und Offline-Conversions", "Kill-Switches pro Site und Organisation", "EU-Datenebene mit Row-Level-Mandantentrennung"],
      faq: [
        { q: "Umgeht serverseitiges Tracking den Consent?", a: "Nein. Consent wird für jedes Event und jede Destination geprüft; ohne den erforderlichen Zweck wird nichts gespeichert, gesendet oder später nachgeliefert." },
        { q: "Was passiert, wenn ein Anbieter ausfällt?", a: "Zustellungen werden mit Backoff wiederholt, der Circuit Breaker pausiert die Destination, fehlgeschlagene Events landen in der Dead-Letter-Queue und können nach der Erholung erneut gesendet werden." },
      ],
    },
    {
      slug: "event-debugger",
      title: "Event-Debugger und Herkunft",
      short: "Jedes Event mit Consent-Snapshot, Routing-Entscheidung und Anbieterantwort.",
      intro: "Öffne ein Event und lies seine Geschichte: Quelle und SDK-Version, der zu diesem Zeitpunkt erteilte Consent, erfasste Click-IDs, die Konfigurationsversion, die es geroutet hat, und der Zustellversuch pro Destination inklusive geschwärzter Payload und Anbieterantwort.",
      sections: [
        { title: "Geschwärzt, nicht versteckt", text: "Payload-Vorschauen zeigen Struktur und gehashte Kennungen, damit du Mappings prüfen kannst, ohne personenbezogene Daten oder Tokens offenzulegen." },
        { title: "Testevents durch die echte Pipeline", text: "Testevents sind markiert, laufen durch dieselbe Queue und denselben Worker und melden das Urteil des Anbieters — kein simulierter Erfolg." },
        { title: "Verwerfungen werden erklärt", text: "Jedes verworfene Event trägt einen Grund: fehlender Consent, PII blockiert, ungültiger Name, Duplikat, pausierte Destination oder Policy-Block." },
      ],
      bullets: ["Filter nach Eventname, Status und Quelle", "Versuchshistorie pro Destination mit HTTP-Status und Fehlerklasse", "Testmodus-Hinweise pro Plattform", "Direkte Links in den Destination-Assistenten"],
      faq: [{ q: "Wie lange werden Debugger-Daten aufbewahrt?", a: "Zustellversuche standardmäßig 90 Tage, Events 13 Monate; beides ist pro Organisation im Datenschutz-Center konfigurierbar." }],
    },
    {
      slug: "data-quality",
      title: "Datenqualität und Health-Score",
      short: "Ein Score mit erklärbaren Komponenten und Problemen, die auf ihre Lösung verlinken.",
      intro: "Der Worker berechnet einen Tracking-Health-Score aus Consent-Abdeckung, Abdeckung kritischer Events, Schemaqualität, Duplikatrate, Zustellerfolg und Aktualität. Jedes erkannte Problem benennt das Assistenten-Tool, das es löst.",
      sections: [
        { title: "Probleme mit Fingerprints", text: "Wiederkehrende Probleme werden gruppiert, gezählt und mit Zeitstempeln versehen, damit du Trends statt Rauschen siehst." },
        { title: "Schema-Leitplanken", text: "Standardevents haben Pflichtparameter; Custom-Events folgen Namensregeln; PII in Properties wird vor dem Speichern blockiert." },
        { title: "Benchmarks nur mit Opt-in", text: "Anonymisierte, aggregierte Benchmarks gibt es nur für Organisationen, die sich dafür entscheiden." },
      ],
      bullets: ["Stündliche Snapshots pro Site", "Probleme lösen oder ignorieren mit Audit-Trail", "Consent-Abdeckung und Duplikatrate als zentrale Kennzahlen"],
      faq: [{ q: "Ist der Score über Sites vergleichbar?", a: "Die Komponenten sind für jede Site identisch; die Gewichte stehen in der Score-Karte, damit Teams Unterschiede nachvollziehen können." }],
    },
    {
      slug: "consent",
      title: "Consent-konform von Grund auf",
      short: "Strikte Opt-in-Standards, Consent Mode v2, zweckgebundene Destinationen, kein Replay nach Consent.",
      intro: "Consent ist keine Banner-Integration, sondern eine Policy-Engine: Zwecke, Regionen, Destinationsanforderungen und Click-ID-Erfassung werden für jedes Event im Browser und erneut auf dem Server geprüft.",
      sections: [
        { title: "CMP-Adapter und API", text: "TCF 2.2, GPP und Global Privacy Control, Adapter für Cookiebot, OneTrust und Usercentrics sowie eine Consent-API für eigene Banner." },
        { title: "Consent Mode v2, zweckbasiert", text: "Google-Consent-Signale werden aus Zwecken abgeleitet; der erweiterte Modus ist nur mit dokumentierter juristischer Prüfung verfügbar." },
        { title: "Nachweis", text: "Deduplizierte Consent-Snapshots werden mit jedem Event gespeichert, damit du belegen kannst, was wann erteilt wurde." },
      ],
      bullets: ["Abgeleiteter Consent wird nie an Werbeplattformen exportiert", "Ein Widerruf stoppt Sendungen sofort", "Server-Käufe bleiben operativ, aber ohne Consent nie Werbung"],
      faq: [{ q: "Welche Regionen werden unterstützt?", a: "Striktes Opt-in für EU/EWR/UK/CH als Standard; regionale Policies sind konfigurierbar, aber nie schwächer als die rechtliche Basis ohne explizite Entscheidung." }],
    },
    {
      slug: "attribution",
      title: "Click-IDs und Attribution richtig gemacht",
      short: "Nur die IDs erfassen, die die Destination braucht, nur mit Consent, nur für das dokumentierte Zeitfenster.",
      intro: "Der Tracker erfasst gclid, fbclid, ttclid, msclkid, li_fat_id und die anderen Plattform-Click-IDs auf Landingpages nach Marketing-Consent, speichert sie First-Party für das Zeitfenster des Anbieters und leitet jede ID nur an die Plattform weiter, zu der sie gehört.",
      sections: [
        { title: "Weitergabe pro Destination", text: "Meta sieht nie deine gclid und Google nie deine fbclid. Die Policy-Matrix wird maschinell geprüft." },
        { title: "Deduplizierung auf Bestellebene", text: "Käufe tragen die Bestellnummer zu jedem Anbieter, der sie unterstützt, damit Browser- und Server-Conversions korrekt zusammenlaufen." },
        { title: "Offline und CRM", text: "Server-Events mit Offline-Flag erreichen Google Ads, CM360, Microsoft, Meta, TikTok, Pinterest, Snapchat, Amazon, Yahoo und LinkedIn als Offline-Conversions." },
      ],
      bullets: ["Dokumentierte Aufbewahrung pro Click-ID (standardmäßig 90 Tage)", "Enhanced Conversions mit normalisiertem Hashing", "Affiliate-Netzwerke mit Click-IDs pro Netzwerk"],
      faq: [{ q: "Baut ihr seitenübergreifende Profile?", a: "Nein. Es gibt kein Fingerprinting und keine seitenübergreifende Identität; Kennungen bleiben innerhalb der Site und der eingewilligten Zwecke." }],
    },
  ],
};

export const HOW_IT_WORKS: Record<Locale, { title: string; intro: string; steps: Array<{ title: string; text: string }>; architecture: Array<{ title: string; text: string }>; faq: Array<{ q: string; a: string }> }> = {
  en: {
    title: "How track.site works",
    intro: "From a domain to consent-compliant server-side delivery in one guided session — with a signed, versioned configuration you can roll back at any time.",
    steps: [
      { title: "Create a site", text: "Sign up, name your organization, enter the domain. You get a public six-character tracking ID and a one-line snippet." },
      { title: "Install and verify", text: "Add the snippet or use the shop plugin. Verify domain ownership by DNS, file or meta tag; the assistant checks the installation." },
      { title: "Configure destinations", text: "Pick platforms, enter public IDs, connect credentials through the vault or OAuth, map events, send a verified test event." },
      { title: "Publish and monitor", text: "Review the diff and recipients, approve, publish a signed version. Watch deliveries, health and data quality; roll back with one click." },
    ],
    architecture: [
      { title: "Browser SDK", text: "Consent-gated storage, CMP adapters, batching transport, SPA tracking, vendor loaders with shared dedup ids. Under 30 KB gzip." },
      { title: "Collector", text: "Origin allow-list, rate limits, HMAC-signed server requests, kill switches, durable queue hand-off before the 202 is returned." },
      { title: "Worker", text: "Normalization, PII scan, consent policy, event store, conversion dedup, usage ledger, fan-out, delivery with retries and DLQ." },
      { title: "Control plane", text: "Next.js dashboard and assistant: typed tools, approvals, audit log, RBAC, billing, privacy center — separated from the data plane." },
    ],
    faq: [
      { q: "Do I need a tag manager?", a: "No. The tracker loads vendor tags itself after consent. Existing GTM setups can coexist during migration." },
      { q: "Where is data processed?", a: "In the EU. Vendor APIs receive only what you configured, under the documented transfer basis shown for each destination." },
      { q: "How is the configuration protected?", a: "Bundles are immutable, versioned and Ed25519-signed; the SDK verifies the signature before applying any configuration." },
    ],
  },
  de: {
    title: "So funktioniert track.site",
    intro: "Von der Domain zur consent-konformen serverseitigen Zustellung in einer geführten Sitzung — mit signierter, versionierter Konfiguration, die du jederzeit zurückrollen kannst.",
    steps: [
      { title: "Site anlegen", text: "Registrieren, Organisation benennen, Domain eingeben. Du erhältst eine öffentliche sechsstellige Tracking-ID und ein einzeiliges Snippet." },
      { title: "Installieren und verifizieren", text: "Snippet einbauen oder Shop-Plugin nutzen. Domain-Inhaberschaft per DNS, Datei oder Meta-Tag verifizieren; der Assistent prüft die Installation." },
      { title: "Destinationen konfigurieren", text: "Plattformen wählen, öffentliche IDs eingeben, Zugangsdaten über Tresor oder OAuth verbinden, Events mappen, verifizierten Testevent senden." },
      { title: "Veröffentlichen und überwachen", text: "Diff und Empfänger prüfen, freigeben, signierte Version veröffentlichen. Zustellungen, Zustand und Datenqualität beobachten; Rollback per Klick." },
    ],
    architecture: [
      { title: "Browser-SDK", text: "Consent-gesteuerter Speicher, CMP-Adapter, gebündelter Transport, SPA-Tracking, Anbieter-Loader mit gemeinsamen Dedup-IDs. Unter 30 KB gzip." },
      { title: "Collector", text: "Origin-Allowlist, Rate-Limits, HMAC-signierte Server-Requests, Kill-Switches, Übergabe an die dauerhafte Queue vor der 202-Antwort." },
      { title: "Worker", text: "Normalisierung, PII-Scan, Consent-Policy, Event-Store, Conversion-Dedup, Usage-Ledger, Fan-out, Zustellung mit Retries und DLQ." },
      { title: "Control Plane", text: "Next.js-Dashboard und Assistent: typisierte Tools, Freigaben, Audit-Log, RBAC, Abrechnung, Datenschutz-Center — getrennt von der Datenebene." },
    ],
    faq: [
      { q: "Brauche ich einen Tag-Manager?", a: "Nein. Der Tracker lädt Anbieter-Tags nach Consent selbst. Bestehende GTM-Setups können während der Migration parallel laufen." },
      { q: "Wo werden Daten verarbeitet?", a: "In der EU. Anbieter-APIs erhalten nur, was du konfiguriert hast, auf der bei jeder Destination dokumentierten Übermittlungsgrundlage." },
      { q: "Wie ist die Konfiguration geschützt?", a: "Bundles sind unveränderlich, versioniert und Ed25519-signiert; das SDK prüft die Signatur, bevor eine Konfiguration angewendet wird." },
    ],
  },
};

import type { ContactFormCopy } from "@/components/marketing/contact-form";

export const FORM_COPY: Record<Locale, ContactFormCopy> = {
  en: { name: "Name", email: "E-mail", company: "Company (optional)", message: "Message", submit: "Send", sent: "Thank you — we received your message and reply by e-mail.", invalid: "Please check the fields: name, a valid e-mail and a message of at least 10 characters.", rateLimited: "Too many requests from this network; please try again later.", generic: "Something went wrong. Please try again.", privacy: "We store your request to answer it and delete it after handling. See the privacy policy." },
  de: { name: "Name", email: "E-Mail", company: "Unternehmen (optional)", message: "Nachricht", submit: "Senden", sent: "Danke — wir haben deine Nachricht erhalten und antworten per E-Mail.", invalid: "Bitte prüfe die Felder: Name, eine gültige E-Mail und eine Nachricht mit mindestens 10 Zeichen.", rateLimited: "Zu viele Anfragen aus diesem Netzwerk; bitte später erneut versuchen.", generic: "Etwas ist schiefgelaufen. Bitte erneut versuchen.", privacy: "Wir speichern deine Anfrage zur Beantwortung und löschen sie nach Bearbeitung. Siehe Datenschutzerklärung." },
};
