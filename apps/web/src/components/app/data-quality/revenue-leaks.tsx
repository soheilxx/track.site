import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Alert, Banner, Card, CardContent, CardHeader, CardTitle, EmptyState, StatCard, Status, Table, TBody, Td, Th, THead, Tr, buttonVariants, cn } from "@track-site/ui";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import { dominantReason, leakShare, type LeakKind, type LeakRange, type LeakTotals, type RevenueLeakReport } from "@/server/revenue-leaks";
import { GAP_TONE, formatDateTime, formatShare, leakTone } from "./format";

const REASONS = ["no_consent", "blocked", "not_captured", "delivery_failed", "unknown"] as const;

const chip = (active: boolean) =>
  cn(
    "inline-flex min-h-9 items-center rounded-[var(--radius-chip)] border px-3 text-sm font-medium transition-[background-color,color,border-color] duration-[var(--motion-base)] ease-in-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary pointer-coarse:min-h-11",
    active ? "border-primary bg-primary-soft text-primary" : "border-line-2 bg-surface text-ink-2 hover:border-ink-3 hover:text-ink",
  );

function money(amount: number | null, currency: string | null, locale: string): string | null {
  if (amount == null || !currency) return null;
  return formatCurrency(amount, locale, { currency });
}

/** Range (7 / 30 days) and kind (orders / leads) as links, so every view has a URL. */
export async function LeakControls({ report }: { report: RevenueLeakReport }) {
  const t = await getTranslations("dataQuality.leaks");
  const href = (range: LeakRange, kind: LeakKind) => `/app/data-quality/revenue-leaks?range=${range}&kind=${kind}`;
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <nav aria-label={t("range.label")} className="flex flex-wrap gap-2">
        {([7, 30] as const).map((r) => (
          <Link key={r} href={href(r, report.kind)} aria-current={report.rangeDays === r ? "true" : undefined} className={chip(report.rangeDays === r)}>
            {t(`range.${r}`)}
          </Link>
        ))}
      </nav>
      <nav aria-label={t("kind.label")} className="flex flex-wrap gap-2">
        {(["purchase", "lead"] as const).map((k) => (
          <Link key={k} href={href(report.rangeDays, k)} aria-current={report.kind === k ? "true" : undefined} className={chip(report.kind === k)}>
            {t(`kind.${k}`)}
          </Link>
        ))}
      </nav>
    </div>
  );
}

