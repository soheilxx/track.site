import { getTranslations } from "next-intl/server";
import { EmptyState, Status, TBody, THead, Table, Td, Th, Tr } from "@track-site/ui";
import type { OverageSummary } from "@/server/ops/revenue";
import { Figure, OrgCell, Section, TableFrame } from "./cells";
import { count, day, money } from "./format";

/** Overage of the current period at list price, reduced to what the organisation's policy lets the platform bill. */
export async function OverageSection({ overage, locale }: { overage: OverageSummary; locale: string }) {
  const t = await getTranslations("opsRevenue.overage");
  return (
    <Section
      id="ops-revenue-overage"
      title={t("title")}
      intro={t("intro", { period: overage.periodKey })}
      aside={<Figure label={t("total")} value={money(overage.totalExposureCents, locale)} hint={t("totalHint", { list: money(overage.totalListCents, locale), count: overage.rows.length })} tone={overage.totalExposureCents > 0 ? "warn" : "neutral"} />}
    >
      {overage.rows.length === 0 ? (
        <EmptyState title={t("empty.title")} description={t("empty.text", { period: overage.periodKey })} />
      ) : (
        <>
          <TableFrame>
            <Table caption={t("caption")}>
              <THead>
                <Tr>
                  <Th>{t("columns.organisation")}</Th>
                  <Th>{t("columns.plan")}</Th>
                  <Th className="text-right">{t("columns.billable")}</Th>
                  <Th className="text-right">{t("columns.limit")}</Th>
                  <Th className="text-right">{t("columns.over")}</Th>
                  <Th className="text-right">{t("columns.packs")}</Th>
                  <Th className="text-right">{t("columns.list")}</Th>
                  <Th>{t("columns.policy")}</Th>
                  <Th className="text-right">{t("columns.exposure")}</Th>
                </Tr>
              </THead>
              <TBody>
                {overage.rows.map((row) => (
                  <Tr key={row.organizationId} data-testid="ops-revenue-overage-row">
                    <Td label={t("columns.organisation")}>
                      <OrgCell id={row.organizationId} name={row.organizationName} slug={row.organizationSlug} />
                    </Td>
                    <Td label={t("columns.plan")}>{row.planName ?? row.planId ?? "—"}</Td>
                    <Td label={t("columns.billable")} numeric className="text-ink-2">
                      {count(row.billableEvents, locale)}
                    </Td>
                    <Td label={t("columns.limit")} numeric className="text-ink-3">
                      {row.limit == null ? "—" : count(row.limit, locale)}
                    </Td>
                    <Td label={t("columns.over")} numeric className="font-medium text-warn">
                      {count(row.overEvents, locale)}
                    </Td>
                    <Td label={t("columns.packs")} numeric className="text-ink-2">
                      {row.pack ? t("packInfo", { packs: count(row.packs, locale), events: count(row.pack.events, locale) }) : "—"}
                    </Td>
                    <Td label={t("columns.list")} numeric className="text-ink-2">
                      {row.contractual ? <span className="text-ink-3">{t("contractualCell")}</span> : money(row.listCents, locale)}
                    </Td>
                    <Td label={t("columns.policy")}>
                      <Status tone={row.effectivePolicy === "allow" ? "info" : row.effectivePolicy === "cost_limit" ? "info" : "neutral"} indicator="dot">
                        {t(`policies.${row.effectivePolicy}`)}
                      </Status>
                      {row.hardLimitHitAt ? <p className="text-xs text-bad">{t("paused", { when: day(row.hardLimitHitAt, locale) })}</p> : null}
                    </Td>
                    <Td label={t("columns.exposure")} numeric className={row.exposureCents > 0 ? "font-medium text-ink" : "text-ink-3"}>
                      {row.contractual ? "—" : money(row.exposureCents, locale)}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </TableFrame>
          {overage.contractualCount > 0 ? <p className="text-sm text-ink-3">{t("contractual", { count: overage.contractualCount })}</p> : null}
        </>
      )}
    </Section>
  );
}
