"use client";

import { Save } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useId } from "react";
import type { SupportAutoAssignStrategy } from "@track-site/db";
import { Alert, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox, Field, Input, Radio, TBody, THead, Table, Td, Textarea, Th, Tr, buttonVariants } from "@track-site/ui";
import { updateSupportSettingsAction, type SupportSettingsActionState } from "@/server/ops/actions/support-settings";
import type { BusinessHoursFormModel, DayKey, SupportSettingsView } from "@/server/support/settings";
import { errorLabel, fieldErrorLabel, noticeLabel } from "../macros/labels";

const initial: SupportSettingsActionState = { ok: false, error: null, notice: null };
const DAYS: readonly DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const STRATEGIES: readonly SupportAutoAssignStrategy[] = ["none", "round_robin"];

export interface GeneralSettingsFormProps {
  settings: SupportSettingsView;
  hours: BusinessHoursFormModel;
  timeZones: string[];
  agentsOnline: number;
  onlineWindowMinutes: number;
  limits: { fromNameMax: number; signatureMax: number };
}

/**
 * General desk settings form: sender and reply domain (with the environment overrides shown), signature,
 * auto-acknowledgement, auto-assignment, business hours (one window per day, `HH:MM`), CSAT. Uncontrolled
 * inputs with the stored values as defaults; field errors come back from the server action.
 */
