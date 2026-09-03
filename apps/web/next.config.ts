import { config as loadDotenv } from "dotenv";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import path from "node:path";

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

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }] : []),
];

const nextConfig: NextConfig = {
  // the locale proxy skips file-like paths, so the unprefixed English feed maps to its locale route here
  async rewrites() {
    return [{ source: "/blog/feed.xml", destination: "/en/blog/feed.xml" }];
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
    "@track-site/queue",
    "@track-site/sdk",
  ],
  serverExternalPackages: ["pg", "pino", "pino-pretty", "undici", "@aws-sdk/client-kms", "@aws-sdk/client-sqs", "@clickhouse/client"],
  images: { formats: ["image/avif", "image/webp"] },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      { source: "/cdn/:path*", headers: [{ key: "Access-Control-Allow-Origin", value: "*" }] },
    ];
  },
};

export default withNextIntl(nextConfig);
