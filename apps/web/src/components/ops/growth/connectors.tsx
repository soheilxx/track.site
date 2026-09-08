import { getTranslations } from "next-intl/server";
import { EmptyState, TBody, THead, Table, Td, Th, Tr } from "@track-site/ui";
import type { ConnectorsView } from "@/server/ops/growth";
import { count } from "./format";
import { Figure, Section, ShareBar, TableFrame } from "./section";

/** Connector types by organisations with a connected integration; labels come from the shared connector names. */
export async function ConnectorsSection({ connectors, locale }: { connectors: ConnectorsView; locale: string }) {
  const [t, tc] = await Promise.all([getTranslations("opsGrowth.connectors"), getTranslations("consent")]);
  const label = (type: string): string => (tc.has(`connectors.${type}`) ? tc(`connectors.${type}`) : type);
  const reference = connectors.organizationsWithConnected;
  return (
    <Section
      id="ops-growth-connectors"
      title={t("title")}
      intro={t("intro")}
      aside={
        <>
          <Figure label={t("figures.organizations")} value={count(connectors.organizationsWithConnected, locale)} />
          <Figure label={t("figures.connected")} value={count(connectors.connected, locale)} />
        </>
      }
    >
      {connectors.rows.length === 0 ? (
        <EmptyState title={t("empty.title")} description={t("empty.text")} />
      ) : (
        <TableFrame>
          <Table caption={t("caption")}>
            <THead>
              <Tr>
                <Th>{t("columns.connector")}</Th>
                <Th className="text-right">{t("columns.organizations")}</Th>
                <Th className="text-right">{t("columns.connected")}</Th>
                <Th className="text-right">{t("columns.paused")}</Th>
                <Th className="text-right">{t("columns.error")}</Th>
                <Th className="text-right">{t("columns.notConnected")}</Th>
              </Tr>
            </THead>
            <TBody>
              {connectors.rows.map((row) => (
                <Tr key={row.connectorType} data-testid="ops-growth-connector-row">
                  <Td label={t("columns.connector")}>
                    <span className="font-medium text-ink">{label(row.connectorType)}</span>
                    <p className="font-mono text-xs text-ink-3">{row.connectorType}</p>
                  </Td>
                  <Td label={t("columns.organizations")} numeric>
                    <span className="flex items-center justify-end gap-3">
                      <ShareBar share={reference > 0 ? row.organizations / reference : null} className="hidden md:block" />
                      <span className="font-medium text-ink">{count(row.organizations, locale)}</span>
                    </span>
                  </Td>
                  <Td label={t("columns.connected")} numeric className="text-ink-2">
                    {count(row.connected, locale)}
                  </Td>
                  <Td label={t("columns.paused")} numeric className="text-ink-3">
                    {count(row.paused, locale)}
                  </Td>
                  <Td label={t("columns.error")} numeric className={row.error > 0 ? "text-bad" : "text-ink-3"}>
                    {count(row.error, locale)}
                  </Td>
                  <Td label={t("columns.notConnected")} numeric className="text-ink-3">
                    {count(row.notConnected, locale)}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </TableFrame>
      )}
      {connectors.more > 0 ? <p className="text-xs text-ink-3">{t("more", { count: connectors.more })}</p> : null}
    </Section>
  );
}
