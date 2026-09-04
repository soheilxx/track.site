import type { AuthCopy } from "../types";

/**
 * Italian (it, "tu" register) copy of the auth area. Same shape as en.ts; see docs/14-localization.md.
 */

export const AUTH_COPY_IT: AuthCopy = {
  plan: { selected: "Selezionato nella pagina dei prezzi: {plan}, {interval}. Il checkout arriva dopo la configurazione; lì potrai ancora cambiare piano.", intervals: { monthly: "fatturazione mensile", yearly: "fatturazione annuale" } },
  shell: {
    brandHome: "Track – home",
    legalLabel: "Legale",
    legal: { privacy: "Privacy", terms: "Termini", imprint: "Note legali", security: "Sicurezza" },
    region: "Regione dati UE · Responsabile del trattamento ai sensi dell'art. 28 GDPR",
    stepsLabel: "Passaggi della configurazione",
  },
  steps: ["Crea l'account", "Conferma l'e-mail", "Aggiungi il tuo sito web"],
  signals: [
    { icon: "passkey", title: "Passkey e accesso a due fattori", text: "Accedi con una passkey o proteggi il tuo account con un'app di autenticazione." },
    { icon: "eu", title: "Regione dati UE", text: "I dati degli eventi vengono trattati nell'UE di default. Track agisce come responsabile del trattamento ai sensi dell'art. 28 GDPR." },
    { icon: "consent", title: "È il consenso a decidere la consegna", text: "Un evento raggiunge una piattaforma solo se lo stato del consenso lo permette. Nessuna supposizione." },
  ],
  preview: {
    eyebrow: "Cosa configurerai adesso",
    title: "Uno snippet. Eventi verificati. Consenso rispettato.",
    text: "Track riceve gli eventi del tuo sito web, li verifica rispetto allo stato del consenso e alla tua policy e li consegna alle piattaforme che colleghi.",
    caption: "Illustrazione con valori di esempio, non dati reali.",
    diagram: {
      title: "Flusso dei dati: sito web, Track, gate del consenso, destinazioni",
      website: "Sito web",
      websiteSub: "browser · server",
      track: "Track",
      trackSub: "eventi verificati",
      consent: "Consenso",
      consentState: "concesso",
      destinations: ["Meta", "Google Ads", "GA4"],
      delivered: "consegnato (esempio)",
    },
  },
};
