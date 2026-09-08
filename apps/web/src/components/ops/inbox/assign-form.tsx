"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Button, Label, Select, Status } from "@track-site/ui";
import { assignContactAction, type InboxActionError } from "@/server/ops/actions/inbox";
import { errorLabel } from "./labels";

export interface AssigneeOption {
  id: string;
  name: string;
}

/** Assignee select with save, plus a one-click "assign to me"; the outcome is announced next to the controls. */
export function AssignForm({ requestId, assigneeId, operators, selfId }: { requestId: string; assigneeId: string | null; operators: AssigneeOption[]; selfId: string }) {
  const t = useTranslations("opsInbox");
  const router = useRouter();
  const selectId = useId();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(assigneeId ?? "");
  const [result, setResult] = useState<{ ok: boolean; error: InboxActionError | null } | null>(null);

  const save = (next: string | null) =>
    startTransition(async () => {
      let outcome: { ok: boolean; error: InboxActionError | null };
      try {
        outcome = await assignContactAction({ requestId, assigneeUserId: next });
      } catch {
        outcome = { ok: false, error: "generic" };
      }
      setResult(outcome);
      if (outcome.ok) {
        setValue(next ?? "");
        router.refresh();
      }
    });

  const changed = value !== (assigneeId ?? "");
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        save(value || null);
      }}
    >
      <div>
        <Label htmlFor={selectId}>{t("detail.assign.label")}</Label>
        <Select id={selectId} name="assigneeUserId" value={value} onChange={(e) => setValue(e.target.value)} className="mt-1.5">
          <option value="">{t("common.unassigned")}</option>
          {operators.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
              {o.id === selfId ? ` (${t("common.you")})` : ""}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" variant="secondary" disabled={!changed} loading={pending} loadingLabel={t("common.working")}>
          {t("detail.assign.save")}
        </Button>
        {assigneeId !== selfId ? (
          <Button type="button" size="sm" variant="ghost" loading={pending} loadingLabel={t("common.working")} onClick={() => save(selfId)} data-testid="inbox-assign-self">
            {t("detail.assign.takeOver")}
          </Button>
        ) : null}
      </div>
      <span role="status" aria-live="polite" className="block text-xs">
        {result ? (
          <Status tone={result.ok ? "ok" : "bad"} indicator="icon" className="text-xs">
            {result.ok ? t("detail.assign.saved") : errorLabel(t, result.error)}
          </Status>
        ) : null}
      </span>
    </form>
  );
}
