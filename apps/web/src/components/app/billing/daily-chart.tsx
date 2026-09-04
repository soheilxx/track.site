import { getLocale, getTranslations } from "next-intl/server";
import { TBody, Table, Td, Th, THead, Tr } from "@track-site/ui";
import { formatNumber } from "@/lib/format";
import type { DailyCount, DayWindow } from "@/server/usage";
import { count, formatDayKey } from "./format";

const W = 720;
const H = 200;
const PAD = { left: 44, right: 8, top: 12, bottom: 28 };

/**
 * Billable events per UTC day: the 4-week baseline, the last 7 complete days the forecast is averaged
 * over, and today's partial day. Server-rendered SVG built from tokens (no library, no hydration), with
 * the same rows in a table for assistive technology and anyone who prefers numbers. The forecast is
 * never drawn as bars — it is a projection, not a measurement.
 */
export async function DailyChart({ daily, recent, baseline, today }: { daily: DailyCount[]; recent: DayWindow; baseline: DayWindow; today: string }) {
  const t = await getTranslations("billingUsage.chart");
  const locale = await getLocale();
  const max = Math.max(1, ...daily.map((d) => d.events));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const slot = innerW / Math.max(1, daily.length);
  const barW = Math.max(2, slot * 0.68);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const windowOf = (day: string): "baseline" | "recent" | "today" => (day === today ? "today" : day >= recent.from && day <= recent.to ? "recent" : "baseline");
  const fill = { baseline: "fill-line-2", recent: "fill-primary", today: "fill-primary-soft-2" } as const;
  const ticks = [0, 0.5, 1].map((f) => Math.round(max * f));
  const labelled = new Set([daily[0]?.day, recent.from, today]);
  const total = daily.reduce((a, d) => a + d.events, 0);
  const aria = t("aria", { days: daily.length, recent: count(recent.events, locale), baseline: count(baseline.events, locale), today: count(daily.find((d) => d.day === today)?.events ?? 0, locale) });
  return (
    <section aria-labelledby="usage-chart-title" className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
      <h2 id="usage-chart-title" className="text-base font-semibold text-ink">
        {t("title")}
      </h2>
      <p className="mt-1 text-sm text-ink-3">{t("intro", { from: formatDayKey(baseline.from, locale), to: formatDayKey(today, locale) })}</p>
      {total === 0 ? (
        <p className="mt-4 text-sm text-ink-3">{t("empty")}</p>
      ) : (
        <figure className="mt-4">
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={aria} className="h-auto w-full text-[11px]">
            {ticks.map((v) => (
              <g key={v}>
                <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className="stroke-line" strokeWidth={1} />
                <text x={PAD.left - 6} y={y(v) + 4} textAnchor="end" className="fill-ink-3">
                  {formatNumber(v, locale, { notation: "compact" })}
                </text>
              </g>
            ))}
            {daily.map((d, i) => {
              const kind = windowOf(d.day);
              const x = PAD.left + i * slot + (slot - barW) / 2;
              const h = (d.events / max) * innerH;
              return (
                <g key={d.day}>
                  <rect x={x} y={y(d.events)} width={barW} height={Math.max(d.events > 0 ? 1 : 0, h)} rx={2} className={fill[kind]}>
                    <title>{`${formatDayKey(d.day, locale)}: ${count(d.events, locale)}`}</title>
                  </rect>
                  {labelled.has(d.day) ? (
                    <text x={x + barW / 2} y={H - 8} textAnchor={i === 0 ? "start" : i === daily.length - 1 ? "end" : "middle"} className="fill-ink-3">
                      {formatDayKey(d.day, locale)}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>
          <figcaption className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-2">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="size-2.5 rounded-sm bg-line-2" /> {t("legend.baseline", { from: formatDayKey(baseline.from, locale), to: formatDayKey(baseline.to, locale) })}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="size-2.5 rounded-sm bg-primary" /> {t("legend.recent", { from: formatDayKey(recent.from, locale), to: formatDayKey(recent.to, locale) })}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="size-2.5 rounded-sm bg-primary-soft-2" /> {t("legend.today")}
            </span>
          </figcaption>
        </figure>
      )}
      <details className="mt-3 text-sm">
        <summary className="inline-flex min-h-10 cursor-pointer items-center rounded-[var(--radius-control-sm)] px-1 font-medium text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary pointer-coarse:min-h-11">{t("details")}</summary>
        <Table caption={t("title")} wrapperClassName="mt-2 max-h-80 overflow-y-auto">
          <THead>
            <Tr>
              <Th>{t("day")}</Th>
              <Th>{t("window.label")}</Th>
              <Th className="text-right">{t("events")}</Th>
            </Tr>
          </THead>
          <TBody>
            {daily.map((d) => (
              <Tr key={d.day}>
                <Td label={t("day")} className="tabular-nums">
                  {formatDayKey(d.day, locale)}
                </Td>
                <Td label={t("window.label")} className="text-ink-3">
                  {t(`window.${windowOf(d.day)}`)}
                </Td>
                <Td label={t("events")} numeric>
                  {count(d.events, locale)}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </details>
    </section>
  );
}
