import { getTranslations } from "next-intl/server";
import { EmptyState, TBody, THead, Table, Td, Th, Tr } from "@track-site/ui";
import type { SubscriptionSummary } from "@/server/ops/revenue";
import { Section, TableFrame } from "./cells";
import { count, money, percent } from "./format";

/** MRR by plan and interval; custom-priced and unknown plans are listed but never priced. */
export async function PlanRevenueSection({ summary, locale }: { summary: SubscriptionSummary; locale: string }) {
  const t = await getTranslations("opsRevenue.plans");
  const total = summary.byPlan.reduce((sum, p) => sum + p.total, 0);
  const excluded = (Object.keys(summary.excluded) as Array<keyof SubscriptionSummary["excluded"]>).filter((k) => summary.excluded[k] > 0);
  return (
    <Section id="ops-revenue-plans" title={t("title")} intro={t("intro")}>
      {total === 0 ? (
        <EmptyState title={t("empty.title")} description={t("empty.text")} />
      ) : (
        <TableFrame>
          <Table caption={t("caption")}>
            <THead>
              <Tr>
                <Th>{t("columns.plan")}</Th>
                <Th className="text-right">{t("columns.active")}</Th>
                <Th className="text-right">{t("columns.monthly")}</Th>
                <Th className="text-right">{t("columns.yearly")}</Th>
                <Th className="text-right">{t("columns.trialing")}</Th>
                <Th className="text-right">{t("columns.pastDue")}</Th>
                <Th className="text-right">{t("columns.mrr")}</Th>
                <Th className="text-right">{t("columns.share")}</Th>
              </Tr>
            </THead>
            <TBody>
              {summary.byPlan.map((row) => (
                <Tr key={row.planId} data-testid="ops-revenue-plan-row">
                  <Td label={t("columns.plan")}>
                    <span className="font-medium text-ink">{row.name ?? t("other")}</span>
                    {row.customPrice ? <p className="text-xs text-ink-3">{t("customPrice")}</p> : null}
                  </Td>
                  <Td label={t("columns.active")} numeric className="font-medium text-ink">
                    {count(row.active, locale)}
                  </Td>
                  <Td label={t("columns.monthly")} numeric className="text-ink-2">
                    {count(row.monthly, locale)}
                  </Td>
                  <Td label={t("columns.yearly")} numeric className="text-ink-2">
                    {count(row.yearly, locale)}
                  </Td>
                  <Td label={t("columns.trialing")} numeric className="text-ink-3">
                    {count(row.trialing, locale)}
                  </Td>
                  <Td label={t("columns.pastDue")} numeric className={row.pastDue > 0 ? "text-warn" : "text-ink-3"}>
                    {count(row.pastDue, locale)}
                  </Td>
                  <Td label={t("columns.mrr")} numeric className="font-medium text-ink">
                    {row.mrrCents == null ? "—" : money(row.mrrCents, locale)}
                  </Td>
                  <Td label={t("columns.share")} numeric className="text-ink-2">
                    {row.share == null ? "—" : percent(row.share, locale)}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </TableFrame>
      )}
      {excluded.length ? (
        <div className="text-sm text-ink-2">
          <p className="font-medium text-ink">{t("excluded.title")}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {excluded.map((reason) => (
              <li key={reason}>{t(`excluded.${reason}`, { count: summary.excluded[reason] })}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </Section>
  );
}
