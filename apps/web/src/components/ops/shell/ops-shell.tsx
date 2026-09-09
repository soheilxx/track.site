"use client";

import { LayoutDashboard, LogOut, Menu as MenuIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState, type ReactNode } from "react";
import { Badge, BrandMark, IconButton, Sheet, buttonVariants, cn } from "@track-site/ui";
import { Menu } from "@/components/app/shell/menu";
import { authClient } from "@/lib/auth-client";
import { EnvironmentBadge } from "./environment-badge";
import { NotificationBell } from "./notifications";
import { OpsNav } from "./ops-nav";
import { useSupportNavBadge } from "./support-badge";
import type { OpsShellProps } from "./types";

function initials(name: string, email: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    parts.length >= 2
      ? `${parts[0]![0]}${parts[parts.length - 1]![0]}`
      : (parts[0]?.slice(0, 2) ?? email.slice(0, 2));
  return letters.toUpperCase();
}

/**
 * Viewport-fixed operator shell (docs/17 §"Shell"): a neutral header — "Track Operations", the platform
 * role, the environment/host badge, a link back to the customer dashboard and the account menu — over
 * navigation | main, each with its own scroll area (`minmax(0, 1fr)` / `min-h-0`, same pattern as the
 * customer dashboard shell, deliberately without workspace switcher, Track AI panel or command palette).
 * Below `lg` the navigation is a drawer.
 */
export function OpsShell({
  user,
  platformRole,
  environment,
  locale,
  children,
}: OpsShellProps & { children: ReactNode }) {
  const t = useTranslations("ops");
  const router = useRouter();
  const [navOpen, setNavOpen] = useState(false);
  // the desk's live counts for the "Support" entry (one poller for both navigation instances)
  const supportBadge = useSupportNavBadge();

  const logout = useCallback(async () => {
    await authClient.signOut();
    router.push(`/${locale}/login`);
  }, [router, locale]);

  return (
    <div
      data-testid="ops-shell"
      className="grid h-dvh grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] bg-ground text-ink"
    >
      <a href="#main" className="skip-link">
        {t("skipToContent")}
      </a>
      <header
        className="flex h-14 min-w-0 shrink-0 items-center gap-1.5 border-b border-line bg-surface px-2 sm:gap-3 sm:px-4"
        data-testid="ops-header"
      >
        <IconButton
          label={navOpen ? t("nav.closeMenu") : t("nav.openMenu")}
          className="lg:hidden"
          aria-expanded={navOpen}
          aria-controls="ops-nav-drawer"
          onClick={() => setNavOpen(true)}
        >
          <MenuIcon className="size-5" aria-hidden="true" />
        </IconButton>
        <Link
          href="/ops"
          aria-label={t("brandHome")}
          // the brand is the header's flexible item: its text truncates (and hides below `sm`) before any
          // control shrinks — the bell and the account menu keep their 40 px targets at 375 px
          className="flex min-w-0 items-center gap-2 rounded-[var(--radius-control-sm)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <BrandMark size={26} className="shrink-0" />
          <span className="hidden truncate text-sm font-semibold tracking-tight text-ink sm:inline">
            {t("title")}
          </span>
        </Link>
        <Badge
          tone={platformRole === "PLATFORM_ADMIN" ? "primary" : "info"}
          className="hidden sm:inline-flex"
          data-testid="ops-role-badge"
        >
          <span className="sr-only">{t("roleLabel")}: </span>
          {t(`roles.${platformRole}`)}
        </Badge>
        <div className="min-w-0 flex-1" />
        <div className="min-w-0 shrink-0">
          <EnvironmentBadge environment={environment} />
        </div>
        <NotificationBell />
        <Link
          href="/app"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "hidden md:inline-flex")}
        >
          <LayoutDashboard className="size-4" aria-hidden="true" />
          {t("backToDashboard")}
        </Link>
        <div className="shrink-0">
          <Menu
            label={t("user.menu")}
            triggerLabel={t("user.menu")}
            align="end"
            triggerClassName="px-1.5"
            header={
              <div className="min-w-0">
                <p className="text-xs text-ink-3">{t("user.signedInAs")}</p>
                <p className="truncate text-sm font-medium text-ink">{user.name}</p>
                <p className="truncate text-xs text-ink-3">{user.email}</p>
                <p className="mt-1 text-xs text-ink-3">
                  {t("roleLabel")}:{" "}
                  <span className="font-medium text-ink-2">{t(`roles.${platformRole}`)}</span>
                </p>
              </div>
            }
            sections={[
              {
                id: "account",
                items: [
                  {
                    id: "dashboard",
                    label: t("user.dashboard"),
                    icon: <LayoutDashboard className="size-4" aria-hidden="true" />,
                    href: "/app",
                  },
                  {
                    id: "logout",
                    label: t("user.logout"),
                    icon: <LogOut className="size-4" aria-hidden="true" />,
                    onSelect: () => void logout(),
                  },
                ],
              },
            ]}
          >
            <span
              aria-hidden="true"
              className="inline-flex size-8 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-ink-2"
            >
              {initials(user.name, user.email)}
            </span>
          </Menu>
        </div>
      </header>

      <div className="grid min-h-0 grid-cols-[auto_minmax(0,1fr)]">
        <aside
          className="hidden min-h-0 w-56 shrink-0 flex-col border-r border-line bg-surface lg:flex"
          aria-label={t("nav.label")}
        >
          <div className="relative min-h-0 flex-1 overflow-y-auto px-3 py-4">
            <OpsNav platformRole={platformRole} supportBadge={supportBadge} />
          </div>
          <div className="shrink-0 border-t border-line px-4 py-3 text-xs text-ink-3">
            <p className="truncate font-medium text-ink-2">{user.name}</p>
            <p className="truncate">{user.email}</p>
          </div>
        </aside>

        {/* `relative`: the scroll area is the containing block of absolutely positioned descendants (sr-only captions), so they never grow the document */}
        <main
          id="main"
          tabIndex={-1}
          className="relative min-h-0 min-w-0 overflow-y-auto overflow-x-clip outline-none"
          data-testid="ops-main"
        >
          <div className="mx-auto w-full max-w-wide px-4 py-6 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>

      <Sheet
        open={navOpen}
        onClose={() => setNavOpen(false)}
        side="left"
        title={t("nav.menuTitle")}
        closeLabel={t("nav.closeMenu")}
        className="max-w-xs"
      >
        <div id="ops-nav-drawer" className="-mx-2">
          <OpsNav
            platformRole={platformRole}
            onNavigate={() => setNavOpen(false)}
            supportBadge={supportBadge}
          />
          <div className="mt-3 border-t border-line px-2 pt-3 md:hidden">
            <Link
              href="/app"
              onClick={() => setNavOpen(false)}
              className={cn(buttonVariants({ variant: "secondary" }), "w-full justify-start")}
            >
              <LayoutDashboard className="size-4" aria-hidden="true" />
              {t("backToDashboard")}
            </Link>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
