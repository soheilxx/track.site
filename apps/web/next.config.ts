import { config as loadDotenv } from "dotenv";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import path from "node:path";
import { KNOWLEDGE_LEGACY_REDIRECTS, LEGACY_UNPREFIXED_PATHS } from "./src/lib/routes";

// The monorepo keeps one .env at the root; Next.js only reads the app directory by default.
loadDotenv({ path: path.resolve(process.cwd(), "../../.env"), quiet: true });

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const isProd = process.env.NODE_ENV === "production";
const ingest = process.env.NEXT_PUBLIC_HOST_INGEST ?? "http://localhost:3100";
const cdn = process.env.NEXT_PUBLIC_HOST_CDN ?? "http://localhost:3000/cdn";
const origins = (u: string) => {
  try {
    return new URL(u).origin;
  } catch {
    return "";
  }
};
const hostnameOf = (u: string | undefined) => {
  if (!u) return null;
  try {
    return new URL(u).hostname.toLowerCase();
  } catch {
    return null;
  }
};

/** Strict but workable CSP: our own scripts, Stripe, and connect to ingest/cdn/OpenAI-free (server only). */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://js.stripe.com${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  `connect-src 'self' ${origins(ingest)} ${origins(cdn)} https://api.stripe.com`,
  "frame-src https://js.stripe.com https://hooks.stripe.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  isProd ? "upgrade-insecure-requests" : "",
]
  .filter(Boolean)
  .join("; ");

/** Cache lifetimes of assets that only change with a deploy (favicons, manifest, brand files) and of generated social cards. */
const STATIC_ASSET_CACHE = "public, max-age=86400, stale-while-revalidate=604800";
const SOCIAL_CARD_CACHE = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }] : []),
];

/**
 * The unprefixed English marketing URLs redirect permanently to `/en/...`. next.config redirects run
 * before the proxy, so they must not fire on the dedicated dashboard/API/CDN hosts (which the proxy
 * rewrites to /app, /api, /cdn); locally every host is the same and the list applies unconditionally.
 */
const marketingHost = hostnameOf(process.env.HOST_MARKETING);
const dedicatedHosts = [process.env.HOST_APP, process.env.HOST_API, process.env.HOST_CDN]
  .map(hostnameOf)
  .filter((h): h is string => Boolean(h) && h !== marketingHost);
const notOnDedicatedHost = dedicatedHosts.map((h) => ({ type: "host" as const, value: h.replace(/\./g, "\\.") }));

/**
 * Dashboard paths renamed by the task-oriented navigation (redesign supplement §8). Permanent
 * redirects, query string preserved. On the dedicated app host the proxy prefixes `/app` only
 * AFTER these redirects ran, so each rule exists twice: `/app/<old>` (marketing host / local) and
 * `/<old>` restricted to the app host.
 *
 * Only add a rule once its target route exists in `src/app/app`: a 308 is cached by browsers, so a
 * redirect onto a missing page turns a working module into a permanent 404. The Event Debugger became
 * the Live Event Explorer (its `site`, `event` and `name` parameters are understood there; the query
 * string is carried over) and audiences moved into the Insights module.
 */
const DASHBOARD_LEGACY_PATHS: ReadonlyArray<[from: string, to: string]> = [
  ["/setup", "/ai-setup"],
  ["/debugger", "/events/explorer"],
  ["/audiences", "/insights/audiences"],
];
const appHost = hostnameOf(process.env.HOST_APP);
const onAppHost = appHost && appHost !== marketingHost ? [{ type: "host" as const, value: appHost.replace(/\./g, "\\.") }] : null;

const nextConfig: NextConfig = {
  // Analysis builds (bundle attribution for docs/qa): `NEXT_DIST_DIR=.next-analysis NEXT_SOURCEMAPS=1 next build`
  // writes a separate output directory with browser source maps and leaves `.next` (served by `next start`) untouched.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  productionBrowserSourceMaps: process.env.NEXT_SOURCEMAPS === "1",
  experimental: {
    // No shared root layout (marketing `[locale]` and dashboard `/app` render their own `<html>`),
    // so the 404 for unmatched non-localized paths is `src/app/global-not-found.tsx`.
    globalNotFound: true,
  },
  async redirects() {
    const marketingOnly = notOnDedicatedHost.length ? { missing: notOnDedicatedHost } : {};
    return [
      ...DASHBOARD_LEGACY_PATHS.flatMap(([from, to]) => [
        { source: `/app${from}`, destination: `/app${to}`, permanent: true },
        ...(onAppHost ? [{ source: from, destination: to, permanent: true, has: onAppHost }] : []),
      ]),
      // Blog → Tracking Knowledge (supplement §6): direct 301s for old article, index and feed URLs,
      // prefixed and unprefixed, so no request is answered with a chain through `/en/blog/...`.
      ...KNOWLEDGE_LEGACY_REDIRECTS.map((r) => ({
        source: r.source,
        destination: r.destination,
        permanent: true,
        ...(r.unprefixed ? marketingOnly : {}),
      })),
      ...LEGACY_UNPREFIXED_PATHS.map((source) => ({
        source,
        destination: `/en${source === "/" ? "" : source}`,
        permanent: true,
        ...marketingOnly,
      })),
    ];
  },
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: [
    "@track-site/ui",
    "@track-site/core",
    "@track-site/db",
    "@track-site/events",
    "@track-site/policy",
    "@track-site/config",
    "@track-site/connectors",
    "@track-site/ai",
    "@track-site/analytics",
    "@track-site/catalog",
    "@track-site/queue",
    "@track-site/sdk",
  ],
  serverExternalPackages: ["pg", "pino", "pino-pretty", "undici", "@aws-sdk/client-kms", "@aws-sdk/client-sqs", "@clickhouse/client"],
  images: { formats: ["image/avif", "image/webp"] },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      { source: "/cdn/:path*", headers: [{ key: "Access-Control-Allow-Origin", value: "*" }] },
      // Static brand assets and app icons change only with a deploy: a day in the browser cache, a week
      // stale-while-revalidate. (`/_next/static` is already served immutable by Next.js.)
      { source: "/brand/:path*", headers: [{ key: "Cache-Control", value: STATIC_ASSET_CACHE }] },
      { source: "/:file(icon\\.svg|apple-icon\\.png|manifest\\.webmanifest)", headers: [{ key: "Cache-Control", value: STATIC_ASSET_CACHE }] },
      // Generated social cards of Tracking Knowledge (route handlers): cache at the edge and in the
      // browser; a card changes only when an article title changes.
      { source: "/:locale(en|de|fr|es|it|nl)/tracking-knowledge/card.png", headers: [{ key: "Cache-Control", value: SOCIAL_CARD_CACHE }] },
      { source: "/:locale(en|de|fr|es|it|nl)/tracking-knowledge/:slug/card.png", headers: [{ key: "Cache-Control", value: SOCIAL_CARD_CACHE }] },
    ];
  },
};

export default withNextIntl(nextConfig);
