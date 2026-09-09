import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Badge, EmptyState, Status, TBody, THead, Table, Td, Th, Tr } from "@track-site/ui";
import { formatDateTime } from "@/components/ops/support/list/format";
import type { TeamSummary } from "@/server/support/teams";

/** Teams as stored (default first, archived last) with member and open-ticket counts; each row links to its detail. */
export async function TeamsTable({ teams, locale }: { teams: TeamSummary[]; locale: string }) {
  const t = await getTranslations("supportTeams.settings");
  if (!teams.length) return <EmptyState title={t("empty")} description={t("emptyText")} />;
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface px-2 py-2 sm:px-3">
      <Table caption={t("caption")}>
        <THead>
          <Tr>
            <Th>{t("columns.team")}</Th>
            <Th>{t("columns.members")}</Th>
            <Th>{t("columns.open")}</Th>
            <Th>{t("columns.state")}</Th>
            <Th>{t("columns.updated")}</Th>
          </Tr>
        </THead>
        <TBody>
          {teams.map((team) => (
            <Tr key={team.id} data-testid="support-team-row">
              <Td label={t("columns.team")}>
                <Link href={`/ops/support/settings/teams/${team.id}`} aria-label={t("openTeam", { name: team.name })} className="inline-flex min-h-9 items-center rounded-[var(--radius-control-sm)] font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary pointer-coarse:min-h-11">
                  {team.name}
                </Link>
                <p className="font-mono text-xs text-ink-3">{team.slug}</p>
                {team.description ? <p className="mt-1 text-xs text-ink-2">{team.description}</p> : null}
              </Td>
              <Td label={t("columns.members")} className="tabular-nums">
                {t("memberCount", { count: team.memberCount })}
              </Td>
              <Td label={t("columns.open")} className="tabular-nums">
                {t("openCount", { count: team.openTickets })}
              </Td>
              <Td label={t("columns.state")}>
                <div className="flex flex-wrap gap-1">
                  {team.isDefault ? <Badge tone="primary">{t("default")}</Badge> : null}
                  <Status tone={team.archivedAt ? "neutral" : "ok"} indicator="dot" chip>
                    {team.archivedAt ? t("archived") : t("active")}
                  </Status>
                </div>
              </Td>
              <Td label={t("columns.updated")} className="whitespace-nowrap text-ink-2">
                <time dateTime={team.updatedAt}>{formatDateTime(team.updatedAt, locale)}</time>
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
