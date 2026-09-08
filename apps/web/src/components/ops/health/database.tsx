import { getTranslations } from "next-intl/server";
import { Alert, Status, TBody, THead, Table, Td, Th, Tr } from "@track-site/ui";
import { DATABASE_TABLE_LIMIT, type DatabaseView } from "@/server/ops/health";
import { fmtBytes, fmtCount, fmtDateTime } from "./format";
import { Facts, HealthSection, Panel, Unknown, type Fact } from "./section";

/** Size, version and connections of the database plus its largest tables (statistics views, estimates). */
export async function Database({ database, locale }: { database: DatabaseView; locale: string }) {
  const t = await getTranslations("opsHealth");
  const unknown = <Unknown label={t("states.unknown")} />;
  const facts: Fact[] = [
    { label: t("database.size"), value: fmtBytes(database.sizeBytes, locale) ?? unknown },
    { label: t("database.version"), value: database.version ?? unknown },
    { label: t("database.connections"), value: database.connections !== null ? fmtCount(database.connections, locale) : unknown },
    { label: t("database.tableCount"), value: database.tableCount !== null ? fmtCount(database.tableCount, locale) : unknown },
  ];
  return (
    <HealthSection
      id="database"
      title={t("database.title")}
      intro={t("database.intro")}
      aside={
        <Status tone={database.state === "ok" ? "ok" : "bad"} indicator="both" data-testid="ops-health-database-state">
          {database.state === "ok" ? t("states.ok") : t("states.unavailable")}
        </Status>
      }
    >
      {database.state !== "ok" ? <Alert tone="bad">{t("database.unavailable")}</Alert> : null}
      <Panel>
        <Facts items={facts} columns={4} />
      </Panel>
      {database.tables.length ? (
        <Panel>
          <Table caption={t("database.largest", { count: DATABASE_TABLE_LIMIT })} showCaption>
            <THead>
              <Tr>
                <Th>{t("database.columns.table")}</Th>
                <Th className="text-right">{t("database.columns.rows")}</Th>
                <Th className="text-right">{t("database.columns.dead")}</Th>
                <Th className="text-right">{t("database.columns.size")}</Th>
                <Th>{t("database.columns.vacuum")}</Th>
              </Tr>
            </THead>
            <TBody>
              {database.tables.map((row) => (
                <Tr key={row.name} data-testid="ops-health-table">
                  <Td label={t("database.columns.table")} className="font-mono text-xs break-all">
                    {row.name}
                  </Td>
                  <Td label={t("database.columns.rows")} numeric>
                    {fmtCount(row.liveRows, locale)}
                  </Td>
                  <Td label={t("database.columns.dead")} numeric>
                    {fmtCount(row.deadRows, locale)}
                  </Td>
                  <Td label={t("database.columns.size")} numeric>
                    {fmtBytes(row.totalBytes, locale)}
                  </Td>
                  <Td label={t("database.columns.vacuum")} className="whitespace-nowrap">
                    {row.lastAutovacuumAt ? <time dateTime={row.lastAutovacuumAt}>{fmtDateTime(row.lastAutovacuumAt, locale)}</time> : <span className="text-ink-3">{t("database.never")}</span>}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Panel>
      ) : null}
    </HealthSection>
  );
}
