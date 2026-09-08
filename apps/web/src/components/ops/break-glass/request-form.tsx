"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Button, Field, Input, Select, Textarea } from "@track-site/ui";
import { requestBreakGlassAction } from "@/server/ops/actions/break-glass";
import { BREAK_GLASS_DURATIONS, BREAK_GLASS_REASON_MAX, BREAK_GLASS_REASON_MIN, BREAK_GLASS_TICKET_MAX } from "./constants";
import { ActionFeedback, INITIAL_STATE } from "./feedback";

export interface RequestOrganisation {
  id: string;
  name: string;
  slug: string;
}

/**
 * Request form: organisation, reason (≥ 20 characters, live counter), ticket reference, duration 15 min – 4 h.
 * Server-side field errors are mapped onto the fields; after a successful request the form is remounted empty.
 */
export function RequestForm({ organisations, otherAdminExists, locale, defaultOrganizationId = null }: { organisations: RequestOrganisation[]; otherAdminExists: boolean; locale: string; /** `?organization=<id>` from the Organisations detail page; honoured only when it is one of the selectable organisations */ defaultOrganizationId?: string | null }) {
  const t = useTranslations("opsBreakGlass");
  const [state, action, pending] = useActionState(requestBreakGlassAction, INITIAL_STATE);
  const [reasonLength, setReasonLength] = useState(0);
  const [formKey, setFormKey] = useState(0);
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state.ok) {
      setFormKey((k) => k + 1);
      setReasonLength(0);
    }
  }
  const errors = state.fieldErrors ?? {};
  const count = new Intl.NumberFormat(locale).format;
  const preselected = defaultOrganizationId && organisations.some((o) => o.id === defaultOrganizationId) ? defaultOrganizationId : "";
  return (
    <form key={formKey} action={action} className="space-y-4" data-testid="break-glass-request-form">
      <ActionFeedback state={state} />
      <Field label={t("request.organization")} required error={errors.organizationId ? t("errors.organization") : undefined} hint={t("request.organizationHint", { count: organisations.length })}>
        {(control) => (
          <Select {...control} name="organizationId" defaultValue={preselected} disabled={organisations.length === 0}>
            <option value="" disabled>
              {t("request.organizationPlaceholder")}
            </option>
            {organisations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} ({o.slug})
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field
        label={t("request.reason")}
        required
        error={errors.reason ? t("errors.reason", { min: BREAK_GLASS_REASON_MIN, max: BREAK_GLASS_REASON_MAX }) : undefined}
        hint={t("request.reasonHint", { min: BREAK_GLASS_REASON_MIN })}
        meta={<span aria-live="polite">{t("request.reasonCount", { count: count(reasonLength), max: count(BREAK_GLASS_REASON_MAX) })}</span>}
      >
        {(control) => <Textarea {...control} name="reason" minLength={BREAK_GLASS_REASON_MIN} maxLength={BREAK_GLASS_REASON_MAX} rows={4} onChange={(e) => setReasonLength(e.target.value.trim().length)} />}
      </Field>
      <Field label={t("request.ticket")} meta={otherAdminExists ? t("request.optional") : undefined} required={!otherAdminExists} error={errors.ticketRef ? t("errors.ticketRef", { max: BREAK_GLASS_TICKET_MAX }) : undefined} hint={t("request.ticketHint")}>
        {(control) => <Input {...control} name="ticketRef" maxLength={BREAK_GLASS_TICKET_MAX} autoComplete="off" spellCheck={false} />}
      </Field>
      <Field label={t("request.duration")} required error={errors.durationMinutes ? t("errors.durationMinutes") : undefined}>
        {(control) => (
          <Select {...control} name="durationMinutes" defaultValue="60">
            {BREAK_GLASS_DURATIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {t(`request.durations.${minutes}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Button type="submit" loading={pending} disabled={organisations.length === 0}>
        {t("request.submit")}
      </Button>
    </form>
  );
}
