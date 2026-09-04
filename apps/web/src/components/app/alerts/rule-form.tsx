"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import {
  ALERT_COOLDOWN_DEFAULT_MINUTES,
  ALERT_COOLDOWN_MAX_MINUTES,
  ALERT_COOLDOWN_MIN_MINUTES,
  ALERT_RULE_KINDS,
  type AlertRuleKind,
} from "@track-site/db/schema";
import { Alert, Button, Checkbox, Dialog, Field, Input, Select } from "@track-site/ui";
import { saveRuleAction, type AlertFormState } from "@/server/actions/alerts";
import type { AlertChannelView, AlertRuleView } from "@/server/alerts";
import { errorLabel, fieldErrorLabel } from "./labels";
import {
  parseThresholdInput,
  previewValues,
  thresholdDefaults,
  thresholdFields,
} from "./threshold";

const initial: AlertFormState = { ok: false, error: null };

export interface RuleFormProps {
  open: boolean;
  onClose: () => void;
  /** null = create */
  rule: AlertRuleView | null;
  channels: AlertChannelView[];
  sites: Array<{ id: string; name: string }>;
  onSaved: (mode: "create" | "edit") => void;
}

/**
 * Create / edit dialog of an alert rule: kind (fixed once created), name, site scope, the kind's
 * threshold fields with client-side parsing and a plain-language preview of the condition, channels,
 * cooldown and the enabled flag. The server re-parses everything with the same bounds.
 */
