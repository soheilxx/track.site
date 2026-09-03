"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Alert, Badge, Button, Input, Label, Select } from "@track-site/ui";
import { cancelInvitationAction, inviteMemberAction, removeMemberAction, updateMemberRoleAction } from "@/server/actions/team";
import type { ActionState } from "@/server/actions/organization";

const initial: ActionState = { ok: false, error: null };

export function InviteForm({ roles }: { roles: string[] }) {
  const t = useTranslations("app.team");
  const [state, action, pending] = useActionState(inviteMemberAction, initial);
  return (
    <form action={action} className="space-y-3">
      {state.error ? <Alert tone="bad">{t(`errors.${state.error}`)}</Alert> : null}
      {state.ok ? <Alert tone="ok">{t("invited")}</Alert> : null}
      <div>
        <Label htmlFor="invite-email">{t("email")}</Label>
        <Input id="invite-email" name="email" type="email" required className="mt-1" aria-invalid={Boolean(state.fieldErrors?.email)} />
      </div>
      <div>
        <Label htmlFor="invite-role">{t("role")}</Label>
        <Select id="invite-role" name="role" className="mt-1" defaultValue={roles.includes("ANALYST") ? "ANALYST" : roles[0]}>
          {roles.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </Select>
      </div>
      <Button type="submit" loading={pending}>
        {t("sendInvite")}
      </Button>
    </form>
  );
}

export function MemberRow({ member, roles, canUpdate, canRemove }: { member: { id: string; name: string; email: string; role: string; twoFactor: boolean; isSelf: boolean }; roles: string[]; canUpdate: boolean; canRemove: boolean }) {
  const t = useTranslations("app.team");
  const [roleState, roleAction, rolePending] = useActionState(updateMemberRoleAction, initial);
  const [removeState, removeAction, removePending] = useActionState(removeMemberAction, initial);
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium text-ink">
          {member.name} {member.isSelf ? <span className="text-xs text-ink-3">({t("you")})</span> : null}
        </p>
        <p className="text-xs text-ink-3">
          {member.email} {member.twoFactor ? <Badge tone="ok">2FA</Badge> : null}
        </p>
        {roleState.error || removeState.error ? <p className="text-xs text-bad">{t(`errors.${roleState.error ?? removeState.error}`)}</p> : null}
      </div>
      <div className="flex items-center gap-2">
        {canUpdate && roles.length ? (
          <form action={roleAction} className="flex items-center gap-2">
            <input type="hidden" name="memberId" value={member.id} />
            <Select name="role" defaultValue={member.role} aria-label={t("role")} className="h-8 text-xs">
              {Array.from(new Set([member.role, ...roles])).map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
            <Button type="submit" size="sm" variant="secondary" loading={rolePending}>
              {t("save")}
            </Button>
          </form>
        ) : (
          <Badge tone="neutral">{member.role}</Badge>
        )}
        {canRemove ? (
          <form
            action={removeAction}
            onSubmit={(e) => {
              if (!window.confirm(t("confirmRemove", { email: member.email }))) e.preventDefault();
            }}
          >
            <input type="hidden" name="memberId" value={member.id} />
            <Button type="submit" size="sm" variant="ghost" loading={removePending}>
              {t("remove")}
            </Button>
          </form>
        ) : null}
      </div>
    </li>
  );
}

export function PendingInvitation({ invitation, canCancel }: { invitation: { id: string; email: string; role: string; expiresAt: string }; canCancel: boolean }) {
  const t = useTranslations("app.team");
  const [, action, pending] = useActionState(cancelInvitationAction, initial);
  return (
    <li className="flex items-center justify-between py-2 text-sm">
      <span>
        <span className="text-ink">{invitation.email}</span> <Badge tone="neutral">{invitation.role}</Badge>
        <span className="ml-2 text-xs text-ink-3">{t("expires", { date: new Date(invitation.expiresAt).toLocaleDateString() })}</span>
      </span>
      {canCancel ? (
        <form action={action}>
          <input type="hidden" name="invitationId" value={invitation.id} />
          <Button type="submit" size="sm" variant="ghost" loading={pending}>
            {t("cancel")}
          </Button>
        </form>
      ) : null}
    </li>
  );
}
