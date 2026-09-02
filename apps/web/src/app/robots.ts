import type { MetadataRoute } from "next";
import { baseUrl } from "@/lib/seo";

/** Marketing pages are indexable; app, auth, API, CDN and preview paths are not. */
export default function robots(): MetadataRoute.Robots {
  const disallow = ["/app", "/api", "/cdn", "/login", "/signup", "/verify-email", "/forgot-password", "/reset-password", "/two-factor", "/accept-invitation", "/de/login", "/de/signup", "/de/verify-email", "/de/forgot-password", "/de/reset-password", "/de/two-factor", "/de/accept-invitation", "/*?preview=", "/*?test="];
  return {
    rules: [{ userAgent: "*", allow: "/", disallow }],
    sitemap: `${baseUrl()}/sitemap.xml`,
    host: baseUrl(),
  };
}