export function RuleForm({ open, onClose, rule, channels, sites, onSaved }: RuleFormProps) {
  const t = useTranslations("alerts");
  const router = useRouter();
  const [state, action, pending] = useActionState(saveRuleAction, initial);
  const [kind, setKind] = useState<AlertRuleKind>(rule?.kind ?? "event_drop");
  const [values, setValues] = useState<Record<string, string>>(() =>
    stringify(rule?.threshold ?? thresholdDefaults(rule?.kind ?? "event_drop")),
  );
  const [handled, setHandled] = useState<AlertFormState | null>(null);
  const effectiveKind = rule?.kind ?? kind;
  const editing = Boolean(rule);

  if (state.ok && handled !== state) {
    setHandled(state);
    onSaved(editing ? "edit" : "create");
  }
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  const changeKind = (next: AlertRuleKind) => {
    setKind(next);
    setValues(stringify(thresholdDefaults(next)));
  };
  const parsed = parseThresholdInput(effectiveKind, values);
  const preview = t(
    `rules.preview.${effectiveKind}`,
    previewValues(effectiveKind, parsed.ok ? parsed.threshold : numeric(values)),
  );
  const serverError = (name: string) => (state.ok ? undefined : state.fieldErrors?.[name]);
  const fields = thresholdFields(effectiveKind);

  return (
    <Dialog
      open={open}
      onClose={() => (pending ? undefined : onClose())}
      title={rule ? t("rules.form.editTitle", { name: rule.name }) : t("rules.form.createTitle")}
      closeLabel={t("common.close")}
      size="lg"
    >
      <form action={action} className="space-y-4 py-2" data-testid="rule-form">
        {rule ? <input type="hidden" name="ruleId" value={rule.id} /> : null}
        {!state.ok && state.error && state.error !== "invalid" ? (
          <Alert tone="bad">{errorLabel(t, state.error)}</Alert>
        ) : null}
        {!state.ok && state.error === "invalid" ? (
          <Alert tone="bad">{errorLabel(t, "invalid")}</Alert>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t("rules.form.kind")}
            hint={rule ? t("rules.form.kindFixed") : t(`kinds.${effectiveKind}.description`)}
            error={fieldErrorLabel(t, serverError("kind"))}
          >
            {(control) =>
              rule ? (
                <>
                  <input type="hidden" name="kind" value={rule.kind} />
                  <Input {...control} value={t(`kinds.${rule.kind}.label`)} readOnly />
                </>
              ) : (
                <Select
                  {...control}
                  name="kind"
                  value={kind}
                  onChange={(e) => changeKind(e.target.value as AlertRuleKind)}
                  data-testid="rule-kind"
                >
                  {ALERT_RULE_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {t(`kinds.${k}.label`)}
                    </option>
                  ))}
                </Select>
              )
            }
          </Field>
          <Field
            label={t("rules.form.name")}
            error={fieldErrorLabel(t, serverError("name"))}
            required
          >
            {(control) => (
              <Input
                {...control}
                name="name"
                defaultValue={rule?.name ?? ""}
                maxLength={80}
                placeholder={t("rules.form.namePlaceholder")}
              />
            )}
          </Field>
        </div>
        <Field label={t("rules.form.site")} error={fieldErrorLabel(t, serverError("siteId"))}>
          {(control) => (
            <Select {...control} name="siteId" defaultValue={rule?.siteId ?? ""}>
              <option value="">{t("rules.form.allSites")}</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <fieldset className="min-w-0 rounded-[var(--radius-card)] border border-line p-4">
          <legend className="px-1 text-sm font-medium text-ink">
            {t("rules.form.thresholds")}
          </legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {fields.map((field) => {
              const clientError = parsed.ok ? undefined : parsed.errors[field.key];
              const error = fieldErrorLabel(
                t,
                serverError(`threshold.${field.key}`) ??
                  (values[field.key] !== "" ? clientError : undefined),
                { min: field.min, max: field.max },
              );
              return (
                <Field
                  key={field.key}
                  label={t(`rules.form.fields.${field.key}`)}
                  hint={`${field.min}–${field.max}`}
                  error={error}
                  required
                >
                  {(control) => (
                    <Input
                      {...control}
                      name={`threshold.${field.key}`}
                      type="number"
                      inputMode="numeric"
                      min={field.min}
                      max={field.max}
                      step={field.integer ? 1 : "any"}
                      value={values[field.key] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                      data-testid={`rule-threshold-${field.key}`}
                    />
                  )}
                </Field>
              );
            })}
          </div>
          <p className="mt-3 text-sm text-ink-2" data-testid="rule-preview">
            <span className="font-medium text-ink">{t("rules.form.previewLabel")}:</span> {preview}
          </p>
        </fieldset>
        <fieldset className="min-w-0">
          <legend className="text-sm font-medium text-ink">{t("rules.form.channels")}</legend>
          <p className="mt-1 text-xs text-ink-3">{t("rules.form.channelsHint")}</p>
          {channels.length === 0 ? (
            <p className="mt-2 text-sm text-ink-3">{t("rules.form.noChannels")}</p>
          ) : (
            <div className="mt-1 divide-y divide-line">
              {channels.map((c) => (
                <Checkbox
                  key={c.id}
                  name="channelIds"
                  value={c.id}
                  defaultChecked={rule?.channelIds.includes(c.id) ?? false}
                  label={c.name}
                  description={`${t(`channelKinds.${c.kind}`)}${c.enabled ? "" : ` · ${t("common.disabled")}`}`}
                />
              ))}
            </div>
          )}
          {serverError("channelIds") ? (
            <p className="text-sm text-bad">{fieldErrorLabel(t, serverError("channelIds"))}</p>
          ) : null}
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t("rules.form.cooldown")}
            hint={t("rules.form.cooldownHint", {
              min: ALERT_COOLDOWN_MIN_MINUTES,
              max: ALERT_COOLDOWN_MAX_MINUTES,
            })}
            error={fieldErrorLabel(t, serverError("cooldownMinutes"), {
              min: ALERT_COOLDOWN_MIN_MINUTES,
              max: ALERT_COOLDOWN_MAX_MINUTES,
            })}
            required
          >
            {(control) => (
              <Input
                {...control}
                name="cooldownMinutes"
                type="number"
                inputMode="numeric"
                min={ALERT_COOLDOWN_MIN_MINUTES}
                max={ALERT_COOLDOWN_MAX_MINUTES}
                step={1}
                defaultValue={rule?.cooldownMinutes ?? ALERT_COOLDOWN_DEFAULT_MINUTES}
              />
            )}
          </Field>
          <div className="sm:pt-6">
            <Checkbox
              name="enabled"
              defaultChecked={rule?.enabled ?? true}
              label={t("rules.form.enabled")}
            />
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" disabled={pending} onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            loading={pending}
            loadingLabel={t("common.saving")}
            data-testid="rule-form-submit"
          >
            {rule ? t("rules.form.submitEdit") : t("rules.form.submitCreate")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function stringify(values: Record<string, number>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) out[k] = String(v);
  return out;
}

function numeric(values: Record<string, string>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(values)) {
    const n = Number(v.replace(",", "."));
    if (v.trim() !== "" && Number.isFinite(n)) out[k] = n;
  }
  return out;
}
