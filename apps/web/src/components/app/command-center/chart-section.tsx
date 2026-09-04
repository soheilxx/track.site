import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { TBody, Table, Td, Th, THead, Tr } from "@track-site/ui";
import { formatNumber } from "@/lib/format";
import type { CommandCenterFacts, MeasurementStatus } from "@/server/command-center";
import { StackedBarChart, type ChartRow, type ChartSeries } from "./charts";
import { formatDay, formatHour } from "./format";

function ChartFigure({ title, window, status, empty, unavailable, showTable, chart, table }: { title: string; window: string; status: MeasurementStatus; empty: string; unavailable: string; showTable: string; chart: ReactNode; table: ReactNode }) {
  const hasData = status === "measured" || status === "stale";
  return (
    <figure className="rounded-[var(--radius-card)] border border-line bg-surface p-5" data-state={status}>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <span className="text-xs text-ink-3">{window}</span>
      </figcaption>
      <div className="mt-4">{hasData ? chart : <p className="flex h-[220px] items-center justify-center rounded-[var(--radius-control)] border border-dashed border-line-2 px-4 text-center text-sm text-ink-3">{status === "empty" ? empty : unavailable}</p>}</div>
      {hasData ? (
        <details className="mt-3 text-sm">
          <summary className="min-h-11 cursor-pointer py-3 font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{showTable}</summary>
          <div className="mt-2">{table}</div>
        </details>
      ) : null}
    </figure>
  );
}

function DataTable({ caption, columns, rows, locale }: { caption: string; columns: { key: string; label: string }[]; rows: ChartRow[]; locale: string }) {
  return (
    <Table caption={caption}>
      <THead>
        <tr>
          {columns.map((c, i) => (
            <Th key={c.key} className={i > 0 ? "text-right" : undefined}>
              {c.label}
            </Th>
          ))}
        </tr>
      </THead>
      <TBody>
        {rows.map((row) => (
          <Tr key={row.label}>
            {columns.map((c, i) => (
              <Td key={c.key} label={c.label} numeric={i > 0}>
                {i === 0 ? row.label : formatNumber(Number(row[c.key] ?? 0), locale)}
              </Td>
            ))}
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}

/**
 * Two real charts from the worker's aggregates: the hourly event flow (accepted / deduplicated /
 * dropped, last 24 h) and the daily delivery outcomes (delivered / failed / dead-lettered, last
 * 7 days). Each figure carries the same rows as an expandable table; empty windows show no chart.
 */
export async function ChartsSection({ facts, locale, timeZone }: { facts: CommandCenterFacts; locale: string; timeZone: string }) {
  const t = await getTranslations("commandCenter");
  const flowSeries: ChartSeries[] = [
    { key: "accepted", label: t("charts.flow.accepted"), color: "primary" },
    { key: "deduplicated", label: t("charts.flow.deduplicated"), color: "warn" },
    { key: "dropped", label: t("charts.flow.dropped"), color: "bad" },
  ];
  const flowRows: ChartRow[] = (facts.flow.value ?? []).map((b) => ({ label: formatHour(b.bucketStart, locale, timeZone), accepted: b.accepted, deduplicated: b.deduplicated, dropped: b.dropped }));
  const deliverySeries: ChartSeries[] = [
    { key: "success", label: t("charts.delivery.success"), color: "ok" },
    { key: "failed", label: t("charts.delivery.failed"), color: "warn" },
    { key: "dead", label: t("charts.delivery.dead"), color: "bad" },
  ];
  const deliveryRows: ChartRow[] = (facts.deliveryHistory.value ?? []).map((d) => ({ label: formatDay(d.day, locale), success: d.success, failed: d.failed, dead: d.dead }));
  const unavailable = t("state.unavailable");
  // the flow needs an environment; without one it is "not measurable", not a failed query
  const notMeasurable = t("state.not_measurable");
  return (
    <section aria-labelledby="cc-charts-heading">
      <h2 id="cc-charts-heading" className="sr-only">
        {t("charts.heading")}
      </h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartFigure
          title={t("charts.flow.title")}
          window={t("charts.flow.window")}
          status={facts.flow.status}
          empty={t("charts.flow.empty")}
          unavailable={facts.flow.status === "not_measurable" ? notMeasurable : unavailable}
          showTable={t("charts.showTable")}
          chart={<StackedBarChart data={flowRows} series={flowSeries} locale={locale} title={t("charts.flow.title")} description={t("charts.flow.caption")} />}
          table={<DataTable caption={t("charts.flow.caption")} columns={[{ key: "label", label: t("charts.flow.hour") }, ...flowSeries.map((s) => ({ key: s.key, label: s.label }))]} rows={flowRows} locale={locale} />}
        />
        <ChartFigure
          title={t("charts.delivery.title")}
          window={t("charts.delivery.window")}
          status={facts.deliveryHistory.status}
          empty={t("charts.delivery.empty")}
          unavailable={unavailable}
          showTable={t("charts.showTable")}
          chart={<StackedBarChart data={deliveryRows} series={deliverySeries} locale={locale} title={t("charts.delivery.title")} description={t("charts.delivery.caption")} />}
          table={<DataTable caption={t("charts.delivery.caption")} columns={[{ key: "label", label: t("charts.delivery.day") }, ...deliverySeries.map((s) => ({ key: s.key, label: s.label }))]} rows={deliveryRows} locale={locale} />}
        />
      </div>
    </section>
  );
}
