"use client";

import { UserMinus, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Label, Select, TBody, THead, Table, Td, Th, Tr } from "@track-site/ui";
import { formatDateTime } from "@/components/ops/support/list/format";
import { addTeamMemberAction, removeTeamMemberAction, type SupportTeamActionState } from "@/server/ops/actions/support-teams";
import type { TeamDetail, TeamOperatorOption } from "@/server/support/teams";
import { TEAM_ROLES, type TeamRole } from "./constants";
import { errorLabel, noticeLabel } from "./labels";

/**
 * Members of a team: the table with role change and removal per row, and the "add operator" row (every
 * platform operator not yet in the team). Each control calls its server action and refreshes the page.
 */
export function TeamMembers({ team, operators, selfId, locale }: { team: TeamDetail; operators: TeamOperatorOption[]; selfId: string; locale: string }) {
  const t = useTranslations("supportTeams");
  const ts = useTranslations("supportTeams.settings");
  const router = useRouter();
  const ids = useId();
  const [pending, start] = useTransition();
  const [state, setState] = useState<SupportTeamActionState | null>(null);
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<TeamRole>("member");
  const memberIds = new Set(team.members.map((m) => m.userId));
  const candidates = operators.filter((o) => !memberIds.has(o.id));

  const run = (fn: () => Promise<SupportTeamActionState>) =>
    start(async () => {
      const result = await fn();
      setState(result);
      if (result.ok) {
        setUserId("");
        router.refresh();
      }
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{ts("membersTitle")}</CardTitle>
        <CardDescription>{ts("membersText")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {state?.ok && state.notice ? <Alert tone="ok">{noticeLabel(t, state.notice)}</Alert> : null}
        {state && !state.ok && state.error ? <Alert tone="bad">{errorLabel(t, state.error)}</Alert> : null}
        {team.members.length === 0 ? (
          <EmptyState title={ts("noMembers")} description={ts("noMembersText")} />
        ) : (
          <div className="rounded-[var(--radius-card)] border border-line bg-surface px-2 py-2 sm:px-3">
            <Table caption={ts("membersCaption")}>
              <THead>
                <Tr>
                  <Th>{ts("memberColumns.member")}</Th>
                  <Th>{ts("memberColumns.role")}</Th>
                  <Th>{ts("memberColumns.since")}</Th>
                  <Th>{ts("memberColumns.actions")}</Th>
                </Tr>
              </THead>
              <TBody>
                {team.members.map((m) => (
                  <Tr key={m.userId} data-testid="support-team-member-row">
                    <Td label={ts("memberColumns.member")}>
                      <p className="font-medium text-ink">
                        {m.name}
                        {m.userId === selfId ? <span className="text-ink-3"> ({t("common.you")})</span> : null}
                      </p>
                      <p className="break-all text-xs text-ink-3">{m.email}</p>
                    </Td>
                    <Td label={ts("memberColumns.role")}>
                      <Badge tone={m.role === "lead" ? "primary" : "neutral"}>{t(`roles.${m.role}`)}</Badge>
                    </Td>
                    <Td label={ts("memberColumns.since")} className="whitespace-nowrap text-ink-2">
                      <time dateTime={m.joinedAt}>{formatDateTime(m.joinedAt, locale)}</time>
                    </Td>
                    <Td label={ts("memberColumns.actions")}>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="secondary" size="sm" disabled={pending} aria-label={ts("roleLabel", { name: m.name })} onClick={() => run(() => addTeamMemberAction({ teamId: team.id, userId: m.userId, role: m.role === "lead" ? "member" : "lead" }))}>
                          {m.role === "lead" ? ts("makeMember") : ts("makeLead")}
                        </Button>
                        <Button type="button" variant="ghost" size="sm" disabled={pending} aria-label={ts("removeLabel", { name: m.name })} leadingIcon={<UserMinus className="size-4" aria-hidden="true" />} onClick={() => run(() => removeTeamMemberAction({ teamId: team.id, userId: m.userId }))} data-testid="support-team-member-remove">
                          {ts("remove")}
                        </Button>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
          <div className="min-w-0">
            <Label htmlFor={`${ids}-user`}>{ts("addMember")}</Label>
            <Select id={`${ids}-user`} value={userId} onChange={(e) => setUserId(e.target.value)} disabled={!candidates.length} className="mt-1.5" data-testid="support-team-add-user">
              <option value="">{candidates.length ? ts("addMemberPlaceholder") : ts("allAdded")}</option>
              {candidates.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} · {o.email}
                </option>
              ))}
            </Select>
          </div>
          <div className="min-w-0">
            <Label htmlFor={`${ids}-role`}>{ts("addMemberRole")}</Label>
            <Select id={`${ids}-role`} value={role} onChange={(e) => setRole(e.target.value as TeamRole)} className="mt-1.5">
              {TEAM_ROLES.map((r) => (
                <option key={r} value={r}>
                  {t(`roles.${r}`)}
                </option>
              ))}
            </Select>
          </div>
          <Button type="button" variant="secondary" disabled={!userId || pending} loading={pending} loadingLabel={t("common.working")} leadingIcon={<UserPlus className="size-4" aria-hidden="true" />} onClick={() => run(() => addTeamMemberAction({ teamId: team.id, userId, role }))} data-testid="support-team-add">
            {ts("add")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
