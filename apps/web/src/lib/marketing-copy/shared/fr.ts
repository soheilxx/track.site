import type { ConsentCopy, ContactFormCopy, FooterCopy, HeaderCopy } from "../types";

/**
 * French (fr) copy of the shared area. Same shape as en.ts; see docs/14-localization.md.
 */

export const HEADER_COPY_FR: HeaderCopy = {
  brandHome: "Track – accueil",
  mainNav: "Navigation principale",
  skipToContent: "Aller au contenu",
  groups: [
    {
      key: "product",
      label: "Produit",
      columns: [
        {
          key: "overview",
          title: "Vue d’ensemble",
          links: [
            { href: "/features", label: "Fonctionnalités", description: "Tout ce que Track fait, de la configuration guidée à la transmission" },
            { href: "/how-it-works", label: "Comment ça fonctionne", description: "Créer un site, installer le snippet, connecter les destinations, publier" },
          ],
        },
        {
          key: "capabilities",
          title: "En détail",
          wide: true,
          links: [
            { href: "/features/ai-setup", label: "Configuration guidée par l’IA", description: "Décrivez votre site, confirmez chaque étape, publiez une configuration signée" },
            { href: "/features/server-side-tracking", label: "Routeur d’événements côté serveur", description: "Transmission navigateur et serveur avec un ID d’événement commun pour la déduplication" },
            { href: "/features/event-debugger", label: "Event Debugger", description: "Chaque événement avec son instantané de consentement, sa décision de routage et la réponse du fournisseur" },
            { href: "/features/data-quality", label: "Qualité des données", description: "Un score de santé aux composantes explicables ; chaque problème renvoie vers sa solution" },
            { href: "/features/consent", label: "Consentement", description: "Opt-in strict par défaut et Consent Mode v2 ; rien n’est envoyé sans la finalité requise" },
            { href: "/features/attribution", label: "Attribution", description: "Les ID de clic uniquement pour la destination qui en a besoin, uniquement avec consentement" },
          ],
        },
      ],
    },
    {
      key: "integrations",
      label: "Intégrations",
      columns: [
        {
          key: "ads",
          title: "Plateformes publicitaires",
          links: [
            { href: "/integrations/meta", label: "Meta Ads" },
            { href: "/integrations/google-ads", label: "Google Ads" },
            { href: "/integrations/tiktok", label: "TikTok Ads" },
            { href: "/integrations/linkedin", label: "LinkedIn Ads" },
            { href: "/integrations/microsoft", label: "Microsoft Ads" },
            { href: "/integrations/reddit", label: "Reddit Ads" },
          ],
        },
        {
          key: "data",
          title: "Analytics et données",
          links: [
            { href: "/integrations/google-analytics", label: "Google Analytics 4" },
            { href: "/integrations/webhook", label: "Webhooks" },
            { href: "/integrations/affiliate-postbacks", label: "Postbacks d’affiliation" },
          ],
        },
        {
          key: "shops",
          title: "Plateformes e-commerce",
          links: [
            { href: "/integrations/shopify", label: "Shopify" },
            { href: "/integrations/woocommerce", label: "WooCommerce" },
            { href: "/integrations/shopware", label: "Shopware 6" },
          ],
        },
      ],
      more: { href: "/integrations", label: "Toutes les intégrations", description: "Tag navigateur plus API côté serveur pour chaque plateforme qui en propose une" },
    },
    {
      key: "resources",
      label: "Ressources",
      columns: [
        {
          key: "learn",
          title: "Apprendre",
          links: [
            { href: "/tracking-knowledge", label: "Tracking Knowledge", description: "Guides sur le tracking côté serveur, le tracking e-commerce, le consentement et l’attribution" },
            { href: "/docs", label: "Documentation", description: "Installer le snippet, envoyer des événements, intégrer le consentement, configurer les destinations" },
          ],
        },
        {
          key: "docs",
          title: "Accès rapide à la documentation",
          links: [
            { href: "/docs#install", label: "Installer le snippet" },
            { href: "/docs#events", label: "Envoyer des événements navigateur" },
            { href: "/docs#server", label: "API serveur et conversions hors ligne" },
            { href: "/docs#consent", label: "Intégration du consentement" },
          ],
        },
        {
          key: "help",
          title: "Aide",
          links: [
            { href: "/support", label: "Support" },
            { href: "/status", label: "État du système" },
            { href: "/security", label: "Sécurité" },
            { href: "/contact", label: "Contact" },
            { href: "/demo", label: "Réserver une démo" },
          ],
        },
      ],
    },
  ],
  pricing: { href: "/pricing", label: "Tarifs" },
  login: { href: "/login", label: "Se connecter" },
  start: { href: "/signup", label: "Commencer gratuitement" },
  language: "Langue",
  openMenu: "Ouvrir le menu",
  closeMenu: "Fermer le menu",
  menuTitle: "Menu",
};

