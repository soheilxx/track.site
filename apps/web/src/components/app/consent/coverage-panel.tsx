import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Banner, Card, CardContent, CardHeader, CardTitle, EmptyState, StatCard, TBody, THead, Table, Td, Th, Tr, buttonVariants } from "@track-site/ui";
import { formatDate, formatNumber } from "@/lib/format";
import type { CoverageSummary } from "@/server/consent-coverage";
import { regionGroupLabel, signalLabel } from "./labels";

/** Consent coverage of the active site, measured from recorded consent states (never estimated). */
export async function CoveragePanel({ summary, locale }: { summary: CoverageSummary | null; locale: string }) {
  const t = await getTranslations("consent.coverage");
  const tc = await getTranslations("consent");
  const pct = (v: number) => formatNumber(v, locale, { style: "percent", maximumFractionDigits: 1 });
  return (
    <section aria-labelledby="consent-coverage-title" className="space-y-4">
      <div>
        <h2 id="consent-coverage-title" className="text-lg font-semibold text-ink">
          {t("title")}
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-3">{t("intro")}</p>
      </div>
      {!summary ? (
        <EmptyState
          title={t("empty")}
          description={t("emptyText")}
          action={
            <Link href="/app/ai-setup" className={buttonVariants({ variant: "secondary" })}>
              {t("emptyAction")}
            </Link>
          }
        />
      ) : (
        <>
          {summary.stale ? (
            <Banner tone="warn" title={t("staleTitle")}>
              {t("stale", { date: formatDate(summary.lastSeenAt, locale, "short") })}
            </Banner>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label={t("events")} value={formatNumber(summary.events, locale)} hint={t("states", { count: summary.states })} />
            <StatCard label={t("explicit")} value={pct(summary.explicitShare)} hint={t("explicitHint")} />
            <StatCard label={t("analytics")} value={pct(summary.purposeShare.analytics)} />
            <StatCard label={t("marketing")} value={pct(summary.purposeShare.marketing)} hint={t("marketingHint")} />
            <StatCard label={t("gpc")} value={pct(summary.gpcShare)} hint={t("gpcHint")} />
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Card variant="flat">
              <CardHeader>
                <CardTitle>{t("byRegion")}</CardTitle>
              </CardHeader>
              <CardContent className="px-2 py-2 sm:px-3">
                <Table caption={t("tableCaption")}>
                  <THead>
                    <Tr>
                      <Th>{t("region")}</Th>
                      <Th className="text-right">{t("eventsColumn")}</Th>
                      <Th className="text-right">{t("share")}</Th>
                      <Th className="text-right">{t("explicitShare")}</Th>
                      <Th className="text-right">{t("analyticsShare")}</Th>
                      <Th className="text-right">{t("marketingShare")}</Th>
                    </Tr>
                  </THead>
                  <TBody>
                    {summary.byRegion.map((row) => (
                      <Tr key={row.key}>
                        <Td label={t("region")} className="font-medium">
                          {regionGroupLabel(tc, row.key)}
                        </Td>
                        <Td label={t("eventsColumn")} numeric>
                          {formatNumber(row.events, locale)}
                        </Td>
                        <Td label={t("share")} numeric>
                          {pct(row.share)}
                        </Td>
                        <Td label={t("explicitShare")} numeric>
                          {pct(row.explicitShare)}
                        </Td>
                        <Td label={t("analyticsShare")} numeric>
                          {pct(row.analyticsShare)}
                        </Td>
                        <Td label={t("marketingShare")} numeric>
                          {pct(row.marketingShare)}
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              </CardContent>
            </Card>
            <Card variant="flat">
              <CardHeader>
                <CardTitle>{t("bySource")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-line text-sm">
                  {summary.bySource.map((row) => (
                    <li key={row.key} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0 truncate text-ink">{signalLabel(tc, row.key)}</span>
                      <span className="shrink-0 tabular-nums text-ink-2">
                        {formatNumber(row.events, locale)} · {pct(row.share)}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
          <p className="text-xs text-ink-3">{t("since", { first: formatDate(summary.firstSeenAt, locale, "short"), last: formatDate(summary.lastSeenAt, locale, "short") })}</p>
        </>
      )}
    </section>
  );
}
