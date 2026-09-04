import type { HowItWorksCopy } from "../types";
import { SNIPPET } from "./samples";

/**
 * French (fr) copy of the how-it-works area. Same shape as en.ts; see docs/14-localization.md.
 */

export const HOW_IT_WORKS_FR: HowItWorksCopy = {
  eyebrow: "Comment ça fonctionne",
  title: "De votre domaine à des conversions vérifiées sur chaque plateforme",
  intro: "Un snippet sur votre site, une session guidée avec l’assistant, une configuration signée que vous approuvez. Track prend les événements en charge à partir de là — avec un consentement évalué pour chaque destination et un débogueur qui vous montre ce qui s’est passé.",
  cta: "Commencer avec votre domaine",
  ctaSecondary: "Voir les fonctionnalités",
  stage: {
    title: "Snippet → Track → plateformes",
    description: "Le snippet sur votre site web envoie les événements depuis le navigateur ; votre boutique ou votre serveur envoie les mêmes conversions avec un ID d’événement commun. Track évalue le consentement à une barrière de règles et transmet chaque événement à Meta, Google Ads, Google Analytics 4 et TikTok.",
    caption: "Snippet → Track → Consentement/règles → plateformes. La même image que vous voyez dans le débogueur pour chaque événement réel.",
  },
  milestonesTitle: "Quatre étapes clés, une seule session",
  milestonesText: "C’est le point de vue du client. Les contrôles techniques derrière chaque étape sont détaillés plus bas.",
  youLabel: "Vous",
  outcomeLabel: "Vous obtenez",
  steps: [
    { title: "Créez votre site", text: "Inscrivez-vous avec votre domaine. Track crée le site, un ID de tracking public à six caractères et le snippet d’une ligne.", you: "saisissez le domaine et collez le snippet — ou installez l’application Shopify, WooCommerce ou Shopware", outcome: "une installation vérifiée : Track voit la première page vue et confirme la propriété par DNS, fichier ou balise meta" },
    { title: "Laissez l’assistant proposer la configuration", text: "L’assistant détecte la plateforme et l’outil de consentement, propose un plan d’événements pour votre type d’activité et demande les ID publics des plateformes que vous utilisez.", you: "répondez à quelques questions et saisissez les ID de pixel dans le chat, les jetons d’accès dans la carte coffre-fort", outcome: "un brouillon de configuration avec des événements mappés et un véritable événement de test accepté par le fournisseur" },
    { title: "Approuvez et publiez", text: "Vous voyez le diff, les destinataires et l’exigence de consentement de chaque destination. Une approbation publie un bundle signé et versionné.", you: "lisez le diff et cliquez sur approuver", outcome: "une configuration en ligne avec son numéro de version, rollback disponible en un clic" },
    { title: "Observez et améliorez", text: "Le débogueur montre chaque événement avec sa décision, le score de santé indique quoi corriger, et l’assistant propose la correction.", you: "consultez le score lorsqu’il change ; approuvez les améliorations", outcome: "des conversions vérifiées sur chaque plateforme, avec des preuves pour chaque événement" },
  ],
  snippet: { title: "Le snippet", code: SNIPPET, copy: "Copier le snippet", copied: "Copié", note: "Servi depuis un hôte CDN first-party ; la configuration qu’il charge est signée en Ed25519 et vérifiée avant toute exécution." },
  published: {
    title: "Configuration · version 13",
    state: "en ligne",
    facts: [
      { label: "Approuvée par", value: "vous, liée au diff que vous avez lu" },
      { label: "Signature", value: "Ed25519, vérifiée par le SDK" },
      { label: "Destinations", value: "Meta (navigateur + serveur), Google Ads (serveur)" },
      { label: "Rollback", value: "version 12, un clic" },
    ],
  },
  flows: {
    title: "D’où viennent vos événements",
    text: "Passez d’un mode de transmission à l’autre. Chaque destination peut fonctionner en navigateur seul, en serveur seul ou avec les deux ; le mode hybride est le réglage par défaut, parce que les deux chemins couvrent mutuellement leurs lacunes.",
    tabsLabel: "Modes de transmission",
    items: [
      {
        id: "browser",
        label: "Navigateur seul",
        title: "Événements depuis le SDK navigateur",
        text: "Le snippet collecte les pages vues, les vues de produits et les événements de panier dans le navigateur du visiteur et les envoie à l’hôte d’ingestion de Track. Les tags des fournisseurs ne se chargent qu’après consentement. Ce mode s’installe vite mais dépend du navigateur : scripts bloqués et onglets fermés perdent des événements.",
        points: ["Installation : un snippet", "Consentement : évalué dans le navigateur, puis à nouveau sur le serveur", "Lacune : aucun événement si le script est bloqué ou si l’onglet se ferme trop tôt"],
      },
      {
        id: "server",
        label: "Serveur seul",
        title: "Événements depuis votre serveur ou votre boutique",
        text: "Votre plateforme e-commerce, votre backend ou votre CRM envoie les conversions à l’API serveur avec une clé de source. Achats, remboursements et conversions hors ligne arrivent de façon fiable et ne sont jamais bloqués dans le navigateur. Les données de correspondance se limitent à ce que votre serveur connaît.",
        points: ["Installation : application de boutique ou requête signée depuis votre backend", "Fiable pour les achats, les remboursements, les leads issus de votre CRM", "Lacune : moins de signaux navigateur pour la correspondance"],
      },
      {
        id: "hybrid",
        label: "Navigateur + serveur",
        title: "Les deux chemins, un seul ID d’événement",
        text: "Le navigateur et le serveur envoient la même conversion avec le même ID d’événement. Track normalise les deux, applique la décision de consentement par destination et les transmet ; les fournisseurs dédupliquent sur l’ID d’événement ou l’ID de commande. Vous obtenez la portée du chemin serveur avec la qualité de correspondance du chemin navigateur.",
        points: ["Mode par défaut pour chaque destination qui prend en charge les deux", "Déduplication : ID d’événement (Meta, TikTok, Pinterest, Snapchat, Microsoft, LinkedIn …), ID de commande (Google Ads)", "Consentement : une décision par événement et par destination pour les deux chemins"],
      },
    ],
  },
  checks: {
    title: "Ce que Track vérifie en chemin",
    summary: "Afficher les contrôles techniques derrière les quatre étapes clés",
    intro: "Ces contrôles s’exécutent pendant la session guidée, puis dans le worker. C’est grâce à eux que les quatre étapes clés suffisent — vous n’avez pas à les vérifier à la main.",
    groups: [
      { title: "Site et installation", items: ["Format du domaine et accessibilité", "Propriété par enregistrement DNS, fichier de vérification ou balise meta", "Snippet présent et signature de la configuration vérifiée dans le navigateur", "Première page vue reçue sur l’hôte d’ingestion"] },
      { title: "Plateforme, outil de consentement et plan d’événements", items: ["Plateforme e-commerce ou CMS détectée avec un niveau de confiance", "Outil de consentement détecté (TCF 2.2, GPP, Cookiebot, OneTrust, Usercentrics ou API de consentement)", "Modèle de plan d’événements choisi selon le type d’activité (boutique, génération de leads, SaaS, éditeur)", "Paramètres obligatoires par événement standard, règles de nommage pour les événements personnalisés, données personnelles bloquées dans les propriétés"] },
      { title: "Destinations et identifiants d’accès", items: ["ID publics validés selon le format du fournisseur", "Jetons d’accès stockés dans le coffre-fort via une carte ou OAuth ; jamais dans la transcription", "Finalité de consentement requise par chaque destination enregistrée", "Matrice des ID de clic vérifiée : chaque ID transmis uniquement à sa plateforme"] },
      { title: "Test, relecture et publication", items: ["Événement de test envoyé dans la vraie file d’attente et le vrai worker ; verdict du fournisseur enregistré", "Diff, liste des destinataires et approbateur liés à un seul jeton d’approbation", "Bundle signé en Ed25519, versionné et immuable", "Entrée d’audit pour chaque appel d’outil et chaque approbation"] },
      { title: "Après la mise en ligne", items: ["Score de santé : couverture du consentement, événements critiques, qualité du schéma, doublons, transmission, fraîcheur", "Nouvelles tentatives avec backoff, circuit breaker et dead-letter queue par destination", "Problèmes regroupés par empreinte, chacun nommant l’outil qui le corrige", "Rollback vers n’importe quelle version antérieure"] },
    ],
  },
  architectureTitle: "Deux plans, une configuration signée",
  architectureText: "Un control plane pour les personnes et l’assistant, un data plane pour les événements. Ils ne partagent rien d’autre que la configuration signée — une preuve technique après les étapes clés, pas un prérequis pour utiliser Track.",
  architectureColumns: { component: "Composant", responsibility: "Responsabilité" },
  architecture: [
    { title: "SDK navigateur", text: "Stockage conditionné au consentement, adaptateurs CMP, transport par lots, tracking des SPA, chargeurs de fournisseurs avec ID de déduplication communs. Maintenu sous 30 Ko gzip par un budget CI." },
    { title: "Collecteur", text: "Liste d’autorisation des origines, limites de débit, requêtes serveur signées HMAC, kill switches, remise à la file d’attente durable avant le renvoi du 202." },
    { title: "Worker", text: "Normalisation, analyse des données personnelles, règles de consentement, stockage des événements, déduplication des conversions, registre d’usage, fan-out, transmission avec nouvelles tentatives et DLQ." },
    { title: "Control plane", text: "Tableau de bord et assistant : outils typés, approbations, journal d’audit, RBAC, facturation, centre de confidentialité — séparés du data plane." },
  ],
  faqTitle: "Questions",
  faq: [
    { q: "Ai-je besoin d’un tag manager ?", a: "Non. Le tracker charge lui-même les tags des fournisseurs après consentement. Les configurations GTM existantes peuvent coexister pendant la migration." },
    { q: "Où les données sont-elles traitées ?", a: "Dans l’UE. Les API des fournisseurs ne reçoivent que ce que vous avez configuré, sur la base de transfert documentée affichée pour chaque destination." },
    { q: "Comment la configuration est-elle protégée ?", a: "Les bundles sont immuables, versionnés et signés en Ed25519 ; le SDK vérifie la signature avant d’appliquer toute configuration." },
    { q: "Et si le fournisseur d’IA est indisponible ?", a: "Les mêmes états de configuration existent sous forme d’assistant à base de règles. Rien dans le pipeline ne dépend de la disponibilité d’un modèle." },
  ],
  closing: { title: "Prêt quand vous l’êtes", text: "Créez votre site, collez le snippet et laissez l’assistant configurer la première destination.", cta: "Commencer gratuitement", secondary: "Lire la documentation" },
};
