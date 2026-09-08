import { getTranslations } from "next-intl/server";
import { EmptyState, TBody, THead, Table, Td, Th, Tr } from "@track-site/ui";
import { FORMER_AGENTS_ID, type AgentsView } from "@/server/support/reports";
import { count, duration } from "./format";
import { Figure, Note, Section, TableFrame } from "./section";

/** Workload per operator: open tickets now, replies sent and tickets solved inside the range, first responses of the range's tickets and their median time. */
export async function AgentsSection({ agents, locale }: { agents: AgentsView; locale: string }) {
  const t = await getTranslations("supportReports.agents");
  const aside = [
    <Figure
      key="agents"
      label={t("figures.agents")}
      value={count(agents.rows.filter((r) => r.id !== FORMER_AGENTS_ID).length, locale)}
    />,
    <Figure
      key="unassigned"
      label={t("figures.unassigned")}
      value={count(agents.unassignedOpen, locale)}
    />,
  ];
  return (
    <Section id="support-reports-agents" title={t("title")} intro={t("intro")} aside={aside}>
      {!agents.any ? (
        <EmptyState title={t("empty.title")} description={t("empty.text")} />
      ) : (
        <div className="space-y-2">
          <TableFrame>
            <Table caption={t("caption")}>
              <THead>
                <Tr>
                  <Th>{t("columns.agent")}</Th>
                  <Th className="text-right">{t("columns.open")}</Th>
                  <Th className="text-right">{t("columns.replies")}</Th>
                  <Th className="text-right">{t("columns.firstResponses")}</Th>
                  <Th className="text-right">{t("columns.median")}</Th>
                  <Th className="text-right">{t("columns.solved")}</Th>
                </Tr>
              </THead>
              <TBody>
                {agents.rows.map((row) => (
                  <Tr key={row.id}>
                    <Td label={t("columns.agent")} className="font-medium text-ink">
                      {row.name ?? <span className="font-normal text-ink-3">{t("former")}</span>}
                    </Td>
                    <Td label={t("columns.open")} numeric>
                      {count(row.open, locale)}
                    </Td>
                    <Td label={t("columns.replies")} numeric>
                      {count(row.replies, locale)}
                    </Td>
                    <Td label={t("columns.firstResponses")} numeric>
                      {count(row.firstResponses, locale)}
                    </Td>
                    <Td label={t("columns.median")} numeric className="text-ink-2">
                      {duration(row.medianFirstResponseMs, locale)}
                    </Td>
                    <Td label={t("columns.solved")} numeric>
                      {count(row.solved, locale)}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </TableFrame>
          <Note>{t("note")}</Note>
        </div>
      )}
    </Section>
  );
}
