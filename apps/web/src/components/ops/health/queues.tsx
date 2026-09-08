import { getTranslations } from "next-intl/server";
import { Alert, EmptyState, Status, TBody, THead, Table, Td, Th, Tr } from "@track-site/ui";
import type { QueuesView } from "@/server/ops/health";
import { fmtCount, fmtDateTime, fmtDuration } from "./format";
import { HealthSection, Panel, Unknown } from "./section";

const LAG_WARN_MS = 15 * 60_000;

/** Backlog per queue from the durable tables; a driver outside the database is said so instead of showing zeros. */
export async function Queues({ queues, locale }: { queues: QueuesView; locale: string }) {
  const t = await getTranslations("opsHealth");
  const unknown = <Unknown label={t("states.unknown")} />;
  return (
    <HealthSection
      id="queues"
      title={t("queues.title")}
      intro={t("queues.intro")}
      aside={
        <span className="text-ink-3">
          {t("queues.driver")}: <span className="font-mono text-xs text-ink">{queues.driver}</span>
        </span>
      }
    >
      {!queues.measured ? <Alert tone="info">{t("queues.notMeasured", { driver: queues.driver })}</Alert> : null}
      {queues.rows.length === 0 ? (
        <EmptyState title={t("queues.empty")} description={t("queues.references", { count: fmtCount(queues.deadLetterReferences, locale) })} />
      ) : (
        <Panel>
          <Table caption={t("queues.title")}>
            <THead>
              <Tr>
                <Th>{t("queues.columns.queue")}</Th>
                <Th className="text-right">{t("queues.columns.ready")}</Th>
                <Th className="text-right">{t("queues.columns.scheduled")}</Th>
                <Th className="text-right">{t("queues.columns.inFlight")}</Th>
                <Th>{t("queues.columns.oldest")}</Th>
                <Th className="text-right">{t("queues.columns.lag")}</Th>
                <Th className="text-right">{t("queues.columns.dead")}</Th>
                <Th>{t("queues.columns.oldestDead")}</Th>
              </Tr>
            </THead>
            <TBody>
              {queues.rows.map((row) => (
                <Tr key={row.queue} data-testid="ops-health-queue">
                  <Td label={t("queues.columns.queue")} className="font-mono text-xs">
                    {row.queue}
                  </Td>
                  <Td label={t("queues.columns.ready")} numeric>
                    {fmtCount(row.ready, locale)}
                  </Td>
                  <Td label={t("queues.columns.scheduled")} numeric>
                    {fmtCount(row.scheduled, locale)}
                  </Td>
                  <Td label={t("queues.columns.inFlight")} numeric>
                    {fmtCount(row.inFlight, locale)}
                  </Td>
                  <Td label={t("queues.columns.oldest")} className="whitespace-nowrap">
                    {row.oldestReadyAt ? <time dateTime={row.oldestReadyAt}>{fmtDateTime(row.oldestReadyAt, locale)}</time> : unknown}
                  </Td>
                  <Td label={t("queues.columns.lag")} numeric>
                    {row.lagMs === null ? (
                      unknown
                    ) : row.lagMs >= LAG_WARN_MS ? (
                      <Status tone="warn" indicator="icon">
                        {fmtDuration(row.lagMs, locale)}
                      </Status>
                    ) : (
                      fmtDuration(row.lagMs, locale)
                    )}
                  </Td>
                  <Td label={t("queues.columns.dead")} numeric>
                    {row.dead > 0 ? (
                      <Status tone="bad" indicator="icon">
                        {fmtCount(row.dead, locale)}
                      </Status>
                    ) : (
                      fmtCount(row.dead, locale)
                    )}
                  </Td>
                  <Td label={t("queues.columns.oldestDead")} className="whitespace-nowrap">
                    {row.oldestDeadAt ? <time dateTime={row.oldestDeadAt}>{fmtDateTime(row.oldestDeadAt, locale)}</time> : unknown}
                  </Td>
                </Tr>
              ))}
              <Tr className="font-medium">
                <Td label={t("queues.columns.queue")}>{t("queues.totals")}</Td>
                <Td label={t("queues.columns.ready")} numeric>
                  {fmtCount(queues.totals.ready, locale)}
                </Td>
                <Td label={t("queues.columns.scheduled")} numeric>
                  {fmtCount(queues.totals.scheduled, locale)}
                </Td>
                <Td label={t("queues.columns.inFlight")} numeric>
                  {fmtCount(queues.totals.inFlight, locale)}
                </Td>
                <Td label={t("queues.columns.oldest")} />
                <Td label={t("queues.columns.lag")} numeric>
                  {fmtDuration(queues.totals.maxLagMs, locale) ?? unknown}
                </Td>
                <Td label={t("queues.columns.dead")} numeric>
                  {fmtCount(queues.totals.dead, locale)}
                </Td>
                <Td label={t("queues.columns.oldestDead")} />
              </Tr>
            </TBody>
          </Table>
          <p className="mt-2 text-xs text-ink-3">{t("queues.references", { count: fmtCount(queues.deadLetterReferences, locale) })}</p>
        </Panel>
      )}
    </HealthSection>
  );
}
