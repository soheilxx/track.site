import type { IntegrationCatalogText } from "../types";

/**
 * Texto en español del catálogo de integraciones (resumen, requisito previo del proveedor,
 * etiquetas de los identificadores públicos). Las claves son los `slug` y las `key` del catálogo
 * (`@/lib/integrations-catalog`) y se mantienen idénticas al inglés; los nombres de plataformas,
 * APIs y parámetros no se traducen (docs/14-localization.md §4).
 */
export const INTEGRATION_CATALOG_TEXT_ES: IntegrationCatalogText = {
  meta: {
    summary: "Meta Pixel más Conversions API con IDs de evento compartidos, datos de coincidencia hasheados y códigos de evento de prueba.",
    accessNote: null,
    publicIds: { pixel_id: "ID del píxel / del dataset" },
  },
  "google-ads": {
    summary: "Conversiones de la etiqueta de Google, Enhanced Conversions y subidas de conversiones por clic online/offline a través de la API de Google Ads.",
    accessNote: "Requiere un token de desarrollador de Google Ads aprobado para tu aplicación OAuth.",
    publicIds: { conversion_id: "ID de conversión de la etiqueta de Google", customer_id: "ID de cliente de Google Ads", login_customer_id: "ID de cliente de la cuenta de administrador (MCC)" },
  },
  "google-analytics": {
    summary: "gtag.js más Measurement Protocol (endpoint de la UE) con validación de depuración antes del envío.",
    accessNote: null,
    publicIds: { measurement_id: "ID de medición" },
  },
  tiktok: {
    summary: "TikTok Pixel y Events API con coincidencia por ttclid y deduplicación.",
    accessNote: null,
    publicIds: { pixel_id: "Código del píxel" },
  },
  microsoft: {
    summary: "Etiqueta UET más Microsoft Conversions API (capi.uet.microsoft.com) con IDs de evento compartidos, identificadores hasheados y señales de consentimiento.",
    accessNote: null,
    publicIds: { uet_tag_id: "ID de la etiqueta UET" },
  },
  linkedin: {
    summary: "Insight Tag y Conversions API con coincidencia por li_fat_id y endpoints REST versionados.",
    accessNote: "La Conversions API requiere el producto Advertising API en tu aplicación de LinkedIn.",
    publicIds: { partner_id: "ID de partner del Insight Tag", ad_account_id: "ID de la cuenta publicitaria" },
  },
  reddit: {
    summary: "Reddit Pixel y Conversions API con rdt_cid y modo de prueba.",
    accessNote: null,
    publicIds: { pixel_id: "ID del píxel / de la cuenta publicitaria" },
  },
  pinterest: {
    summary: "Pinterest Tag y Conversions API con IDs de clic epik.",
    accessNote: null,
    publicIds: { tag_id: "ID de la etiqueta de Pinterest", ad_account_id: "ID de la cuenta publicitaria" },
  },
  snapchat: {
    summary: "Snap Pixel y Conversions API v3 con coincidencia por ScCid.",
    accessNote: null,
    publicIds: { pixel_id: "ID del Snap Pixel" },
  },
  x: {
    summary: "X Pixel y Conversion API con twclid.",
    accessNote: null,
    publicIds: { pixel_id: "ID del X Pixel" },
  },
  taboola: {
    summary: "Taboola Pixel y seguimiento de conversiones server-to-server con tblci.",
    accessNote: null,
    publicIds: { account_id: "ID de cuenta de Taboola (numérico)" },
  },
  outbrain: {
    summary: "Outbrain Pixel y conversiones server-to-server con ob_click_id / dicbo.",
    accessNote: null,
    publicIds: { marketer_id: "ID de marketer de Outbrain" },
  },
  amazon: {
    summary: "Amazon Ad Tag más Conversions API a través de la API de Amazon Ads.",
    accessNote: "El acceso a la Conversions API depende de tu cuenta de Amazon Ads y de su región; las definiciones de conversión deben existir en la cuenta de Ads antes de que se acepten eventos.",
    publicIds: { tag_id: "ID del Amazon Ad Tag", account_id: "ID de la cuenta de Amazon Ads", region: "Región de la API (NA, EU, FE)", data_set_name: "Nombre del data set de la Events API" },
  },
  spotify: {
    summary: "Spotify Pixel y Conversions API.",
    accessNote: null,
    publicIds: { pixel_id: "Clave del píxel de Spotify" },
  },
  quora: {
    summary: "Quora Pixel y Conversion API con qclid.",
    accessNote: null,
    publicIds: { pixel_id: "ID del píxel de Quora", account_id: "ID de la cuenta publicitaria" },
  },
  yahoo: {
    summary: "Píxel Yahoo Dot y Conversion API.",
    accessNote: null,
    publicIds: { pixel_id: "ID del píxel de Yahoo", project_id: "ID de proyecto de la etiqueta Dot" },
  },
  tradedesk: {
    summary: "Universal Pixel y Real-Time Conversion Events API.",
    accessNote: "Los eventos de servidor solo se aceptan para píxeles o event trackers que ya existan en la plataforma de The Trade Desk para tu anunciante.",
    publicIds: { advertiser_id: "ID del anunciante", pixel_id: "ID del Universal Pixel", tracker_id: "ID del event tracker" },
  },
  "google-marketing-platform": {
    summary: "Etiquetas Floodlight más conversiones Floodlight server-side para CM360, DV360 y SA360.",
    accessNote: null,
    publicIds: { floodlight_configuration_id: "ID de configuración de Floodlight (anunciante)", profile_id: "ID del perfil de usuario de CM360" },
  },
  adroll: {
    summary: "AdRoll Pixel más Conversions and Events API.",
    accessNote: "La Conversions and Events API es una beta restringida; AdRoll debe activarla para tu cuenta. El píxel funciona sin ella.",
    publicIds: { advertiser_id: "EID del advertisable", pixel_id: "EID del píxel" },
  },
  criteo: {
    summary: "Criteo OneTag más los endpoints de eventos server-side disponibles oficialmente.",
    accessNote: "Los eventos server-side dependen del producto de Criteo activado para tu cuenta.",
    publicIds: { account_id: "ID de cuenta de Criteo (ID de partner)" },
  },
  "affiliate-postbacks": {
    summary: "Postbacks server-to-server universales con presets para Awin, CJ, Impact, TradeTracker, Tradedoubler, Partnerize, Rakuten, Webgains, Digistore24, Adcell, Belboon, TUNE y Everflow.",
    accessNote: null,
    publicIds: { preset: "Preset de la red" },
  },
  webhook: {
    summary: "Webhooks JSON firmados hacia tus propios sistemas con campos en lista de permitidos.",
    accessNote: null,
    publicIds: { url: "URL del endpoint (https)" },
  },
  shopify: {
    summary: "Extensión web pixel más webhooks verificados de pedidos y reembolsos.",
    accessNote: null,
    publicIds: { shop_domain: "Dominio de la tienda", default_currency: "Moneda de reserva" },
  },
  woocommerce: {
    summary: "Plugin ligero con webhooks de pedido firmados y adaptador para el navegador.",
    accessNote: null,
    publicIds: { shop_domain: "Dominio de la tienda", default_currency: "Moneda de reserva" },
  },
  shopware: {
    summary: "App de Shopware con script de storefront y webhooks de pedido firmados.",
    accessNote: null,
    publicIds: { shop_domain: "Dominio de la tienda", default_currency: "Moneda de reserva", purchase_on: "Momento de la compra (pagado o realizado)" },
  },
};
