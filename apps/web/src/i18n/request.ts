import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { isLocale, routing, type AppLocale } from "./routing";

/**
 * Marketing pages carry the locale in the URL ([locale] segment). Dashboard, API and CDN routes
 * have no locale segment; they use the NEXT_LOCALE cookie (set from the user's preference) or English.
 * Messages are split per domain (common, auth, app, marketing) and merged here.
 */
const NAMESPACES = ["common", "auth", "app", "chat", "destinations", "marketing"] as const;

export async function loadMessages(locale: AppLocale): Promise<Record<string, unknown>> {
  const parts = await Promise.all(
    NAMESPACES.map(async (ns) => {
      try {
        return (await import(`../../messages/${locale}/${ns}.json`)).default as Record<string, unknown>;
      } catch {
        return {};
      }
    }),
  );
  return Object.assign({}, ...parts);
}

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;
  if (!isLocale(locale)) {
    const cookieLocale = (await cookies()).get("NEXT_LOCALE")?.value;
    locale = isLocale(cookieLocale) ? cookieLocale : routing.defaultLocale;
  }
  return { locale, messages: await loadMessages(locale as AppLocale), timeZone: "Europe/Berlin" };
});
