import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Badge, cn } from "@track-site/ui";
import { formatNumber } from "@/lib/format";
import type { ViewCounts } from "@/server/support/tickets";
import { DEFAULT_VIEWS, viewHref, type SavedView } from "@/server/support/views";

const tab = "inline-flex min-h-10 items-center gap-2 rounded-[var(--radius-control-sm)] px-3 py-2 text-sm font-medium text-ink-2 transition-colors duration-[var(--motion-fast)] ease-out hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary pointer-coarse:min-h-11";
const activeTab = "bg-primary-soft text-primary hover:bg-primary-soft hover:text-primary";

/**
 * The queues: seven default views and the operator's saved views (shared first), each with its live count.
 * Links, never buttons — the view is part of the URL so it survives reloads and can be shared.
 */
export async function ViewTabs({ current, counts, saved, locale }: { current: string | null; counts: ViewCounts; saved: SavedView[]; locale: string }) {
  const t = await getTranslations("supportTickets.queue.views");
  const savedCounts = new Map(counts.saved.map((s) => [s.id, s.count]));
  const shared = saved.filter((v) => v.scope === "shared");
  const personal = saved.filter((v) => v.scope === "personal");
  const render = (key: string, label: string, count: number) => {
    const active = current === key;
    return (
      <li key={key}>
        <Link href={viewHref(key)} aria-current={active ? "page" : undefined} className={cn(tab, active && activeTab)} data-testid={`support-view-${key}`}>
          <span className="truncate">{label}</span>
          <Badge tone={active ? "primary" : "neutral"} className="tabular-nums">
            <span className="sr-only">{t("count", { count })}</span>
            <span aria-hidden="true">{formatNumber(count, locale)}</span>
          </Badge>
        </Link>
      </li>
    );
  };
  return (
    <nav aria-label={t("label")} className="rounded-[var(--radius-card)] border border-line bg-surface p-2">
      <ul className="flex flex-wrap gap-1">{DEFAULT_VIEWS.map((view) => render(view.key, t(`defaults.${view.key}`), counts.defaults[view.key]))}</ul>
      {shared.length || personal.length ? (
        <div className="mt-2 border-t border-line pt-2">
          <p className="px-3 pb-1 text-xs font-medium tracking-wide text-ink-3 uppercase">{t("saved")}</p>
          <ul className="flex flex-wrap gap-1">
            {shared.map((view) => render(view.id, view.name, savedCounts.get(view.id) ?? 0))}
            {personal.map((view) => render(view.id, view.name, savedCounts.get(view.id) ?? 0))}
          </ul>
        </div>
      ) : null}
    </nav>
  );
}
