import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { PlatformRole } from "@track-site/core";
import { cn } from "@track-site/ui";
import { supportSubnavItems, type SupportSection } from "./subnav-items";

/**
 * Secondary navigation on every page under `/ops/support` (docs/18 §"Entry points"): Tickets, Views, Macros,
 * Reports and — with `platform.sla.manage` — Settings. Plain links with `aria-current`; the page that
 * renders it enforces its own permission, this only hides what the role cannot open.
 */
export async function SupportSubnav({ current, role }: { current: SupportSection; role: PlatformRole }) {
  const t = await getTranslations("support.subnav");
  const items = supportSubnavItems(role);
  return (
    <nav aria-label={t("label")} className="-mb-px overflow-x-auto border-b border-line" data-testid="support-subnav">
      <ul className="flex min-w-max gap-1">
        {items.map((item) => {
          const active = item.key === current;
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                data-testid={`support-subnav-${item.key}`}
                className={cn(
                  "inline-flex min-h-10 items-center border-b-2 px-3 text-sm font-medium transition-colors duration-[var(--motion-base)] ease-in-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary pointer-coarse:min-h-11",
                  active ? "border-primary text-ink" : "border-transparent text-ink-2 hover:text-ink",
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
