"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@track-site/ui";

const ITEMS = [
  { href: "/app/settings", key: "general", exact: true },
  { href: "/app/settings/alerts", key: "alerts", exact: false },
] as const;

/** Section navigation of the Settings module: links (not tabs), the current one carries aria-current. */
export function SettingsSubnav({ className }: { className?: string }) {
  const t = useTranslations("alerts.settingsSubnav");
  const pathname = usePathname();
  return (
    <nav
      aria-label={t("label")}
      className={cn("-mb-px flex gap-1 overflow-x-auto border-b border-line", className)}
    >
      {ITEMS.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            data-testid={`settings-subnav-${item.key}`}
            className={cn(
              "inline-flex min-h-10 shrink-0 items-center border-b-2 px-3 text-sm font-medium transition-colors duration-[var(--motion-fast)] ease-out focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary pointer-coarse:min-h-11",
              active
                ? "border-primary text-primary"
                : "border-transparent text-ink-2 hover:border-line-2 hover:text-ink",
            )}
          >
            {t(item.key)}
          </Link>
        );
      })}
    </nav>
  );
}
