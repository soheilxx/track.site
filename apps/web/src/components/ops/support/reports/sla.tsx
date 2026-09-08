import { getTranslations } from "next-intl/server";
import { EmptyState, TBody, THead, Table, Td, Th, Tr } from "@track-site/ui";
import type { SlaClockStats, SlaView } from "@/server/support/reports";
import { count, percent } from "./format";
import { Figure, Note, Section, TableFrame } from "./section";

type Clock = "firstResponse" | "resolution";

/** SLA outcomes of the range's tickets per clock — overall and by priority — from the stored due times and stop instants only. */
export async function SlaSection({ sla, locale }: { sla: SlaView; locale: string }) {
  const [t, tv] = await Promise.all([
    getTranslations("supportReports.sla"),
    getTranslations("support"),
  ]);
  const clockLabel: Record<Clock, string> = {
    firstResponse: tv("sla.firstResponse"),
    resolution: tv("sla.resolution"),
  };
  const aside = [
    <Figure
      key="withPolicy"
      label={t("figures.withPolicy")}
      value={count(sla.withPolicy, locale)}
    />,
    <Figure
      key="fr"
      label={t("figures.firstResponse")}
      value={percent(sla.firstResponse.rate, locale)}
      hint={t("rateHint", {
        met: count(sla.firstResponse.met, locale),
        counted: count(sla.firstResponse.met + sla.firstResponse.breached, locale),
      })}
    />,
    <Figure
      key="res"
      label={t("figures.resolution")}
      value={percent(sla.resolution.rate, locale)}
      hint={t("rateHint", {
        met: count(sla.resolution.met, locale),
        counted: count(sla.resolution.met + sla.resolution.breached, locale),
      })}
    />,
  ];
  const table = (clock: Clock) => {
    const rows: Array<{ key: string; label: string; stats: SlaClockStats }> = [
      { key: "all", label: t("all"), stats: sla[clock] },
      ...sla.byPriority.map((p) => ({
        key: p.priority,
        label: tv(`priority.${p.priority}`),
        stats: p[clock],
      })),
    ];
    return (
      <TableFrame key={clock}>
        <Table caption={t("caption", { clock: clockLabel[clock] })} showCaption>
          <THead>
            <Tr>
              <Th>{t("columns.priority")}</Th>
              <Th className="text-right">{t("columns.met")}</Th>
              <Th className="text-right">{t("columns.breached")}</Th>
              <Th className="text-right">{t("columns.running")}</Th>
              <Th className="text-right">{t("columns.noPolicy")}</Th>
              <Th className="text-right">{t("columns.rate")}</Th>
            </Tr>
          </THead>
          <TBody>
            {rows.map((row) => (
              <Tr key={row.key} className={row.key === "all" ? "font-medium" : undefined}>
                <Td label={t("columns.priority")} className="text-ink">
                  {row.label}
                </Td>
                <Td label={t("columns.met")} numeric>
                  {count(row.stats.met, locale)}
                </Td>
                <Td
                  label={t("columns.breached")}
                  numeric
                  className={row.stats.breached > 0 ? "text-bad" : undefined}
                >
                  {count(row.stats.breached, locale)}
                </Td>
                <Td label={t("columns.running")} numeric className="text-ink-2">
                  {count(row.stats.running, locale)}
                </Td>
                <Td label={t("columns.noPolicy")} numeric className="text-ink-2">
                  {count(row.stats.noPolicy, locale)}
                </Td>
                <Td label={t("columns.rate")} numeric className="text-ink">
                  {percent(row.stats.rate, locale)}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </TableFrame>
    );
  };
  return (
    <Section id="support-reports-sla" title={t("title")} intro={t("intro")} aside={aside}>
      {sla.withPolicy === 0 ? (
        <EmptyState title={t("empty.title")} description={t("empty.text")} />
      ) : (
        <div className="space-y-2">
          <div className="grid gap-6 xl:grid-cols-2">
            {table("firstResponse")}
            {table("resolution")}
          </div>
          <Note>{t("note")}</Note>
        </div>
      )}
    </Section>
  );
}
