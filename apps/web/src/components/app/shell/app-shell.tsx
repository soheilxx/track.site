"use client";

import { Menu as MenuIcon, Search, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition, type ReactNode } from "react";
import { Brand, Button, IconButton, Kbd, Sheet, cn } from "@track-site/ui";
import { useAssistant } from "@/components/chat/assistant-store";
import { authClient } from "@/lib/auth-client";
import { setActiveSiteAction } from "./actions";
import { AssistantHost } from "./assistant-host";
import { CommandPalette } from "./command-palette";
import { EnvironmentIndicator } from "./environment-indicator";
import { DashboardNav } from "./nav";
import type { ShellProps } from "./types";
import { UserMenu } from "./user-menu";
import { WorkspaceSwitcher } from "./workspace-switcher";

/**
 * Viewport-fixed dashboard shell (redesign supplement §8/§9): header (workspace switcher, environment
 * indicator, command palette, Track AI launcher, account) over three independent scroll areas —
 * navigation | main | Track AI panel — built with `minmax(0, 1fr)` / `min-h-0` / `min-w-0` so the
 * document itself never scrolls. Below `lg` the navigation is a drawer and the panel an overlay or
 * bottom sheet; the launcher stays visible in the header and, on small screens, in the safe area.
 */
export function AppShell({ user, organization, organizations, workspace, destinations, locale, children }: ShellProps & { children: ReactNode }) {
  const t = useTranslations("shell");
  const router = useRouter();
  const assistant = useAssistant();
  const [navOpen, setNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [, startTransition] = useTransition();

  const logout = useCallback(async () => {
    await authClient.signOut();
    // the login page lives under the localized root layout: the router performs the document load
    router.push(`/${locale}/login`);
  }, [router, locale]);

  const switchSite = useCallback(
    (siteId: string) => {
      startTransition(async () => {
        const result = await setActiveSiteAction({ siteId });
        if (result.ok) router.refresh();
      });
    },
    [router],
  );

  const openAssistant = useCallback(() => {
    assistant.setOpen(true);
    requestAnimationFrame(() => assistant.focusComposer());
  }, [assistant]);
  const assistantOpen = assistant.open === true;

  return (
    <div data-testid="app-shell" className="grid h-dvh grid-rows-[auto_minmax(0,1fr)] bg-ground text-ink">
      <a href="#main" className="skip-link">
        {t("skipToContent")}
      </a>
      <header className="flex h-14 shrink-0 items-center gap-1.5 border-b border-line bg-surface px-2 sm:gap-2 sm:px-4">
        <IconButton label={navOpen ? t("nav.closeMenu") : t("nav.openMenu")} className="lg:hidden" aria-expanded={navOpen} aria-controls="app-nav-drawer" onClick={() => setNavOpen(true)}>
          <MenuIcon className="size-5" aria-hidden="true" />
        </IconButton>
        <Link href="/app" aria-label={t("brandHome")} className="mr-1 flex items-center rounded-[var(--radius-control-sm)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:hidden">
          <Brand size={26} textClassName="hidden text-base sm:inline" />
        </Link>
        <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-3">
          <WorkspaceSwitcher organization={organization} organizations={organizations} workspace={workspace} />
          <div className="hidden sm:block">
            <EnvironmentIndicator siteId={workspace?.site?.id ?? null} environments={workspace?.environments ?? []} environment={workspace?.environment ?? null} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <Button variant="secondary" size="sm" className="hidden md:inline-flex" onClick={() => setPaletteOpen(true)} leadingIcon={<Search className="size-4" aria-hidden="true" />} aria-keyshortcuts="Control+K Meta+K">
            <span className="text-ink-3">{t("palette.trigger")}</span>
            <Kbd className="ml-2">Ctrl K</Kbd>
          </Button>
          <IconButton label={t("palette.title")} className="md:hidden" onClick={() => setPaletteOpen(true)}>
            <Search className="size-5" aria-hidden="true" />
          </IconButton>
          <Button
            variant={assistantOpen ? "secondary" : "primary"}
            size="sm"
            onClick={() => (assistantOpen ? assistant.setOpen(false) : openAssistant())}
            aria-pressed={assistantOpen}
            aria-label={assistantOpen ? t("assistant.close") : t("assistant.open")}
            leadingIcon={<Sparkles className="size-4" aria-hidden="true" />}
            data-testid="assistant-launcher"
          >
            <span className="hidden sm:inline">{t("assistant.launcher")}</span>
          </Button>
          <UserMenu user={user} role={organization?.role ?? null} onLogout={() => void logout()} />
        </div>
      </header>

      <div className="grid min-h-0 grid-cols-[auto_minmax(0,1fr)_auto]">
        <aside className="hidden min-h-0 w-60 shrink-0 flex-col border-r border-line bg-surface lg:flex" aria-label={t("nav.label")}>
          <div className="shrink-0 px-4 pb-2 pt-4">
            <Link href="/app" aria-label={t("brandHome")} className="inline-flex rounded-[var(--radius-control-sm)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              <Brand size={30} textClassName="text-lg" />
            </Link>
          </div>
          <div className="relative min-h-0 flex-1 overflow-y-auto px-3 py-2">
            <DashboardNav />
          </div>
          <div className="shrink-0 border-t border-line px-4 py-3 text-xs text-ink-3">
            <p className="truncate font-medium text-ink-2">{user.name}</p>
            <p className="truncate">{user.email}</p>
          </div>
        </aside>

        {/* `relative`: the scroll area is the containing block of its absolutely positioned descendants (sr-only captions/headings, tooltips), otherwise they escape the clip and grow the document's scrollable overflow */}
        <main id="main" tabIndex={-1} className="relative min-h-0 min-w-0 overflow-y-auto overflow-x-clip outline-none" data-testid="app-main">
          <div className={cn("mx-auto w-full max-w-wide px-4 py-6 sm:px-6 lg:px-8", "pb-24 lg:pb-8")}>
            <div className="mb-4 sm:hidden">
              <EnvironmentIndicator siteId={workspace?.site?.id ?? null} environments={workspace?.environments ?? []} environment={workspace?.environment ?? null} />
            </div>
            {children}
          </div>
        </main>

        <AssistantHost />
      </div>

      {assistant.open !== true ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-end p-4 pb-safe lg:hidden">
          <Button className="pointer-events-auto mb-4 shadow-pop" onClick={openAssistant} leadingIcon={<Sparkles className="size-4" aria-hidden="true" />} aria-label={t("assistant.open")} data-testid="assistant-fab">
            {t("assistant.launcher")}
          </Button>
        </div>
      ) : null}

      <Sheet open={navOpen} onClose={() => setNavOpen(false)} side="left" title={t("nav.menuTitle")} closeLabel={t("nav.closeMenu")} className="max-w-xs">
        <div id="app-nav-drawer" className="-mx-2">
          <DashboardNav onNavigate={() => setNavOpen(false)} />
        </div>
      </Sheet>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} sites={workspace?.sites ?? []} activeSiteId={workspace?.site?.id ?? null} destinations={destinations} onSwitchSite={switchSite} assistantOpen={assistantOpen} onToggleAssistant={() => (assistantOpen ? assistant.setOpen(false) : openAssistant())} onLogout={() => void logout()} />
    </div>
  );
}
