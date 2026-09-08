import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Status, buttonVariants, type Tone } from "@track-site/ui";
import { count } from "@/components/ops/growth/format";
import type { AlertDigest, InboxPage, PrivacyOverview } from "@/server/ops/inbox";
import { Unavailable } from "./unavailable";

interface Row {
  key: "contacts" | "privacy" | "alerts";
  href: string;
  tone: Tone;
  value: string;
  hint: string;
}

/**
 * Open work from the inbox module: contact requests, privacy requests and alerts. Each source that could
 * not be loaded says so on its own line; the whole card only when all three failed.
 */
export async function InboxCard({ inbox, privacy, alerts, locale }: { inbox: InboxPage | null; privacy: PrivacyOverview | null; alerts: AlertDigest | null; locale: string }) {
  const t = await getTranslations("opsGrowth.overview.inbox");
  const rows: Row[] = [];
  if (inbox) {
    const open = inbox.counts.new + inbox.counts.in_progress;
    rows.push({
      key: "contacts",
      href: "/ops/inbox",
      tone: inbox.counts.new > 0 ? "warn" : open > 0 ? "info" : "ok",
      value: t("contacts.open", { count: open }),
      hint: t("contacts.detail", { newCount: count(inbox.counts.new, locale), inProgress: count(inbox.counts.in_progress, locale) }),
    });
  }
  if (privacy) {
    rows.push({
      key: "privacy",
      href: "/ops/inbox/privacy",
      tone: !privacy.available ? "neutral" : privacy.totals.overdue > 0 ? "bad" : privacy.totals.dueSoon > 0 ? "warn" : privacy.totals.open > 0 ? "info" : "ok",
      value: privacy.available ? t("privacy.open", { count: privacy.totals.open }) : t("notMeasured"),
      hint: privacy.available ? t("privacy.detail", { overdue: count(privacy.totals.overdue, locale), dueSoon: count(privacy.totals.dueSoon, locale) }) : t("privacy.unavailable"),
    });
  }
  if (alerts) {
    rows.push({
      key: "alerts",
      href: "/ops/inbox/alerts",
      tone: !alerts.available ? "neutral" : alerts.totals.critical > 0 ? "bad" : alerts.totals.open > 0 ? "warn" : "ok",
      value: alerts.available ? t("alerts.open", { count: alerts.totals.open }) : t("notMeasured"),
      hint: alerts.available ? t("alerts.detail", { critical: count(alerts.totals.critical, locale), days: alerts.windowDays }) : t("alerts.unavailable"),
    });
  }
  const missing = (["contacts", "privacy", "alerts"] as const).filter((key) => !rows.some((r) => r.key === key));
  return (
    <section aria-labelledby="ops-overview-inbox-title" className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4" data-testid="ops-overview-inbox">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="ops-overview-inbox-title" className="text-base font-semibold text-ink">
          {t("title")}
        </h2>
        <Link href="/ops/inbox" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          {t("link")}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
      {rows.length === 0 ? (
        <Unavailable />
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((row) => (
            <li key={row.key} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3" data-testid={`ops-overview-inbox-${row.key}`}>
              <div className="min-w-0">
                <Link href={row.href} className="inline-flex min-h-9 items-center text-sm font-medium text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary pointer-coarse:min-h-11">
                  {t(`${row.key}.label`)}
                </Link>
                <p className="text-xs text-ink-3 tabular-nums">{row.hint}</p>
              </div>
              <Status tone={row.tone} indicator="both" className="shrink-0 tabular-nums">
                {row.value}
              </Status>
            </li>
          ))}
          {missing.map((key) => (
            <li key={key} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <p className="text-sm font-medium text-ink">{t(`${key}.label`)}</p>
              <Status tone="neutral" indicator="both" className="shrink-0">
                {t("failed")}
              </Status>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
