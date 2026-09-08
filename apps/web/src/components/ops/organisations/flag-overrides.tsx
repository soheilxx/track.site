"use client";

import { useTranslations } from "next-intl";
import { useActionState, useId, useState } from "react";
import { Badge, Button, Dialog, EmptyState, FieldError, FieldHint, Label, Radio, Status, TBody, THead, Table, Td, Textarea, Th, Tr } from "@track-site/ui";
import { formatDateTime } from "@/components/app/alerts/format";
import { setFeatureFlagOverrideAction } from "@/server/ops/actions/organisations";
import type { FlagView } from "@/server/ops/organisations";
import { ActionFeedback, initialState, useCloseOnSuccess } from "./action-feedback";

/**
 * Feature-flag overrides of one organisation: global default, override and effective state per flag;
 * platform admins change an override from a dialog (enable / disable / inherit) with a mandatory
 * reason. The server re-checks the role, the flag and the `confirm` field.
 */
export function FlagOverrides({ organizationId, organizationName, flags, canManage, locale }: { organizationId: string; organizationName: string; flags: FlagView[]; canManage: boolean; locale: string }) {
  const t = useTranslations("opsOrganisations");
  const [editing, setEditing] = useState<FlagView | null>(null);
  const [state, action, pending] = useActionState(setFeatureFlagOverrideAction, initialState);
  const id = useId();
  useCloseOnSuccess(state, () => setEditing(null));
  const onOff = (value: boolean) => (value ? t("detail.flags.enabled") : t("detail.flags.disabled"));
  if (flags.length === 0) return <EmptyState title={t("detail.flags.empty")} />;
  const current = editing ? (editing.override ? (editing.override.enabled ? "enabled" : "disabled") : "inherit") : "inherit";
  const reasonError = state.fieldErrors?.reason ? t("errors.invalid") : null;
  return (
    <div className="space-y-3">
      {state.ok || (state.error && !editing) ? <ActionFeedback state={state} /> : null}
      {!canManage ? <p className="text-xs text-ink-3">{t("common.adminOnly")}</p> : null}
      <div className="rounded-[var(--radius-card)] border border-line bg-surface px-2 py-2 sm:px-3">
        <Table caption={t("detail.flags.caption")}>
          <THead>
            <Tr>
              <Th>{t("detail.flags.key")}</Th>
              <Th>{t("detail.flags.defaultLabel")}</Th>
              <Th>{t("detail.flags.override")}</Th>
              <Th>{t("detail.flags.effective")}</Th>
              {canManage ? <Th>{t("detail.flags.change")}</Th> : null}
            </Tr>
          </THead>
          <TBody>
            {flags.map((flag) => (
              <Tr key={flag.key}>
                <Td label={t("detail.flags.key")}>
                  <code className="text-sm text-ink">{flag.key}</code>
                  {flag.description ? <p className="text-xs text-ink-3">{flag.description}</p> : null}
                </Td>
                <Td label={t("detail.flags.defaultLabel")}>
                  <Badge tone="neutral">{flag.defaultEnabled ? t("detail.flags.enabled") : t("detail.flags.disabled")}</Badge>
                </Td>
                <Td label={t("detail.flags.override")}>
                  {flag.override ? (
                    <>
                      <Badge tone={flag.override.enabled ? "ok" : "warn"}>{flag.override.enabled ? t("detail.flags.enabled") : t("detail.flags.disabled")}</Badge>
                      {flag.override.reason ? <p className="mt-1 text-xs text-ink-2">{flag.override.reason}</p> : null}
                      <p className="text-xs text-ink-3">{t("detail.flags.updated", { name: flag.override.actorName ?? t("detail.notes.former"), date: formatDateTime(flag.override.updatedAt, locale) ?? "" })}</p>
                    </>
                  ) : (
                    <span className="text-sm text-ink-3">{t("detail.flags.inherit")}</span>
                  )}
                </Td>
                <Td label={t("detail.flags.effective")}>
                  <Status tone={flag.effective ? "ok" : "neutral"} indicator="both">
                    {flag.effective ? t("detail.flags.enabled") : t("detail.flags.disabled")}
                  </Status>
                </Td>
                {canManage ? (
                  <Td label={t("detail.flags.change")}>
                    <Button size="sm" variant="secondary" onClick={() => setEditing(flag)} aria-haspopup="dialog" aria-label={t("detail.flags.changeFor", { key: flag.key })}>
                      {t("detail.flags.change")}
                    </Button>
                  </Td>
                ) : null}
              </Tr>
            ))}
          </TBody>
        </Table>
      </div>

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={t("detail.flags.dialog.title", { key: editing?.key ?? "", name: organizationName })} description={t("detail.flags.dialog.description", { defaultState: editing ? onOff(editing.defaultEnabled) : "" })} closeLabel={t("common.close")} size="md">
        {editing ? (
          <form action={action} className="space-y-4 py-2" key={editing.key}>
            <input type="hidden" name="organizationId" value={organizationId} />
            <input type="hidden" name="key" value={editing.key} />
            <input type="hidden" name="confirm" value="flag" />
            {state.error ? <ActionFeedback state={state} /> : null}
            <fieldset>
              <legend className="mb-1 text-sm font-medium text-ink">{t("detail.flags.dialog.state")}</legend>
              <Radio name="state" value="enabled" defaultChecked={current === "enabled"} label={t("detail.flags.dialog.enable")} />
              <Radio name="state" value="disabled" defaultChecked={current === "disabled"} label={t("detail.flags.dialog.disable")} />
              <Radio name="state" value="inherit" defaultChecked={current === "inherit"} label={t("detail.flags.dialog.inheritOption")} />
            </fieldset>
            <div>
              <Label htmlFor={`${id}-reason`}>{t("detail.flags.dialog.reason")}</Label>
              <Textarea id={`${id}-reason`} name="reason" required minLength={5} maxLength={500} rows={3} className="mt-1.5" aria-describedby={`${id}-reason-hint${reasonError ? ` ${id}-reason-error` : ""}`} state={reasonError ? "error" : undefined} />
              <FieldError id={`${id}-reason-error`}>{reasonError}</FieldError>
              <FieldHint id={`${id}-reason-hint`}>{t("detail.flags.dialog.reasonHint")}</FieldHint>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" loading={pending}>
                {t("detail.flags.dialog.confirm")}
              </Button>
            </div>
          </form>
        ) : null}
      </Dialog>
    </div>
  );
}
