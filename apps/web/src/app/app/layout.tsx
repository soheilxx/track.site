import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app/shell";
import { ThemeScript } from "@/components/theme-script";
import { loadMessages } from "@/i18n/request";
import { LOCALE_COOKIE, isLocale, routing } from "@/i18n/routing";
import { getOrgContext, getSession } from "@/server/session";
import { bodyClassName, fontClassName } from "../fonts";
import "../globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Track", template: "%s · Track" },
};

/**
 * Dashboard root layout (app.track.site). It renders its own `<html lang>`: the dashboard has no
 * locale segment, so the language comes from the user preference or the NEXT_LOCALE cookie, which
 * is fine here because the whole tree is dynamic anyway. Requires a verified session; without an
 * organization the user is sent to organization onboarding.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  const path = (await headers()).get("x-invoke-path") ?? "";
  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  // auth pages live under the locale prefix: go there directly instead of via the /login → /en/login redirect
  if (!session) redirect(`/${isLocale(cookieLocale) ? cookieLocale : routing.defaultLocale}/login?next=${encodeURIComponent(path || "/app")}`);
  const locale = isLocale(session.user.locale) ? session.user.locale : isLocale(cookieLocale) ? cookieLocale : routing.defaultLocale;
  const messages = await loadMessages(locale);
  const ctx = await getOrgContext();
  return (
    <html lang={locale} suppressHydrationWarning className={fontClassName}>
      <head>
        <ThemeScript />
      </head>
      <body className={bodyClassName}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AppShell user={{ name: session.user.name, email: session.user.email }} organization={ctx ? { name: ctx.organization.name, role: ctx.role } : null} locale={locale}>
            {children}
          </AppShell>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
