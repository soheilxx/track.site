"use client";

import { ShieldOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useId, useState } from "react";
import { Alert, Button, Dialog, FieldError, FieldHint, Input, Label, Select, Textarea } from "@track-site/ui";
import { resetTwoFactorAction } from "@/server/ops/actions/users";
import { ROLE_REASON_MAX, ROLE_REASON_MIN, ROLE_TICKET_MAX } from "./constants";
import { ActionFeedback, initialState, useCloseOnSuccess } from "./action-feedback";

export interface TwoFactorResetOrganization {
  id: string;
  name: string;
}

/**
 * "Reset two-factor" for another account (docs/17 §"Two-factor reset"): confirmation dialog with a
 * mandatory reason; for customer accounts (no platform role) the ticket reference is mandatory too and,
 * when the account belongs to organisations, the ticket's organisation is chosen so the audit entry lands
 * in that organisation's log. Hidden while the account has no two-factor (nothing to reset), disabled
 * with the reason for the admin's own account. The server re-checks every rule and e-mails the person.
 */
export function TwoFactorResetControl({
  userId,
  name,
  isSelf,
  twoFactor,
  platformRole,
  organizations = [],
  size = "md",
}: {
  userId: string;
  name: string;
  isSelf: boolean;
  twoFactor: boolean;
  platformRole: string;
  organizations?: TwoFactorResetOrganization[];
  size?: "sm" | "md";
}) {
  const t = useTranslations("opsUsers");
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(resetTwoFactorAction, initialState);
  const id = useId();
  useCloseOnSuccess(state, () => setOpen(false));
  if (!twoFactor) return null;
  const support = platformRole === "NONE";
  const errors = state.fieldErrors ?? {};
  const reasonError = errors.reason ? t("errors.invalid") : null;
  const ticketError = errors.ticketRef ? (errors.ticketRef === "required" ? t("errors.ticketRequired") : t("errors.invalid")) : null;
  const organizationError = errors.organizationId ? (errors.organizationId === "required" ? t("errors.organizationRequired") : t("errors.notMember")) : null;
  return (
    <div className="flex flex-col gap-2">
      <Button
        size={size}
        variant="ghost"
        onClick={() => setOpen(true)}
        disabled={isSelf}
        aria-describedby={isSelf ? `${id}-disabled` : undefined}
        aria-haspopup="dialog"
        leadingIcon={<ShieldOff className="size-4" aria-hidden="true" />}
        aria-label={t("twoFactorDialog.title", { name })}
        data-testid="ops-user-reset-two-factor"
      >
        {t("operators.resetTwoFactor")}
      </Button>
      {isSelf ? (
        <p id={`${id}-disabled`} className="max-w-xs text-xs text-ink-3">
          {t("operators.selfTwoFactor")}
        </p>
      ) : null}
      {state.ok || (state.error && !open) ? (
        <div className="w-full sm:max-w-md">
          <ActionFeedback state={state} />
        </div>
      ) : null}
      <Dialog open={open} onClose={() => setOpen(false)} title={t("twoFactorDialog.title", { name })} description={t("twoFactorDialog.text")} closeLabel={t("common.close")} size="md">
        <form action={action} className="space-y-4 py-2">
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="confirm" value="twoFactorReset" />
          {state.error ? <ActionFeedback state={state} /> : null}
          <Alert tone={support ? "info" : "warn"}>{support ? t("twoFactorDialog.customerHint") : t("twoFactorDialog.operatorHint")}</Alert>
          <div>
            <Label htmlFor={`${id}-reason`}>{t("twoFactorDialog.reason")}</Label>
            <Textarea id={`${id}-reason`} name="reason" required minLength={ROLE_REASON_MIN} maxLength={ROLE_REASON_MAX} rows={3} className="mt-1.5" aria-describedby={`${id}-reason-hint${reasonError ? ` ${id}-reason-error` : ""}`} state={reasonError ? "error" : undefined} data-autofocus />
            <FieldError id={`${id}-reason-error`}>{reasonError}</FieldError>
            <FieldHint id={`${id}-reason-hint`}>{t("twoFactorDialog.reasonHint", { min: ROLE_REASON_MIN, max: ROLE_REASON_MAX })}</FieldHint>
          </div>
          <div>
            <Label htmlFor={`${id}-ticket`}>{t("twoFactorDialog.ticket")}</Label>
            <Input id={`${id}-ticket`} name="ticketRef" maxLength={ROLE_TICKET_MAX} required={support} autoComplete="off" className="mt-1.5" aria-describedby={`${id}-ticket-hint${ticketError ? ` ${id}-ticket-error` : ""}`} state={ticketError ? "error" : undefined} />
            <FieldError id={`${id}-ticket-error`}>{ticketError}</FieldError>
            <FieldHint id={`${id}-ticket-hint`}>{support ? t("twoFactorDialog.ticketHint") : t("twoFactorDialog.ticketOptionalHint")}</FieldHint>
          </div>
          {support && organizations.length ? (
            <div>
              <Label htmlFor={`${id}-organization`}>{t("twoFactorDialog.organisation")}</Label>
              <Select id={`${id}-organization`} name="organizationId" required defaultValue={organizations[0]?.id} className="mt-1.5" aria-describedby={`${id}-organization-hint${organizationError ? ` ${id}-organization-error` : ""}`}>
                {organizations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </Select>
              <FieldError id={`${id}-organization-error`}>{organizationError}</FieldError>
              <FieldHint id={`${id}-organization-hint`}>{t("twoFactorDialog.organisationHint")}</FieldHint>
            </div>
          ) : null}
          <p className="text-xs text-ink-3">{t("twoFactorDialog.notice")}</p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" variant="danger" loading={pending}>
              {t("twoFactorDialog.confirm")}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