export function GeneralSettingsForm({ settings, hours, timeZones, agentsOnline, onlineWindowMinutes, limits }: GeneralSettingsFormProps) {
  const t = useTranslations("supportMacros");
  const tg = useTranslations("supportMacros.settings.general");
  const router = useRouter();
  const ids = useId();
  const [state, action, pending] = useActionState(async (prev: SupportSettingsActionState, formData: FormData) => {
    const result = await updateSupportSettingsAction(prev, formData);
    if (result.ok) router.refresh();
    return result;
  }, initial);
  const err = (name: string) => fieldErrorLabel(t, state.fieldErrors?.[name]);
  const strategyError = err("autoAssignStrategy");
  const extraDays = (Object.keys(hours.extraWindows) as DayKey[]).filter((key) => (hours.extraWindows[key]?.length ?? 0) > 0);

  return (
    <form action={action} className="space-y-6" data-testid="support-settings-form">
      {state.ok && state.notice ? <Alert tone="ok">{noticeLabel(t, state.notice)}</Alert> : null}
      {!state.ok && state.error ? <Alert tone="bad">{errorLabel(t, state.error)}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>{tg("senderTitle")}</CardTitle>
          <CardDescription>{tg("senderText")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label={tg("fromName")} hint={tg("fromNameHint")} required error={err("fromName")}>
            {(control) => <Input {...control} name="fromName" defaultValue={settings.fromName} maxLength={limits.fromNameMax} autoComplete="off" />}
          </Field>
          <Field
            label={tg("fromAddress")}
            hint={settings.envOverrides.fromAddress ? tg("envOverride", { name: "SUPPORT_FROM_ADDRESS", value: settings.effective.fromAddress }) : tg("fromAddressHint")}
            required
            error={err("fromAddress")}
          >
            {(control) => <Input {...control} type="email" name="fromAddress" defaultValue={settings.fromAddress} maxLength={254} autoComplete="off" spellCheck={false} />}
          </Field>
          <Field
            label={tg("inboundDomain")}
            hint={settings.envOverrides.inboundDomain ? tg("envOverride", { name: "SUPPORT_INBOUND_DOMAIN", value: settings.effective.inboundDomain }) : tg("inboundDomainHint")}
            required
            error={err("inboundDomain")}
            className="sm:col-span-2"
          >
            {(control) => <Input {...control} name="inboundDomain" defaultValue={settings.inboundDomain} maxLength={253} autoComplete="off" spellCheck={false} className="font-mono" />}
          </Field>
          <Field label={tg("signature")} hint={tg("signatureHint", { max: limits.signatureMax })} error={err("signatureText")} className="sm:col-span-2">
            {(control) => <Textarea {...control} name="signatureText" defaultValue={settings.signatureText} maxLength={limits.signatureMax} rows={4} />}
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tg("autoReplyTitle")}</CardTitle>
          <CardDescription>{tg("autoReplyText")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Checkbox name="autoReplyEnabled" defaultChecked={settings.autoReplyEnabled} label={tg("autoReplyEnabled")} description={tg("autoReplyEnabledText")} data-testid="support-settings-auto-reply" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tg("assignTitle")}</CardTitle>
          <CardDescription>{tg("assignText")}</CardDescription>
        </CardHeader>
        <CardContent>
          <fieldset aria-invalid={strategyError ? true : undefined} aria-describedby={strategyError ? `${ids}-strategy-error` : undefined}>
            <legend className="sr-only">{tg("assignTitle")}</legend>
            {STRATEGIES.map((strategy) => (
              <Radio
                key={strategy}
                name="autoAssignStrategy"
                value={strategy}
                defaultChecked={settings.autoAssignStrategy === strategy}
                label={tg(`assign.${strategy}`)}
                description={tg(`assignText_${strategy}`, { minutes: onlineWindowMinutes })}
                state={strategyError ? "error" : undefined}
              />
            ))}
          </fieldset>
          {strategyError ? (
            <p id={`${ids}-strategy-error`} role="alert" className="mt-1 text-xs text-bad" data-testid="support-settings-strategy-error">
              {strategyError}
            </p>
          ) : null}
          <p className="mt-2 text-sm text-ink-3">{tg("agentsOnline", { count: agentsOnline, minutes: onlineWindowMinutes })}</p>
          <Alert tone="info" className="mt-4">
            {tg("assignApplied")}
          </Alert>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tg("hoursTitle")}</CardTitle>
          <CardDescription>{tg("hoursText")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert tone="info">{tg("hoursFallback")}</Alert>
          <Field label={tg("timezone")} hint={tg("timezoneHint")} required error={err("timezone")} className="max-w-md">
            {(control) => (
              <>
                <Input {...control} name="timezone" defaultValue={hours.form.timezone} list={`${ids}-tz`} autoComplete="off" spellCheck={false} className="font-mono" />
                <datalist id={`${ids}-tz`}>
                  {timeZones.map((tz) => (
                    <option key={tz} value={tz} />
                  ))}
                </datalist>
              </>
            )}
          </Field>
          <Table caption={tg("hoursCaption")}>
            <THead>
              <Tr>
                <Th>{tg("day")}</Th>
                <Th>{tg("start")}</Th>
                <Th>{tg("end")}</Th>
              </Tr>
            </THead>
            <TBody>
              {DAYS.map((key) => {
                const day = hours.form.days[key];
                const error = err(`day_${key}`);
                return (
                  <Tr key={key}>
                    <Td label={tg("day")}>
                      <Checkbox name={`day_${key}_enabled`} defaultChecked={day.enabled} label={tg(`days.${key}`)} className="min-h-10 py-1" />
                      {error ? (
                        <p role="alert" className="mt-1 text-xs text-bad">
                          {error}
                        </p>
                      ) : null}
                    </Td>
                    <Td label={tg("start")}>
                      <Input type="time" name={`day_${key}_start`} defaultValue={day.start} aria-label={`${tg(`days.${key}`)} — ${tg("start")}`} className="max-w-36" state={error ? "error" : undefined} />
                    </Td>
                    <Td label={tg("end")}>
                      <Input type="time" name={`day_${key}_end`} defaultValue={day.end} aria-label={`${tg(`days.${key}`)} — ${tg("end")}`} className="max-w-36" state={error ? "error" : undefined} />
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
          {extraDays.length ? (
            <Alert tone="warn">
              {tg("extraWindows", { days: extraDays.map((key) => tg(`days.${key}`)).join(", ") })}
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tg("csatTitle")}</CardTitle>
          <CardDescription>{tg("csatText")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Checkbox name="csatEnabled" defaultChecked={settings.csatEnabled} label={tg("csatEnabled")} description={tg("csatEnabledText")} />
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={pending} loadingLabel={t("common.working")} leadingIcon={<Save className="size-4" aria-hidden="true" />} data-testid="support-settings-submit">
          {tg("save")}
        </Button>
        <Link href="/ops/support/settings" className={buttonVariants({ variant: "secondary" })}>
          {t("common.cancel")}
        </Link>
      </div>
    </form>
  );
}
