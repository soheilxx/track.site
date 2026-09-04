"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@track-site/ui";

const ITEMS = [
  { href: "/app/events", key: "overview", exact: true },
  { href: "/app/events/matrix", key: "coverage", exact: false },
  { href: "/app/events/explorer", key: "explorer", exact: false },
  { href: "/app/events/test-lab", key: "testLab", exact: false },
] as const;

/** Sub-navigation of the Events module (overview, coverage matrix, explorer, test lab); links, never buttons. */
export function EventsNav() {
  const t = useTranslations("events.nav");
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
