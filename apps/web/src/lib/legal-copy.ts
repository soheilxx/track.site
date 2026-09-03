import type { Locale } from "./marketing-copy";

/**
 * Legal and trust pages. Operator identity (company, address, contact, DPO) is read from the
 * environment so nothing is invented; missing values render an explicit "to be published" state.
 */
export interface Operator {
  company: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  register: string | null;
  vatId: string | null;
  representatives: string | null;
  dpo: string | null;
}

export function operatorFromEnv(): Operator {
  const e = process.env;
  const v = (k: string) => (e[k] && e[k]!.trim() ? e[k]!.trim() : null);
  return { company: v("LEGAL_COMPANY"), address: v("LEGAL_ADDRESS"), email: v("LEGAL_EMAIL"), phone: v("LEGAL_PHONE"), register: v("LEGAL_REGISTER"), vatId: v("LEGAL_VAT_ID"), representatives: v("LEGAL_REPRESENTATIVES"), dpo: v("LEGAL_DPO") };
}

export interface LegalDoc {
  title: string;
  intro: string;
  updated: string;
  sections: Array<{ title: string; paragraphs: string[]; bullets?: string[] }>;
}

export const SUBPROCESSORS = [
  { name: "Amazon Web Services EMEA SARL", purpose: "Hosting, database, queue, object storage, KMS (eu-central-1)", region: "EU (Frankfurt)", basis: "DPA + SCC" },
  { name: "Stripe Payments Europe Ltd.", purpose: "Subscription billing and invoices", region: "EU / US", basis: "DPA + SCC / DPF" },
  { name: "OpenAI Ireland Ltd.", purpose: "Setup assistant (Responses API, zero data retention, no training)", region: "EU / US", basis: "DPA + SCC / DPF" },
  { name: "Resend, Inc. or the configured SMTP provider", purpose: "Transactional e-mail", region: "EU / US", basis: "DPA + SCC" },
  { name: "Advertising and analytics vendors selected by the customer", purpose: "Event delivery per configured destination", region: "per destination (shown in the wizard)", basis: "customer's own contract with the vendor" },
] as const;

