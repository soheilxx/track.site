"use client";

import { Activity, BarChart3, Bug, CreditCard, Gauge, Globe, LogOut, Menu, Settings, ShieldCheck, Sparkles, Users, Waypoints, X } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Brand, Button, cn } from "@track-site/ui";
import { authClient } from "@/lib/auth-client";

const NAV = [
  { href: "/app", key: "overview", icon: Gauge, exact: true },
  { href: "/app/setup", key: "aiSetup", icon: Sparkles },
  { href: "/app/sites", key: "sites", icon: Globe },
  { href: "/app/events", key: "events", icon: BarChart3 },
  { href: "/app/debugger", key: "debugger", icon: Bug },
  { href: "/app/destinations", key: "destinations", icon: Waypoints },
  { href: "/app/data-quality", key: "dataQuality", icon: Activity },
  { href: "/app/consent", key: "consent", icon: ShieldCheck },
  { href: "/app/audiences", key: "audiences", icon: Users },
  { href: "/app/team", key: "team", icon: Users },
  { href: "/app/billing", key: "billing", icon: CreditCard },
  { href: "/app/settings", key: "settings", icon: Settings },
] as const;

export function AppShell({ user, organization, locale, children }: { user: { name: string; email: string }; organization: { name: string; role: string } | null; locale: string; children: ReactNode }) {
  const t = useTranslations("app.nav");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const nav = (
    <nav aria-label="Dashboard" className="flex flex-1 flex-col gap-0.5">
      {NAV.map((item) => {
        const active = "exact" in item && item.exact ? pathname === item.href : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link key={item.href} href={item.href} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined} className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink", active && "bg-primary-soft text-primary hover:bg-primary-soft")}>
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t(item.key)}
          </Link>
        );
      })}
    </nav>
  );
  return (
    <div lang={locale} className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-surface p-4 lg:flex">
        <Link href="/app" className="mb-6 px-2">
          <Brand size={32} textClassName="text-lg" />
        </Link>
        {organization ? (
          <div className="mb-4 rounded-lg border border-line px-3 py-2">
            <p className="truncate text-sm font-medium text-ink">{organization.name}</p>
            <p className="text-xs text-ink-3">{organization.role}</p>
          </div>
        ) : null}
        {nav}
        <UserMenu user={user} logoutLabel={t("logout")} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-surface/90 px-4 backdrop-blur lg:hidden">
          <Link href="/app">
            <Brand size={28} textClassName="text-base" />
          </Link>
          <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2" aria-expanded={open} aria-controls="app-nav" aria-label={open ? t("closeMenu") : t("openMenu")} onClick={() => setOpen((v) => !v)}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </header>
        {open ? (
          <div id="app-nav" className="border-b border-line bg-surface p-4 lg:hidden">
            {nav}
            <UserMenu user={user} logoutLabel={t("logout")} />
          </div>
        ) : null}
        <main className="min-w-0 flex-1 overflow-x-clip px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

function UserMenu({ user, logoutLabel }: { user: { name: string; email: string }; logoutLabel: string }) {
  return (
    <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-4">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink">{user.name}</p>
        <p className="truncate text-xs text-ink-3">{user.email}</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        aria-label={logoutLabel}
        onClick={async () => {
          await authClient.signOut();
          window.location.assign("/login");
        }}
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
