import type { HowItWorksCopy } from "../types";
import { SNIPPET } from "./samples";

/**
 * German (de) copy of the how-it-works area. Same shape as en.ts; see docs/14-localization.md.
 */

export const HOW_IT_WORKS_DE: HowItWorksCopy = {
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
};
