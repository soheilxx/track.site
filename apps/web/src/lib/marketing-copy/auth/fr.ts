import type { AuthCopy } from "../types";

/**
 * French (fr) copy of the auth area. Same shape as en.ts; see docs/14-localization.md.
 */

export const AUTH_COPY_FR: AuthCopy = {
  plan: { selected: "Sélectionné sur la page des tarifs : {plan}, {interval}. Le paiement suit la configuration ; vous pourrez encore changer de formule à cette étape.", intervals: { monthly: "facturation mensuelle", yearly: "facturation annuelle" } },
  shell: {
    brandHome: "Track – accueil",
    legalLabel: "Informations légales",
    legal: { privacy: "Confidentialité", terms: "Conditions", imprint: "Mentions légales", security: "Sécurité" },
    region: "Région de données UE · Sous-traitant au sens de l’art. 28 du RGPD",
    stepsLabel: "Étapes de configuration",
  },
  steps: ["Créer un compte", "Confirmer l’e-mail", "Ajouter votre site web"],
  signals: [
    { icon: "passkey", title: "Clés d’accès et connexion à deux facteurs", text: "Connectez-vous avec une clé d’accès (passkey) ou protégez votre compte avec une application d’authentification." },
    { icon: "eu", title: "Région de données UE", text: "Les données d’événements sont traitées dans l’UE par défaut. Track agit en tant que sous-traitant au sens de l’art. 28 du RGPD." },
    { icon: "consent", title: "Le consentement décide de la transmission", text: "Un événement n’atteint une plateforme que si l’état du consentement le permet. Rien n’est deviné." },
  ],
  preview: {
    eyebrow: "Ce que vous configurez ensuite",
    title: "Un snippet. Des événements vérifiés. Le consentement respecté.",
    text: "Track reçoit les événements de votre site web, les vérifie par rapport à l’état du consentement et à vos règles, puis les transmet aux plateformes que vous connectez.",
    caption: "Illustration avec des valeurs d’exemple, pas des données réelles.",
    diagram: {
      title: "Flux de données : site web, Track, barrière de consentement, destinations",
      website: "Site web",
      websiteSub: "navigateur · serveur",
      track: "Track",
      trackSub: "événements vérifiés",
      consent: "Consentement",
      consentState: "accordé",
      destinations: ["Meta", "Google Ads", "GA4"],
      delivered: "transmis (exemple)",
    },
  },
};
