import type { IntegrationCatalogText } from "../types";

/**
 * Testo italiano del catalogo integrazioni (riepilogo, prerequisito lato vendor, etichette degli
 * identificatori pubblici). Le chiavi sono gli `slug` e le `key` del catalogo
 * (`@/lib/integrations-catalog`) e restano identiche all’inglese; nomi di piattaforme, API e
 * parametri non vengono tradotti (docs/14-localization.md §4).
 */
export const INTEGRATION_CATALOG_TEXT_IT: IntegrationCatalogText = {
  meta: {
    summary: "Meta Pixel più Conversions API con ID evento condivisi, dati di matching in hash e codici evento di test.",
    accessNote: null,
    publicIds: { pixel_id: "ID pixel / dataset" },
  },
  "google-ads": {
    summary: "Conversioni del tag Google, Enhanced Conversions e caricamenti di conversioni da clic online/offline tramite l’API Google Ads.",
    accessNote: "Richiede un token sviluppatore Google Ads approvato per la tua app OAuth.",
    publicIds: { conversion_id: "ID conversione del tag Google", customer_id: "ID cliente Google Ads", login_customer_id: "ID cliente dell’account amministratore (MCC)" },
  },
  "google-analytics": {
    summary: "gtag.js più Measurement Protocol (endpoint UE) con validazione di debug prima dell’invio.",
    accessNote: null,
    publicIds: { measurement_id: "ID misurazione" },
  },
  tiktok: {
    summary: "TikTok Pixel ed Events API con matching ttclid e deduplicazione.",
    accessNote: null,
    publicIds: { pixel_id: "Codice pixel" },
  },
  microsoft: {
    summary: "Tag UET più Microsoft Conversions API (capi.uet.microsoft.com) con ID evento condivisi, identificatori in hash e segnali di consenso.",
    accessNote: null,
    publicIds: { uet_tag_id: "ID tag UET" },
  },
  linkedin: {
    summary: "Insight Tag e Conversions API con matching li_fat_id ed endpoint REST versionati.",
    accessNote: "La Conversions API richiede il prodotto Advertising API nella tua app LinkedIn.",
    publicIds: { partner_id: "ID partner dell’Insight Tag", ad_account_id: "ID account pubblicitario" },
  },
  reddit: {
    summary: "Reddit Pixel e Conversions API con rdt_cid e modalità test.",
    accessNote: null,
    publicIds: { pixel_id: "ID pixel / account pubblicitario" },
  },
  pinterest: {
    summary: "Pinterest Tag e Conversions API con click id epik.",
    accessNote: null,
    publicIds: { tag_id: "ID tag Pinterest", ad_account_id: "ID account pubblicitario" },
  },
  snapchat: {
    summary: "Snap Pixel e Conversions API v3 con matching ScCid.",
    accessNote: null,
    publicIds: { pixel_id: "ID Snap Pixel" },
  },
  x: {
    summary: "X Pixel e Conversion API con twclid.",
    accessNote: null,
    publicIds: { pixel_id: "ID X Pixel" },
  },
  taboola: {
    summary: "Taboola Pixel e tracking delle conversioni server-to-server con tblci.",
    accessNote: null,
    publicIds: { account_id: "ID account Taboola (numerico)" },
  },
  outbrain: {
    summary: "Outbrain Pixel e conversioni server-to-server con ob_click_id / dicbo.",
    accessNote: null,
    publicIds: { marketer_id: "ID marketer Outbrain" },
  },
  amazon: {
    summary: "Amazon Ad Tag più Conversions API tramite l’API Amazon Ads.",
    accessNote: "L’accesso alla Conversions API dipende dal tuo account Amazon Ads e dalla regione; le definizioni di conversione devono esistere nell’account Ads prima che gli eventi vengano accettati.",
    publicIds: { tag_id: "ID Amazon Ad Tag", account_id: "ID account Amazon Ads", region: "Regione API (NA, EU, FE)", data_set_name: "Nome del data set dell’Events API" },
  },
  spotify: {
    summary: "Spotify Pixel e Conversions API.",
    accessNote: null,
    publicIds: { pixel_id: "Chiave pixel Spotify" },
  },
  quora: {
    summary: "Quora Pixel e Conversion API con qclid.",
    accessNote: null,
    publicIds: { pixel_id: "ID pixel Quora", account_id: "ID account pubblicitario" },
  },
  yahoo: {
    summary: "Pixel Yahoo Dot e Conversion API.",
    accessNote: null,
    publicIds: { pixel_id: "ID pixel Yahoo", project_id: "ID progetto del tag Dot" },
  },
  tradedesk: {
    summary: "Universal Pixel e Real-Time Conversion Events API.",
    accessNote: "Gli eventi server vengono accettati solo per pixel o event tracker già esistenti nella piattaforma The Trade Desk per il tuo inserzionista.",
    publicIds: { advertiser_id: "ID inserzionista", pixel_id: "ID Universal Pixel", tracker_id: "ID event tracker" },
  },
  "google-marketing-platform": {
    summary: "Tag Floodlight più conversioni Floodlight server-side per CM360, DV360 e SA360.",
    accessNote: null,
    publicIds: { floodlight_configuration_id: "ID configurazione Floodlight (inserzionista)", profile_id: "ID profilo utente CM360" },
  },
  adroll: {
    summary: "AdRoll Pixel più Conversions and Events API.",
    accessNote: "La Conversions and Events API è una beta ad accesso limitato; AdRoll deve attivarla per il tuo account. Il pixel funziona anche senza.",
    publicIds: { advertiser_id: "EID advertisable", pixel_id: "EID pixel" },
  },
  criteo: {
    summary: "Criteo OneTag più gli endpoint evento server-side ufficialmente disponibili.",
    accessNote: "Gli eventi server-side dipendono dal prodotto Criteo attivato per il tuo account.",
    publicIds: { account_id: "ID account Criteo (ID partner)" },
  },
  "affiliate-postbacks": {
    summary: "Postback server-to-server universali con preset per Awin, CJ, Impact, TradeTracker, Tradedoubler, Partnerize, Rakuten, Webgains, Digistore24, Adcell, Belboon, TUNE ed Everflow.",
    accessNote: null,
    publicIds: { preset: "Preset del network" },
  },
  webhook: {
    summary: "Webhook JSON firmati verso i tuoi sistemi con campi in allow-list.",
    accessNote: null,
    publicIds: { url: "URL dell’endpoint (https)" },
  },
  shopify: {
    summary: "Estensione web pixel più webhook verificati di ordini e rimborsi.",
    accessNote: null,
    publicIds: { shop_domain: "Dominio dello shop", default_currency: "Valuta di fallback" },
  },
  woocommerce: {
    summary: "Plugin leggero con webhook ordine firmati e adapter per il browser.",
    accessNote: null,
    publicIds: { shop_domain: "Dominio dello shop", default_currency: "Valuta di fallback" },
  },
  shopware: {
    summary: "App Shopware con script storefront e webhook ordine firmati.",
    accessNote: null,
    publicIds: { shop_domain: "Dominio dello shop", default_currency: "Valuta di fallback", purchase_on: "Momento dell’acquisto (pagato o effettuato)" },
  },
};
