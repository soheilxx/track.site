import { getTranslations } from "next-intl/server";
import { EmptyState, TBody, THead, Table, Td, Th, Tr } from "@track-site/ui";
import type { FunnelView } from "@/server/ops/growth";
import { count, daysValue, percent } from "./format";
import { Figure, Section, ShareBar, TableFrame } from "./section";

/**
 * Activation stages as a dense table: organisations that reached each milestone (with a proportional bar
 * against the first stage), the share of the previous stage, the share of all, the median time from
 * sign-up, and the same counts for organisations created in the recent window.
 */
export async function FunnelSection({ funnel, locale }: { funnel: FunnelView; locale: string }) {
  const t = await getTranslations("opsGrowth.funnel");
  const first = funnel.stages[0]?.count ?? 0;
  return (
    <Section
      id="ops-growth-funnel"
      title={t("title")}
      intro={t("intro")}
      aside={
        <>
          <Figure label={t("figures.all")} value={count(funnel.organizations, locale)} />
          <Figure label={t("figures.recent", { days: funnel.recentDays })} value={count(funnel.recentOrganizations, locale)} />
        </>
      }
    >
      {funnel.organizations === 0 ? (
        <EmptyState title={t("empty.title")} description={t("empty.text")} />
      ) : (
        <TableFrame>
          <Table caption={t("caption")}>
            <THead>
              <Tr>
                <Th>{t("columns.stage")}</Th>
                <Th className="text-right">{t("columns.count")}</Th>
                <Th className="text-right">{t("columns.step")}</Th>
                <Th className="text-right">{t("columns.total")}</Th>
                <Th className="text-right">{t("columns.median")}</Th>
                <Th className="text-right">{t("columns.recent", { days: funnel.recentDays })}</Th>
                <Th className="text-right">{t("columns.recentStep")}</Th>
              </Tr>
            </THead>
            <TBody>
              {funnel.stages.map((stage, i) => (
                <Tr key={stage.key} data-testid="ops-growth-funnel-row">
                  <Td label={t("columns.stage")}>
                    <span className="font-medium text-ink">
                      <span className="mr-2 inline-block w-4 text-right text-xs text-ink-3 tabular-nums" aria-hidden="true">
                        {i + 1}
                      </span>
                      {t(`stages.${stage.key}`)}
                    </span>
                  </Td>
                  <Td label={t("columns.count")} numeric>
                    <span className="flex items-center justify-end gap-3">
                      <ShareBar share={first > 0 ? stage.count / first : null} className="hidden md:block" />
                      <span className="font-medium text-ink">{count(stage.count, locale)}</span>
                    </span>
                  </Td>
                  <Td label={t("columns.step")} numeric className="text-ink-2">
                    {percent(stage.stepRate, locale)}
                  </Td>
                  <Td label={t("columns.total")} numeric className="text-ink-2">
                    {percent(stage.totalRate, locale)}
                  </Td>
                  <Td label={t("columns.median")} numeric className="text-ink-2">
                    {daysValue(stage.medianDays, locale)}
                  </Td>
                  <Td label={t("columns.recent", { days: funnel.recentDays })} numeric className="font-medium text-ink">
                    {count(stage.recent.count, locale)}
                  </Td>
                  <Td label={t("columns.recentStep")} numeric className="text-ink-2">
                    {percent(stage.recent.stepRate, locale)}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </TableFrame>
      )}
      <p className="text-xs text-ink-3">{t("note")}</p>
    </Section>
  );
}
