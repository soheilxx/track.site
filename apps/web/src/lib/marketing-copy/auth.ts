import type { AuthCopy, LocalizedCopy } from "./types";

/**
 * Auth shell copy (supplement §4 "Login und Registrierung": minimal Track brand, clear form flow,
 * optional product preview, short privacy/security signals, no full marketing footer).
 *
 * `login`/`signup` mirror the page-level titles of messages/{en,de}/auth.json verbatim; field
 * labels, errors and flow-specific strings stay in that catalog because the auth forms are client
 * components that read it through next-intl. Everything the server-rendered shell shows around the
 * forms (chrome, setup steps, signals, the static preview) lives here, typed, en + de of one shape.
 *
 * Every signal is a verifiable product fact (passkey + TOTP plugins are wired in auth-client.ts,
 * the EU region / Art. 28 statement is the one the footer makes, consent-gated delivery is the
 * policy engine's rule). No customers, numbers or success claims.
 */
export interface AuthSignal {
  icon: "passkey" | "eu" | "consent";
  title: string;
  text: string;
}

export interface AuthShellCopy extends AuthCopy {
  shell: {
    /** Accessible name of the brand link (leads to the start page). */
    brandHome: string;
    /** Landmark label of the compact legal footer. */
    legalLabel: string;
    legal: { privacy: string; terms: string; imprint: string; security: string };
    /** Region statement under the legal links (same fact as the marketing footer). */
    region: string;
    /** Label of the setup-step list shown above signup and e-mail verification. */
    stepsLabel: string;
  };
  /** Three setup steps: account → e-mail → website. Signup is step 1, verification step 2. */
  steps: [string, string, string];
  signals: AuthSignal[];
  preview: {
    eyebrow: string;
    title: string;
    text: string;
    /** Honesty note under the diagram: example values, not live data. */
    caption: string;
    diagram: {
      /** Accessible name of the SVG. */
      title: string;
      website: string;
      websiteSub: string;
      track: string;
      trackSub: string;
      consent: string;
      consentState: string;
      destinations: [string, string, string];
      delivered: string;
    };
  };
}

export const AUTH_COPY: LocalizedCopy<AuthShellCopy> = {
  en: {
    login: { title: "Welcome back", subtitle: "Log in to your Track workspace." },
    signup: { title: "Create your account", subtitle: "Free to start. No credit card required. EU data region.", terms: "By creating an account you agree to the terms of service and the data processing agreement." },
    shell: {
      brandHome: "Track – home",
      legalLabel: "Legal",
      legal: { privacy: "Privacy", terms: "Terms", imprint: "Imprint", security: "Security" },
      region: "EU data region · Processor under Art. 28 GDPR",
      stepsLabel: "Setup steps",
    },
    steps: ["Create account", "Confirm e-mail", "Add your website"],
    signals: [
      { icon: "passkey", title: "Passkeys and two-factor login", text: "Sign in with a passkey or protect your account with an authenticator app." },
      { icon: "eu", title: "EU data region", text: "Event data is processed in the EU by default. Track acts as a processor under Art. 28 GDPR." },
      { icon: "consent", title: "Consent decides delivery", text: "An event reaches a platform only when the consent state allows it. Nothing is guessed." },
    ],
    preview: {
      eyebrow: "What you set up next",
      title: "One snippet. Verified events. Consent respected.",
      text: "Track receives the events of your website, checks them against the consent state and your policy, and delivers them to the platforms you connect.",
      caption: "Illustration with example values, not live data.",
      diagram: {
        title: "Data flow: Website, Track, consent gate, destinations",
        website: "Website",
        websiteSub: "browser · server",
        track: "Track",
        trackSub: "verified events",
        consent: "Consent",
        consentState: "granted",
        destinations: ["Meta", "Google Ads", "GA4"],
        delivered: "delivered (example)",
      },
    },
  },
  de: {
    login: { title: "Willkommen zurück", subtitle: "Melde dich in deinem Track-Workspace an." },
    signup: { title: "Konto erstellen", subtitle: "Kostenlos starten. Keine Kreditkarte nötig. EU-Datenregion.", terms: "Mit der Registrierung stimmst du den Nutzungsbedingungen und dem Auftragsverarbeitungsvertrag zu." },
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
  },
};
