"use client";

import { UserCog } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useId, useState } from "react";
import type { PlatformRole } from "@track-site/core";
import { Button, Dialog, FieldError, FieldHint, Input, Label, Select, Textarea } from "@track-site/ui";
import { proposeRoleChangeAction } from "@/server/ops/actions/users";
import type { RoleChangeMode, RoleChangeRefusal } from "@/server/ops/users";
import { ROLE_REASON_MAX, ROLE_REASON_MIN, ROLE_TICKET_MAX } from "./constants";
import { ActionFeedback, initialState, useCloseOnSuccess } from "./action-feedback";
import { roleLabel } from "./labels";

export interface RoleChangeTarget {
  id: string;
  name: string;
  platformRole: string;
}

/** `PLATFORM_ROLES` of packages/core, repeated here so the client bundle never imports the core package's node-only modules; the server validates against the real list. */
const ROLES: readonly PlatformRole[] = ["NONE", "PLATFORM_SUPPORT", "PLATFORM_ADMIN"];

/**
 * Trigger + confirmation dialog of a role change. With a `target` it changes that account's role (operators
 * table, detail page); without one it is the "grant a platform role" form that finds the account by e-mail.
 * `mode` says what the change will be for the viewer — a four-eyes request or the single-admin fallback
 * (ticket required) — and a `refusal` (own account, last admin, or the only other admin who cannot approve
 * their own change: a third admin is needed) renders the trigger disabled with the reason.
 * The server re-checks everything; the hidden `confirm` field is what it verifies as the explicit confirmation.
 */
export function RoleChangeControl({
  target,
  mode,
  refusal = null,
  size = "md",
  variant = "secondary",
}: {
  target?: RoleChangeTarget;
  mode: RoleChangeMode;
  refusal?: RoleChangeRefusal | null;
  size?: "sm" | "md";
  variant?: "primary" | "secondary";
}) {
  const t = useTranslations("opsUsers");
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(proposeRoleChangeAction, initialState);
  const id = useId();
  useCloseOnSuccess(state, () => setOpen(false));
  const errors = state.fieldErrors ?? {};
  const emailError = errors.email ? (errors.email === "not_found" ? t("errors.not_found") : t("errors.invalid")) : null;
  const reasonError = errors.reason ? t("errors.invalid") : null;
  const ticketError = errors.ticketRef ? (errors.ticketRef === "required" ? t("errors.ticketRequired") : t("errors.invalid")) : null;
  const disabledReason =
    refusal === "self" ? t("operators.self") : refusal === "lastAdmin" ? t("operators.lastAdmin") : refusal === "needsThirdAdmin" ? t("errors.needsThirdAdmin") : refusal ? t(`errors.${refusal}`) : null;
  const roles = ROLES.filter((r) => r !== target?.platformRole);
  return (
    <div className="flex flex-col gap-2">
      <Button
        size={size}
        variant={variant}
        onClick={() => setOpen(true)}
        disabled={refusal !== null}
        aria-describedby={disabledReason ? `${id}-disabled` : undefined}
        aria-haspopup="dialog"
        leadingIcon={<UserCog className="size-4" aria-hidden="true" />}
        aria-label={target ? t("roleDialog.title", { name: target.name }) : undefined}
        data-testid={target ? "ops-user-change-role" : "ops-users-grant-role"}
      >
        {target ? t("operators.changeRole") : t("overview.grant")}
      </Button>
      {disabledReason ? (
        <p id={`${id}-disabled`} className="max-w-xs text-xs text-ink-3">
          {disabledReason}
        </p>
      ) : null}
      {state.ok || (state.error && !open) ? (
        <div className="w-full sm:max-w-md">
          <ActionFeedback state={state} />
        </div>
      ) : null}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={target ? t("roleDialog.title", { name: target.name }) : t("roleDialog.grantTitle")}
        description={target ? t("roleDialog.description", { role: roleLabel(t, target.platformRole) }) : t("roleDialog.grantDescription")}
        closeLabel={t("common.close")}
        size="md"
      >
        <form action={action} className="space-y-4 py-2">
          {target ? <input type="hidden" name="userId" value={target.id} /> : null}
          <input type="hidden" name="confirm" value="role" />
          {state.error ? <ActionFeedback state={state} /> : null}
          <p className="text-sm text-ink-2">{mode === "proposal" ? t("roleDialog.modeProposal") : t("roleDialog.modeSelf")}</p>
          {!target ? (
            <div>
              <Label htmlFor={`${id}-email`}>{t("roleDialog.email")}</Label>
              <Input id={`${id}-email`} name="email" type="email" required maxLength={254} autoComplete="off" className="mt-1.5" aria-describedby={`${id}-email-hint${emailError ? ` ${id}-email-error` : ""}`} state={emailError ? "error" : undefined} data-autofocus />
              <FieldError id={`${id}-email-error`}>{emailError}</FieldError>
              <FieldHint id={`${id}-email-hint`}>{t("roleDialog.emailHint")}</FieldHint>
            </div>
          ) : null}
          <div>
            <Label htmlFor={`${id}-role`}>{t("roleDialog.role")}</Label>
            <Select id={`${id}-role`} name="role" required defaultValue={roles.includes("PLATFORM_SUPPORT") ? "PLATFORM_SUPPORT" : roles[0]} className="mt-1.5">
              {roles.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(t, r)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor={`${id}-reason`}>{t("roleDialog.reason")}</Label>
            <Textarea id={`${id}-reason`} name="reason" required minLength={ROLE_REASON_MIN} maxLength={ROLE_REASON_MAX} rows={3} className="mt-1.5" aria-describedby={`${id}-reason-hint${reasonError ? ` ${id}-reason-error` : ""}`} state={reasonError ? "error" : undefined} data-autofocus={target ? true : undefined} />
            <FieldError id={`${id}-reason-error`}>{reasonError}</FieldError>
            <FieldHint id={`${id}-reason-hint`}>{t("roleDialog.reasonHint", { min: ROLE_REASON_MIN, max: ROLE_REASON_MAX })}</FieldHint>
          </div>
          <div>
            <Label htmlFor={`${id}-ticket`}>{t("roleDialog.ticket")}</Label>
            <Input id={`${id}-ticket`} name="ticketRef" maxLength={ROLE_TICKET_MAX} required={mode === "self"} autoComplete="off" className="mt-1.5" aria-describedby={`${id}-ticket-hint${ticketError ? ` ${id}-ticket-error` : ""}`} state={ticketError ? "error" : undefined} />
            <FieldError id={`${id}-ticket-error`}>{ticketError}</FieldError>
            <FieldHint id={`${id}-ticket-hint`}>{t("roleDialog.ticketHint")}</FieldHint>
          </div>
          <p className="text-xs text-ink-3">{t("roleDialog.signOut")}</p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" loading={pending}>
              {mode === "proposal" ? t("roleDialog.submit") : t("roleDialog.submitSelf")}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
