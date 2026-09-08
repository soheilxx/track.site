"use client";

import { Save } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { Alert, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox, Field, FieldError, Input, Select, TBody, THead, Table, Td, Textarea, Th, Tr, buttonVariants } from "@track-site/ui";
import type { PlatformUserOption } from "@/app/ops/support/settings/sla/queries";
import { saveSlaPolicyAction, type SupportSlaActionState } from "@/server/ops/actions/support-sla";
import type { SlaPolicyFormValues } from "@/server/support/sla";
import {
  SLA_AUTO_CLOSE_DAYS_MAX,
  SLA_CLOCKS,
  SLA_DESCRIPTION_MAX,
  SLA_NAME_MAX,
  SLA_PATHS,
  SLA_TARGET_UNITS,
  SLA_TIMEZONE_SUGGESTIONS,
  SLA_WARNING_PERCENT_MAX,
  SLA_WARNING_PERCENT_MIN,
  SLA_WEEKDAYS,
  type SlaClock,
  type SlaWeekday,
} from "./constants";
import { SlaActionFeedback } from "./feedback";
import { weekdayLabel } from "./format";
import { fieldErrorLabel, planLabel } from "./labels";

const PRIORITIES = ["urgent", "high", "normal", "low"] as const;
const CLOCK_KEY: Record<SlaClock, "firstResponse" | "resolution"> = { first_response: "firstResponse", resolution: "resolution" };
const initialState: SupportSlaActionState = { ok: false, error: null, notice: null };

export interface PolicyFormProps {
  mode: "create" | "edit";
  initial: SlaPolicyFormValues;
  plans: readonly string[];
  operators: PlatformUserOption[];
  locale: string;
}

/**
 * SLA policy editor: name, plans and default flag; targets per priority (value + unit, stored as business
 * minutes); business hours (zone and one window per weekday — no enabled day means a 24 × 7 clock);
 * escalation (warning share, admin escalation, named operators, auto-close). Validation errors come back
 * per field from the server action; the server re-checks everything.
 */
