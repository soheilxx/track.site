"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useActionState, useMemo, useRef, useState } from "react";
import type { ApprovalPolicy } from "@track-site/db";
import { Alert, Banner, Button, Checkbox, Dialog, buttonVariants } from "@track-site/ui";
import { formatDate } from "@/lib/format";
import { updateApprovalPolicyAction, type TeamActionState } from "@/server/actions/team";
import { changeTypeLabel, roleLabel } from "./labels";
import { ActionFeedback, useCloseOnSuccess } from "./members";

const initial: TeamActionState = { ok: false, error: null, notice: null };

export interface ApprovalPolicyFormProps {
  policy: ApprovalPolicy;
  changeTypes: readonly string[];
  approverOptions: readonly string[];
  /** the plan includes approval workflows and the four-eyes principle */
  enabled: boolean;
  /** migration 0012 applied (the column exists) */
  persisted: boolean;
  canEdit: boolean;
  planName: string;
  updatedByName: string | null;
  locale: string;
}

/**
 * Approval requirements editor. Gated by the plan (an honest note with the plan comparison, nothing
 * pretends to be enforced), read-only without `org.update`, and a relaxing change (dropping a
 * requirement or widening the approvers) is confirmed in a dialog before the server re-checks it.
 */
export function ApprovalPolicyForm({ policy, changeTypes, approverOptions, enabled, persisted, canEdit, planName, updatedByName, locale }: ApprovalPolicyFormProps) {
  const t = useTranslations("team");
  const [state, action, pending] = useActionState(updateApprovalPolicyAction, initial);
  const [fourEyes, setFourEyes] = useState<Record<string, boolean>>(() => Object.fromEntries(changeTypes.map((c) => [c, policy.fourEyes[c as keyof ApprovalPolicy["fourEyes"]] === true])));
  const [approvers, setApprovers] = useState<Record<string, boolean>>(() => Object.fromEntries(approverOptions.map((r) => [r, r === "OWNER" || policy.approverRoles.includes(r)])));
  const [dialogOpen, setDialogOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const editable = enabled && persisted && canEdit;
  const storedTypes = changeTypes.filter((c) => policy.fourEyes[c as keyof ApprovalPolicy["fourEyes"]] === true);

  const relaxing = useMemo(
    () => [
      ...changeTypes.filter((c) => policy.fourEyes[c as keyof ApprovalPolicy["fourEyes"]] === true && !fourEyes[c]).map((c) => ({ kind: "relaxed" as const, key: c })),
      ...approverOptions.filter((r) => r !== "OWNER" && !policy.approverRoles.includes(r) && approvers[r]).map((r) => ({ kind: "approverAdded" as const, key: r })),
    ],
    [changeTypes, approverOptions, policy, fourEyes, approvers],
  );
  const dirty = changeTypes.some((c) => (policy.fourEyes[c as keyof ApprovalPolicy["fourEyes"]] === true) !== Boolean(fourEyes[c])) || approverOptions.some((r) => policy.approverRoles.includes(r) !== Boolean(approvers[r]));

  useCloseOnSuccess(state, setDialogOpen);

  const submit = () => {
    if (!formRef.current) return;
    if (confirmRef.current) confirmRef.current.value = "";
    if (relaxing.length) setDialogOpen(true);
    else formRef.current.requestSubmit();
  };
  const confirmRelax = () => {
    if (confirmRef.current) confirmRef.current.value = "relax";
    formRef.current?.requestSubmit();
  };

  return (
    <div className="space-y-4">
      {!enabled ? (
        <Banner
          tone="info"
          title={t("approvals.notInPlanTitle", { plan: planName })}
          action={
            <Link href="/app/billing" className={buttonVariants({ variant: "secondary", size: "sm" })}>
              {t("approvals.comparePlans")}
            </Link>
          }
        >
          {t("approvals.notInPlan")}
        </Banner>
      ) : null}
      {!enabled && storedTypes.length ? <Alert tone="warn">{t("approvals.storedInactive")}</Alert> : null}
      {enabled && !persisted ? <Alert tone="warn">{t("approvals.notPersisted")}</Alert> : null}
      {enabled && persisted && !canEdit ? <p className="text-sm text-ink-3">{t("approvals.readOnly")}</p> : null}
      <ActionFeedback state={state} />

      <form ref={formRef} action={action} className="space-y-6">
        <input ref={confirmRef} type="hidden" name="confirm" defaultValue="" />
        <fieldset className="space-y-1" disabled={!editable}>
          <legend className="text-sm font-semibold text-ink">{t("approvals.changeTypesLegend")}</legend>
          <div className="divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface px-4">
            {changeTypes.map((changeType) => (
              <Checkbox
                key={changeType}
                name={`fourEyes.${changeType}`}
                checked={Boolean(fourEyes[changeType])}
                onChange={(e) => setFourEyes((prev) => ({ ...prev, [changeType]: e.target.checked }))}
                label={changeTypeLabel(t, changeType)}
                description={t(`approvals.types.${changeType}.description`)}
              />
            ))}
          </div>
        </fieldset>
        <fieldset className="space-y-1" disabled={!editable}>
          <legend className="text-sm font-semibold text-ink">{t("approvals.approversLegend")}</legend>
          <div className="divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface px-4">
            {approverOptions.map((role) => (
              <Checkbox
                key={role}
                name={`approver.${role}`}
                checked={Boolean(approvers[role])}
                disabled={role === "OWNER" || !editable}
                onChange={(e) => setApprovers((prev) => ({ ...prev, [role]: e.target.checked }))}
                label={roleLabel(t, role)}
                description={role === "OWNER" ? t("approvals.ownerAlways") : t(`roles.descriptions.${role}`)}
              />
            ))}
          </div>
          <p className="pt-2 text-sm text-ink-3">{t("approvals.requesterNote")}</p>
          <p className="text-sm text-ink-3">{t("approvals.enforcementNote")}</p>
        </fieldset>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-ink-3">{policy.updatedAt ? t("approvals.updated", { date: formatDate(policy.updatedAt, locale, "short"), name: updatedByName ?? t("requests.former") }) : t("approvals.neverUpdated")}</p>
          {editable ? (
            <Button type="button" onClick={submit} disabled={!dirty} loading={pending}>
              {t("approvals.save")}
            </Button>
          ) : null}
        </div>
      </form>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title={t("approvals.relaxDialog.title")} description={t("approvals.relaxDialog.description")} closeLabel={t("common.close")}>
        <div className="space-y-4 py-2">
          <ul className="space-y-1.5 text-sm text-ink">
            {relaxing.map((c) => (
              <li key={`${c.kind}-${c.key}`}>{c.kind === "relaxed" ? t("approvals.changes.relaxed", { type: changeTypeLabel(t, c.key) }) : t("approvals.changes.approverAdded", { role: roleLabel(t, c.key) })}</li>
            ))}
          </ul>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setDialogOpen(false)} data-autofocus>
              {t("common.cancel")}
            </Button>
            <Button type="button" variant="danger" onClick={confirmRelax} loading={pending}>
              {t("approvals.relaxDialog.confirm")}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
