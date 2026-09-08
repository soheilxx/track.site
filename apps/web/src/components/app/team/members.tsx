"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useActionState, useId, useState } from "react";
import type { OrgRole } from "@track-site/core";
import { Alert, Badge, Button, Dialog, FieldError, FieldHint, Input, Label, Select, Status, Td, Textarea, Tr } from "@track-site/ui";
import { formatDate } from "@/lib/format";
import { cancelInvitationAction, inviteMemberAction, removeMemberAction, resendInvitationAction, resetMemberTwoFactorAction, updateMemberRoleAction, type TeamActionState } from "@/server/actions/team";
import type { PermissionGroup, SeatUsage } from "@/server/team";
import { TWO_FACTOR_RESET_REASON_MAX, TWO_FACTOR_RESET_REASON_MIN, errorLabel, roleLabel } from "./labels";
import { PermissionsSheet } from "./permissions-sheet";

const initial: TeamActionState = { ok: false, error: null, notice: null };

/**
 * Closes a confirmation dialog once its action succeeded. Implemented as "state adjusted during
 * render" (the last seen action state is tracked) instead of an effect, so no cascading render.
 */
export function useCloseOnSuccess(state: TeamActionState, setOpen: (open: boolean) => void): void {
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state.ok) setOpen(false);
  }
}

/** Result of a team action: the notice on success, the mapped error otherwise. */
export function ActionFeedback({ state }: { state: TeamActionState }) {
  const t = useTranslations("team");
  if (state.ok && state.notice) return <Alert tone={state.notice === "roleRequested" ? "info" : state.notice === "twoFactorResetNoMail" ? "warn" : "ok"}>{t(`notices.${state.notice}`)}</Alert>;
  if (state.error) return <Alert tone="bad">{errorLabel(t, state.error)}</Alert>;
  return null;
}

/** Invitation form; blocked with an honest note (and the plan comparison) when every seat is used. */
export function InviteForm({ roles, seats, planName }: { roles: OrgRole[]; seats: SeatUsage; planName: string }) {
  const t = useTranslations("team");
  const [state, action, pending] = useActionState(inviteMemberAction, initial);
  const blocked = seats.reached;
  return (
    <form action={action} className="space-y-3">
      <ActionFeedback state={state} />
      {blocked ? (
        <Alert tone="warn" title={t("invite.seatLimitTitle")}>
          {t("invite.seatLimit", { plan: planName, cap: seats.cap ?? 0 })}{" "}
          <Link href="/app/billing" className="font-medium text-primary underline-offset-2 hover:underline">
            {t("invite.comparePlans")}
          </Link>
        </Alert>
      ) : null}
      <div>
        <Label htmlFor="invite-email">{t("invite.email")}</Label>
        <Input id="invite-email" name="email" type="email" required autoComplete="off" className="mt-1" aria-invalid={state.fieldErrors?.email ? true : undefined} disabled={blocked} />
      </div>
      <div>
        <Label htmlFor="invite-role">{t("invite.role")}</Label>
        <Select id="invite-role" name="role" className="mt-1" defaultValue={roles.includes("ANALYST") ? "ANALYST" : roles[0]} disabled={blocked}>
          {roles.map((r) => (
            <option key={r} value={r}>
              {roleLabel(t, r)}
            </option>
          ))}
        </Select>
      </div>
      <Button type="submit" loading={pending} disabled={blocked}>
        {t("invite.send")}
      </Button>
    </form>
  );
}

export interface MemberRowData {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: OrgRole;
  twoFactor: boolean;
  /** ISO string (serializable) */
  joinedAt: string;
  isSelf: boolean;
}

/**
 * One member: role change (OWNER changes behind a confirmation dialog; behind four eyes the server
 * stores a request instead), two-factor state, permissions sheet, the two-factor reset (owners and
 * admins, owners only by owners; reason mandatory, the member is e-mailed) and removal — each behind a
 * dialog. `canResetTwoFactor` is derived from the viewer's assignable roles when the page does not pass
 * it: `assignableRoles` names OWNER for an owner and every other role for an admin — the same two roles
 * that hold `members.security` (packages/core `canResetTwoFactor`); the server re-checks the permission,
 * the owner rule and the own-account rule in any case.
 */
