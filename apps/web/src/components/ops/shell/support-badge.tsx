"use client";

import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { supportNavBadgeAction, type SupportNavBadge } from "@/server/ops/actions/support-tickets";

/** How often the shell refreshes the support counts while the tab is visible (the bell polls every 30 s; the badge is coarser). */
export const SUPPORT_BADGE_POLL_MS = 60_000;

/**
 * Live counts behind the "Support" entry of the console navigation (docs/18 §13 `loadSupportNavBadge`):
 * fetched through a server action on mount, on every route change and every minute while the tab is
 * visible; a failed poll keeps the last figure (never a guessed one) and a refused one (no platform role
 * any more) clears it. Null until the first answer — the entry then shows no badge at all.
 */
export function useSupportNavBadge(): SupportNavBadge | null {
  const pathname = usePathname();
  const [badge, setBadge] = useState<SupportNavBadge | null>(null);
  useEffect(() => {
    let active = true;
    const poll = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      try {
        const result = await supportNavBadgeAction();
        if (!active) return;
        if (result.ok) setBadge(result.badge);
        else if (result.error === "forbidden") setBadge(null);
      } catch {
        // a missed poll keeps the previous figure; the next one catches up
      }
    };
    void poll();
    const interval = window.setInterval(() => void poll(), SUPPORT_BADGE_POLL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [pathname]);
  return badge;
}

/** Which figure the shell shows: open tickets nobody holds; the accessible name adds the breached count. */
export function supportBadgeFigure(badge: SupportNavBadge | null): number | null {
  if (!badge) return null;
  return badge.unassigned > 0 || badge.breached > 0 ? badge.unassigned : null;
}

/** The count next to the "Support" entry with an accessible name that also names the breached tickets. */
export function SupportNavBadgeChip({ badge }: { badge: SupportNavBadge | null }) {
  const t = useTranslations("support.subnav");
  const figure = supportBadgeFigure(badge);
  if (badge === null || figure === null) return null;
  const tone = badge.breached > 0 ? "bg-bad-soft text-bad" : "bg-primary-soft text-primary";
  return (
    <span className={`ml-auto inline-flex min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums ${tone}`} data-testid="ops-nav-support-badge">
      <span aria-hidden="true">{figure > 999 ? "999+" : figure}</span>
      <span className="sr-only">{t("badge", { unassigned: badge.unassigned, breached: badge.breached })}</span>
    </span>
  );
}