/** Which authoritative sources exist: shop connections and verified server keys. */
export async function LeakSources({ report, siteId, locale, timezone }: { report: RevenueLeakReport; siteId: string; locale: string; timezone: string }) {
  const t = await getTranslations("dataQuality.leaks.sources");
  const shops = report.sources.shopConnections;
  const hasSource = shops.some((s) => s.status === "connected") || report.sources.serverKeys > 0;
  return (
    <Card variant="flat">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {shops.length === 0 && report.sources.serverKeys === 0 ? (
          <Alert tone="warn">{t("none")}</Alert>
        ) : (
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {shops.map((s) => (
              <li key={s.platform} className="flex flex-wrap items-center gap-2">
                <Status tone={s.status === "connected" ? "ok" : s.status === "paused" ? "neutral" : "warn"} indicator="both">
                  {t("shop", { platform: t(`platform.${s.platform}`), status: t(`shopStatus.${s.status}`) })}
                </Status>
                <span className="text-xs text-ink-3">{s.lastEventAt ? t("lastEvent", { date: formatDateTime(s.lastEventAt, locale, timezone) }) : t("never")}</span>
              </li>
            ))}
            <li>
              <Status tone={report.sources.serverKeys > 0 ? "ok" : "neutral"} indicator="both">
                {t("serverKeys", { n: formatNumber(report.sources.serverKeys, locale) })}
              </Status>
            </li>
          </ul>
        )}
        {!hasSource ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-ink-3">{t("hint")}</p>
            <Link href={`/app/sites/${siteId}/shop`} className={buttonVariants({ size: "sm", variant: "secondary" })}>
              {t("connect")}
            </Link>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

async function Totals({ totals, kindLabel, locale }: { totals: LeakTotals; kindLabel: string; locale: string }) {
  const t = await getTranslations("dataQuality.leaks.summary");
  const share = leakShare(totals);
  const value = money(totals.value, totals.currency, locale);
  const min = money(totals.leakMin, totals.currency, locale);
  const max = money(totals.leakMax, totals.currency, locale);
  const unknownShare = totals.authoritative > 0 ? totals.gaps.unknown / totals.authoritative : null;
  const browserShare = totals.authoritative > 0 ? totals.observedBrowser / totals.authoritative : null;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label={t("authoritative", { kind: kindLabel })} value={formatNumber(totals.authoritative, locale)} hint={totals.currencyMixed ? t("mixed") : value ? t("value", { value }) : t("valued", { valued: formatNumber(totals.valued, locale), count: formatNumber(totals.authoritative, locale) })} />
      <StatCard label={t("gaps")} value={formatNumber(totals.definiteGaps, locale)} tone={leakTone(share)} hint={share != null ? t("gapsShare", { share: formatShare(share, locale), kind: kindLabel }) : t("noBase")} />
      <StatCard
        label={t("leak")}
        value={min && max ? (totals.leakMin === totals.leakMax ? min : t("leakRange", { min, max })) : totals.currencyMixed ? t("mixedShort") : t("noValue")}
        tone={min && totals.leakMin ? leakTone(share) : "neutral"}
        hint={totals.leakUnvalued > 0 ? t("leakUnvalued", { n: formatNumber(totals.leakUnvalued, locale) }) : t("leakHelp")}
      />
      <StatCard label={t("unknown")} value={formatNumber(totals.gaps.unknown, locale)} tone={totals.gaps.unknown > 0 ? "warn" : "neutral"} hint={unknownShare != null ? t("unknownShare", { share: formatShare(unknownShare, locale) }) : t("unknownHelp")} />
      <StatCard label={t("delivered")} value={formatNumber(totals.delivered, locale)} hint={t("deliveredHelp")} />
      <StatCard label={t("browserCapture")} value={browserShare != null ? formatShare(browserShare, locale) : "—"} tone={browserShare == null ? "neutral" : browserShare >= 0.8 ? "ok" : browserShare >= 0.5 ? "warn" : "bad"} hint={t("browserHelp", { n: formatNumber(totals.observedBrowser, locale) })} />
      <StatCard label={t("duplicates")} value={formatNumber(totals.deduplicated, locale)} hint={t("duplicatesHelp")} />
      <StatCard label={t("days")} value={formatNumber(totals.days, locale)} hint={totals.computedAt ? formatDate(totals.computedAt, locale, "short") : "—"} />
    </div>
  );
}

/** The report: site totals, reasons, destinations and the daily series. */
export async function LeakReport({ report, locale, timezone }: { report: RevenueLeakReport; locale: string; timezone: string }) {
  const t = await getTranslations("dataQuality.leaks");
  const kindLabel = t(`kind.${report.kind}`);
  if (!report.site) {
    return <EmptyState title={t("empty.title")} description={t("empty.text")} />;
  }
  const site = report.site;
  const dominant = dominantReason(site);
  return (
    <div className="space-y-8">
      {report.stale && report.computedAt ? <Banner tone="warn">{t("stale", { date: formatDateTime(report.computedAt, locale, timezone) })}</Banner> : null}
      <section aria-labelledby="dq-leak-summary" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="dq-leak-summary" className="text-base font-semibold text-ink">
            {t("summary.title", { kind: kindLabel })}
          </h2>
          {report.computedAt ? <p className="text-xs text-ink-3">{t("computedAt", { date: formatDateTime(report.computedAt, locale, timezone) })}</p> : null}
        </div>
        <Totals totals={site} kindLabel={kindLabel} locale={locale} />
        <p className="text-xs text-ink-3">{t("honesty")}</p>
      </section>

      <section aria-labelledby="dq-leak-reasons" className="space-y-3">
        <h2 id="dq-leak-reasons" className="text-base font-semibold text-ink">
          {t("reasons.title")}
        </h2>
        <Table caption={t("reasons.title")}>
          <THead>
            <tr>
              <Th>{t("reasons.reason")}</Th>
              <Th className="text-right">{t("reasons.count")}</Th>
              <Th className="text-right">{t("reasons.share")}</Th>
              <Th>{t("reasons.meaning")}</Th>
            </tr>
          </THead>
          <TBody>
            {REASONS.map((r) => {
              const n = site.gaps[r];
              const share = site.authoritative > 0 ? n / site.authoritative : null;
              return (
                <Tr key={r}>
                  <Td label={t("reasons.reason")}>
                    <Status tone={n > 0 ? GAP_TONE[r] : "neutral"} indicator="both">
                      {t(`reasons.${r}`)}
                      {dominant === r ? <span className="ml-1 text-xs text-ink-3">· {t("reasons.dominant")}</span> : null}
                    </Status>
                  </Td>
                  <Td label={t("reasons.count")} numeric>
                    {formatNumber(n, locale)}
                  </Td>
                  <Td label={t("reasons.share")} numeric>
                    {share != null ? formatShare(share, locale) : "—"}
                  </Td>
                  <Td label={t("reasons.meaning")} className="text-ink-3">
                    {t(`reasons.help.${r}`)}
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      </section>

      <section aria-labelledby="dq-leak-destinations" className="space-y-3">
        <h2 id="dq-leak-destinations" className="text-base font-semibold text-ink">
          {t("destinations.title")}
        </h2>
        {report.destinations.length === 0 ? (
          <EmptyState
            title={t("destinations.empty")}
            action={
              <Link href="/app/destinations" className={buttonVariants({ size: "sm", variant: "secondary" })}>
                {t("destinations.open")}
              </Link>
            }
          />
        ) : (
          <Table caption={t("destinations.title")}>
            <THead>
              <tr>
                <Th>{t("destinations.name")}</Th>
                <Th>{t("destinations.mode")}</Th>
                <Th className="text-right">{t("destinations.authoritative")}</Th>
                <Th className="text-right">{t("destinations.delivered")}</Th>
                <Th className="text-right">{t("destinations.gaps")}</Th>
                <Th className="text-right">{t("destinations.unknown")}</Th>
                <Th className="text-right">{t("destinations.leak")}</Th>
                <Th>{t("destinations.dominant")}</Th>
              </tr>
            </THead>
            <TBody>
              {report.destinations.map((d) => {
                const tt = d.totals;
                const share = leakShare(tt);
                const min = tt ? money(tt.leakMin, tt.currency, locale) : null;
                const max = tt ? money(tt.leakMax, tt.currency, locale) : null;
                const reason = dominantReason(tt);
                return (
                  <Tr key={d.integrationId}>
                    <Td label={t("destinations.name")}>
                      <span className="font-medium text-ink">{d.name}</span>
                      <span className="ml-2 font-mono text-xs text-ink-3">{d.connectorType}</span>
                      <span className="ml-2 text-xs text-ink-3">{t(`destinations.status.${d.status}`)}</span>
                    </Td>
                    <Td label={t("destinations.mode")}>
                      {d.mode ? t(`destinations.modes.${d.mode}`) : t("destinations.modes.none")}
                      {d.mapped === false ? <span className="ml-1 text-xs text-warn">· {t("destinations.notMapped", { kind: kindLabel })}</span> : null}
                    </Td>
                    {tt ? (
                      <>
                        <Td label={t("destinations.authoritative")} numeric>
                          {formatNumber(tt.authoritative, locale)}
                        </Td>
                        <Td label={t("destinations.delivered")} numeric>
                          {formatNumber(tt.delivered, locale)}
                        </Td>
                        <Td label={t("destinations.gaps")} numeric>
                          <Status tone={leakTone(share)} chip>
                            {formatNumber(tt.definiteGaps, locale)}
                            {share != null ? ` · ${formatShare(share, locale)}` : ""}
                          </Status>
                        </Td>
                        <Td label={t("destinations.unknown")} numeric>
                          {formatNumber(tt.gaps.unknown, locale)}
                        </Td>
                        <Td label={t("destinations.leak")} numeric>
                          {min && max ? (tt.leakMin === tt.leakMax ? min : t("summary.leakRange", { min, max })) : tt.currencyMixed ? t("summary.mixedShort") : "—"}
                          {tt.leakUnvalued > 0 ? <span className="block text-xs text-ink-3">{t("summary.leakUnvalued", { n: formatNumber(tt.leakUnvalued, locale) })}</span> : null}
                        </Td>
                        <Td label={t("destinations.dominant")}>{reason ? <Status tone={GAP_TONE[reason]}>{t(`reasons.${reason}`)}</Status> : <span className="text-ink-3">—</span>}</Td>
                      </>
                    ) : (
                      <Td label={t("destinations.authoritative")} colSpan={6} className="text-ink-3">
                        {t("destinations.noData")}
                      </Td>
                    )}
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        )}
      </section>

      <section aria-labelledby="dq-leak-daily" className="space-y-3">
        <h2 id="dq-leak-daily" className="text-base font-semibold text-ink">
          {t("daily.title")}
        </h2>
        <Table caption={t("daily.title")}>
          <THead>
            <tr>
              <Th>{t("daily.day")}</Th>
              <Th className="text-right">{t("daily.authoritative")}</Th>
              <Th className="text-right">{t("daily.delivered")}</Th>
              <Th className="text-right">{t("daily.gaps")}</Th>
              <Th className="text-right">{t("daily.unknown")}</Th>
              <Th>{t("daily.bar")}</Th>
            </tr>
          </THead>
          <TBody>
            {report.daily.map((d) => {
              const deliveredPct = d.authoritative > 0 ? (d.delivered / d.authoritative) * 100 : 0;
              const gapPct = d.authoritative > 0 ? (d.gaps / d.authoritative) * 100 : 0;
              return (
                <Tr key={d.day}>
                  <Td label={t("daily.day")}>{formatDate(d.day, locale, "short")}</Td>
                  <Td label={t("daily.authoritative")} numeric>
                    {formatNumber(d.authoritative, locale)}
                  </Td>
                  <Td label={t("daily.delivered")} numeric>
                    {formatNumber(d.delivered, locale)}
                  </Td>
                  <Td label={t("daily.gaps")} numeric>
                    {formatNumber(d.gaps, locale)}
                  </Td>
                  <Td label={t("daily.unknown")} numeric>
                    {formatNumber(d.unknown, locale)}
                  </Td>
                  <Td label={t("daily.bar")}>
                    <div className="flex h-2 w-full min-w-24 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={t("daily.barLabel", { delivered: formatShare(deliveredPct / 100, locale), gaps: formatShare(gapPct / 100, locale) })}>
                      <span className="bg-ok" style={{ width: `${deliveredPct}%` }} />
                      <span className="bg-bad" style={{ width: `${gapPct}%` }} />
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      </section>
    </div>
  );
}
