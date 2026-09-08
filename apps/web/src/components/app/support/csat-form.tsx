"use client";

import { useTranslations } from "next-intl";
import { useActionState, useId } from "react";
import { Button, Field, FieldError, Radio, Textarea } from "@track-site/ui";
import { rateTicketAction, type SupportActionState } from "@/server/actions/support";
import { PORTAL_LIMITS } from "./constants";
import { ActionFeedback } from "./feedback";

const initial: SupportActionState = { ok: false, error: null, notice: null };
const SCORES = [1, 2, 3, 4, 5] as const;

/** Satisfaction after a solved ticket: one rating (1–5) plus an optional comment; asked once per ticket. */
export function CsatForm({ ticketId, locale }: { ticketId: string; locale: string }) {
  const t = useTranslations("supportPortal");
  const [state, action, pending] = useActionState(rateTicketAction, initial);
  const uid = useId();
  if (state.ok) return <ActionFeedback state={state} locale={locale} />;
  const scoreError = state.fieldErrors?.score ? t("errors.score") : undefined;
  return (
    <form action={action} className="space-y-4" aria-labelledby={`${uid}-title`}>
      <div>
        <h2 id={`${uid}-title`} className="text-lg font-semibold text-ink">
          {t("detail.csat.title")}
        </h2>
        <p className="mt-1 text-sm text-ink-3">{t("detail.csat.intro")}</p>
      </div>
      <input type="hidden" name="ticketId" value={ticketId} />
      {state.error ? <ActionFeedback state={state} locale={locale} /> : null}
      <fieldset aria-describedby={scoreError ? `${uid}-score-error` : undefined}>
        <legend className="text-sm font-medium text-ink">{t("detail.csat.legend")}</legend>
        <div className="mt-1 grid gap-x-4 sm:grid-cols-2 lg:grid-cols-5">
          {SCORES.map((s) => (
            <Radio key={s} name="score" value={s} required label={t(`detail.csat.scores.${s}`)} state={scoreError ? "error" : undefined} data-testid={`support-csat-${s}`} />
          ))}
        </div>
        <FieldError id={`${uid}-score-error`}>{scoreError}</FieldError>
      </fieldset>
      <Field id={`${uid}-comment`} label={t("detail.csat.comment")} hint={t("detail.csat.commentHint", { max: PORTAL_LIMITS.csatCommentMax })} meta={t("common.optional")}>
        {(control) => <Textarea {...control} name="comment" maxLength={PORTAL_LIMITS.csatCommentMax} rows={3} className="min-h-20" />}
      </Field>
      <Button type="submit" loading={pending} loadingLabel={t("common.working")} data-testid="support-csat-submit">
        {t("detail.csat.submit")}
      </Button>
    </form>
  );
}
