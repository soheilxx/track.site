import type { AuthCopy } from "../types";

/**
 * Dutch (nl, "je" register) copy of the auth area. Same shape as en.ts; see docs/14-localization.md.
 */

export const AUTH_COPY_NL: AuthCopy = {
  plan: { selected: "Gekozen op de prijzenpagina: {plan}, {interval}. De checkout volgt na de setup; je kunt het abonnement daar nog wijzigen.", intervals: { monthly: "maandelijks gefactureerd", yearly: "jaarlijks gefactureerd" } },
  shell: {
    brandHome: "Track – startpagina",
    legalLabel: "Juridisch",
    legal: { privacy: "Privacy", terms: "Voorwaarden", imprint: "Colofon", security: "Beveiliging" },
    region: "EU-dataregio · Verwerker volgens art. 28 AVG",
    stepsLabel: "Stappen van de setup",
  },
  steps: ["Account aanmaken", "E-mail bevestigen", "Website toevoegen"],
  signals: [
    { icon: "passkey", title: "Passkeys en tweestapsverificatie", text: "Log in met een passkey of beveilig je account met een authenticator-app." },
    { icon: "eu", title: "EU-dataregio", text: "Eventdata wordt standaard in de EU verwerkt. Track treedt op als verwerker volgens art. 28 AVG." },
    { icon: "consent", title: "Toestemming bepaalt de aflevering", text: "Een event bereikt een platform alleen als de toestemmingsstatus dat toelaat. Er wordt niets gegokt." },
  ],
  preview: {
    eyebrow: "Wat je hierna instelt",
    title: "Eén snippet. Geverifieerde events. Toestemming gerespecteerd.",
    text: "Track ontvangt de events van je website, toetst ze aan de toestemmingsstatus en je policy en levert ze af bij de platformen die je koppelt.",
    caption: "Illustratie met voorbeeldwaarden, geen live data.",
    diagram: {
      title: "Datastroom: website, Track, toestemmingscheck, destinations",
      website: "Website",
      websiteSub: "browser · server",
      track: "Track",
      trackSub: "geverifieerde events",
      consent: "Toestemming",
      consentState: "gegeven",
      destinations: ["Meta", "Google Ads", "GA4"],
      delivered: "afgeleverd (voorbeeld)",
    },
  },
};
