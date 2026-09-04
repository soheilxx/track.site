import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOCALE, isLocale, routing } from "./i18n/routing";

/**
 * Host routing + locale routing. Production hosts map to internal path prefixes so the same app
 * serves marketing (track.site), dashboard (app.), API (api.) and CDN (cdn.) without DNS locally:
 *   app.track.site/x  -> /app/x      api.track.site/x -> /api/x      cdn.track.site/x -> /cdn/x
 *
 * Marketing URLs always carry a locale prefix (`/en` included). An unprefixed marketing path is
 * answered with a permanent redirect to its English URL (query string preserved) — or to the
 * language the visitor chose deliberately in the switcher (NEXT_LOCALE cookie), never by geo or
 * Accept-Language detection. Every programme locale is active, so a prefixed path is passed to
 * next-intl as is; should a locale ever be withdrawn from `ACTIVE_LOCALES`, its prefix is simply
 * unknown here and is redirected like any other unprefixed path. Dashboard, API, CDN, Next
 * internals and file-like paths are never redirected or localized.
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

/** Path prefixes that are served without a locale segment. */
const UNLOCALIZED_PREFIXES = ["/app", "/api", "/cdn", "/_next"] as const;

export function isUnlocalizedPath(pathname: string): boolean {
  return UNLOCALIZED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`)) || pathname.includes(".");
}

/**
 * Redirect for marketing paths without an active locale prefix; `null` when the path is already
 * localized (or not a marketing path). Exported so the behaviour can be unit-tested without a server.
 *
 * This is the generic fallback (`/x` → `/en/x`). Legacy URLs of a renamed section must be redirected
 * to their final URL BEFORE this runs (`next.config.ts` `redirects()`), otherwise the old URL is
 * answered with a chain (`/blog/x` → `/en/blog/x` → new URL), which supplement §6 forbids.
 */
export function localeRedirect(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;
  if (isUnlocalizedPath(pathname)) return null;
  const segments = pathname.split("/").filter(Boolean);
  if (isLocale(segments[0])) return null;
  // a plain URL keeps the query string but not NextURL's remembered trailing slash
  const url = new URL(request.url);
  // a deliberate choice stored by the language switcher wins over the English default (no geo detection)
  const chosen = request.cookies.get("NEXT_LOCALE")?.value;
  const target = isLocale(chosen) ? chosen : DEFAULT_LOCALE;
  const rest = segments.join("/");
  url.pathname = `/${target}${rest ? `/${rest}` : ""}`;
  return NextResponse.redirect(url, 308);
}

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
  if (isUnlocalizedPath(pathname)) return NextResponse.next();
  const redirect = localeRedirect(request);
  if (redirect) return redirect;
  return intl(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|sitemaps/|.*\\..*).*)"],
};