export function MemberRow({ member, roles, groups, canUpdate, canRemove, canResetTwoFactor, locale }: { member: MemberRowData; roles: OrgRole[]; groups: PermissionGroup[]; canUpdate: boolean; canRemove: boolean; canResetTwoFactor?: boolean; locale: string }) {
  const t = useTranslations("team");
  const [roleState, roleAction, rolePending] = useActionState(updateMemberRoleAction, initial);
  const [removeState, removeAction, removePending] = useActionState(removeMemberAction, initial);
  const [resetState, resetAction, resetPending] = useActionState(resetMemberTwoFactorAction, initial);
  const [role, setRole] = useState<OrgRole>(member.role);
  const [ownerOpen, setOwnerOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const resetId = useId();
  useCloseOnSuccess(roleState, setOwnerOpen);
  useCloseOnSuccess(removeState, setRemoveOpen);
  useCloseOnSuccess(resetState, setResetOpen);
  const ownerInvolved = member.role === "OWNER" || role === "OWNER";
  const changed = role !== member.role;
  const options = Array.from(new Set<OrgRole>([member.role, ...roles]));
  const selectId = `role-${member.id}`;
  const viewerIsOwner = roles.includes("OWNER");
  const viewerMayReset = canResetTwoFactor ?? (roles.length > 0 && (member.role !== "OWNER" || viewerIsOwner));
  const showReset = !member.isSelf && member.twoFactor && viewerMayReset;
  const resetReasonError = resetState.fieldErrors?.reason ? t("errors.reasonRequired") : null;
  const feedback = roleState.error || roleState.notice ? roleState : resetState.error || resetState.notice ? resetState : removeState;
  return (
    <Tr>
      <Td label={t("members.member")}>
        <p className="font-medium text-ink">
          {member.name} {member.isSelf ? <span className="text-xs font-normal text-ink-3">({t("members.you")})</span> : null}
        </p>
        <p className="text-xs text-ink-3">{member.email}</p>
        {feedback.error || feedback.notice ? (
          <div className="mt-2">
            <ActionFeedback state={feedback} />
          </div>
        ) : null}
      </Td>
      <Td label={t("members.role")}>
        {canUpdate && roles.length ? (
          <form action={roleAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="memberId" value={member.id} />
            <label htmlFor={selectId} className="sr-only">
              {t("members.roleSelect", { name: member.name })}
            </label>
            <Select id={selectId} name="role" value={role} onChange={(e) => setRole(e.target.value as OrgRole)} className="min-w-36 text-xs">
              {options.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(t, r)}
                </option>
              ))}
            </Select>
            {ownerInvolved ? (
              <Button type="button" size="sm" variant="secondary" disabled={!changed} onClick={() => setOwnerOpen(true)} aria-haspopup="dialog">
                {t("members.save")}
              </Button>
            ) : (
              <Button type="submit" size="sm" variant="secondary" disabled={!changed} loading={rolePending}>
                {t("members.save")}
              </Button>
            )}
          </form>
        ) : (
          <Badge tone={member.role === "OWNER" ? "primary" : "neutral"}>{roleLabel(t, member.role)}</Badge>
        )}
      </Td>
      <Td label={t("members.twoFactor")}>
        <Status tone={member.twoFactor ? "ok" : "warn"} indicator="icon">
          {member.twoFactor ? t("members.twoFactorOn") : t("members.twoFactorOff")}
        </Status>
      </Td>
      <Td label={t("members.joined")} className="whitespace-nowrap text-ink-2">
        {formatDate(member.joinedAt, locale, "short")}
      </Td>
      <Td label={t("members.actions")}>
        <div className="flex flex-wrap items-center gap-2">
          <PermissionsSheet name={member.name} role={member.role} groups={groups} />
          {showReset ? (
            <Button size="sm" variant="ghost" onClick={() => setResetOpen(true)} aria-haspopup="dialog" aria-label={t("members.twoFactorDialog.title", { name: member.name })} data-testid="team-member-reset-two-factor">
              {t("members.resetTwoFactor")}
            </Button>
          ) : null}
          {canRemove ? (
            <Button size="sm" variant="ghost" onClick={() => setRemoveOpen(true)} aria-haspopup="dialog">
              {t("members.remove")}
            </Button>
          ) : null}
        </div>

        <Dialog open={resetOpen} onClose={() => setResetOpen(false)} title={t("members.twoFactorDialog.title", { name: member.name })} description={t("members.twoFactorDialog.description", { email: member.email })} closeLabel={t("common.close")} size="md">
          <form action={resetAction} className="space-y-4 py-2">
            <input type="hidden" name="memberId" value={member.id} />
            <input type="hidden" name="confirm" value="twoFactorReset" />
            {resetState.error ? <ActionFeedback state={resetState} /> : null}
            <div>
              <Label htmlFor={`${resetId}-reason`}>{t("members.twoFactorDialog.reason")}</Label>
              <Textarea id={`${resetId}-reason`} name="reason" required minLength={TWO_FACTOR_RESET_REASON_MIN} maxLength={TWO_FACTOR_RESET_REASON_MAX} rows={3} className="mt-1.5" aria-describedby={`${resetId}-reason-hint${resetReasonError ? ` ${resetId}-reason-error` : ""}`} state={resetReasonError ? "error" : undefined} data-autofocus />
              <FieldError id={`${resetId}-reason-error`}>{resetReasonError}</FieldError>
              <FieldHint id={`${resetId}-reason-hint`}>{t("members.twoFactorDialog.reasonHint", { min: TWO_FACTOR_RESET_REASON_MIN })}</FieldHint>
            </div>
            <p className="text-xs text-ink-3">{t("members.twoFactorDialog.notice")}</p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="secondary" onClick={() => setResetOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" variant="danger" loading={resetPending}>
                {t("members.twoFactorDialog.confirm")}
              </Button>
            </div>
          </form>
        </Dialog>

        <Dialog open={ownerOpen} onClose={() => setOwnerOpen(false)} title={t("members.ownerDialog.title")} description={t("members.ownerDialog.description", { name: member.name, from: roleLabel(t, member.role), to: roleLabel(t, role) })} closeLabel={t("common.close")} size="sm">
          <form action={roleAction} className="flex flex-col-reverse gap-2 py-2 sm:flex-row sm:justify-end">
            <input type="hidden" name="memberId" value={member.id} />
            <input type="hidden" name="role" value={role} />
            <input type="hidden" name="confirm" value="owner" />
            <Button type="button" variant="secondary" onClick={() => setOwnerOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" variant="danger" loading={rolePending} data-autofocus>
              {t("members.ownerDialog.confirm")}
            </Button>
          </form>
        </Dialog>

        <Dialog open={removeOpen} onClose={() => setRemoveOpen(false)} title={t("members.removeDialog.title", { name: member.name })} description={t("members.removeDialog.description", { email: member.email })} closeLabel={t("common.close")} size="sm">
          <form action={removeAction} className="flex flex-col-reverse gap-2 py-2 sm:flex-row sm:justify-end">
            <input type="hidden" name="memberId" value={member.id} />
            <input type="hidden" name="confirm" value="remove" />
            <Button type="button" variant="secondary" onClick={() => setRemoveOpen(false)} data-autofocus>
              {t("common.cancel")}
            </Button>
            <Button type="submit" variant="danger" loading={removePending}>
              {t("members.removeDialog.confirm")}
            </Button>
          </form>
        </Dialog>
      </Td>
    </Tr>
  );
}

export interface PendingInvitationData {
  id: string;
  email: string;
  role: OrgRole | null;
  inviterName: string | null;
  /** ISO string */
  expiresAt: string;
  expired: boolean;
}

/** Pending invitation with resend and cancel (both audited; neither is destructive for existing access). */
export function PendingInvitationRow({ invitation, canManage, locale }: { invitation: PendingInvitationData; canManage: boolean; locale: string }) {
  const t = useTranslations("team");
  const [cancelState, cancelAction, cancelling] = useActionState(cancelInvitationAction, initial);
  const [resendState, resendAction, resending] = useActionState(resendInvitationAction, initial);
  const feedback = resendState.error || resendState.notice ? resendState : cancelState;
  return (
    <li className="space-y-2 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-ink">{invitation.email}</span>
        {invitation.role ? <Badge tone="neutral">{roleLabel(t, invitation.role)}</Badge> : null}
        {invitation.expired ? <Badge tone="warn">{t("pending.expired")}</Badge> : null}
      </div>
      <p className="text-xs text-ink-3">
        {invitation.inviterName ? `${t("pending.invitedBy", { name: invitation.inviterName })} · ` : null}
        {t("pending.expires", { date: formatDate(invitation.expiresAt, locale, "short") })}
      </p>
      {feedback.error || feedback.notice ? <ActionFeedback state={feedback} /> : null}
      {canManage ? (
        <div className="flex flex-wrap gap-2">
          <form action={resendAction}>
            <input type="hidden" name="invitationId" value={invitation.id} />
            <Button type="submit" size="sm" variant="secondary" loading={resending}>
              {t("pending.resend")}
            </Button>
          </form>
          <form action={cancelAction}>
            <input type="hidden" name="invitationId" value={invitation.id} />
            <Button type="submit" size="sm" variant="ghost" loading={cancelling}>
              {t("pending.cancel")}
            </Button>
          </form>
        </div>
      ) : null}
    </li>
  );
}