export const FOOTER_COPY_FR: FooterCopy = {
  tagline: "Tag manager AI-first, routeur d’événements côté serveur respectueux du consentement et couche d’événements first-party.",
  region: "Région de données UE par défaut. Sous-traitant au sens de l’art. 28 du RGPD.",
  rights: "Tous droits réservés.",
  legalNote: "Les pages juridiques sont fournies à titre d’information et ne constituent pas un conseil juridique.",
  language: "Langue",
  columns: [
    {
      key: "product",
      title: "Produit",
      links: [
        { href: "/features", label: "Fonctionnalités" },
        { href: "/how-it-works", label: "Comment ça fonctionne" },
        { href: "/pricing", label: "Tarifs" },
        { href: "/docs", label: "Documentation" },
      ],
    },
    {
      key: "integrations",
      title: "Intégrations",
      links: [
        { href: "/integrations", label: "Toutes les intégrations" },
        { href: "/integrations/meta", label: "Meta Ads" },
        { href: "/integrations/google-ads", label: "Google Ads" },
        { href: "/integrations/google-analytics", label: "Google Analytics 4" },
        { href: "/integrations/shopify", label: "Shopify" },
        { href: "/integrations/woocommerce", label: "WooCommerce" },
        { href: "/integrations/shopware", label: "Shopware 6" },
      ],
    },
    {
      key: "knowledge",
      title: "Apprendre",
      links: [
        { href: "/tracking-knowledge", label: "Tracking Knowledge" },
        { href: "/docs#install", label: "Installer le snippet" },
        { href: "/docs#server", label: "API serveur" },
        { href: "/docs#consent", label: "Intégration du consentement" },
        { href: "/tracking-knowledge/feed.xml", label: "Flux RSS" },
      ],
    },
    {
      key: "company",
      title: "Entreprise",
      links: [
        { href: "/contact", label: "Contact" },
        { href: "/demo", label: "Réserver une démo" },
        { href: "/support", label: "Support" },
        { href: "/status", label: "État du système" },
        { href: "/security", label: "Sécurité" },
      ],
    },
    {
      key: "legal",
      title: "Juridique",
      links: [
        { href: "/privacy", label: "Confidentialité" },
        { href: "/terms", label: "Conditions générales" },
        { href: "/data-processing", label: "Traitement des données (DPA)" },
        { href: "/subprocessors", label: "Sous-traitants ultérieurs" },
        { href: "/imprint", label: "Mentions légales" },
      ],
    },
  ],
};

export const CONSENT_COPY_FR: ConsentCopy = {
  title: "Cookies et technologies similaires",
  description: "Ce site web ne stocke que ce dont il a besoin pour fonctionner. Les catégories optionnelles ne s’activent qu’après votre autorisation.",
  categories: {
    necessary: { label: "Strictement nécessaires", text: "Choix de la langue, thème, session et sécurité. Toujours actifs." },
    analytics: { label: "Analyse", text: "Mesure d’audience agrégée pour améliorer le site web." },
    marketing: { label: "Marketing", text: "Mesure des conversions des campagnes publicitaires." },
  },
  acceptAll: "Tout accepter",
  declineOptional: "Refuser les options",
  save: "Enregistrer la sélection",
  close: "Fermer",
  privacy: { href: "/privacy", label: "Politique de confidentialité" },
};

export const FORM_COPY_FR: ContactFormCopy = { name: "Nom", email: "E-mail", company: "Entreprise (facultatif)", message: "Message", submit: "Envoyer", sent: "Merci — nous avons bien reçu votre message et vous répondrons par e-mail.", invalid: "Veuillez vérifier les champs : un nom, une adresse e-mail valide et un message d’au moins 10 caractères.", rateLimited: "Trop de requêtes depuis ce réseau ; veuillez réessayer plus tard.", generic: "Une erreur s’est produite. Veuillez réessayer.", privacy: "Nous conservons votre demande pour y répondre et la supprimons une fois traitée. Voir la politique de confidentialité." };
