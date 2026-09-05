import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app/shell";
import { AssistantProvider } from "@/components/chat/assistant-store";
import { ThemeScript } from "@/components/theme-script";
import { loadMessages } from "@/i18n/request";
import { LOCALE_COOKIE, isLocale, routing } from "@/i18n/routing";
import { aiConfigured } from "@/server/ai/context";
import { readAiMotion } from "@/server/preferences";
import { getOrgContext, getSession, listMemberships } from "@/server/session";
import { activeSite, paletteDestinations } from "@/server/workspace";
import { fontClassName } from "../fonts";
import "../globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Track", template: "%s · Track" },
};

/**
 * The dashboard viewport. `interactive-widget=resizes-content` keeps the Track AI composer above the
 * on-screen keyboard on Android (Chromium ≥ 108; iOS is handled via `visualViewport`), but the key is
 * Chromium-only and WebKit reports every unknown viewport key as a console error (docs/16 D21). It is
 * therefore not part of the server-rendered meta: `INTERACTIVE_WIDGET_SCRIPT` below appends it before
 * first paint where the engine exposes the VirtualKeyboard API (Chromium only), so Android keeps the
 * resize behaviour and Safari / WebKit never parse the key.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * Inline head script (fixed literal, no user data): on Chromium-class engines it appends the
 * `interactive-widget` key to the viewport meta as soon as the meta exists — synchronously when React
 * streamed it before this script, otherwise at the next head mutation and, as a safety net, on
 * DOMContentLoaded. Chromium re-processes the viewport meta on a content change, so the keyboard
 * behaviour is identical to the build-time key; the key is only added once.
 */
const INTERACTIVE_WIDGET_SCRIPT = `(function(){if(!("virtualKeyboard" in navigator))return;var apply=function(){var m=document.querySelector('meta[name="viewport"]');if(!m)return false;if(m.content.indexOf("interactive-widget")<0)m.content+=", interactive-widget=resizes-content";return true};if(apply())return;var o=new MutationObserver(function(){if(apply())o.disconnect()});o.observe(document.head,{childList:true});document.addEventListener("DOMContentLoaded",function(){apply();o.disconnect()},{once:true})})();`;

/**
 * Dashboard root layout (app.track.site). It renders its own `<html lang>`: the dashboard has no
 * locale segment, so the language comes from the user preference or the NEXT_LOCALE cookie, which
 * is fine here because the whole tree is dynamic anyway. Requires a verified session; without an
 * organization the user is sent to organization onboarding.
 *
 * The shell is viewport-fixed (`data-dashboard` scopes `overflow: hidden` to this document, see
 * globals.css). The Track AI provider sits above the shell so the conversation, running jobs and
 * the panel geometry survive every route change; the workspace (active site + environment) is
 * resolved once per request by `activeSite(ctx)` and handed to the client as plain data.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  const path = (await headers()).get("x-invoke-path") ?? "";
  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  // auth pages live under the locale prefix: go there directly instead of via the /login → /en/login redirect
  if (!session)
    redirect(
      `/${isLocale(cookieLocale) ? cookieLocale : routing.defaultLocale}/login?next=${encodeURIComponent(path || "/app")}`,
    );
  const locale = isLocale(session.user.locale)
    ? session.user.locale
    : isLocale(cookieLocale)
      ? cookieLocale
      : routing.defaultLocale;
  const messages = await loadMessages(locale);
  const ctx = await getOrgContext();
  const [workspace, organizations, destinations, aiMotion] = ctx
    ? await Promise.all([
        activeSite(ctx),
        listMemberships(),
        paletteDestinations(ctx.organization.id),
        readAiMotion(ctx),
      ])
    : [null, [], [], "system" as const];
  const environment = workspace?.environment
    ? {
        id: workspace.environment.id,
        kind: workspace.environment.kind,
        name: workspace.environment.name,
        testMode: workspace.environment.testMode,
      }
    : null;
  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={fontClassName}
      data-dashboard=""
      data-ai-motion={aiMotion}
    >
      <head>
        <ThemeScript />
        <script dangerouslySetInnerHTML={{ __html: INTERACTIVE_WIDGET_SCRIPT }} />
      </head>
      <body className="bg-ground text-ink antialiased" data-dashboard="">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AssistantProvider
            sites={workspace?.sites ?? []}
            activeSiteId={workspace?.site?.id ?? null}
            environment={environment}
            aiEnabled={aiConfigured()}
            locale={locale}
          >
            <AppShell
              user={{ name: session.user.name, email: session.user.email }}
              organization={
                ctx
                  ? {
                      id: ctx.organization.id,
                      name: ctx.organization.name,
                      slug: ctx.organization.slug,
                      role: ctx.role,
                    }
                  : null
              }
              organizations={organizations}
              workspace={
                workspace
                  ? {
                      sites: workspace.sites,
                      site: workspace.site,
                      environments: workspace.environments,
                      environment: workspace.environment,
                    }
                  : null
              }
              destinations={destinations}
              locale={locale}
            >
              {children}
            </AppShell>
          </AssistantProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
