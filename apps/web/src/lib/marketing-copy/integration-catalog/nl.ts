import type { IntegrationCatalogText } from "../types";

/**
 * Nederlandse tekst van de integratiecatalogus (samenvatting, voorwaarde aan leverancierszijde,
 * labels van de publieke identifiers). De sleutels zijn de `slug`s en `key`s van de catalogus
 * (`@/lib/integrations-catalog`) en blijven gelijk aan het Engels; platform-, API- en
 * parameternamen worden niet vertaald (docs/14-localization.md §4).
 */
export const INTEGRATION_CATALOG_TEXT_NL: IntegrationCatalogText = {
  meta: {
    summary: "Meta Pixel plus Conversions API met gedeelde event-ID’s, gehashte matchingdata en test-eventcodes.",
    accessNote: null,
    publicIds: { pixel_id: "Pixel-/dataset-ID" },
  },
  "google-ads": {
    summary: "Google-tag-conversies, Enhanced Conversions en online/offline click-conversion-uploads via de Google Ads API.",
    accessNote: "Vereist een Google Ads-developertoken dat is goedgekeurd voor je OAuth-app.",
    publicIds: { conversion_id: "Google-tag-conversie-ID", customer_id: "Google Ads-klant-ID", login_customer_id: "Klant-ID van het beheerdersaccount (MCC)" },
  },
  "google-analytics": {
    summary: "gtag.js plus Measurement Protocol (EU-endpoint) met debugvalidatie vóór verzending.",
    accessNote: null,
    publicIds: { measurement_id: "Metings-ID" },
  },
  tiktok: {
    summary: "TikTok Pixel en Events API met ttclid-matching en deduplicatie.",
    accessNote: null,
    publicIds: { pixel_id: "Pixelcode" },
  },
  microsoft: {
    summary: "UET-tag plus Microsoft Conversions API (capi.uet.microsoft.com) met gedeelde event-ID’s, gehashte identifiers en toestemmingssignalen.",
    accessNote: null,
    publicIds: { uet_tag_id: "UET-tag-ID" },
  },
  linkedin: {
    summary: "Insight Tag en Conversions API met li_fat_id-matching en geversioneerde REST-endpoints.",
    accessNote: "De Conversions API vereist het Advertising API-product in je LinkedIn-app.",
    publicIds: { partner_id: "Partner-ID van de Insight Tag", ad_account_id: "Advertentieaccount-ID" },
  },
  reddit: {
    summary: "Reddit Pixel en Conversions API met rdt_cid en testmodus.",
    accessNote: null,
    publicIds: { pixel_id: "Pixel-/advertentieaccount-ID" },
  },
  pinterest: {
    summary: "Pinterest Tag en Conversions API met epik-click-ID’s.",
    accessNote: null,
    publicIds: { tag_id: "Pinterest-tag-ID", ad_account_id: "Advertentieaccount-ID" },
  },
  snapchat: {
    summary: "Snap Pixel en Conversions API v3 met ScCid-matching.",
    accessNote: null,
    publicIds: { pixel_id: "Snap Pixel-ID" },
  },
  x: {
    summary: "X Pixel en Conversion API met twclid.",
    accessNote: null,
    publicIds: { pixel_id: "X Pixel-ID" },
  },
  taboola: {
    summary: "Taboola Pixel en server-to-server-conversietracking met tblci.",
    accessNote: null,
    publicIds: { account_id: "Taboola-account-ID (numeriek)" },
  },
  outbrain: {
    summary: "Outbrain Pixel en server-to-server-conversies met ob_click_id / dicbo.",
    accessNote: null,
    publicIds: { marketer_id: "Outbrain-marketer-ID" },
  },
  amazon: {
    summary: "Amazon Ad Tag plus Conversions API via de Amazon Ads API.",
    accessNote: "Toegang tot de Conversions API hangt af van je Amazon Ads-account en regio; conversiedefinities moeten in het Ads-account bestaan voordat events worden geaccepteerd.",
    publicIds: { tag_id: "Amazon Ad Tag-ID", account_id: "Amazon Ads-account-ID", region: "API-regio (NA, EU, FE)", data_set_name: "Naam van de dataset van de Events API" },
  },
  spotify: {
    summary: "Spotify Pixel en Conversions API.",
    accessNote: null,
    publicIds: { pixel_id: "Spotify-pixelsleutel" },
  },
  quora: {
    summary: "Quora Pixel en Conversion API met qclid.",
    accessNote: null,
    publicIds: { pixel_id: "Quora-pixel-ID", account_id: "Advertentieaccount-ID" },
  },
  yahoo: {
    summary: "Yahoo Dot-pixel en Conversion API.",
    accessNote: null,
    publicIds: { pixel_id: "Yahoo-pixel-ID", project_id: "Project-ID van de Dot-tag" },
  },
  tradedesk: {
    summary: "Universal Pixel en Real-Time Conversion Events API.",
    accessNote: "Serverevents worden alleen geaccepteerd voor pixels of event trackers die al in het The Trade Desk-platform voor je adverteerder bestaan.",
    publicIds: { advertiser_id: "Adverteerder-ID", pixel_id: "Universal Pixel-ID", tracker_id: "Event tracker-ID" },
  },
  "google-marketing-platform": {
    summary: "Floodlight-tags plus server-side Floodlight-conversies voor CM360, DV360 en SA360.",
    accessNote: null,
    publicIds: { floodlight_configuration_id: "Floodlight-configuratie-ID (adverteerder)", profile_id: "CM360-gebruikersprofiel-ID" },
  },
  adroll: {
    summary: "AdRoll Pixel plus Conversions and Events API.",
    accessNote: "De Conversions and Events API is een afgeschermde bèta; AdRoll moet deze voor je account activeren. De pixel werkt ook zonder.",
    publicIds: { advertiser_id: "Advertisable-EID", pixel_id: "Pixel-EID" },
  },
  criteo: {
    summary: "Criteo OneTag plus de officieel beschikbare server-side event-endpoints.",
    accessNote: "Server-side events hangen af van het Criteo-product dat voor je account is geactiveerd.",
    publicIds: { account_id: "Criteo-account-ID (partner-ID)" },
  },
  "affiliate-postbacks": {
    summary: "Universele server-to-server-postbacks met presets voor Awin, CJ, Impact, TradeTracker, Tradedoubler, Partnerize, Rakuten, Webgains, Digistore24, Adcell, Belboon, TUNE en Everflow.",
    accessNote: null,
    publicIds: { preset: "Netwerkpreset" },
  },
  webhook: {
    summary: "Ondertekende JSON-webhooks naar je eigen systemen met velden op een allowlist.",
    accessNote: null,
    publicIds: { url: "Endpoint-URL (https)" },
  },
  shopify: {
    summary: "Web pixel-extensie plus geverifieerde order- en refund-webhooks.",
    accessNote: null,
    publicIds: { shop_domain: "Shopdomein", default_currency: "Fallbackvaluta" },
  },
  woocommerce: {
    summary: "Kleine plugin met ondertekende orderwebhooks en een browseradapter.",
    accessNote: null,
    publicIds: { shop_domain: "Shopdomein", default_currency: "Fallbackvaluta" },
  },
  shopware: {
    summary: "Shopware-app met storefront-script en ondertekende orderwebhooks.",
    accessNote: null,
    publicIds: { shop_domain: "Shopdomein", default_currency: "Fallbackvaluta", purchase_on: "Aankoopmoment (betaald of geplaatst)" },
  },
};
