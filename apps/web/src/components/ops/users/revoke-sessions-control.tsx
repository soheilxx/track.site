"use client";

import { LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useId, useState } from "react";
import { Alert, Button, Dialog, FieldError, FieldHint, Label, Textarea } from "@track-site/ui";
import { revokeSessionsAction } from "@/server/ops/actions/users";
import { ROLE_REASON_MAX, ROLE_REASON_MIN } from "./constants";
import { ActionFeedback, initialState, useCloseOnSuccess } from "./action-feedback";

/**
 * "Sign out everywhere" for an operator account: confirmation dialog with a mandatory reason; the server
 * deletes the stored session rows, audits the count and refuses customer accounts (directory is read-only).
 */
export function RevokeSessionsControl({ userId, name, isSelf, activeSessions, cacheMinutes, size = "md" }: { userId: string; name: string; isSelf: boolean; activeSessions: number; cacheMinutes: number; size?: "sm" | "md" }) {
  const t = useTranslations("opsUsers");
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(revokeSessionsAction, initialState);
  const id = useId();
  useCloseOnSuccess(state, () => setOpen(false));
  const reasonError = state.fieldErrors?.reason ? t("errors.invalid") : null;
  return (
    <div className="flex flex-col gap-2">
      <Button size={size} variant="ghost" onClick={() => setOpen(true)} aria-haspopup="dialog" leadingIcon={<LogOut className="size-4" aria-hidden="true" />} aria-label={t("revokeDialog.title", { name })} data-testid="ops-user-revoke-sessions">
        {t("operators.revokeSessions")}
      </Button>
      {state.ok || (state.error && !open) ? (
        <div className="w-full sm:max-w-md">
          <ActionFeedback state={state} />
        </div>
      ) : null}
      <Dialog open={open} onClose={() => setOpen(false)} title={t("revokeDialog.title", { name })} description={t("revokeDialog.text")} closeLabel={t("common.close")} size="md">
        <form action={action} className="space-y-4 py-2">
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="confirm" value="revoke" />
          {state.error ? <ActionFeedback state={state} /> : null}
          {isSelf ? <Alert tone="warn">{t("revokeDialog.selfWarning")}</Alert> : null}
          <p className="text-sm text-ink-2">
            {t("operators.activeSessions", { count: activeSessions })} · {t("revokeDialog.cache", { minutes: cacheMinutes })}
          </p>
          <div>
            <Label htmlFor={`${id}-reason`}>{t("revokeDialog.reason")}</Label>
            <Textarea id={`${id}-reason`} name="reason" required minLength={ROLE_REASON_MIN} maxLength={ROLE_REASON_MAX} rows={3} className="mt-1.5" aria-describedby={`${id}-reason-hint${reasonError ? ` ${id}-reason-error` : ""}`} state={reasonError ? "error" : undefined} data-autofocus />
            <FieldError id={`${id}-reason-error`}>{reasonError}</FieldError>
            <FieldHint id={`${id}-reason-hint`}>{t("revokeDialog.reasonHint", { min: ROLE_REASON_MIN })}</FieldHint>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" variant="danger" loading={pending}>
              {t("revokeDialog.confirm")}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
