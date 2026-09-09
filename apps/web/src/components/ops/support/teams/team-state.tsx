"use client";

import { Archive, ArchiveRestore, Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Dialog } from "@track-site/ui";
import { formatDateTime } from "@/components/ops/support/list/format";
import { archiveTeamAction, setDefaultTeamAction, type SupportTeamActionState } from "@/server/ops/actions/support-teams";
import type { TeamSummary } from "@/server/support/teams";
import { errorLabel, noticeLabel } from "./labels";

/** Default flag and archive / restore of a team; archiving is confirmed in a dialog, the default team cannot be archived. */
export function TeamState({ team, locale }: { team: TeamSummary; locale: string }) {
  const t = useTranslations("supportTeams");
  const ts = useTranslations("supportTeams.settings");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [state, setState] = useState<SupportTeamActionState | null>(null);
  const [open, setOpen] = useState(false);
  const run = (fn: () => Promise<SupportTeamActionState>) =>
    start(async () => {
      const result = await fn();
      setState(result);
      if (result.ok) {
        setOpen(false);
        router.refresh();
      }
    });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{ts("stateTitle")}</CardTitle>
        <CardDescription>{team.isDefault ? ts("isDefault") : team.archivedAt ? ts("archivedText", { date: formatDateTime(team.archivedAt, locale) ?? "" }) : ts("notDefault")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {state?.ok && state.notice ? <Alert tone="ok">{noticeLabel(t, state.notice)}</Alert> : null}
        {state && !state.ok && state.error && !open ? <Alert tone="bad">{errorLabel(t, state.error)}</Alert> : null}
        <div className="flex flex-wrap gap-2">
          {!team.isDefault && !team.archivedAt ? (
            <Button type="button" variant="secondary" disabled={pending} leadingIcon={<Star className="size-4" aria-hidden="true" />} onClick={() => run(() => setDefaultTeamAction({ teamId: team.id }))} data-testid="support-team-default">
              {ts("setDefault")}
            </Button>
          ) : null}
          {team.archivedAt ? (
            <Button type="button" variant="secondary" disabled={pending} leadingIcon={<ArchiveRestore className="size-4" aria-hidden="true" />} onClick={() => run(() => archiveTeamAction({ teamId: team.id, archived: false }))} data-testid="support-team-restore">
              {ts("restore")}
            </Button>
          ) : !team.isDefault ? (
            <Button type="button" variant="danger" disabled={pending} aria-haspopup="dialog" leadingIcon={<Archive className="size-4" aria-hidden="true" />} onClick={() => setOpen(true)} data-testid="support-team-archive">
              {ts("archive")}
            </Button>
          ) : null}
        </div>
      </CardContent>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={ts("archiveDialog.title")}
        description={ts("archiveDialog.description", { name: team.name })}
        closeLabel={t("common.close")}
        size="sm"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} data-autofocus>
              {t("common.cancel")}
            </Button>
            <Button type="button" variant="danger" loading={pending} loadingLabel={t("common.working")} onClick={() => run(() => archiveTeamAction({ teamId: team.id, archived: true, confirmed: true }))} data-testid="support-team-archive-confirm">
              {ts("archiveDialog.confirm")}
            </Button>
          </>
        }
      >
        {state && !state.ok && state.error ? <Alert tone="bad">{errorLabel(t, state.error)}</Alert> : null}
      </Dialog>
    </Card>
  );
}
