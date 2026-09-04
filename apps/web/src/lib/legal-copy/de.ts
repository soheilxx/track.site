import type { LegalCopy } from "./index";

/**
 * German (de) legal and trust documents (security, privacy, data processing, terms). Same shape as
 * en.ts; see docs/14-localization.md. Operator facts (company, address, DPO) are not in
 * here — they come from the environment (`operatorFromEnv`).
 */

export const LEGAL_DE: LegalCopy = {
  security: {
    title: "Sicherheit",
    intro: "Wie Track Kundendaten schützt: Architektur, Kontrollen und die Garantien, die du im Produkt nachprüfen kannst.",
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
    intro: "Die Bedingungen, zu denen der Betreiber Track Geschäftskunden bereitstellt.",
    updated: "2026-09-03",
    sections: [
      { title: "Leistung", paragraphs: ["Track ist ein Tag-Manager, consent-konformer serverseitiger Event-Router und Analytics-Layer im Abonnement. Funktionen und Limits sind auf der Preisseite und im gewählten Tarif beschrieben."] },
      { title: "Pflichten des Kunden", paragraphs: ["Kunden sind für eine rechtmäßige Consent-Implementierung auf ihren Properties, die Richtigkeit der Destinationskonfiguration und aktuelle Anbieter-Zugangsdaten verantwortlich. Besondere Kategorien personenbezogener Daten dürfen nicht gesendet werden; Fingerprinting oder Consent-Umgehung sind untersagt."] },
      { title: "Entgelte", paragraphs: ["Entgelte werden über Stripe pro Tarif und Intervall abgerechnet. Nutzung über dem Tariflimit löst Warnungen und eine Frist aus, bevor harte Limits greifen. Preise werden auf der Preisseite so angezeigt, wie sie in Stripe konfiguriert sind."] },
      { title: "Verfügbarkeit und Support", paragraphs: ["Der Betreiber strebt eine hohe Verfügbarkeit der Datenebene an und veröffentlicht Vorfälle auf der Statusseite. Support erfolgt per E-Mail; Enterprise-Tarife enthalten ein SLA."] },
      { title: "Haftung", paragraphs: ["Die Haftung ist auf den in den zwölf Monaten vor dem Ereignis gezahlten Betrag begrenzt, außer bei Vorsatz, grober Fahrlässigkeit, Verletzung von Leben oder Gesundheit und zwingender gesetzlicher Haftung."] },
      { title: "Laufzeit und Kündigung", paragraphs: ["Abonnements verlängern sich pro Intervall und können zum Periodenende gekündigt werden. Der Betreiber kann Konten, die gegen diese Bedingungen verstoßen, nach Ankündigung sperren, außer wenn sofortiges Handeln zum Schutz der Plattform erforderlich ist."] },
      { title: "Anwendbares Recht", paragraphs: ["Es gilt das Recht am Sitz des Betreibers; zwingende Verbraucherschutzvorschriften bleiben unberührt."] },
    ],
  },
};
