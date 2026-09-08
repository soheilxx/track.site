"use client";

import { Megaphone } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useActionState } from "react";
import { Alert, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox, Field, Input, Select, Textarea, buttonVariants } from "@track-site/ui";
import { ALL_LOCALES, LOCALE_NAMES } from "@/i18n/routing";
import { createAnnouncementAction, type ControlsActionState } from "@/server/ops/actions/controls";
import { ActionFeedback } from "./feedback";
import { fieldErrorLabel } from "./labels";

const initial: ControlsActionState = { ok: false, error: null, notice: null };

export interface AnnouncementFormProps {
  plans: readonly string[];
  /** `datetime-local` default for the start (now, UTC) */
  defaultStartsAt: string;
}

/**
 * Create / schedule an announcement: severity, six-locale title and body (English mandatory, other
 * locales fall back to English in the dashboard), window in UTC, audience by plan and/or organization
 * ids, optional https link. Validation errors come back per field from the server action.
 */
export function AnnouncementForm({ plans, defaultStartsAt }: AnnouncementFormProps) {
  const t = useTranslations("opsControls.announcements.form");
  const tc = useTranslations("opsControls");
  const [state, action, pending] = useActionState(createAnnouncementAction, initial);
  const err = (name: string) => fieldErrorLabel(tc, state.fieldErrors?.[name]);

  if (state.ok) {
    return (
      <Alert tone="ok" title={t("created")}>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link href="/ops/controls/announcements" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            {t("back")}
          </Link>
          <Link href="/ops/controls/announcements/new" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            {t("createAnother")}
          </Link>
        </div>
      </Alert>
    );
  }

  return (
    <form action={action} className="space-y-6" data-testid="ops-announcement-form">
      <ActionFeedback state={state.error ? state : null} />

      <Card>
        <CardHeader>
          <CardTitle>{t("textsTitle")}</CardTitle>
          <CardDescription>{t("textsText")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Field label={t("severity")} hint={t("severityHint")} required error={err("severity")}>
            {(control) => (
              <Select {...control} name="severity" defaultValue="info">
                <option value="info">{tc("announcements.severity.info")}</option>
                <option value="warn">{tc("announcements.severity.warn")}</option>
                <option value="bad">{tc("announcements.severity.bad")}</option>
              </Select>
            )}
          </Field>
          {ALL_LOCALES.map((locale) => (
            <fieldset key={locale} className="space-y-3 rounded-[var(--radius-card)] border border-line p-4">
              <legend className="px-1 text-sm font-medium text-ink">
                {LOCALE_NAMES[locale]} <span className="font-mono text-xs text-ink-3">({locale})</span>
                {locale === "en" ? null : <span className="ml-2 text-xs font-normal text-ink-3">{tc("common.optional")}</span>}
              </legend>
              <Field label={t("titleFor", { locale: LOCALE_NAMES[locale] })} required={locale === "en"} error={err(`title_${locale}`)}>
                {(control) => <Input {...control} name={`title_${locale}`} maxLength={160} lang={locale} />}
              </Field>
              <Field label={t("bodyFor", { locale: LOCALE_NAMES[locale] })} error={err(`body_${locale}`)}>
                {(control) => <Textarea {...control} name={`body_${locale}`} maxLength={1000} rows={3} lang={locale} />}
              </Field>
            </fieldset>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("windowTitle")}</CardTitle>
          <CardDescription>{t("windowText")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label={t("startsAt")} hint={t("startsAtHint")} error={err("startsAt")}>
            {(control) => <Input {...control} type="datetime-local" name="startsAt" defaultValue={defaultStartsAt} />}
          </Field>
          <Field label={t("endsAt")} hint={t("endsAtHint")} error={err("endsAt")}>
            {(control) => <Input {...control} type="datetime-local" name="endsAt" />}
          </Field>
          <Field label={t("linkUrl")} hint={t("linkUrlHint")} error={err("linkUrl")} className="sm:col-span-2">
            {(control) => <Input {...control} type="url" name="linkUrl" inputMode="url" placeholder="https://" maxLength={2048} />}
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("audienceTitle")}</CardTitle>
          <CardDescription>{t("audienceText")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <fieldset>
            <legend className="mb-1 text-sm font-medium text-ink">{t("plans")}</legend>
            <div className="grid gap-x-4 sm:grid-cols-2">
              {plans.map((plan) => (
                <Checkbox key={plan} name="plans" value={plan} label={tc.has(`plans.${plan}`) ? tc(`plans.${plan}`) : plan} />
              ))}
            </div>
          </fieldset>
          <Field label={t("organisationIds")} hint={t("organisationIdsHint")} error={err("organizationIds")}>
            {(control) => <Textarea {...control} name="organizationIds" rows={3} spellCheck={false} className="font-mono text-xs" />}
          </Field>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={pending} loadingLabel={tc("common.working")} leadingIcon={<Megaphone className="size-4" aria-hidden="true" />} data-testid="ops-announcement-submit">
          {t("submit")}
        </Button>
        <Link href="/ops/controls/announcements" className={buttonVariants({ variant: "secondary" })}>
          {tc("common.cancel")}
        </Link>
      </div>
    </form>
  );
}
