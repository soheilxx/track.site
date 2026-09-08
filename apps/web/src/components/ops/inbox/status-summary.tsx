import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { CONTACT_REQUEST_STATUSES, type ContactRequestStatus } from "@track-site/db";
import { cn } from "@track-site/ui";
import { formatNumber } from "@/lib/format";
import type { InboxFilters, InboxStatusFilter } from "@/server/ops/inbox";

const chip =
  "inline-flex min-h-10 items-center gap-2 rounded-[var(--radius-chip)] border px-3 text-sm font-medium transition-colors duration-[var(--motion-fast)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary pointer-coarse:min-h-11";

/** Whole-inbox counts per status as links that set the status filter (the current one is marked, not only coloured). */
export async function StatusSummary({ counts, filters, locale }: { counts: Record<ContactRequestStatus, number>; filters: InboxFilters; locale: string }) {
  const t = await getTranslations("opsInbox");
  const open = counts.new + counts.in_progress;
  const all = open + counts.done + counts.spam;
  const items: Array<{ key: InboxStatusFilter; label: string; count: number }> = [
    { key: "open", label: t("requests.summary.open"), count: open },
    ...CONTACT_REQUEST_STATUSES.map((s) => ({ key: s as InboxStatusFilter, label: t(`status.${s}`), count: counts[s] })),
    { key: "all", label: t("requests.summary.all"), count: all },
  ];
  return (
    <nav aria-label={t("requests.summary.label")}>
      <ul className="flex flex-wrap gap-2">
        {items.map((item) => {
          const active = filters.status === item.key;
          return (
            <li key={item.key}>
              <Link
                href={item.key === "open" ? "/ops/inbox" : `/ops/inbox?status=${item.key}`}
                aria-current={active ? "page" : undefined}
                className={cn(chip, active ? "border-primary bg-primary-soft text-ink" : "border-line bg-surface text-ink-2 hover:border-line-2 hover:text-ink")}
              >
                {item.label}
                <span className="rounded-[var(--radius-chip)] bg-surface-2 px-1.5 text-xs tabular-nums text-ink-2">{formatNumber(item.count, locale)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
