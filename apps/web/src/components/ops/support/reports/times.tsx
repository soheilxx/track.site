import { getTranslations } from "next-intl/server";
import { EmptyState, TBody, THead, Table, Td, Th, Tr } from "@track-site/ui";
import { MIN_P90_SAMPLE, type DurationStats, type TimesView } from "@/server/support/reports";
import { count, duration } from "./format";
import { Note, Section, TableFrame } from "./section";

/** First-response and resolution times of the range's tickets: measured count, median, 90th percentile and how many are still pending. */
export async function TimesSection({ times, locale }: { times: TimesView; locale: string }) {
  const t = await getTranslations("supportReports.times");
  const rows: Array<{ key: "firstResponse" | "resolution"; stats: DurationStats }> = [
    { key: "firstResponse", stats: times.firstResponse },
    { key: "resolution", stats: times.resolution },
  ];
  const measured = times.firstResponse.measured + times.resolution.measured;
  const withheld = rows.some((r) => r.stats.p90Withheld);
  return (
    <Section id="support-reports-times" title={t("title")} intro={t("intro")}>
      {measured === 0 ? (
        <EmptyState title={t("empty.title")} description={t("empty.text")} />
      ) : (
        <div className="space-y-2">
          <TableFrame>
            <Table caption={t("caption")}>
              <THead>
                <Tr>
                  <Th>{t("columns.metric")}</Th>
                  <Th className="text-right">{t("columns.measured")}</Th>
                  <Th className="text-right">{t("columns.median")}</Th>
                  <Th className="text-right">{t("columns.p90")}</Th>
                  <Th className="text-right">{t("columns.pending")}</Th>
                </Tr>
              </THead>
              <TBody>
                {rows.map(({ key, stats }) => (
                  <Tr key={key}>
                    <Td label={t("columns.metric")} className="font-medium text-ink">
                      {t(`rows.${key}`)}
                    </Td>
                    <Td label={t("columns.measured")} numeric>
                      {count(stats.measured, locale)}
                    </Td>
                    <Td label={t("columns.median")} numeric className="font-medium text-ink">
                      {duration(stats.medianMs, locale)}
                    </Td>
                    <Td label={t("columns.p90")} numeric>
                      {stats.p90Withheld ? (
                        <span className="text-ink-3">{t("withheld")}</span>
                      ) : (
                        duration(stats.p90Ms, locale)
                      )}
                    </Td>
                    <Td label={t("columns.pending")} numeric className="text-ink-2">
                      {count(stats.pending, locale)}
                      <span className="ml-1 text-xs text-ink-3">{t(`pending.${key}`)}</span>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </TableFrame>
          {withheld ? <Note>{t("p90Withheld", { min: MIN_P90_SAMPLE })}</Note> : null}
        </div>
      )}
    </Section>
  );
}
