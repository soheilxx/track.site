/**
 * Deterministic technology detection from public HTML. Returns only signal names and counts,
 * never page content, so results are safe to hand to the model. Detection is evidence with a
 * confidence score; the customer always confirms.
 */
export type DetectedPlatform = "shopify" | "woocommerce" | "shopware" | "wordpress" | "headless" | "custom" | "unknown";

export interface SiteInspection {
  platform: DetectedPlatform;
  confidence: number;
  signals: string[];
  cmp: "usercentrics" | "cookiebot" | "onetrust" | "tcf" | "unknown";
  existingTags: string[];
  hasDataLayer: boolean;
  isEcommerceLikely: boolean;
  title: string | null;
  language: string | null;
}

const PLATFORM_SIGNALS: Array<{ platform: DetectedPlatform; weight: number; re: RegExp; name: string }> = [
  { platform: "shopify", weight: 0.6, re: /cdn\.shopify\.com/i, name: "shopify_cdn" },
  { platform: "shopify", weight: 0.4, re: /Shopify\.(theme|shop|routes)/i, name: "shopify_global" },
  { platform: "shopify", weight: 0.3, re: /\/cdn\/shop\//i, name: "shopify_shop_path" },
  { platform: "woocommerce", weight: 0.6, re: /wp-content\/plugins\/woocommerce/i, name: "woocommerce_plugin" },
  { platform: "woocommerce", weight: 0.3, re: /\bwoocommerce\b/i, name: "woocommerce_class" },
  { platform: "shopware", weight: 0.6, re: /\/bundles\/storefront\//i, name: "shopware_storefront" },
  { platform: "shopware", weight: 0.4, re: /\bshopware\b/i, name: "shopware_marker" },
  { platform: "wordpress", weight: 0.5, re: /wp-content\/|wp-includes\//i, name: "wordpress_assets" },
  { platform: "headless", weight: 0.4, re: /__NEXT_DATA__|\/_next\/static/i, name: "nextjs" },
  { platform: "headless", weight: 0.4, re: /\/_nuxt\//i, name: "nuxt" },
  { platform: "headless", weight: 0.2, re: /data-reactroot|id="__next"/i, name: "react_root" },
];

const TAG_SIGNALS: Array<{ name: string; re: RegExp }> = [
  { name: "google_tag_manager", re: /googletagmanager\.com\/gtm\.js/i },
  { name: "gtag", re: /googletagmanager\.com\/gtag\/js/i },
  { name: "ga4", re: /gtag\/js\?id=G-/i },
  { name: "google_ads", re: /AW-\d{6,}/ },
  { name: "meta_pixel", re: /connect\.facebook\.net|fbq\(/i },
  { name: "tiktok_pixel", re: /analytics\.tiktok\.com|ttq\./i },
  { name: "linkedin_insight", re: /snap\.licdn\.com|_linkedin_partner_id/i },
  { name: "reddit_pixel", re: /redditstatic\.com\/ads\/pixel|rdt\(/i },
  { name: "microsoft_uet", re: /bat\.bing\.com/i },
  { name: "pinterest_tag", re: /s\.pinimg\.com\/ct\//i },
  { name: "snap_pixel", re: /sc-static\.net\/scevent/i },
  { name: "track_site", re: /tracker\.js[^"']*["'][^>]*data-site-id/i },
];

export function inspectHtml(html: string): SiteInspection {
  const scores = new Map<DetectedPlatform, number>();
  const signals: string[] = [];
  for (const s of PLATFORM_SIGNALS) {
    if (s.re.test(html)) {
      scores.set(s.platform, (scores.get(s.platform) ?? 0) + s.weight);
      signals.push(s.name);
    }
  }
  let platform: DetectedPlatform = "unknown";
  let best = 0;
  for (const [p, score] of scores) {
    if (score > best) {
      best = score;
      platform = p;
    }
  }
  // WordPress + WooCommerce: WooCommerce wins when present
  if (scores.has("woocommerce") && platform === "wordpress") platform = "woocommerce";
  if (platform === "unknown" && html.length > 0) platform = "custom";
  const confidence = Math.min(0.95, best);
  const existingTags = TAG_SIGNALS.filter((t) => t.re.test(html)).map((t) => t.name);
  const cmp: SiteInspection["cmp"] = /app\.usercentrics\.eu|usercentrics/i.test(html) ? "usercentrics" : /consent\.cookiebot\.com/i.test(html) ? "cookiebot" : /cdn\.cookielaw\.org|onetrust/i.test(html) ? "onetrust" : /__tcfapi/i.test(html) ? "tcf" : "unknown";
  const hasDataLayer = /dataLayer\s*=|dataLayer\.push/i.test(html);
  const isEcommerceLikely = platform === "shopify" || platform === "woocommerce" || platform === "shopware" || /add[- ]?to[- ]?cart|checkout|warenkorb|in den warenkorb/i.test(html);
  const title = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i)?.[1]?.trim() ?? null;
  const language = html.match(/<html[^>]*\blang=["']([a-zA-Z-]{2,10})["']/i)?.[1] ?? null;
  return { platform, confidence: platform === "custom" ? 0.3 : confidence, signals, cmp, existingTags, hasDataLayer, isEcommerceLikely, title, language };
}
