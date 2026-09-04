import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { Badge, Status, TBody, Table, Td, Th, THead, Tr } from "@track-site/ui";
import type { CoverageCell, CoverageMatrix, CoverageRow } from "@/server/events";
import { formatDateTime } from "./format";
import { CELL_TONE } from "./tones";

function CellView({ cell, children }: { cell: CoverageCell; children?: React.ReactNode }) {
  const t = useTranslations("events.coverage");
  const locale = useLocale();
  return (
    <div className="space-y-1">
      <Status tone={CELL_TONE[cell.status]} chip indicator="both">
        {t(`statuses.${cell.status}`)}
      </Status>
      <p className="text-xs text-ink-2">{t(`messages.${cell.message}`, cell.params ?? {})}</p>
      {children}
      {cell.lastAt ? <p className="text-xs tabular-nums text-ink-3">{t("lastAt", { time: formatDateTime(cell.lastAt, locale) })}</p> : null}
      {cell.action ? (
        <Link href={cell.action.href} className="inline-flex min-h-6 items-center pointer-coarse:min-h-11 text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          {t(`actions.${cell.action.key}`)}
        </Link>
      ) : null}
    </div>
  );
}

function DestinationsCell({ row }: { row: CoverageRow }) {
  const t = useTranslations("events.coverage");
  const locale = useLocale();
  return (
    <CellView cell={row.destinations}>
      {row.destinations.list.length ? (
        <ul className="space-y-1.5">
          {row.destinations.list.map((d) => (
            <li key={d.id} className="text-xs">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <Status tone={CELL_TONE[d.status]} indicator="dot">
                  {d.name}
                </Status>
                <span className="font-mono text-ink-3">{d.type}</span>
                <Link href={d.href} className="inline-flex min-h-6 items-center pointer-coarse:min-h-11 font-medium text-primary underline-offset-4 hover:underline">
                  {t("actions.openDestination")}
                </Link>
              </div>
              <p className="tabular-nums text-ink-3">
                {t("destination.counts", { delivered: d.delivered, failed: d.failed, skipped: d.skipped })}
                {d.lastDeliveredAt ? ` · ${t("destination.lastDelivered", { time: formatDateTime(d.lastDeliveredAt, locale) })}` : ""}
                {d.lastFailedAt ? ` · ${t("destination.lastFailed", { time: formatDateTime(d.lastFailedAt, locale) })}` : ""}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </CellView>
  );
}

/** Event Coverage Matrix (supplement §8 module 2): rows = relevant events, columns = sources, consent, required parameters, data quality, destinations. */
export function CoverageTable({ matrix }: { matrix: CoverageMatrix }) {
  const t = useTranslations("events.coverage");
  const columns = [t("columns.browser"), t("columns.server"), t("columns.consent"), t("columns.params"), t("columns.quality"), t("columns.destinations")];
  return (
    <Table caption={t("caption", { days: matrix.windowDays })} className="md:min-w-[64rem]">
      <THead>
        <tr>
          <Th className="w-56">{t("columns.event")}</Th>
          {columns.map((c) => (
            <Th key={c}>{c}</Th>
          ))}
        </tr>
      </THead>
      <TBody>
        {matrix.rows.map((row) => (
          <Tr key={row.name}>
            <Td label={t("columns.event")}>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-sm text-ink">{row.name}</span>
                {row.critical ? <Badge tone="primary">{t("critical")}</Badge> : null}
                {!row.standard ? <Badge>{t("custom")}</Badge> : null}
              </div>
              <p className="mt-1 text-xs text-ink-3">{row.origin.map((o) => t(`origin.${o}`)).join(" · ")}</p>
            </Td>
            <Td label={columns[0]}>
              <CellView cell={row.browser} />
            </Td>
            <Td label={columns[1]}>
              <CellView cell={row.server} />
            </Td>
            <Td label={columns[2]}>
              <CellView cell={row.consent} />
            </Td>
            <Td label={columns[3]}>
              <CellView cell={row.params}>{row.params.required.length ? <p className="font-mono text-xs text-ink-3">{t("required", { params: row.params.required.join(", ") })}</p> : null}</CellView>
            </Td>
            <Td label={columns[4]}>
              <CellView cell={row.quality} />
            </Td>
            <Td label={columns[5]}>
              <DestinationsCell row={row} />
            </Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}

export function CoverageLegend() {
  const t = useTranslations("events.coverage");
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-ink-3" aria-label={t("legend")}>
      {(["ok", "warn", "bad", "info", "none", "unknown"] as const).map((s) => (
        <li key={s} className="inline-flex items-center gap-1.5">
          <Status tone={CELL_TONE[s]} indicator="both">
            {t(`statuses.${s}`)}
          </Status>
          <span>— {t(`legendText.${s}`)}</span>
        </li>
      ))}
    </ul>
  );
}
