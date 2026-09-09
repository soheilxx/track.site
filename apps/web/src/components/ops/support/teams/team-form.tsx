"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { Alert, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input, Textarea } from "@track-site/ui";
import { saveTeamAction, type SupportTeamActionState } from "@/server/ops/actions/support-teams";
import type { TeamSummary } from "@/server/support/teams";
import { TEAM_DESCRIPTION_MAX, TEAM_NAME_MAX, TEAM_SLUG_MAX } from "./constants";
import { errorLabel, fieldErrorLabel, noticeLabel } from "./labels";

const INITIAL: SupportTeamActionState = { ok: false, error: null, notice: null };

/** Create (no `team`) or rename a team; the slug is set once at creation. Field errors come from the action. */
export function TeamForm({ team }: { team: TeamSummary | null }) {
  const t = useTranslations("supportTeams");
  const ts = useTranslations("supportTeams.settings");
  const router = useRouter();
  const [state, action, pending] = useActionState(async (prev: SupportTeamActionState, formData: FormData) => {
    const result = await saveTeamAction(prev, formData);
    if (result.ok) {
      if (!team && result.id) router.push(`/ops/support/settings/teams/${result.id}`);
      else router.refresh();
    }
    return result;
  }, INITIAL);
  const err = (name: string) => fieldErrorLabel(t, state.fieldErrors?.[name]);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{team ? ts("editTitle") : ts("createTitle")}</CardTitle>
        <CardDescription>{team ? ts("editText", { slug: team.slug }) : ts("createText")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4" data-testid="support-team-form">
          {team ? <input type="hidden" name="teamId" value={team.id} /> : null}
          {state.ok && state.notice ? <Alert tone="ok">{noticeLabel(t, state.notice)}</Alert> : null}
          {!state.ok && state.error ? <Alert tone="bad">{errorLabel(t, state.error)}</Alert> : null}
          <Field label={ts("name")} required error={err("name")}>
            {(control) => <Input {...control} name="name" defaultValue={team?.name ?? ""} maxLength={TEAM_NAME_MAX} autoComplete="off" data-testid="support-team-name" />}
          </Field>
          {team ? null : (
            <Field label={ts("slug")} hint={ts("slugHint")} error={err("slug")}>
              {(control) => <Input {...control} name="slug" maxLength={TEAM_SLUG_MAX} autoComplete="off" className="font-mono" data-testid="support-team-slug" />}
            </Field>
          )}
          <Field label={ts("description")} error={err("description")}>
            {(control) => <Textarea {...control} name="description" defaultValue={team?.description ?? ""} maxLength={TEAM_DESCRIPTION_MAX} rows={3} />}
          </Field>
          <Button type="submit" loading={pending} loadingLabel={t("common.working")} data-testid="support-team-save">
            {team ? ts("save") : ts("create")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
