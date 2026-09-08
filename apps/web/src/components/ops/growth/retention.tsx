import { getTranslations } from "next-intl/server";
import { Badge, EmptyState, ScrollRegion, cn } from "@track-site/ui";
import { MIN_COHORT_SIZE, RETENTION_COHORT_WEEKS, type RetentionCell, type RetentionView } from "@/server/ops/growth";
import { count, dateTime, day, percent } from "./format";
import { Section } from "./section";

/**
 * Sequential steps of the primary hue for the share of a cohort active in a week. Text colour follows the
 * fill so the percentage always clears contrast; the number is in every cell, the colour only ranks it.
 */
function cellClass(cell: RetentionCell): string {
  if (cell.state === "pending") return "bg-transparent text-ink-3";
  if (cell.rate === null || cell.rate === 0) return "bg-surface-2 text-ink-3";
  if (cell.rate < 0.25) return "bg-primary-soft text-ink";
  if (cell.rate < 0.5) return "bg-primary-soft-2 text-ink";
  if (cell.rate < 0.75) return "bg-primary text-on-primary";
  return "bg-primary-strong text-on-primary";
}

/**
 * Weekly retention grid: one row per sign-up week (Monday, UTC), one column per week after sign-up. Every
 * cell carries its percentage and, for screen readers, the count; dashed cells are still running.
 */
export async function RetentionSection({ retention, locale }: { retention: RetentionView; locale: string }) {
  const t = await getTranslations("opsGrowth.retention");
  const weeks = Array.from({ length: retention.weeks }, (_, i) => i);
  return (
    <Section id="ops-growth-retention" title={t("title")} intro={t("intro")}>
      {!retention.measured ? (
        <EmptyState title={t("empty.title", { weeks: RETENTION_COHORT_WEEKS })} description={t("empty.text")} />
      ) : (
        <ScrollRegion label={t("caption")} className="rounded-[var(--radius-card)] border border-line bg-surface" scrollClassName="p-2">
          <table className="w-full border-collapse text-sm text-ink tabular-nums">
            <caption className="sr-only">{t("caption")}</caption>
            <thead className="text-left text-xs font-medium tracking-wide text-ink-3 uppercase">
              <tr>
                <th scope="col" className="px-3 py-2 whitespace-nowrap">
                  {t("columns.cohort")}
                </th>
                <th scope="col" className="px-3 py-2 text-right whitespace-nowrap">
                  {t("columns.size")}
                </th>
                {weeks.map((w) => (
                  <th key={w} scope="col" className="px-1 py-2 text-center whitespace-nowrap">
                    {t("columns.week", { n: w })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {retention.cohorts.map((cohort) => (
                <tr key={cohort.weekStart} data-testid="ops-growth-cohort-row">
                  <th scope="row" className="px-3 py-2 text-left font-medium whitespace-nowrap text-ink">
                    {day(cohort.weekStart, locale)}
                    {cohort.small && cohort.size > 0 ? (
                      <Badge tone="neutral" className="ml-2 align-middle">
                        {t("small")}
                      </Badge>
                    ) : null}
                  </th>
                  <td className="px-3 py-2 text-right">{count(cohort.size, locale)}</td>
                  {cohort.cells.map((cell) => (
                    <td key={cell.week} className="p-1 text-center">
                      <span
                        className={cn(
                          "flex min-h-9 min-w-14 items-center justify-center rounded-[var(--radius-control-sm)] px-1 text-xs font-medium",
                          cellClass(cell),
                          cell.state === "partial" && "border border-dashed border-line-2",
                        )}
                      >
                        {cell.state === "pending" || cohort.size === 0 ? (
                          <span aria-hidden="true">—</span>
                        ) : (
                          <span aria-hidden="true">{percent(cell.rate, locale)}</span>
                        )}
                        <span className="sr-only">
                          {cell.state === "pending" ? t("state.pending") : `${t("cell", { active: cell.active, size: cohort.size })}${cell.state === "partial" ? ` (${t("state.partial")})` : ""}`}
                        </span>
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
      )}
      <div className="grid gap-2 text-xs text-ink-3 sm:grid-cols-2">
        <p>{t("legend.scale")}</p>
        <p>{t("legend.partial")}</p>
        <p>{t("legend.small", { min: MIN_COHORT_SIZE })}</p>
        <p>{retention.aggregatesSince ? t("horizon", { at: dateTime(retention.aggregatesSince, locale) }) : t("horizonNone")}</p>
      </div>
    </Section>
  );
}
