import type { MetadataRoute } from "next";
import { ACTIVE_LOCALES } from "@/i18n/routing";
import { AUTH_ROUTES } from "@/lib/routes";
import { baseUrl } from "@/lib/seo";

/** Marketing pages are indexable; app, auth, API, CDN and preview paths are not. Points to the sitemap index. */
export default function robots(): MetadataRoute.Robots {
  const disallow = ["/app", "/api", "/cdn", ...ACTIVE_LOCALES.flatMap((locale) => AUTH_ROUTES.map((route) => `/${locale}${route}`)), "/*?preview=", "/*?test="];
  return {
    rules: [{ userAgent: "*", allow: "/", disallow }],
    sitemap: `${baseUrl()}/sitemap.xml`,
    host: baseUrl(),
  };
}
