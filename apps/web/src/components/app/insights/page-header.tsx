import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, cn } from "@track-site/ui";
import { formatDate } from "@/lib/format";
import { RANGE_DAYS, type RangeDays } from "@/server/insights-attribution";
import type { WorkspaceEnvironment, WorkspaceSite } from "@/server/workspace";

/**
 * Page header of an Insights page: the one h1, the intro and a toolbar that names the scope the
 * numbers refer to (site, environment, window) plus the range switch. The scope comes from the
 * shell's workspace — never from the URL — so a switch in the header re-scopes every figure.
 */
export async function InsightsPageHeader({
  title,
  intro,
  site,
  environment,
  window,
  basePath,
  actions,
}: {
  title: string;
  intro: string;
  site: WorkspaceSite;
  environment: WorkspaceEnvironment | null;
  window?: { from: Date; to: Date; days: RangeDays };
  basePath?: string;
  actions?: ReactNode;
}) {
  const t = await getTranslations("insights.toolbar");
  const locale = await getLocale();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold text-ink">{title}</h1>
          <p className="mt-1 max-w-3xl text-sm text-ink-3">{intro}</p>
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      <div className="flex flex-col gap-3 rounded-[var(--radius-control)] border border-line bg-surface px-4 py-3 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <dl className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-2">
            <dt className="text-ink-3">{t("site")}</dt>
            <dd className="font-medium text-ink">
              {site.name} <span className="font-mono text-xs text-ink-3">{site.trackingId}</span>
            </dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="text-ink-3">{t("environment")}</dt>
            <dd>
              {environment ? (
                <Badge tone={environment.kind === "production" ? "primary" : "neutral"}>
                  {t(`environmentKind.${environment.kind}`)}
                </Badge>
              ) : (
                <Badge tone="neutral">{t("allEnvironments")}</Badge>
              )}
            </dd>
          </div>
          {window ? (
            <div className="flex items-center gap-2">
              <dt className="text-ink-3">{t("window")}</dt>
              <dd className="tabular-nums text-ink">
                {t("windowRange", {
                  from: formatDate(window.from, locale, "short"),
                  to: formatDate(window.to, locale, "short"),
                })}
              </dd>
            </div>
          ) : null}
        </dl>
        {window && basePath ? (
          <div role="group" aria-label={t("range")} className="flex flex-wrap gap-2">
            {RANGE_DAYS.map((days) => {
              const active = days === window.days;
              return (
                <Link
                  key={days}
                  href={days === 30 ? basePath : `${basePath}?range=${days}`}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "inline-flex min-h-9 items-center rounded-[var(--radius-chip)] border px-3 text-sm font-medium transition-[background-color,color,border-color] duration-[var(--motion-base)] ease-in-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary pointer-coarse:min-h-11",
                    active
                      ? "border-primary bg-primary-soft text-primary"
                      : "border-line-2 bg-surface text-ink-2 hover:border-ink-3 hover:text-ink",
                  )}
                >
                  {t("days", { days })}
                </Link>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
