import type { Metadata } from "next";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { LocalizedPathsProvider } from "@/components/marketing/localized-paths";
import { ThemeScript } from "@/components/theme-script";
import { routing } from "@/i18n/routing";
import { BRAND_NAME, baseUrl, ogLocale } from "@/lib/seo";
import { bodyClassName, fontClassName } from "../fonts";
import "../globals.css";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/**
 * Locale-wide defaults only. Canonical + hreflang are page-specific and come from `pageMetadata()`
 * in every indexable page, so no route inherits a wrong canonical from the layout.
 */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    metadataBase: new URL(baseUrl()),
    title: { default: t("defaultTitle"), template: `%s · ${BRAND_NAME}` },
    description: t("defaultDescription"),
    openGraph: { siteName: BRAND_NAME, type: "website", locale: ogLocale(locale) },
    robots: { index: true, follow: true },
  };
}

/**
 * Root layout of the localized public tree. It renders `<html lang>` itself (there is no shared root
 * layout above the `[locale]` segment) so the locale is known statically from the URL segment:
 * `setRequestLocale` runs before any next-intl call, nothing reads request headers or cookies, and
 * every `/[locale]/**` page stays prerendered. The dashboard (`/app`) has its own root layout.
 *
 * The page chrome belongs to the route groups: `(marketing)` renders skip link → header → `<main>`
 * → footer around every public page, `(auth)` its compact frame around the auth pages. Both share
 * the providers below (messages, localized paths for the language switcher) and the default social
 * card next to this file. There is deliberately no consent dialog: the marketing site sets no
 * optional cookies or storage (see components/marketing/consent-dialog.tsx).
 */
export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();
  return (
    <html lang={locale} suppressHydrationWarning className={fontClassName}>
      <head>
        <ThemeScript />
      </head>
      <body className={bodyClassName}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <LocalizedPathsProvider>{children}</LocalizedPathsProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
