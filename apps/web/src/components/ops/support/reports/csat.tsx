import { getTranslations } from "next-intl/server";
import { Alert, EmptyState, TBody, THead, Table, Td, Th, Tr } from "@track-site/ui";
import type { CsatView } from "@/server/support/reports";
import { count, decimal, percent } from "./format";
import { Figure, Section, ShareBar, TableFrame } from "./section";

/** Satisfaction answers of the range's tickets: average, response share of solved tickets and the 1–5 distribution. */
export async function CsatSection({ csat, locale }: { csat: CsatView; locale: string }) {
  const t = await getTranslations("supportReports.csat");
  const aside = [
    <Figure
      key="average"
      label={t("figures.average")}
      value={
        csat.average === null ? "—" : t("outOf", { average: decimal(csat.average, locale, 2) })
      }
    />,
    <Figure key="responses" label={t("figures.responses")} value={count(csat.responses, locale)} />,
    <Figure
      key="rate"
      label={t("figures.responseRate")}
      value={percent(csat.responseRate, locale)}
      hint={t("responseRateHint", { solved: count(csat.solvedTickets, locale) })}
    />,
  ];
  return (
    <Section id="support-reports-csat" title={t("title")} intro={t("intro")} aside={aside}>
      {!csat.enabled ? <Alert tone="info">{t("disabled")}</Alert> : null}
      {csat.responses === 0 ? (
        <EmptyState title={t("empty.title")} description={t("empty.text")} />
      ) : (
        <TableFrame>
          <Table caption={t("caption")}>
            <THead>
              <Tr>
                <Th>{t("columns.score")}</Th>
                <Th className="text-right">{t("columns.count")}</Th>
                <Th>{t("columns.share")}</Th>
              </Tr>
            </THead>
            <TBody>
              {[...csat.distribution].reverse().map((row) => (
                <Tr key={row.score}>
                  <Td label={t("columns.score")} className="font-medium text-ink">
                    {t("score", { score: row.score })}
                  </Td>
                  <Td label={t("columns.count")} numeric>
                    {count(row.count, locale)}
                  </Td>
                  <Td label={t("columns.share")}>
                    <span className="flex items-center gap-2">
                      <ShareBar share={row.share} className="max-w-32" />
                      <span className="tabular-nums text-ink-2">{percent(row.share, locale)}</span>
                    </span>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </TableFrame>
      )}
    </Section>
  );
}
