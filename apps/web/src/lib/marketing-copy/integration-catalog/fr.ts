import type { IntegrationCatalogText } from "../types";

/**
 * Texte français du catalogue d’intégrations (résumé, prérequis côté éditeur, libellés des
 * identifiants publics). Les clés sont les `slug` et les `key` du catalogue (`@/lib/integrations-catalog`)
 * et restent identiques à l’anglais ; les noms de plateformes, d’API et de paramètres ne sont pas
 * traduits (docs/14-localization.md §4).
 */
export const INTEGRATION_CATALOG_TEXT_FR: IntegrationCatalogText = {
  meta: {
    summary: "Meta Pixel plus Conversions API avec des identifiants d’événement partagés, des données de matching hachées et des codes d’événement de test.",
    accessNote: null,
    publicIds: { pixel_id: "ID du pixel / du dataset" },
  },
  "google-ads": {
    summary: "Conversions du tag Google, Enhanced Conversions et imports de conversions par clic en ligne/hors ligne via l’API Google Ads.",
    accessNote: "Nécessite un token développeur Google Ads approuvé pour votre application OAuth.",
    publicIds: { conversion_id: "ID de conversion du tag Google", customer_id: "Numéro client Google Ads", login_customer_id: "Numéro client du compte administrateur (MCC)" },
  },
  "google-analytics": {
    summary: "gtag.js plus Measurement Protocol (point de terminaison UE) avec validation debug avant l’envoi.",
    accessNote: null,
    publicIds: { measurement_id: "ID de mesure" },
  },
  tiktok: {
    summary: "TikTok Pixel et Events API avec matching ttclid et déduplication.",
    accessNote: null,
    publicIds: { pixel_id: "Code du pixel" },
  },
  microsoft: {
    summary: "Tag UET plus Microsoft Conversions API (capi.uet.microsoft.com) avec identifiants d’événement partagés, identifiants hachés et signaux de consentement.",
    accessNote: null,
    publicIds: { uet_tag_id: "ID du tag UET" },
  },
  linkedin: {
    summary: "Insight Tag et Conversions API avec matching li_fat_id et points de terminaison REST versionnés.",
    accessNote: "La Conversions API nécessite le produit Advertising API sur votre application LinkedIn.",
    publicIds: { partner_id: "ID partenaire de l’Insight Tag", ad_account_id: "ID du compte publicitaire" },
  },
  reddit: {
    summary: "Reddit Pixel et Conversions API avec rdt_cid et mode test.",
    accessNote: null,
    publicIds: { pixel_id: "ID du pixel / du compte publicitaire" },
  },
  pinterest: {
    summary: "Pinterest Tag et Conversions API avec identifiants de clic epik.",
    accessNote: null,
    publicIds: { tag_id: "ID du tag Pinterest", ad_account_id: "ID du compte publicitaire" },
  },
  snapchat: {
    summary: "Snap Pixel et Conversions API v3 avec matching ScCid.",
    accessNote: null,
    publicIds: { pixel_id: "ID du Snap Pixel" },
  },
  x: {
    summary: "X Pixel et Conversion API avec twclid.",
    accessNote: null,
    publicIds: { pixel_id: "ID du X Pixel" },
  },
  taboola: {
    summary: "Taboola Pixel et suivi des conversions server-to-server avec tblci.",
    accessNote: null,
    publicIds: { account_id: "ID de compte Taboola (numérique)" },
  },
  outbrain: {
    summary: "Outbrain Pixel et conversions server-to-server avec ob_click_id / dicbo.",
    accessNote: null,
    publicIds: { marketer_id: "ID marketer Outbrain" },
  },
  amazon: {
    summary: "Amazon Ad Tag plus Conversions API via l’API Amazon Ads.",
    accessNote: "L’accès à la Conversions API dépend de votre compte Amazon Ads et de sa région ; les définitions de conversion doivent exister dans le compte Ads avant que des événements soient acceptés.",
    publicIds: { tag_id: "ID de l’Amazon Ad Tag", account_id: "ID du compte Amazon Ads", region: "Région de l’API (NA, EU, FE)", data_set_name: "Nom du data set de l’Events API" },
  },
  spotify: {
    summary: "Spotify Pixel et Conversions API.",
    accessNote: null,
    publicIds: { pixel_id: "Clé du pixel Spotify" },
  },
  quora: {
    summary: "Quora Pixel et Conversion API avec qclid.",
    accessNote: null,
    publicIds: { pixel_id: "ID du pixel Quora", account_id: "ID du compte publicitaire" },
  },
  yahoo: {
    summary: "Pixel Yahoo Dot et Conversion API.",
    accessNote: null,
    publicIds: { pixel_id: "ID du pixel Yahoo", project_id: "ID de projet du tag Dot" },
  },
  tradedesk: {
    summary: "Universal Pixel et Real-Time Conversion Events API.",
    accessNote: "Les événements serveur ne sont acceptés que pour les pixels ou event trackers déjà créés dans la plateforme The Trade Desk pour votre annonceur.",
    publicIds: { advertiser_id: "ID annonceur", pixel_id: "ID de l’Universal Pixel", tracker_id: "ID de l’event tracker" },
  },
  "google-marketing-platform": {
    summary: "Tags Floodlight plus conversions Floodlight côté serveur pour CM360, DV360 et SA360.",
    accessNote: null,
    publicIds: { floodlight_configuration_id: "ID de configuration Floodlight (annonceur)", profile_id: "ID du profil utilisateur CM360" },
  },
  adroll: {
    summary: "AdRoll Pixel plus Conversions and Events API.",
    accessNote: "La Conversions and Events API est une bêta sur invitation ; AdRoll doit l’activer pour votre compte. Le pixel fonctionne sans elle.",
    publicIds: { advertiser_id: "EID de l’advertisable", pixel_id: "EID du pixel" },
  },
  criteo: {
    summary: "Criteo OneTag plus les points de terminaison d’événements côté serveur officiellement disponibles.",
    accessNote: "Les événements côté serveur dépendent du produit Criteo activé pour votre compte.",
    publicIds: { account_id: "ID de compte Criteo (ID partenaire)" },
  },
  "affiliate-postbacks": {
    summary: "Postbacks server-to-server universels avec des presets pour Awin, CJ, Impact, TradeTracker, Tradedoubler, Partnerize, Rakuten, Webgains, Digistore24, Adcell, Belboon, TUNE et Everflow.",
    accessNote: null,
    publicIds: { preset: "Preset du réseau" },
  },
  webhook: {
    summary: "Webhooks JSON signés vers vos propres systèmes avec des champs sur liste d’autorisation.",
    accessNote: null,
    publicIds: { url: "URL du point de terminaison (https)" },
  },
  shopify: {
    summary: "Extension web pixel plus webhooks de commande et de remboursement vérifiés.",
    accessNote: null,
    publicIds: { shop_domain: "Domaine de la boutique", default_currency: "Devise de repli" },
  },
  woocommerce: {
    summary: "Petit plugin avec webhooks de commande signés et adaptateur navigateur.",
    accessNote: null,
    publicIds: { shop_domain: "Domaine de la boutique", default_currency: "Devise de repli" },
  },
  shopware: {
    summary: "App Shopware avec script storefront et webhooks de commande signés.",
    accessNote: null,
    publicIds: { shop_domain: "Domaine de la boutique", default_currency: "Devise de repli", purchase_on: "Moment de l’achat (payé ou passé)" },
  },
};
