import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Status, buttonVariants, type Tone } from "@track-site/ui";
import { count } from "@/components/ops/growth/format";
import type { ViewCounts } from "@/server/support/tickets";
import { Unavailable } from "./unavailable";

interface Row {
  key: "unassigned" | "breached" | "mine";
  /** the queue's default view that lists exactly these tickets */
  href: string;
  tone: Tone;
  value: number;
}

/**
 * Support desk KPIs on the overview (docs/18): the live counts of the queue's default views — open tickets,
 * unassigned, SLA-breached and the operator's own — counted by `loadViewCounts` from the stored rows and
 * timestamps (never estimated). Every figure links to the view that lists those tickets; `null` when the
 * desk could not be loaded (the card says so instead of showing zeros).
 */
export async function SupportCard({ counts, locale }: { counts: ViewCounts | null; locale: string }) {
  const t = await getTranslations("ops.overview.support");
  const rows: Row[] = counts
    ? [
        { key: "unassigned", href: "/ops/support?view=unassigned", tone: counts.defaults.unassigned > 0 ? "warn" : "ok", value: counts.defaults.unassigned },
        { key: "breached", href: "/ops/support?view=breached", tone: counts.defaults.breached > 0 ? "bad" : "ok", value: counts.defaults.breached },
        { key: "mine", href: "/ops/support?view=mine", tone: counts.defaults.mine > 0 ? "info" : "neutral", value: counts.defaults.mine },
      ]
    : [];
  return (
    <section aria-labelledby="ops-overview-support-title" className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4" data-testid="ops-overview-support">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="ops-overview-support-title" className="text-base font-semibold text-ink">
          {t("title")}
        </h2>
        <Link href="/ops/support" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          {t("link")}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
      {!counts ? (
        <Unavailable />
      ) : (
        <>
          <div>
            <p className="font-display text-3xl font-semibold tracking-tight text-ink tabular-nums" data-testid="ops-overview-support-open">
              {t("open", { count: counts.defaults.open })}
            </p>
            <p className="text-xs text-ink-3">{t("openHint")}</p>
          </div>
          <ul className="divide-y divide-line">
            {rows.map((row) => (
              <li key={row.key} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3" data-testid={`ops-overview-support-${row.key}`}>
                <div className="min-w-0">
                  <Link href={row.href} className="inline-flex min-h-9 items-center text-sm font-medium text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary pointer-coarse:min-h-11">
                    {t(row.key)}
                  </Link>
                  <p className="text-xs text-ink-3">{t(`${row.key}Hint`)}</p>
                </div>
                <Status tone={row.tone} indicator="both" className="shrink-0 tabular-nums">
                  {count(row.value, locale)}
                </Status>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
