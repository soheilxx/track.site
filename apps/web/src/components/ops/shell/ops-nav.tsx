"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@track-site/ui";
import type { ActivePlatformRole } from "@/server/ops/platform";
import { OPS_NAV, isOpsNavActive, roleAllows } from "./nav-items";

/** Console navigation: entries above the operator's role are hidden (the pages enforce the role again). */
export function OpsNav({
  platformRole,
  onNavigate,
  className,
}: {
  platformRole: ActivePlatformRole;
  onNavigate?: () => void;
  className?: string;
}) {
  const t = useTranslations("ops.nav");
  const pathname = usePathname();
  return (
    <nav aria-label={t("label")} className={cn("flex flex-col gap-0.5", className)}>
      {OPS_NAV.filter((item) => roleAllows(platformRole, item.minRole)).map((item) => {
        const active = isOpsNavActive(pathname, item);
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
