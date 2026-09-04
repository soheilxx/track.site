"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@track-site/ui";

const ITEMS = [
  { href: "/app/team", key: "overview", exact: true },
  { href: "/app/team/audit", key: "audit", exact: false },
] as const;

/** Sub-navigation of the Team & Access module (overview, audit log); links, never buttons. */
export function TeamNav() {
  const t = useTranslations("team.module.nav");
  const pathname = usePathname();
  return (
    <nav aria-label={t("label")} className="-mx-1 overflow-x-auto">
      <ul className="flex min-w-max items-stretch gap-1 border-b border-line px-1">
        {ITEMS.map((item) => {
          const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-medium transition-colors duration-[var(--motion-base)] ease-in-out focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary",
                  active ? "border-primary text-primary" : "border-transparent text-ink-2 hover:border-line-2 hover:text-ink",
                )}
              >
                {t(item.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
