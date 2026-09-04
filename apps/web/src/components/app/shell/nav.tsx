"use client";

import { Activity, BarChart3, CreditCard, Gauge, GitBranch, Lightbulb, Settings, ShieldCheck, Sparkles, Users, Waypoints, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@track-site/ui";

/** Task-oriented dashboard navigation (redesign supplement §8); sites live under the workspace switcher. */
export const NAV: ReadonlyArray<{ href: string; key: "commandCenter" | "aiSetup" | "events" | "destinations" | "dataQuality" | "consent" | "insights" | "releases" | "team" | "billing" | "settings"; icon: LucideIcon; exact?: boolean }> = [
  { href: "/app", key: "commandCenter", icon: Gauge, exact: true },
  { href: "/app/ai-setup", key: "aiSetup", icon: Sparkles },
  { href: "/app/events", key: "events", icon: BarChart3 },
  { href: "/app/destinations", key: "destinations", icon: Waypoints },
  { href: "/app/data-quality", key: "dataQuality", icon: Activity },
  { href: "/app/consent", key: "consent", icon: ShieldCheck },
  { href: "/app/insights", key: "insights", icon: Lightbulb },
  { href: "/app/releases", key: "releases", icon: GitBranch },
  { href: "/app/team", key: "team", icon: Users },
  { href: "/app/billing", key: "billing", icon: CreditCard },
  { href: "/app/settings", key: "settings", icon: Settings },
];

export function isNavActive(pathname: string, item: (typeof NAV)[number]): boolean {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function DashboardNav({ onNavigate, className }: { onNavigate?: () => void; className?: string }) {
  const t = useTranslations("shell.nav");
  const pathname = usePathname();
  return (
    <nav aria-label={t("label")} className={cn("flex flex-col gap-0.5", className)}>
      {NAV.map((item) => {
        const active = isNavActive(pathname, item);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-10 items-center gap-3 rounded-[var(--radius-control-sm)] px-3 py-2 text-sm font-medium text-ink-2 transition-colors duration-[var(--motion-fast)] ease-out hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary pointer-coarse:min-h-11",
              active && "bg-primary-soft text-primary hover:bg-primary-soft hover:text-primary",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{t(item.key)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
