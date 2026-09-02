import { NextIntlClientProvider } from "next-intl";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app/shell";
import { loadMessages } from "@/i18n/request";
import { isLocale, routing } from "@/i18n/routing";
import { getOrgContext, getSession } from "@/server/session";

export const dynamic = "force-dynamic";

/**
 * Dashboard shell (app.track.site). Requires a verified session; without an organization the
 * user is sent to organization onboarding. The UI locale follows the user preference.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  const path = (await headers()).get("x-invoke-path") ?? "";
  if (!session) redirect(`/login?next=${encodeURIComponent(path || "/app")}`);
  const cookieLocale = (await cookies()).get("NEXT_LOCALE")?.value;
  const locale = isLocale(session.user.locale) ? session.user.locale : isLocale(cookieLocale) ? cookieLocale : routing.defaultLocale;
  const messages = await loadMessages(locale);
  const ctx = await getOrgContext();
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <AppShell user={{ name: session.user.name, email: session.user.email }} organization={ctx ? { name: ctx.organization.name, role: ctx.role } : null} locale={locale}>
        {children}
      </AppShell>
    </NextIntlClientProvider>
  );
}