export const LEGAL: Record<Locale, Record<"security" | "privacy" | "data-processing" | "terms", LegalDoc>> = {
  en: {
    security: {
      title: "Security",
      intro: "How track.site protects customer data: architecture, controls and the guarantees you can verify in the product.",
      updated: "2026-09-03",
      sections: [
        { title: "Tenant isolation", paragraphs: ["Every tenant table carries the organization id and PostgreSQL row-level security is enforced for the application role. The worker role bypasses RLS only for the partitioned event store and audit trail, never for tenant configuration."] },
        { title: "Secrets", paragraphs: ["Vendor credentials are encrypted with envelope encryption (AES-256-GCM data keys wrapped by AWS KMS or a local master key). The assistant, the browser and the logs only ever see a reference and the last four characters."] },
        { title: "Signed configuration", paragraphs: ["Configuration bundles are immutable, versioned and Ed25519-signed. The browser SDK verifies the signature with WebCrypto before applying a configuration and rejects everything else (fail closed)."] },
        { title: "Data plane", paragraphs: ["The collector validates origins, applies rate limits and HMAC-signed server requests and hands events to a durable queue before answering. Workers process with retries, circuit breakers and a dead-letter queue. Kill switches stop collection and delivery per site or organization within seconds."], bullets: ["No fingerprinting, no cross-site identity", "PII scanner blocks personal data in event properties before storage", "IP addresses are truncated on ingest", "Append-only audit log and usage ledger (database triggers)"] },
        { title: "Access and operations", paragraphs: ["Role-based access control with six organization roles, MFA and passkeys, break-glass access with mandatory reason and audit entry, retention jobs per data kind, and a vulnerability disclosure contact published on this page."] },
      ],
    },
    privacy: {
      title: "Privacy policy",
      intro: "This policy explains how the operator of track.site processes personal data of website visitors, customers and their users.",
      updated: "2026-09-03",
      sections: [
        { title: "Controller", paragraphs: ["The controller for this website and the customer account data is the operator named in the imprint. For event data processed on behalf of customers, the customer is the controller and the operator acts as processor under the data processing agreement."] },
        { title: "Data we process as controller", paragraphs: ["Account data (name, e-mail, organization, role), billing data (handled by Stripe; we store customer and subscription ids), support requests, security logs (truncated IP, user agent family) and cookies strictly required for authentication and language preference."] },
        { title: "Data we process as processor", paragraphs: ["Events sent by customers' websites and systems: event name and parameters, consent state, pseudonymous identifiers, hashed matching data, truncated IP and page context, plus the delivery records to the destinations the customer configured. Processing follows the customer's consent policy; without the required purpose no data is stored or transmitted."] },
        { title: "Purposes and legal basis", paragraphs: ["Contract performance (Art. 6(1)(b) GDPR) for accounts, billing and support; legitimate interest (Art. 6(1)(f)) for security and abuse prevention; consent (Art. 6(1)(a)) where a customer's visitor agreed to analytics or marketing purposes; legal obligations (Art. 6(1)(c)) for accounting records."] },
        { title: "Recipients and transfers", paragraphs: ["Subprocessors are listed on the subprocessors page. Transfers outside the EU rely on standard contractual clauses or the EU-US Data Privacy Framework. Advertising vendors receive data only for destinations the customer configured, and the wizard shows the recipient and transfer basis for each."] },
        { title: "Retention", paragraphs: ["Events 13 months, click ids 90 days, consent snapshots 3 years, delivery attempts 90 days, audit log 2 years, chat transcripts 30 days, DSAR records 3 years — configurable per organization within these maxima. Account data is deleted 30 days after account closure."] },
        { title: "Your rights", paragraphs: ["Access, rectification, erasure, restriction, portability and objection. Customers process visitor requests through the privacy center; visitors can contact the operator directly. You may lodge a complaint with a supervisory authority."] },
        { title: "AI assistant", paragraphs: ["The setup assistant uses the OpenAI Responses API with zero data retention. Secrets and personal data are redacted before a message reaches the model; the model can only act through typed tools that are validated and audited server-side."] },
      ],
    },
    "data-processing": {
      title: "Data processing agreement",
      intro: "Summary of the processor terms that apply to customer event data. The full agreement is provided during onboarding and on request.",
      updated: "2026-09-03",
      sections: [
        { title: "Subject matter", paragraphs: ["Collection, normalization, consent evaluation, storage and delivery of website and server events to destinations configured by the customer, plus dashboards, diagnostics and the setup assistant."] },
        { title: "Instructions", paragraphs: ["The customer instructs the operator through the product configuration: sites, destinations, mappings, consent policy and retention. Configuration versions are signed and auditable, so instructions are documented."] },
        { title: "Technical and organizational measures", paragraphs: ["See the security page: tenant isolation with row-level security, envelope encryption, signed configuration, kill switches, PII scanning, truncated IPs, RBAC with MFA, audit trail, EU hosting."] },
        { title: "Subprocessors", paragraphs: ["Listed on the subprocessors page; customers are informed about changes 30 days in advance and may object."] },
        { title: "Data subject requests and deletion", paragraphs: ["The privacy center processes export and deletion requests against pseudonymous identifiers across all sites of the organization and records the outcome. Retention runs delete data at the end of the configured windows."] },
        { title: "Audit and termination", paragraphs: ["Audit logs, integration matrices and version histories are available in the product. At termination the customer can export data; residual copies are deleted within 30 days."] },
      ],
    },
    terms: {
      title: "Terms of service",
      intro: "The terms under which the operator provides track.site to business customers.",
      updated: "2026-09-03",
      sections: [
        { title: "Service", paragraphs: ["track.site is a tag manager, consent-aware server-side event router and analytics layer offered as a subscription. Features and limits are described on the pricing page and in the plan the customer selected."] },
        { title: "Customer obligations", paragraphs: ["Customers are responsible for a lawful consent implementation on their properties, for the accuracy of destination configuration and for keeping vendor credentials current. Customers must not send special categories of personal data or use the service for fingerprinting or consent circumvention."] },
        { title: "Fees", paragraphs: ["Fees are billed by Stripe per plan and interval. Usage above the plan limit triggers warnings and a grace period before hard limits apply. Prices are shown on the pricing page as configured in Stripe."] },
        { title: "Availability and support", paragraphs: ["The operator targets high availability of the data plane and publishes incidents on the status page. Support is provided by e-mail; enterprise plans include an SLA."] },
        { title: "Liability", paragraphs: ["Liability is limited to the amount paid in the twelve months before the event, except for intent, gross negligence, injury to life or health and mandatory statutory liability."] },
        { title: "Term and termination", paragraphs: ["Subscriptions renew per interval and can be cancelled to the end of the period. The operator may suspend accounts that violate these terms after notice, except where immediate action is required to protect the platform."] },
        { title: "Governing law", paragraphs: ["The law of the operator's registered seat applies; mandatory consumer protections remain unaffected."] },
      ],
    },
  },
  de: {
    security: {
      title: "Sicherheit",
      intro: "Wie track.site Kundendaten schützt: Architektur, Kontrollen und die Garantien, die du im Produkt nachprüfen kannst.",
      updated: "2026-09-03",
      sections: [
        { title: "Mandantentrennung", paragraphs: ["Jede Mandantentabelle trägt die Organisations-ID, und PostgreSQL Row-Level Security wird für die Anwendungsrolle erzwungen. Die Worker-Rolle umgeht RLS nur für den partitionierten Event-Store und den Audit-Trail, nie für Mandantenkonfiguration."] },
        { title: "Geheimnisse", paragraphs: ["Anbieter-Zugangsdaten werden mit Envelope Encryption verschlüsselt (AES-256-GCM-Datenschlüssel, umhüllt von AWS KMS oder einem lokalen Master-Key). Assistent, Browser und Logs sehen nur eine Referenz und die letzten vier Zeichen."] },
        { title: "Signierte Konfiguration", paragraphs: ["Konfigurationsbundles sind unveränderlich, versioniert und Ed25519-signiert. Das Browser-SDK prüft die Signatur per WebCrypto, bevor eine Konfiguration angewendet wird, und lehnt alles andere ab (Fail-closed)."] },
        { title: "Datenebene", paragraphs: ["Der Collector prüft Origins, wendet Rate-Limits und HMAC-signierte Server-Requests an und übergibt Events an eine dauerhafte Queue, bevor er antwortet. Worker verarbeiten mit Retries, Circuit Breakern und Dead-Letter-Queue. Kill-Switches stoppen Erfassung und Zustellung pro Site oder Organisation in Sekunden."], bullets: ["Kein Fingerprinting, keine seitenübergreifende Identität", "PII-Scanner blockiert personenbezogene Daten in Event-Properties vor dem Speichern", "IP-Adressen werden beim Empfang gekürzt", "Append-only Audit-Log und Usage-Ledger (Datenbank-Trigger)"] },
        { title: "Zugriff und Betrieb", paragraphs: ["Rollenbasierte Zugriffskontrolle mit sechs Organisationsrollen, MFA und Passkeys, Break-Glass-Zugriff mit Pflichtbegründung und Audit-Eintrag, Aufbewahrungsjobs pro Datenart sowie ein auf dieser Seite veröffentlichter Kontakt für Sicherheitsmeldungen."] },
      ],
    },
    privacy: {
      title: "Datenschutzerklärung",
      intro: "Diese Erklärung beschreibt, wie der Betreiber von track.site personenbezogene Daten von Website-Besuchern, Kunden und deren Nutzern verarbeitet.",
      updated: "2026-09-03",
      sections: [
        { title: "Verantwortlicher", paragraphs: ["Verantwortlich für diese Website und die Kundenkontodaten ist der im Impressum genannte Betreiber. Für Eventdaten, die im Auftrag von Kunden verarbeitet werden, ist der Kunde Verantwortlicher und der Betreiber Auftragsverarbeiter gemäß Auftragsverarbeitungsvertrag."] },
        { title: "Daten, die wir als Verantwortlicher verarbeiten", paragraphs: ["Kontodaten (Name, E-Mail, Organisation, Rolle), Abrechnungsdaten (über Stripe; wir speichern Kunden- und Abonnement-IDs), Supportanfragen, Sicherheitsprotokolle (gekürzte IP, User-Agent-Familie) und Cookies, die für Authentifizierung und Spracheinstellung zwingend erforderlich sind."] },
        { title: "Daten, die wir als Auftragsverarbeiter verarbeiten", paragraphs: ["Events von Websites und Systemen der Kunden: Eventname und Parameter, Consent-Status, pseudonyme Kennungen, gehashte Matching-Daten, gekürzte IP und Seitenkontext sowie die Zustellprotokolle an die vom Kunden konfigurierten Destinationen. Die Verarbeitung folgt der Consent-Policy des Kunden; ohne den erforderlichen Zweck wird nichts gespeichert oder übermittelt."] },
        { title: "Zwecke und Rechtsgrundlagen", paragraphs: ["Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO) für Konten, Abrechnung und Support; berechtigtes Interesse (Art. 6 Abs. 1 lit. f) für Sicherheit und Missbrauchsprävention; Einwilligung (Art. 6 Abs. 1 lit. a), wenn ein Besucher des Kunden Analytics- oder Marketingzwecken zugestimmt hat; rechtliche Verpflichtungen (Art. 6 Abs. 1 lit. c) für Buchhaltungsunterlagen."] },
        { title: "Empfänger und Übermittlungen", paragraphs: ["Unterauftragsverarbeiter sind auf der Seite Unterauftragsverarbeiter aufgeführt. Übermittlungen außerhalb der EU stützen sich auf Standardvertragsklauseln oder das EU-US Data Privacy Framework. Werbeanbieter erhalten Daten nur für Destinationen, die der Kunde konfiguriert hat; der Assistent zeigt Empfänger und Übermittlungsgrundlage für jede an."] },
        { title: "Aufbewahrung", paragraphs: ["Events 13 Monate, Click-IDs 90 Tage, Consent-Snapshots 3 Jahre, Zustellversuche 90 Tage, Audit-Log 2 Jahre, Chat-Transkripte 30 Tage, DSAR-Datensätze 3 Jahre — pro Organisation innerhalb dieser Höchstwerte konfigurierbar. Kontodaten werden 30 Tage nach Kontoschließung gelöscht."] },
        { title: "Deine Rechte", paragraphs: ["Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerspruch. Kunden bearbeiten Anfragen ihrer Besucher über das Datenschutz-Center; Besucher können sich auch direkt an den Betreiber wenden. Beschwerden sind bei einer Aufsichtsbehörde möglich."] },
        { title: "KI-Assistent", paragraphs: ["Der Einrichtungsassistent nutzt die OpenAI Responses API ohne Datenspeicherung (Zero Data Retention). Geheimnisse und personenbezogene Daten werden geschwärzt, bevor eine Nachricht das Modell erreicht; das Modell handelt ausschließlich über typisierte Tools, die serverseitig validiert und auditiert werden."] },
      ],
    },
    "data-processing": {
      title: "Auftragsverarbeitung",
      intro: "Zusammenfassung der Auftragsverarbeitungsbedingungen für Kunden-Eventdaten. Der vollständige Vertrag wird beim Onboarding und auf Anfrage bereitgestellt.",
      updated: "2026-09-03",
      sections: [
        { title: "Gegenstand", paragraphs: ["Erfassung, Normalisierung, Consent-Prüfung, Speicherung und Zustellung von Website- und Server-Events an vom Kunden konfigurierte Destinationen sowie Dashboards, Diagnostik und der Einrichtungsassistent."] },
        { title: "Weisungen", paragraphs: ["Der Kunde erteilt Weisungen über die Produktkonfiguration: Sites, Destinationen, Mappings, Consent-Policy und Aufbewahrung. Konfigurationsversionen sind signiert und auditierbar, Weisungen damit dokumentiert."] },
        { title: "Technische und organisatorische Maßnahmen", paragraphs: ["Siehe Seite Sicherheit: Mandantentrennung mit Row-Level Security, Envelope Encryption, signierte Konfiguration, Kill-Switches, PII-Scan, gekürzte IPs, RBAC mit MFA, Audit-Trail, EU-Hosting."] },
        { title: "Unterauftragsverarbeiter", paragraphs: ["Auf der Seite Unterauftragsverarbeiter aufgeführt; Kunden werden 30 Tage vor Änderungen informiert und können widersprechen."] },
        { title: "Betroffenenanfragen und Löschung", paragraphs: ["Das Datenschutz-Center verarbeitet Export- und Löschanfragen gegen pseudonyme Kennungen über alle Sites der Organisation und protokolliert das Ergebnis. Aufbewahrungsläufe löschen Daten am Ende der konfigurierten Fristen."] },
        { title: "Audit und Beendigung", paragraphs: ["Audit-Logs, Integrationsmatrizen und Versionshistorien stehen im Produkt bereit. Bei Beendigung kann der Kunde Daten exportieren; Restkopien werden innerhalb von 30 Tagen gelöscht."] },
      ],
    },
    terms: {
      title: "Nutzungsbedingungen",
      intro: "Die Bedingungen, zu denen der Betreiber track.site Geschäftskunden bereitstellt.",
      updated: "2026-09-03",
      sections: [
        { title: "Leistung", paragraphs: ["track.site ist ein Tag-Manager, consent-konformer serverseitiger Event-Router und Analytics-Layer im Abonnement. Funktionen und Limits sind auf der Preisseite und im gewählten Tarif beschrieben."] },
        { title: "Pflichten des Kunden", paragraphs: ["Kunden sind für eine rechtmäßige Consent-Implementierung auf ihren Properties, die Richtigkeit der Destinationskonfiguration und aktuelle Anbieter-Zugangsdaten verantwortlich. Besondere Kategorien personenbezogener Daten dürfen nicht gesendet werden; Fingerprinting oder Consent-Umgehung sind untersagt."] },
        { title: "Entgelte", paragraphs: ["Entgelte werden über Stripe pro Tarif und Intervall abgerechnet. Nutzung über dem Tariflimit löst Warnungen und eine Frist aus, bevor harte Limits greifen. Preise werden auf der Preisseite so angezeigt, wie sie in Stripe konfiguriert sind."] },
        { title: "Verfügbarkeit und Support", paragraphs: ["Der Betreiber strebt eine hohe Verfügbarkeit der Datenebene an und veröffentlicht Vorfälle auf der Statusseite. Support erfolgt per E-Mail; Enterprise-Tarife enthalten ein SLA."] },
        { title: "Haftung", paragraphs: ["Die Haftung ist auf den in den zwölf Monaten vor dem Ereignis gezahlten Betrag begrenzt, außer bei Vorsatz, grober Fahrlässigkeit, Verletzung von Leben oder Gesundheit und zwingender gesetzlicher Haftung."] },
        { title: "Laufzeit und Kündigung", paragraphs: ["Abonnements verlängern sich pro Intervall und können zum Periodenende gekündigt werden. Der Betreiber kann Konten, die gegen diese Bedingungen verstoßen, nach Ankündigung sperren, außer wenn sofortiges Handeln zum Schutz der Plattform erforderlich ist."] },
        { title: "Anwendbares Recht", paragraphs: ["Es gilt das Recht am Sitz des Betreibers; zwingende Verbraucherschutzvorschriften bleiben unberührt."] },
      ],
    },
  },
};