export function PolicyForm({ mode, initial, plans, operators, locale }: PolicyFormProps) {
  const t = useTranslations("supportSla");
  const ts = useTranslations("support");
  const [state, action, pending] = useActionState(saveSlaPolicyAction, initialState);
  const [enabledDays, setEnabledDays] = useState<Record<SlaWeekday, boolean>>(() => Object.fromEntries(SLA_WEEKDAYS.map((d) => [d, initial.days[d].enabled])) as Record<SlaWeekday, boolean>);
  const baseId = useId();
  const tzListId = `${baseId}-tz`;
  const err = (name: string) => fieldErrorLabel(t, state.fieldErrors?.[name]);

  if (state.ok && state.notice === "created" && state.id) {
    return (
      <Alert tone="ok" title={t("form.createdTitle")}>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link href={SLA_PATHS.list} className={buttonVariants({ variant: "secondary", size: "sm" })}>
            {t("nav.list")}
          </Link>
          <Link href={SLA_PATHS.edit(state.id)} className={buttonVariants({ variant: "ghost", size: "sm" })}>
            {t("form.editPolicy")}
          </Link>
        </div>
      </Alert>
    );
  }

  return (
    <form action={action} className="space-y-6" data-testid="ops-sla-policy-form">
      <SlaActionFeedback state={state.ok || state.error ? state : null} />
      {initial.id ? <input type="hidden" name="id" value={initial.id} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("form.general.title")}</CardTitle>
          <CardDescription>{t("form.general.text")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Field label={t("form.name")} hint={t("form.nameHint")} required error={err("name")}>
            {(control) => <Input {...control} name="name" defaultValue={initial.name} maxLength={SLA_NAME_MAX} autoComplete="off" data-autofocus="" />}
          </Field>
          <Field label={t("form.description")} hint={t("form.descriptionHint")} meta={t("common.optional")} error={err("description")}>
            {(control) => <Textarea {...control} name="description" defaultValue={initial.description} maxLength={SLA_DESCRIPTION_MAX} rows={2} />}
          </Field>
          <fieldset aria-describedby={`${baseId}-plans-hint`}>
            <legend className="mb-1 text-sm font-medium text-ink">{t("form.plans")}</legend>
            <div className="grid gap-x-4 sm:grid-cols-2">
              {plans.map((plan) => (
                <Checkbox key={plan} name="planIds" value={plan} label={planLabel(t, plan)} defaultChecked={initial.planIds.includes(plan)} state={err("planIds") ? "error" : undefined} />
              ))}
            </div>
            <FieldError>{err("planIds")}</FieldError>
            <p id={`${baseId}-plans-hint`} className="mt-1 text-sm text-ink-3">
              {t("form.plansHint")}
            </p>
          </fieldset>
          <div>
            <Checkbox name="isDefault" label={t("form.isDefault")} description={t("form.isDefaultHint")} defaultChecked={initial.isDefault} state={err("isDefault") ? "error" : undefined} />
            <FieldError>{err("isDefault")}</FieldError>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("form.targets.title")}</CardTitle>
          <CardDescription>{t("form.targets.text")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Table caption={t("form.targets.caption")}>
            <THead>
              <Tr>
                <Th>{t("form.targets.priority")}</Th>
                <Th>{ts("sla.firstResponse")}</Th>
                <Th>{ts("sla.resolution")}</Th>
              </Tr>
            </THead>
            <TBody>
              {PRIORITIES.map((priority) => (
                <Tr key={priority}>
                  <Th scope="row" className="align-top">
                    {ts(`priority.${priority}`)}
                  </Th>
                  {SLA_CLOCKS.map((clock) => {
                    const name = `${priority}_${clock}`;
                    const error = err(`targets.${priority}.${clock}`);
                    const errorId = error ? `${baseId}-${name}-error` : undefined;
                    const clockLabel = clock === "first_response" ? ts("sla.firstResponse") : ts("sla.resolution");
                    return (
                      <Td key={clock} label={clockLabel}>
                        <div className="flex gap-2">
                          <label htmlFor={`${baseId}-${name}-value`} className="sr-only">
                            {t("form.targets.valueLabel", { priority: ts(`priority.${priority}`), clock: t(`clock.${CLOCK_KEY[clock]}`) })}
                          </label>
                          <Input
                            id={`${baseId}-${name}-value`}
                            name={`target_${name}`}
                            type="number"
                            inputMode="decimal"
                            min={1}
                            step="any"
                            defaultValue={initial.targets[priority][clock].value}
                            aria-invalid={error ? true : undefined}
                            aria-describedby={errorId}
                            className="w-24"
                            required
                          />
                          <label htmlFor={`${baseId}-${name}-unit`} className="sr-only">
                            {t("form.targets.unitLabel", { priority: ts(`priority.${priority}`), clock: t(`clock.${CLOCK_KEY[clock]}`) })}
                          </label>
                          <Select id={`${baseId}-${name}-unit`} name={`unit_${name}`} defaultValue={initial.targets[priority][clock].unit} className="w-32">
                            {SLA_TARGET_UNITS.map((unit) => (
                              <option key={unit} value={unit}>
                                {t(`units.${unit}`)}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <FieldError id={errorId}>{error}</FieldError>
                      </Td>
                    );
                  })}
                </Tr>
              ))}
            </TBody>
          </Table>
          <p className="text-sm text-ink-3">{t("form.targets.hint")}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("form.hours.title")}</CardTitle>
          <CardDescription>{t("form.hours.text")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Field label={t("form.hours.timezone")} hint={t("form.hours.timezoneHint")} required error={err("timezone")}>
            {(control) => (
              <>
                <Input {...control} name="timezone" defaultValue={initial.timezone} list={tzListId} autoComplete="off" spellCheck={false} maxLength={64} className="font-mono" />
                <datalist id={tzListId}>
                  {SLA_TIMEZONE_SUGGESTIONS.map((zone) => (
                    <option key={zone} value={zone} />
                  ))}
                </datalist>
              </>
            )}
          </Field>
          <fieldset className="space-y-1">
            <legend className="mb-1 text-sm font-medium text-ink">{t("form.hours.days")}</legend>
            {SLA_WEEKDAYS.map((day) => {
              const error = err(`days.${day}`);
              const errorId = error ? `${baseId}-${day}-error` : undefined;
              const enabled = enabledDays[day];
              return (
                <div key={day} className="grid grid-cols-1 items-start gap-x-3 gap-y-1 border-t border-line py-1 first:border-t-0 sm:grid-cols-[minmax(9rem,1fr)_8rem_8rem]">
                  <Checkbox name={`day_${day}`} label={weekdayLabel(day, locale, "long")} checked={enabled} onChange={(e) => setEnabledDays((prev) => ({ ...prev, [day]: e.target.checked }))} />
                  <div className="py-2">
                    <label htmlFor={`${baseId}-${day}-start`} className="sr-only">
                      {t("form.hours.startLabel", { day: weekdayLabel(day, locale, "long") })}
                    </label>
                    <Input id={`${baseId}-${day}-start`} name={`start_${day}`} type="time" step={300} defaultValue={initial.days[day].start} disabled={!enabled} aria-invalid={error ? true : undefined} aria-describedby={errorId} />
                  </div>
                  <div className="py-2">
                    <label htmlFor={`${baseId}-${day}-end`} className="sr-only">
                      {t("form.hours.endLabel", { day: weekdayLabel(day, locale, "long") })}
                    </label>
                    <Input id={`${baseId}-${day}-end`} name={`end_${day}`} type="time" step={300} defaultValue={initial.days[day].end} disabled={!enabled} aria-invalid={error ? true : undefined} aria-describedby={errorId} />
                  </div>
                  {error ? (
                    <div className="sm:col-span-3">
                      <FieldError id={errorId}>{error}</FieldError>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </fieldset>
          <p className="text-sm text-ink-3">{t("form.hours.hint")}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("form.escalation.title")}</CardTitle>
          <CardDescription>{t("form.escalation.text")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Field label={t("form.escalation.warningPercent")} hint={t("form.escalation.warningPercentHint")} required error={err("warningPercent")}>
            {(control) => <Input {...control} name="warningPercent" type="number" inputMode="numeric" min={SLA_WARNING_PERCENT_MIN} max={SLA_WARNING_PERCENT_MAX} step={1} defaultValue={initial.warningPercent} className="w-32" />}
          </Field>
          <Checkbox name="escalateToAdmins" label={t("form.escalation.escalateToAdmins")} description={t("form.escalation.escalateToAdminsHint")} defaultChecked={initial.escalateToAdmins} />
          <fieldset aria-describedby={`${baseId}-recipients-hint`}>
            <legend className="mb-1 text-sm font-medium text-ink">{t("form.escalation.notifyUserIds")}</legend>
            {operators.length ? (
              <div className="grid gap-x-4 sm:grid-cols-2">
                {operators.map((op) => (
                  <Checkbox key={op.id} name="notifyUserIds" value={op.id} label={op.name} description={`${op.email} · ${t(`roles.${op.platformRole}`)}`} defaultChecked={initial.notifyUserIds.includes(op.id)} state={err("notifyUserIds") ? "error" : undefined} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-3">{t("form.escalation.noPlatformUsers")}</p>
            )}
            <FieldError>{err("notifyUserIds")}</FieldError>
            <p id={`${baseId}-recipients-hint`} className="mt-1 text-sm text-ink-3">
              {t("form.escalation.notifyUserIdsHint")}
            </p>
          </fieldset>
          <Field label={t("form.escalation.autoCloseDays")} hint={t("form.escalation.autoCloseDaysHint")} meta={t("common.optional")} error={err("autoCloseDays")}>
            {(control) => <Input {...control} name="autoCloseDays" type="number" inputMode="numeric" min={0} max={SLA_AUTO_CLOSE_DAYS_MAX} step={1} defaultValue={initial.autoCloseDays} className="w-32" />}
          </Field>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={pending} loadingLabel={t("common.working")} leadingIcon={<Save className="size-4" aria-hidden="true" />} data-testid="ops-sla-policy-submit">
          {mode === "create" ? t("form.submitCreate") : t("form.submitUpdate")}
        </Button>
        <Link href={SLA_PATHS.list} className={buttonVariants({ variant: "secondary" })}>
          {t("common.cancel")}
        </Link>
      </div>
    </form>
  );
}
