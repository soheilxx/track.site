import { getTranslations } from "next-intl/server";
import { EmptyState, Status, TBody, THead, Table, Td, Th, Tr } from "@track-site/ui";
import type { DeliveriesView, DeliveryWindow } from "@/server/ops/health";
import { fmtCount, fmtPercent } from "./format";
import { HealthSection, Panel, Unknown } from "./section";

/** Delivery attempts per connector type over 24 h and 7 d; the totals row closes the table. */
export async function Deliveries({ deliveries, locale }: { deliveries: DeliveriesView; locale: string }) {
  const t = await getTranslations("opsHealth");
  const unknown = <Unknown label={t("tiles.noAttempts")} />;
  const rate = (w: DeliveryWindow, warn = false) => {
    const text = fmtPercent(w.errorRate, locale);
    if (text === null) return unknown;
    return warn ? (
      <Status tone="warn" indicator="icon">
        {text}
      </Status>
    ) : (
      text
    );
  };
  const c = (v: number) => fmtCount(v, locale);
  return (
    <HealthSection id="deliveries" title={t("deliveries.title")} intro={t("deliveries.intro")}>
      {deliveries.rows.length === 0 ? (
        <EmptyState title={t("deliveries.empty")} />
      ) : (
        <Panel>
          <Table caption={t("deliveries.title")}>
            <THead>
              <Tr>
                <Th rowSpan={2} className="align-bottom">
                  {t("deliveries.columns.connector")}
                </Th>
                <Th rowSpan={2} className="text-right align-bottom">
                  {t("deliveries.columns.tenants")}
                </Th>
                <Th scope="colgroup" colSpan={6} className="text-center">
                  {t("deliveries.window24h")}
                </Th>
                <Th scope="colgroup" colSpan={2} className="text-center">
                  {t("deliveries.window7d")}
                </Th>
              </Tr>
              <Tr>
                <Th className="text-right">{t("deliveries.columns.attempts")}</Th>
                <Th className="text-right">{t("deliveries.columns.success")}</Th>
                <Th className="text-right">{t("deliveries.columns.failed")}</Th>
                <Th className="text-right">{t("deliveries.columns.retry")}</Th>
                <Th className="text-right">{t("deliveries.columns.skipped")}</Th>
                <Th className="text-right">{t("deliveries.columns.errorRate")}</Th>
                <Th className="text-right">{t("deliveries.columns.attempts")}</Th>
                <Th className="text-right">{t("deliveries.columns.errorRate")}</Th>
              </Tr>
            </THead>
            <TBody>
              {deliveries.rows.map((row) => (
                <Tr key={row.connectorType} data-testid="ops-health-delivery" data-warn={row.warn ? "true" : undefined}>
                  <Td label={t("deliveries.columns.connector")}>
                    <span className="font-medium text-ink">{row.displayName}</span>
                    <span className="ml-1 font-mono text-xs text-ink-3">{row.connectorType}</span>
                  </Td>
                  <Td label={t("deliveries.columns.tenants")} numeric>
                    {c(row.organizations)}
                  </Td>
                  <Td label={`${t("deliveries.window24h")} · ${t("deliveries.columns.attempts")}`} numeric>
                    {c(row.last24h.total)}
                  </Td>
                  <Td label={`${t("deliveries.window24h")} · ${t("deliveries.columns.success")}`} numeric>
                    {c(row.last24h.success)}
                  </Td>
                  <Td label={`${t("deliveries.window24h")} · ${t("deliveries.columns.failed")}`} numeric>
                    {c(row.last24h.failed)}
                  </Td>
                  <Td label={`${t("deliveries.window24h")} · ${t("deliveries.columns.retry")}`} numeric>
                    {c(row.last24h.retry)}
                  </Td>
                  <Td label={`${t("deliveries.window24h")} · ${t("deliveries.columns.skipped")}`} numeric>
                    {c(row.last24h.skipped)}
                  </Td>
                  <Td label={`${t("deliveries.window24h")} · ${t("deliveries.columns.errorRate")}`} numeric>
                    {rate(row.last24h, row.warn)}
                  </Td>
                  <Td label={`${t("deliveries.window7d")} · ${t("deliveries.columns.attempts")}`} numeric>
                    {c(row.last7d.total)}
                  </Td>
                  <Td label={`${t("deliveries.window7d")} · ${t("deliveries.columns.errorRate")}`} numeric>
                    {rate(row.last7d)}
                  </Td>
                </Tr>
              ))}
              <Tr className="font-medium">
                <Td label={t("deliveries.columns.connector")}>{t("deliveries.totals")}</Td>
                <Td label={t("deliveries.columns.tenants")} />
                <Td label={`${t("deliveries.window24h")} · ${t("deliveries.columns.attempts")}`} numeric>
                  {c(deliveries.totals.last24h.total)}
                </Td>
                <Td label={`${t("deliveries.window24h")} · ${t("deliveries.columns.success")}`} numeric>
                  {c(deliveries.totals.last24h.success)}
                </Td>
                <Td label={`${t("deliveries.window24h")} · ${t("deliveries.columns.failed")}`} numeric>
                  {c(deliveries.totals.last24h.failed)}
                </Td>
                <Td label={`${t("deliveries.window24h")} · ${t("deliveries.columns.retry")}`} numeric>
                  {c(deliveries.totals.last24h.retry)}
                </Td>
                <Td label={`${t("deliveries.window24h")} · ${t("deliveries.columns.skipped")}`} numeric>
                  {c(deliveries.totals.last24h.skipped)}
                </Td>
                <Td label={`${t("deliveries.window24h")} · ${t("deliveries.columns.errorRate")}`} numeric>
                  {rate(deliveries.totals.last24h)}
                </Td>
                <Td label={`${t("deliveries.window7d")} · ${t("deliveries.columns.attempts")}`} numeric>
                  {c(deliveries.totals.last7d.total)}
                </Td>
                <Td label={`${t("deliveries.window7d")} · ${t("deliveries.columns.errorRate")}`} numeric>
                  {rate(deliveries.totals.last7d)}
                </Td>
              </Tr>
            </TBody>
          </Table>
        </Panel>
      )}
    </HealthSection>
  );
}
