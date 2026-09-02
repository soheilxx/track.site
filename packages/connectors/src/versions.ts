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
  x: { version: env("X_ADS_API_VERSION", "12"), verifiedAt: "pending", sunsetWatch: null, docsUrl: "https://developer.x.com/en/docs/x-ads-api/measurement/api-reference/web-conversions", envVar: "X_ADS_API_VERSION" },
  taboola: { version: "s2s-v1", verifiedAt: "pending", sunsetWatch: null, docsUrl: "https://help.taboola.com/hc/en-us/articles/360003484314-Server-to-Server-S2S-Conversion-Tracking", envVar: null },
  outbrain: { version: "s2s-v1", verifiedAt: "pending", sunsetWatch: null, docsUrl: "https://www.outbrain.com/help/advertisers/server-to-server-conversion-tracking/", envVar: null },
  amazon: { version: "v1", verifiedAt: "pending", sunsetWatch: null, docsUrl: "https://advertising.amazon.com/API/docs/en-us/amazon-attribution-prod-3p/conversions-api", envVar: null },
  spotify: { version: "v1", verifiedAt: "pending", sunsetWatch: null, docsUrl: "https://ads.spotify.com/en-US/help/pixel/", envVar: null },
  quora: { version: "v1", verifiedAt: "pending", sunsetWatch: null, docsUrl: "https://quoraadsupport.zendesk.com/hc/en-us/articles/4406385106068-Quora-Conversion-API", envVar: null },
  yahoo: { version: "v1", verifiedAt: "pending", sunsetWatch: null, docsUrl: "https://developer.yahooinc.com/native/guide/conversions-api/", envVar: null },
  tradedesk: { version: "v1", verifiedAt: "pending", sunsetWatch: null, docsUrl: "https://partner.thetradedesk.com/v1/portal/data/doc/DataConversionEventsApi", envVar: null },
  gmp: { version: env("CM360_API_VERSION", "v5"), verifiedAt: "pending", sunsetWatch: null, docsUrl: "https://developers.google.com/doubleclick-advertisers/guides/conversions_upload", envVar: "CM360_API_VERSION" },
  adroll: { version: "v1", verifiedAt: "pending", sunsetWatch: null, docsUrl: "https://help.adroll.com/hc/en-us/articles/360051908791", envVar: null },
  criteo: { version: env("CRITEO_API_VERSION", "2026-07"), verifiedAt: "pending", sunsetWatch: null, docsUrl: "https://developers.criteo.com/marketing-solutions/docs/conversion-api", envVar: "CRITEO_API_VERSION" },
  affiliate: { version: "postback-v1", verifiedAt: "2026-09-03", sunsetWatch: null, docsUrl: "https://track.site/docs/connectors/affiliate-postbacks", envVar: null },
} as const satisfies Record<string, ApiVersionPin>;

export function sunsetWarning(pin: ApiVersionPin, now: Date = new Date(), daysAhead = 60): string | null {
  if (!pin.sunsetWatch) return null;
  const sunset = new Date(pin.sunsetWatch).getTime();
  const days = Math.ceil((sunset - now.getTime()) / 86_400_000);
  return days <= daysAhead ? `API version ${pin.version} sunsets in ${days} days (${pin.sunsetWatch})` : null;
}

export function unverifiedPins(): string[] {
  return Object.entries(API_VERSIONS).filter(([, p]) => p.verifiedAt === "pending").map(([k]) => k);
}
