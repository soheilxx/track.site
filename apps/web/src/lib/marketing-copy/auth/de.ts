import type { AuthCopy } from "../types";

/**
 * German (de) copy of the auth area. Same shape as en.ts; see docs/14-localization.md.
 */

export const AUTH_COPY_DE: AuthCopy = {
  plan: { selected: "Auf der Preisseite gewählt: {plan}, {interval}. Der Checkout folgt nach der Einrichtung; der Tarif lässt sich dort noch ändern.", intervals: { monthly: "monatliche Abrechnung", yearly: "jährliche Abrechnung" } },
  shell: {
    brandHome: "Track – Startseite",
    legalLabel: "Rechtliches",
    legal: { privacy: "Datenschutz", terms: "Nutzungsbedingungen", imprint: "Impressum", security: "Sicherheit" },
    region: "EU-Datenregion · Auftragsverarbeiter nach Art. 28 DSGVO",
    stepsLabel: "Schritte der Einrichtung",
  },
  steps: ["Konto erstellen", "E-Mail bestätigen", "Website hinzufügen"],
  signals: [
    { icon: "passkey", title: "Passkeys und Zwei-Faktor-Login", text: "Melde dich mit einem Passkey an oder sichere dein Konto mit einer Authenticator-App." },
    { icon: "eu", title: "EU-Datenregion", text: "Eventdaten werden standardmäßig in der EU verarbeitet. Track ist Auftragsverarbeiter nach Art. 28 DSGVO." },
    { icon: "consent", title: "Consent entscheidet über die Zustellung", text: "Ein Event erreicht eine Plattform nur, wenn der Consent-Status es erlaubt. Nichts wird geraten." },
  ],
  preview: {
    eyebrow: "Was du als Nächstes einrichtest",
    title: "Ein Snippet. Geprüfte Events. Consent beachtet.",
    text: "Track empfängt die Events deiner Website, prüft sie gegen den Consent-Status und deine Policy und liefert sie an die Plattformen, die du verbindest.",
    caption: "Illustration mit Beispielwerten, keine Live-Daten.",
    diagram: {
      title: "Datenfluss: Website, Track, Consent-Gate, Destinations",
      website: "Website",
      websiteSub: "Browser · Server",
      track: "Track",
      trackSub: "geprüfte Events",
      consent: "Consent",
      consentState: "erteilt",
      destinations: ["Meta", "Google Ads", "GA4"],
      delivered: "zugestellt (Beispiel)",
    },
  },
};
