import type { KnowledgeArticleCopy } from "../types";

/**
 * French (fr) copy of the knowledge-article area. Same shape as en.ts; see docs/14-localization.md.
 * "Tracking Knowledge" and "Track" never change. Register: vous.
 */

export const KNOWLEDGE_ARTICLE_COPY_FR: KnowledgeArticleCopy = {
  breadcrumbs: { label: "Fil d’Ariane", home: "Track" },
  meta: { by: "Par", published: "Publié le", updated: "Mis à jour le", reviewed: "Dernière relecture", readingTime: "Temps de lecture", minutes: "{n} min de lecture" },
  progress: "Progression de la lecture",
  toc: "Sommaire",
  takeaways: "À retenir",
  callouts: { note: "Remarque", warning: "Attention", privacy: "Confidentialité", practice: "En pratique" },
  code: { copy: "Copier le code", copied: "Copié" },
  steps: "Étapes",
  table: "Tableau",
  checklist: { open: "À faire", done: "Fait" },
  sources: { heading: "Sources principales", text: "Documentation et normes sur lesquelles cet article s’appuie." },
  legal: "Cet article fournit des informations générales et ne constitue pas un conseil juridique. Consultez votre conseil en protection des données pour votre situation particulière.",
  editor: "Responsable éditorial",
  cta: {
    eyebrow: "Track",
    items: {
      "ai-setup": { title: "Configurez le tracking avec Track AI", text: "Décrivez votre site et vos plateformes ; Track AI propose la configuration des événements et vous approuvez chaque changement avant sa mise en ligne.", label: "Voir la configuration par l’IA" },
      integrations: { title: "Connectez vos plateformes", text: "Meta, Google, TikTok, LinkedIn et plus — navigateur et côté serveur avec le même modèle d’événements et un seul état de consentement.", label: "Parcourir les intégrations" },
      "server-side": { title: "Le tracking côté serveur sans la plomberie", text: "La collecte first-party, la déduplication et la livraison vers les API serveur des plateformes sont intégrées à Track.", label: "Comment fonctionne le tracking côté serveur" },
      ecommerce: { title: "Des événements e-commerce vérifiés", text: "Les commandes Shopify, WooCommerce et Shopware atteignent Track comme événements serveur vérifiés, dédupliqués par rapport au navigateur.", label: "Voir les intégrations e-commerce" },
      consent: { title: "Le consentement appliqué à la source", text: "Track fait passer chaque événement par votre état de consentement avant que quoi que ce soit ne quitte le navigateur ou le serveur.", label: "Voir la gestion du consentement" },
      attribution: { title: "Une attribution que vous pouvez vérifier", text: "Track montre, plateforme par plateforme, quels identifiants de clic ont été capturés, transmis ou bloqués.", label: "Voir l’attribution" },
      "data-quality": { title: "Repérez les lacunes de données avant les plateformes", text: "La Data Quality Inbox signale les valeurs manquantes, les achats en double et les livraisons échouées, avec un correctif explicable.", label: "Voir la qualité des données" },
      debugger: { title: "Déboguez les événements en temps réel", text: "Le Live Event Debugger affiche chaque événement avec son origine, son état de consentement, son marqueur de déduplication et son résultat de livraison.", label: "Voir le Live Event Debugger" },
      product: { title: "Découvrez comment Track fonctionne", text: "Snippet, livraison côté serveur, consentement et configuration par l’IA en une seule visite guidée.", label: "Comment ça fonctionne" },
    },
  },
  related: "Articles associés",
  feedback: { heading: "Cet article vous a-t-il été utile ?", yes: "Oui", no: "Non", sending: "Envoi…", thanks: "Merci pour votre retour.", error: "Votre retour n’a pas pu être enregistré. Veuillez réessayer plus tard." },
};
