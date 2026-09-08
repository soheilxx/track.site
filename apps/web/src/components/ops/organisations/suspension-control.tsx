"use client";

import { useTranslations } from "next-intl";
import { useActionState, useId, useState } from "react";
import { Button, Dialog, FieldError, FieldHint, Input, Label, Textarea } from "@track-site/ui";
import { suspendOrganisationAction, unsuspendOrganisationAction } from "@/server/ops/actions/organisations";
import { ActionFeedback, initialState, useCloseOnSuccess } from "./action-feedback";

/**
 * Suspend / lift suspension (tenant kill switch). Admin only: support operators see the button
 * disabled with the reason. The action runs from a confirmation dialog with a mandatory reason and an
 * optional ticket reference; the hidden `confirm` field is what the server re-checks.
 */
export function SuspensionControl({ organizationId, name, suspended, canManage }: { organizationId: string; name: string; suspended: boolean; canManage: boolean }) {
  const t = useTranslations("opsOrganisations");
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(suspended ? unsuspendOrganisationAction : suspendOrganisationAction, initialState);
  const id = useId();
  useCloseOnSuccess(state, () => setOpen(false));
  const reasonError = state.fieldErrors?.reason ? t("errors.invalid") : null;
  return (
    <div className="flex flex-col items-end gap-2">
      <Button variant={suspended ? "secondary" : "danger"} onClick={() => setOpen(true)} disabled={!canManage} aria-haspopup="dialog" data-testid="ops-organisation-suspension">
        {suspended ? t("detail.suspension.unsuspend") : t("detail.suspension.suspend")}
      </Button>
      {!canManage ? <p className="max-w-xs text-right text-xs text-ink-3">{t("common.adminOnly")}</p> : null}
      {state.ok || state.error ? (
        <div className="w-full sm:max-w-md">
          <ActionFeedback state={state} />
        </div>
      ) : null}
      <Dialog open={open} onClose={() => setOpen(false)} title={suspended ? t("detail.suspension.unsuspendTitle", { name }) : t("detail.suspension.suspendTitle", { name })} description={suspended ? t("detail.suspension.unsuspendText") : t("detail.suspension.suspendText")} closeLabel={t("common.close")} size="md">
        <form action={action} className="space-y-4 py-2">
          <input type="hidden" name="organizationId" value={organizationId} />
          <input type="hidden" name="confirm" value={suspended ? "unsuspend" : "suspend"} />
          {state.error ? <ActionFeedback state={state} /> : null}
          <div>
            <Label htmlFor={`${id}-reason`}>{t("detail.suspension.reason")}</Label>
            <Textarea id={`${id}-reason`} name="reason" required minLength={5} maxLength={500} rows={3} className="mt-1.5" aria-describedby={`${id}-reason-hint${reasonError ? ` ${id}-reason-error` : ""}`} state={reasonError ? "error" : undefined} data-autofocus />
            <FieldError id={`${id}-reason-error`}>{reasonError}</FieldError>
            <FieldHint id={`${id}-reason-hint`}>{t("detail.suspension.reasonHint")}</FieldHint>
          </div>
          <div>
            <Label htmlFor={`${id}-ticket`}>{t("detail.suspension.ticket")}</Label>
            <Input id={`${id}-ticket`} name="ticketRef" maxLength={80} autoComplete="off" className="mt-1.5" aria-describedby={`${id}-ticket-hint`} />
            <FieldHint id={`${id}-ticket-hint`}>{t("detail.suspension.ticketHint")}</FieldHint>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" variant={suspended ? "primary" : "danger"} loading={pending}>
              {suspended ? t("detail.suspension.confirmUnsuspend") : t("detail.suspension.confirmSuspend")}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
