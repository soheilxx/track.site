import { cookies } from "next/headers";
import { getSession } from "@/server/session";
import { getRequestConfig } from "next-intl/server";
import { NAMESPACES } from "./namespaces";
import { isLocale, routing, type AppLocale } from "./routing";

/**
 * Marketing pages carry the locale in the URL ([locale] segment). Dashboard, API and CDN routes
 * have no locale segment; they use the NEXT_LOCALE cookie (set from the user's preference) or English.
 * Messages are split per namespace (`namespaces.ts`: one JSON file per namespace and locale, each
 * module registers its own) and merged here in registration order.
 */
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
    // dashboard routes: the signed-in user's preference wins, then the NEXT_LOCALE cookie, then English
    const session = await getSession().catch(() => null);
    const userLocale = session?.user.locale;
    const cookieLocale = (await cookies()).get("NEXT_LOCALE")?.value;
    locale = isLocale(userLocale) ? userLocale : isLocale(cookieLocale) ? cookieLocale : routing.defaultLocale;
  }
  return { locale, messages: await loadMessages(locale as AppLocale), timeZone: "Europe/Berlin" };
});
