import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { OpsForbidden, OpsShell } from "@/components/ops/shell";
import { ThemeScript } from "@/components/theme-script";
import { env } from "@/env";
import { loadMessages } from "@/i18n/request";
import { isLocale, routing } from "@/i18n/routing";
import { platformGate, platformLocale } from "@/server/ops/platform";
import { fontClassName } from "../fonts";
import "../globals.css";

export const dynamic = "force-dynamic";

/** Never indexed: `robots.ts` disallows `/ops`, `next.config.ts` adds `X-Robots-Tag` and `Cache-Control: no-store`. */
export const metadata: Metadata = {
  title: { default: "Track Operations", template: "%s · Track Operations" },
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

function hostOf(value: string): string {
  try {
    return new URL(value).host;
  } catch {
    return value;
  }
}

/**
 * Track Operations root layout (`/ops`, docs/17-operations-console.md). Like the customer dashboard it renders
 * its own `<html>` (no locale segment; the operator's language comes from the account preference or the
 * NEXT_LOCALE cookie) and is viewport-fixed (`data-dashboard`). `platformGate()` redirects a signed-out
 * visitor to the login page and, for a signed-in account without platform role or without two-factor while
 * the step-up rule applies, renders the localized 403 page instead of the shell — the page component is
 * never reached in that case. Pages enforce their minimum role again with `requirePlatform`.
 */
export default async function OpsLayout({ children }: { children: ReactNode }) {
  const gate = await platformGate();
  const rawLocale = await platformLocale(gate.ok ? gate.ctx.user : gate.user);
  const locale = isLocale(rawLocale) ? rawLocale : routing.defaultLocale;
  const messages = await loadMessages(locale);
  const e = env();
  return (
    <html lang={locale} suppressHydrationWarning className={fontClassName} data-dashboard="">
      <head>
        <ThemeScript />
      </head>
      <body className="bg-ground text-ink antialiased" data-dashboard="">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {gate.ok ? (
            <OpsShell
              user={{ name: gate.ctx.user.name, email: gate.ctx.user.email }}
              platformRole={gate.ctx.platformRole}
              environment={{ appEnv: e.APP_ENV, host: hostOf(e.HOST_MARKETING) }}
              locale={locale}
            >
              {children}
            </OpsShell>
          ) : (
            <OpsForbidden reason={gate.reason} standalone />
          )}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
