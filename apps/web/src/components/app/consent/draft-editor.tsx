"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { ConsentPurpose } from "@track-site/events";
import type { ConnectorType } from "@track-site/policy";
import { Alert, Badge, Button, Checkbox, Dialog, Field, Select, Textarea } from "@track-site/ui";
import { saveConsentDraftAction } from "@/server/actions/consent";
import type { ActionState } from "@/server/actions/organization";
import { EDITABLE_REGION_GROUPS, LEGAL_NOTE_MAX_LENGTH, LEGAL_NOTE_MIN_LENGTH, OPERATIONAL_EVENT_OPTIONS, PURPOSES, REGION_MODES, diffPolicyFields, effectiveRegionMode, isWeaker, parseDraftForm, type PolicyChange, type PolicyFields } from "@/server/consent-policy";
import { describeChange, errorLabel, purposeLabel, regionGroupLabel, regionModeLabel } from "./labels";

const initial: ActionState = { ok: false, error: null };
const PURPOSE_RANK: Record<ConsentPurpose, number> = { necessary: 0, analytics: 1, marketing: 2, personalization: 3 };

export interface EditorConnector {
  type: ConnectorType;
  label: string;
  base: ConsentPurpose;
  /** Names of the site's destinations of this type (empty for an override without a destination). */
  names: string[];
}

/**
 * Draft editor for the fields the policy engine reads. Stricter settings save directly; a result that
 * is less restrictive than the published version opens a confirmation that requires a documented
 * legal basis (re-validated by the server action).
 */
export function DraftEditor({ policyId, version, fields, baseline, legalBasisNote, connectors }: { policyId: string; version: number; fields: PolicyFields; baseline: PolicyFields; legalBasisNote: string | null; connectors: EditorConnector[] }) {
  const t = useTranslations("consent.policy.editor");
  const tc = useTranslations("consent");
  const [state, action, pending] = useActionState(saveConsentDraftAction, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<PolicyChange[]>([]);
  const noteId = useId();

  useEffect(() => {
    if (state.ok && confirmRef.current) confirmRef.current.value = "";
  }, [state]);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (confirmRef.current?.value === "weaker") return;
    const data = new FormData(event.currentTarget);
    const parsed = parseDraftForm(
      (name) => {
        const v = data.get(name);
        return typeof v === "string" ? v : null;
      },
      connectors.map((c) => c.type),
    );
    const changes = diffPolicyFields(baseline, parsed.fields);
    if (isWeaker(changes)) {
      event.preventDefault();
      setPendingChanges(changes);
      setDialogOpen(true);
    }
  };

  const confirmWeaker = () => {
    setDialogOpen(false);
    if (confirmRef.current) confirmRef.current.value = "weaker";
    // submit after the dialog has closed so the form is no longer inert
    requestAnimationFrame(() => formRef.current?.requestSubmit());
  };

  const fieldError = (name: string) => (state.fieldErrors?.[name] ? errorLabel(tc, state.fieldErrors[name], { min: LEGAL_NOTE_MIN_LENGTH }) : undefined);

  return (
    <form ref={formRef} action={action} onSubmit={onSubmit} className="space-y-6" aria-labelledby="draft-editor-title">
      <div>
        <h3 id="draft-editor-title" className="text-base font-semibold text-ink">
          {t("title", { version })}
        </h3>
        <p className="mt-1 text-sm text-ink-3">{t("intro")}</p>
      </div>
      {state.ok ? <Alert tone="ok">{tc("policy.savedOk")}</Alert> : null}
      {state.error && state.error !== "fields" ? <Alert tone="bad">{errorLabel(tc, state.error, { min: LEGAL_NOTE_MIN_LENGTH })}</Alert> : null}
      {state.error === "fields" ? <Alert tone="bad">{errorLabel(tc, "fields")}</Alert> : null}
      <input type="hidden" name="policyId" value={policyId} />
      <input ref={confirmRef} type="hidden" name="confirm" defaultValue="" />

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-ink">{t("regionSection")}</legend>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {EDITABLE_REGION_GROUPS.map((group) => (
            <Field key={group} label={t("regionMode", { group: regionGroupLabel(tc, group) })} error={fieldError(`region_${group}`)}>
              {(control) => (
                <Select {...control} name={`region_${group}`} defaultValue={effectiveRegionMode(fields, group)}>
                  {REGION_MODES.map((mode) => (
                    <option key={mode} value={mode}>
                      {regionModeLabel(tc, mode)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ))}
        </div>
        <ul className="space-y-1 text-xs text-ink-3">
          {REGION_MODES.map((mode) => (
            <li key={mode}>
              <span className="font-medium text-ink-2">{regionModeLabel(tc, mode)}:</span> {tc(`regionModeHelp.${mode}`)}
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-ink">{t("destinationSection")}</legend>
        <p className="text-xs text-ink-3">{t("destinationHelp")}</p>
        {connectors.length === 0 ? (
          <p className="text-sm text-ink-3">{t("noDestinations")}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {connectors.map((c) => (
              <Field key={c.type} label={t("destinationPurpose", { destination: c.label })} hint={c.names.length ? c.names.join(", ") : undefined} error={fieldError(`dest_${c.type}`)}>
                {(control) => (
                  <Select {...control} name={`dest_${c.type}`} defaultValue={fields.destinationPurposes[c.type] ?? ""}>
                    <option value="">{t("basePurpose", { purpose: purposeLabel(tc, c.base) })}</option>
                    {PURPOSES.filter((p) => PURPOSE_RANK[p] > PURPOSE_RANK[c.base]).map((p) => (
                      <option key={p} value={p}>
                        {purposeLabel(tc, p)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            ))}
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-1">
        <legend className="text-sm font-semibold text-ink">{t("operationalSection")}</legend>
        <p className="text-xs text-ink-3">{tc("policy.operationalHint")}</p>
        <div className="flex flex-wrap gap-x-6">
          {OPERATIONAL_EVENT_OPTIONS.map((name) => (
            <Checkbox key={name} name={`op_${name}`} value="1" defaultChecked={fields.operationalEvents.includes(name)} label={<span className="font-mono text-xs">{name}</span>} />
          ))}
        </div>
      </fieldset>

      <Field id={noteId} label={t("legalNote")} hint={t("legalNoteHelp", { min: LEGAL_NOTE_MIN_LENGTH })} error={fieldError("legalBasisNote")}>
        {(control) => <Textarea {...control} name="legalBasisNote" rows={3} maxLength={LEGAL_NOTE_MAX_LENGTH} defaultValue={legalBasisNote ?? ""} className="min-h-24" />}
      </Field>

      <Button type="submit" loading={pending}>
        {t("save")}
      </Button>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title={t("weakerDialog.title")} description={t("weakerDialog.description")} closeLabel={tc("close")}>
        <div className="space-y-4 py-2">
          <ul className="space-y-1.5">
            {pendingChanges.map((c) => (
              <li key={`${c.kind}-${c.key}`} className="flex flex-wrap items-center gap-2 text-sm text-ink">
                <span>{describeChange(tc, c)}</span>
                {c.weaker ? <Badge tone="warn">{tc("policy.weakerBadge")}</Badge> : <Badge tone="ok">{tc("policy.stricterBadge")}</Badge>}
              </li>
            ))}
          </ul>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setDialogOpen(false)} data-autofocus>
              {tc("cancel")}
            </Button>
            <Button type="button" variant="danger" onClick={confirmWeaker}>
              {t("weakerDialog.confirm")}
            </Button>
          </div>
        </div>
      </Dialog>
    </form>
  );
}
