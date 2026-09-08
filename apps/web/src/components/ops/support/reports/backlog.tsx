import { getTranslations } from "next-intl/server";
import { EmptyState, TBody, THead, Table, Td, Th, Tr } from "@track-site/ui";
import type { BacklogView } from "@/server/support/reports";
import { count, dateTime, duration, percent } from "./format";
import { Figure, Section, ShareBar, TableFrame } from "./section";

/** The ticket backlog right now, by workflow status (independent of the range), with the open total, the unassigned open tickets and the oldest open ticket. */
export async function BacklogSection({
  backlog,
  locale,
}: {
  backlog: BacklogView;
  locale: string;
}) {
  const [t, tv] = await Promise.all([
    getTranslations("supportReports.backlog"),
    getTranslations("support"),
  ]);
  const aside = [
    <Figure key="open" label={t("figures.open")} value={count(backlog.open, locale)} />,
    <Figure
      key="unassigned"
      label={t("figures.unassigned")}
      value={count(backlog.unassignedOpen, locale)}
    />,
    <Figure
      key="oldest"
      label={t("figures.oldest")}
      value={duration(backlog.oldestOpenAgeMs, locale)}
      hint={
        backlog.oldestOpenAt
          ? t("oldestHint", { at: dateTime(backlog.oldestOpenAt, locale) })
          : undefined
      }
    />,
  ];
  return (
    <Section id="support-reports-backlog" title={t("title")} intro={t("intro")} aside={aside}>
      {backlog.total === 0 ? (
        <EmptyState title={t("empty.title")} description={t("empty.text")} />
      ) : (
        <TableFrame>
          <Table caption={t("caption")}>
            <THead>
              <Tr>
                <Th>{t("columns.status")}</Th>
                <Th className="text-right">{t("columns.count")}</Th>
                <Th>{t("columns.share")}</Th>
              </Tr>
            </THead>
            <TBody>
              {backlog.rows.map((row) => (
                <Tr key={row.status}>
                  <Td label={t("columns.status")} className="font-medium text-ink">
                    {tv(`status.${row.status}`)}
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
