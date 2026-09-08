import { getTranslations } from "next-intl/server";
import { EmptyState, TBody, THead, Table, Td, Th, Tr } from "@track-site/ui";
import type { PlanMixView } from "@/server/ops/growth";
import { count, percent } from "./format";
import { Figure, Section, ShareBar, TableFrame } from "./section";

/** Organisations per catalogue plan and subscription state; the share bar is against all organisations. */
export async function PlanMixSection({ planMix, locale }: { planMix: PlanMixView; locale: string }) {
  const t = await getTranslations("opsGrowth.planMix");
  return (
    <Section id="ops-growth-plan-mix" title={t("title")} intro={t("intro")} aside={<Figure label={t("figures.paying")} value={count(planMix.paying, locale)} hint={percent(planMix.organizations > 0 ? planMix.paying / planMix.organizations : null, locale)} />}>
      {planMix.organizations === 0 ? (
        <EmptyState title={t("empty.title")} description={t("empty.text")} />
      ) : (
        <TableFrame>
          <Table caption={t("caption")}>
            <THead>
              <Tr>
                <Th>{t("columns.plan")}</Th>
                <Th className="text-right">{t("columns.organizations")}</Th>
                <Th className="text-right">{t("columns.share")}</Th>
                <Th className="text-right">{t("columns.active")}</Th>
                <Th className="text-right">{t("columns.trialing")}</Th>
                <Th className="text-right">{t("columns.pastDue")}</Th>
                <Th className="text-right">{t("columns.canceled")}</Th>
                <Th className="text-right">{t("columns.other")}</Th>
              </Tr>
            </THead>
            <TBody>
              {planMix.rows.map((row) => (
                <Tr key={row.planId ?? "none"} data-testid="ops-growth-plan-row">
                  <Td label={t("columns.plan")}>
                    <span className="font-medium text-ink">{row.planId === null ? t("none") : (row.name ?? t("unknown"))}</span>
                    {row.planId !== null && !row.known ? <p className="font-mono text-xs text-ink-3">{row.planId}</p> : null}
                  </Td>
                  <Td label={t("columns.organizations")} numeric>
                    <span className="flex items-center justify-end gap-3">
                      <ShareBar share={row.share} className="hidden md:block" />
                      <span className="font-medium text-ink">{count(row.organizations, locale)}</span>
                    </span>
                  </Td>
                  <Td label={t("columns.share")} numeric className="text-ink-2">
                    {percent(row.share, locale)}
                  </Td>
                  <Td label={t("columns.active")} numeric className="text-ink-2">
                    {count(row.active, locale)}
                  </Td>
                  <Td label={t("columns.trialing")} numeric className="text-ink-3">
                    {count(row.trialing, locale)}
                  </Td>
                  <Td label={t("columns.pastDue")} numeric className={row.pastDue > 0 ? "text-warn" : "text-ink-3"}>
                    {count(row.pastDue, locale)}
                  </Td>
                  <Td label={t("columns.canceled")} numeric className="text-ink-3">
                    {count(row.canceled, locale)}
                  </Td>
                  <Td label={t("columns.other")} numeric className="text-ink-3">
                    {count(row.other, locale)}
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
