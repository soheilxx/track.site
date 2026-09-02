/**
 * Central API version pins. `verifiedAt` documents when the endpoint/version was checked against the
 * official vendor documentation ("pending" = not yet verified against the primary source, see
 * docs/integrations-matrix.md); `sunsetWatch` carries the documented deprecation date if any.
 * Never hard-code versions in adapters; read them from here (env overrides allowed).
 */
export interface ApiVersionPin {
  version: string;
  verifiedAt: string;
  sunsetWatch: string | null;
  docsUrl: string;
  envVar: string | null;
}

const env = (name: string, fallback: string): string => process.env[name] ?? fallback;

export const API_VERSIONS = {
  webhook: { version: "1", verifiedAt: "2026-09-02", sunsetWatch: null, docsUrl: "https://track.site/docs/connectors/webhook", envVar: null },
  meta: { version: env("META_GRAPH_API_VERSION", "v25.0"), verifiedAt: "2026-09-02", sunsetWatch: null, docsUrl: "https://developers.facebook.com/docs/marketing-api/conversions-api/using-the-api", envVar: "META_GRAPH_API_VERSION" },
  ga4: { version: "mp-v2", verifiedAt: "2026-09-02", sunsetWatch: null, docsUrl: "https://developers.google.com/analytics/devguides/collection/protocol/ga4/reference", envVar: null },
  google_ads: { version: env("GOOGLE_ADS_API_VERSION", "v25"), verifiedAt: "2026-09-03", sunsetWatch: null, docsUrl: "https://developers.google.com/google-ads/api/docs/conversions/upload-clicks", envVar: "GOOGLE_ADS_API_VERSION" },
  tiktok: { version: env("TIKTOK_API_VERSION", "v1.3"), verifiedAt: "2026-09-03", sunsetWatch: null, docsUrl: "https://business-api.tiktok.com/portal/docs?id=1771100865818625", envVar: "TIKTOK_API_VERSION" },
  microsoft: { version: "v1", verifiedAt: "2026-09-03", sunsetWatch: null, docsUrl: "https://learn.microsoft.com/en-us/advertising/guides/uet-conversion-api-integration?view=bingads-13", envVar: null },
  linkedin: { version: env("LINKEDIN_API_VERSION", "202608"), verifiedAt: "2026-09-03", sunsetWatch: "2027-08-17", docsUrl: "https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads-reporting/conversions-api", envVar: "LINKEDIN_API_VERSION" },
  reddit: { version: env("REDDIT_API_VERSION", "v3"), verifiedAt: "2026-09-03", sunsetWatch: null, docsUrl: "https://ads-api.reddit.com/docs/v3/guides/programs/capi/direct-integration", envVar: "REDDIT_API_VERSION" },
  pinterest: { version: "v5", verifiedAt: "2026-09-03", sunsetWatch: null, docsUrl: "https://developers.pinterest.com/docs/track-conversions/track-conversions-in-the-api/", envVar: null },
  snapchat: { version: "v3", verifiedAt: "2026-09-03", sunsetWatch: null, docsUrl: "https://developers.snap.com/api/marketing-api/Conversions-API/Parameters", envVar: null },
  x: { version: env("X_ADS_API_VERSION", "12"), verifiedAt: "2026-09-03", sunsetWatch: null, docsUrl: "https://docs.x.com/x-ads-api/measurement/web-conversions", envVar: "X_ADS_API_VERSION" },
  taboola: { version: "log/3", verifiedAt: "2026-09-03", sunsetWatch: null, docsUrl: "https://developers.taboola.com/pixel/docs/bulk-submit-s2s-conversions", envVar: null },
  outbrain: { version: "unifiedPixel", verifiedAt: "2026-09-03", sunsetWatch: null, docsUrl: "https://www.outbrain.com/help/advertisers/server2server-integrations/", envVar: null },
  amazon: { version: "events-v1", verifiedAt: "2026-09-03 (secondary: Commanders Act / MetaRouter references; portal renders client-side)", sunsetWatch: null, docsUrl: "https://advertising.amazon.com/API/docs/en-us/guides/events/overview", envVar: null },
  spotify: { version: "pixel-v1", verifiedAt: "2026-09-03", sunsetWatch: null, docsUrl: "https://help.adanalytics.spotify.com/server-side-gtm-ssgtm-integration-1", envVar: null },
  quora: { version: "v1", verifiedAt: "2026-09-03 (help center + Commanders Act reference; OpenAPI requires Quora Ads login)", sunsetWatch: null, docsUrl: "https://www.quora.com/ads/conversion_api_doc", envVar: "QUORA_CAPI_ENDPOINT" },
  yahoo: { version: "v1", verifiedAt: "2026-09-03", sunsetWatch: null, docsUrl: "https://help.yahooinc.com/dsp-api/docs/standard-yahoo-conversion-api", envVar: null },
  tradedesk: { version: "realtimeconversion", verifiedAt: "2026-09-03 (secondary: Tealium / Adobe / RudderStack references; partner portal requires login)", sunsetWatch: null, docsUrl: "https://partner.thetradedesk.com/v3/portal/data/doc/DataConversionEventsApi", envVar: null },
  gmp: { version: env("CM360_API_VERSION", "v5"), verifiedAt: "2026-09-03", sunsetWatch: null, docsUrl: "https://developers.google.com/doubleclick-advertisers/rest/v5/conversions/batchinsert", envVar: "CM360_API_VERSION" },
  adroll: { version: "s2s-beta", verifiedAt: "2026-09-03", sunsetWatch: null, docsUrl: "https://apidocs.nextroll.com/server-to-server-api/reference.html", envVar: null },
  criteo: { version: "s2s_v1.0.0", verifiedAt: "2026-09-03", sunsetWatch: null, docsUrl: "https://guides.criteotilt.com/onetag/s2s/", envVar: null },
  affiliate: { version: "postback-v1", verifiedAt: "2026-09-03", sunsetWatch: null, docsUrl: "https://track.site/docs/connectors/affiliate-postbacks", envVar: null },
} as const satisfies Record<string, ApiVersionPin>;

export function sunsetWarning(pin: ApiVersionPin, now: Date = new Date(), daysAhead = 60): string | null {
  if (!pin.sunsetWatch) return null;
  const sunset = new Date(pin.sunsetWatch).getTime();
  const days = Math.ceil((sunset - now.getTime()) / 86_400_000);
  return days <= daysAhead ? `API version ${pin.version} sunsets in ${days} days (${pin.sunsetWatch})` : null;
}

export function unverifiedPins(): string[] {
  return Object.entries(API_VERSIONS).filter(([, p]) => (p.verifiedAt as string) === "pending" || (p.verifiedAt as string).includes("(")).map(([k]) => k);
}
