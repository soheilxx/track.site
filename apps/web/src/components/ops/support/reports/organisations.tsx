import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { EmptyState, TBody, THead, Table, Td, Th, Tr } from "@track-site/ui";
import type { OrganisationsView } from "@/server/support/reports";
import { count, percent } from "./format";
import { Figure, Section, ShareBar, TableFrame } from "./section";

/** The organisations with the most tickets in the range (metadata only — name, slug and counts; the detail page needs its own permission). */
export async function OrganisationsSection({
  organisations,
  locale,
}: {
  organisations: OrganisationsView;
  locale: string;
}) {
  const t = await getTranslations("supportReports.organisations");
  const aside = [
    <Figure
      key="distinct"
      label={t("figures.distinct")}
      value={count(organisations.distinct, locale)}
    />,
    <Figure
      key="without"
      label={t("figures.without")}
      value={count(organisations.withoutOrganisation, locale)}
    />,
  ];
  return (
    <Section id="support-reports-organisations" title={t("title")} intro={t("intro")} aside={aside}>
      {organisations.rows.length === 0 ? (
        <EmptyState title={t("empty.title")} description={t("empty.text")} />
      ) : (
        <TableFrame>
          <Table caption={t("caption")}>
            <THead>
              <Tr>
                <Th>{t("columns.organisation")}</Th>
                <Th className="text-right">{t("columns.tickets")}</Th>
                <Th className="text-right">{t("columns.open")}</Th>
                <Th className="text-right">{t("columns.resolved")}</Th>
                <Th>{t("columns.share")}</Th>
              </Tr>
            </THead>
            <TBody>
              {organisations.rows.map((row) => (
                <Tr key={row.organizationId ?? "none"}>
                  <Td label={t("columns.organisation")} className="font-medium text-ink">
                    {row.organizationId ? (
                      <Link
                        href={`/ops/organisations/${row.organizationId}`}
                        className="inline-flex min-h-9 items-center rounded-[var(--radius-control-sm)] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary pointer-coarse:min-h-11"
                      >
                        {row.name ?? row.slug ?? row.organizationId}
                      </Link>
                    ) : (
                      <span className="font-normal text-ink-3">{t("none")}</span>
                    )}
                    {row.slug ? (
                      <span className="ml-2 font-mono text-xs font-normal text-ink-3">
                        {row.slug}
                      </span>
                    ) : null}
                  </Td>
                  <Td label={t("columns.tickets")} numeric className="font-medium text-ink">
                    {count(row.tickets, locale)}
                  </Td>
                  <Td label={t("columns.open")} numeric>
                    {count(row.open, locale)}
                  </Td>
                  <Td label={t("columns.resolved")} numeric className="text-ink-2">
                    {count(row.resolved, locale)}
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
