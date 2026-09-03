import type { Metadata } from "next";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { MarketingFooter } from "@/components/marketing/footer";
import { MarketingHeader } from "@/components/marketing/header";
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
 * Root layout of the marketing tree. It renders `<html lang>` itself (there is no shared root
 * layout above the `[locale]` segment) so the locale is known statically from the URL segment:
 * `setRequestLocale` runs before any next-intl call, nothing reads request headers or cookies, and
 * every `/[locale]/**` page stays prerendered. The dashboard (`/app`) has its own root layout.
 */
export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();
  const t = await getTranslations({ locale, namespace: "nav" });
  return (
    <html lang={locale} suppressHydrationWarning className={fontClassName}>
      <head>
        <ThemeScript />
      </head>
      <body className={bodyClassName}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <LocalizedPathsProvider>
            <div className="flex min-h-screen flex-col">
              <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:text-sm">
                {t("skipToContent")}
              </a>
              <MarketingHeader />
              <main id="main" className="flex-1">
                {children}
              </main>
              <MarketingFooter />
            </div>
          </LocalizedPathsProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
