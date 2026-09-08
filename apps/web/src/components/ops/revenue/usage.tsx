import { getTranslations } from "next-intl/server";
import { EmptyState, TBody, THead, Table, Td, Th, Tr } from "@track-site/ui";
import { TOP_USAGE_LIMIT, type UsageRankRow } from "@/server/ops/revenue";
import { OrgCell, Section, TableFrame } from "./cells";
import { count, percent } from "./format";

/** The organisations with the most billable events this period — counters only, never event data. */
export async function TopUsageSection({ rows, periodKey, locale }: { rows: UsageRankRow[]; periodKey: string; locale: string }) {
  const t = await getTranslations("opsRevenue.usage");
  return (
    <Section id="ops-revenue-usage" title={t("title")} intro={t("intro", { count: TOP_USAGE_LIMIT, period: periodKey })}>
      {rows.length === 0 ? (
        <EmptyState title={t("empty.title")} description={t("empty.text", { period: periodKey })} />
      ) : (
        <TableFrame>
          <Table caption={t("caption")}>
            <THead>
              <Tr>
                <Th className="text-right">{t("columns.rank")}</Th>
                <Th>{t("columns.organisation")}</Th>
                <Th>{t("columns.plan")}</Th>
                <Th className="text-right">{t("columns.billable")}</Th>
                <Th className="text-right">{t("columns.accepted")}</Th>
                <Th className="text-right">{t("columns.limit")}</Th>
                <Th className="text-right">{t("columns.used")}</Th>
                <Th className="text-right">{t("columns.sites")}</Th>
              </Tr>
            </THead>
            <TBody>
              {rows.map((row, index) => (
                <Tr key={row.organizationId} data-testid="ops-revenue-usage-row">
                  <Td label={t("columns.rank")} numeric className="text-ink-3">
                    {index + 1}
                  </Td>
                  <Td label={t("columns.organisation")}>
                    <OrgCell name={row.organizationName} slug={row.organizationSlug} />
                  </Td>
                  <Td label={t("columns.plan")} className="text-ink-2">
                    {row.planName ?? row.planId ?? <span className="text-ink-3">{t("noPlan")}</span>}
                  </Td>
                  <Td label={t("columns.billable")} numeric className="font-medium text-ink">
                    {count(row.billableEvents, locale)}
                  </Td>
                  <Td label={t("columns.accepted")} numeric className="text-ink-3">
                    {count(row.acceptedEvents, locale)}
                  </Td>
                  <Td label={t("columns.limit")} numeric className="text-ink-3">
                    {row.limit == null ? t("noLimit") : count(row.limit, locale)}
                  </Td>
                  <Td label={t("columns.used")} numeric className={row.ratio != null && row.ratio >= 1 ? "font-medium text-warn" : "text-ink-2"}>
                    {row.ratio == null ? "—" : percent(row.ratio, locale)}
                  </Td>
                  <Td label={t("columns.sites")} numeric className="text-ink-3">
                    {count(row.siteCount, locale)}
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
