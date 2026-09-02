/**
 * Central API version pins. `verifiedAt` documents when the endpoint was checked against the
 * official vendor documentation; `sunsetWatch` carries the documented deprecation date if any.
 * Never hard-code versions in adapters; read them from here (env overrides allowed).
 */
export interface ApiVersionPin {
  version: string;
  verifiedAt: string;
  sunsetWatch: string | null;
  docsUrl: string;
  envVar: string | null;
}

export const API_VERSIONS = {
  webhook: { version: "1", verifiedAt: "2026-09-02", sunsetWatch: null, docsUrl: "https://track.site/docs/connectors/webhook", envVar: null },
  meta: { version: process.env.META_GRAPH_API_VERSION ?? "v23.0", verifiedAt: "pending", sunsetWatch: null, docsUrl: "https://developers.facebook.com/documentation/ads-commerce/conversions-api/get-started", envVar: "META_GRAPH_API_VERSION" },
  tiktok: { version: process.env.TIKTOK_API_VERSION ?? "v1.3", verifiedAt: "pending", sunsetWatch: null, docsUrl: "https://business-api.tiktok.com/portal/docs/setup-guide-for-web/v1.3", envVar: "TIKTOK_API_VERSION" },
  reddit: { version: process.env.REDDIT_API_VERSION ?? "v3", verifiedAt: "pending", sunsetWatch: null, docsUrl: "https://ads-api.reddit.com/docs/v3/guides/programs/capi/direct-integration", envVar: "REDDIT_API_VERSION" },
  linkedin: { version: process.env.LINKEDIN_API_VERSION ?? "202508", verifiedAt: "pending", sunsetWatch: null, docsUrl: "https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads-reporting/conversions-api", envVar: "LINKEDIN_API_VERSION" },
  ga4: { version: "mp-v2", verifiedAt: "pending", sunsetWatch: null, docsUrl: "https://developers.google.com/analytics/devguides/collection/protocol/ga4", envVar: null },
  google_ads: { version: process.env.GOOGLE_ADS_API_VERSION ?? "v21", verifiedAt: "pending", sunsetWatch: null, docsUrl: "https://developers.google.com/google-ads/api/docs/conversions/upload-online", envVar: "GOOGLE_ADS_API_VERSION" },
} as const satisfies Record<string, ApiVersionPin>;

export function sunsetWarning(pin: ApiVersionPin, now: Date = new Date(), daysAhead = 60): string | null {
  if (!pin.sunsetWatch) return null;
  const sunset = new Date(pin.sunsetWatch).getTime();
  const days = Math.ceil((sunset - now.getTime()) / 86_400_000);
  return days <= daysAhead ? `API version ${pin.version} sunsets in ${days} days (${pin.sunsetWatch})` : null;
}
