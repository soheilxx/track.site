import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";

/**
 * Host routing + locale routing. Production hosts map to internal path prefixes so the same app
 * serves marketing (track.site), dashboard (app.), API (api.) and CDN (cdn.) without DNS locally:
 *   app.track.site/x  -> /app/x      api.track.site/x -> /api/x      cdn.track.site/x -> /cdn/x
 */
const intl = createIntlMiddleware(routing);

function hostOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
}

const HOST_APP = hostOf(process.env.HOST_APP);
const HOST_API = hostOf(process.env.HOST_API);
const HOST_CDN = hostOf(process.env.HOST_CDN);
const HOST_MARKETING = hostOf(process.env.HOST_MARKETING);

export default function proxy(request: NextRequest) {
  const host = request.headers.get("host")?.toLowerCase() ?? "";
  const { pathname } = request.nextUrl;
  const dedicated = host !== HOST_MARKETING && (host === HOST_APP || host === HOST_API || host === HOST_CDN);
  if (dedicated) {
    const prefix = host === HOST_APP ? "/app" : host === HOST_API ? "/api" : "/cdn";
    if (!pathname.startsWith(prefix)) {
      const url = request.nextUrl.clone();
      url.pathname = `${prefix}${pathname === "/" ? "" : pathname}`;
      return NextResponse.rewrite(url);
    }
    return NextResponse.next();
  }
  if (pathname.startsWith("/app") || pathname.startsWith("/api") || pathname.startsWith("/cdn") || pathname.startsWith("/_next") || pathname.includes(".")) {
    return NextResponse.next();
  }
  return intl(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|sitemap-.*\\.xml|feed\\.xml|.*\\..*).*)"],
};
