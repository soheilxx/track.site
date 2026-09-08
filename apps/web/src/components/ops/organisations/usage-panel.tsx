import { getTranslations } from "next-intl/server";
import { Status, TBody, THead, Table, Td, Th, Tr } from "@track-site/ui";
import { formatDateTime } from "@/components/app/alerts/format";
import { formatCents, formatNumber } from "@/lib/format";
import type { UsageView } from "@/server/ops/organisations";
import { overagePolicyLabel } from "./labels";

/** Current usage period from the worker's counters, its warning thresholds, the overage policy and the earlier periods. */
export async function UsagePanel({ usage, locale }: { usage: UsageView; locale: string }) {
  const t = await getTranslations("opsOrganisations.detail.usage");
  const tAll = await getTranslations("opsOrganisations");
  const tc = await getTranslations("opsOrganisations.common");
  const n = (value: number) => formatNumber(value, locale);
  const current = usage.current;
  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-ink">{t("current", { period: usage.currentPeriodKey })}</h3>
          {current ? (
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs font-medium tracking-wide text-ink-3 uppercase">{t("accepted")}</dt>
                <dd className="mt-0.5 font-medium text-ink tabular-nums">{n(current.accepted)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium tracking-wide text-ink-3 uppercase">{t("billable")}</dt>
                <dd className="mt-0.5 font-medium text-ink tabular-nums">{n(current.billable)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium tracking-wide text-ink-3 uppercase">{t("dropped")}</dt>
                <dd className="mt-0.5 font-medium text-ink tabular-nums">{n(current.dropped)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium tracking-wide text-ink-3 uppercase">{t("deduplicated")}</dt>
                <dd className="mt-0.5 font-medium text-ink tabular-nums">{n(current.deduplicated)}</dd>
              </div>
              <div className="col-span-2 sm:col-span-4">
                <dt className="text-xs font-medium tracking-wide text-ink-3 uppercase">{t("limit")}</dt>
                <dd className="mt-0.5 text-ink tabular-nums">
                  {current.limit == null ? t("noLimit") : n(current.limit)}
                  <span className="text-ink-3">
                    {" "}
                    · {t("sitesCounted", { count: current.siteCount })} · {t("destinationsCounted", { count: current.destinationCount })}
                  </span>
                </dd>
              </div>
              {current.softLimitHitAt ? (
                <div className="col-span-2 sm:col-span-4">
                  <Status tone="warn" indicator="icon">
                    {t("softLimit")} · {formatDateTime(current.softLimitHitAt, locale)}
                  </Status>
                </div>
              ) : null}
              {current.hardLimitHitAt ? (
                <div className="col-span-2 sm:col-span-4">
                  <Status tone="bad" indicator="icon">
                    {t("hardLimit")} · {formatDateTime(current.hardLimitHitAt, locale)}
                  </Status>
                </div>
              ) : null}
              <div className="col-span-2 text-xs text-ink-3 sm:col-span-4">{t("updatedAt", { date: formatDateTime(current.updatedAt, locale) ?? "" })}</div>
            </dl>
          ) : (
            <p className="mt-2 text-sm text-ink-3">{t("noPeriod", { period: usage.currentPeriodKey })}</p>
          )}
          {current?.thresholds ? (
            <div className="mt-4">
              <h4 className="text-xs font-medium tracking-wide text-ink-3 uppercase">{t("thresholds")}</h4>
              <ul className="mt-1 space-y-1 text-sm">
                {current.thresholds.map((th) => (
                  <li key={th.pct} className="flex flex-wrap items-center gap-2">
                    <Status tone={th.reached ? "warn" : "neutral"} indicator="icon">
                      {t("threshold", { pct: th.pct, events: n(th.events) })}
                    </Status>
                    <span className="text-ink-2">{th.reached ? t("reached") : t("notReached")}</span>
                    <span className="text-xs text-ink-3">{th.warnedAt ? t("warnedAt", { date: formatDateTime(th.warnedAt, locale) ?? "" }) : t("notWarned")}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <dl className="divide-y divide-line text-sm">
          <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-3 py-1.5">
            <dt className="text-ink-3">{t("policy")}</dt>
            <dd className="text-ink">{overagePolicyLabel(tAll, usage.policy)}</dd>
          </div>
          <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-3 py-1.5">
            <dt className="text-ink-3">{t("costLimit")}</dt>
            <dd className="text-ink tabular-nums">{usage.costLimitCents == null ? tc("none") : formatCents(usage.costLimitCents, locale)}</dd>
          </div>
          <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-3 py-1.5">
            <dt className="text-ink-3">{t("pauseAt")}</dt>
            <dd className="text-ink tabular-nums">{usage.pauseAtEvents == null ? (usage.limit == null ? t("noLimit") : t("neverPauses")) : t("pauseAtValue", { events: n(usage.pauseAtEvents), grace: usage.gracePercent })}</dd>
          </div>
        </dl>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-ink">{t("history")}</h3>
        {usage.history.length === 0 ? (
          <p className="mt-1 text-sm text-ink-3">{t("noHistory")}</p>
        ) : (
          <div className="mt-2 rounded-[var(--radius-card)] border border-line bg-surface px-2 py-2 sm:px-3">
            <Table caption={t("historyCaption")}>
              <THead>
                <Tr>
                  <Th>{t("period")}</Th>
                  <Th className="text-right">{t("accepted")}</Th>
                  <Th className="text-right">{t("billable")}</Th>
                  <Th className="text-right">{t("dropped")}</Th>
                  <Th className="text-right">{t("limit")}</Th>
                </Tr>
              </THead>
              <TBody>
                {usage.history.map((p) => (
                  <Tr key={p.periodKey}>
                    <Td label={t("period")} className="font-mono">
                      {p.periodKey}
                    </Td>
                    <Td label={t("accepted")} numeric>
                      {n(p.accepted)}
                    </Td>
                    <Td label={t("billable")} numeric>
                      {n(p.billable)}
                    </Td>
                    <Td label={t("dropped")} numeric>
                      {n(p.dropped)}
                    </Td>
                    <Td label={t("limit")} numeric>
                      {p.limit == null ? t("noLimit") : n(p.limit)}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
