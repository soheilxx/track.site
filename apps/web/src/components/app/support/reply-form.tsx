"use client";

import { useTranslations } from "next-intl";
import { useActionState, useId, useState } from "react";
import { Alert, Button, Field, Textarea } from "@track-site/ui";
import { replyTicketAction, type SupportActionState } from "@/server/actions/support";
import { AttachmentsInput } from "./attachments-input";
import { PORTAL_LIMITS } from "./constants";
import { ActionFeedback } from "./feedback";

const initial: SupportActionState = { ok: false, error: null, notice: null };

/** Customer reply with attachments; a successful send clears the text (state adjusted during render, no effect). */
export function ReplyForm({ ticketId, status, locale }: { ticketId: string; status: string; locale: string }) {
  const t = useTranslations("supportPortal");
  const [state, action, pending] = useActionState(replyTicketAction, initial);
  const [body, setBody] = useState("");
  const [seen, setSeen] = useState(state);
  const [formKey, setFormKey] = useState(0);
  if (state !== seen) {
    setSeen(state);
    if (state.ok) {
      setBody("");
      // a fresh key resets the uncontrolled file input after a successful send
      setFormKey((k) => k + 1);
    }
  }
  const uid = useId();
  const limits = { min: PORTAL_LIMITS.bodyMin, max: PORTAL_LIMITS.bodyMax };
  const length = body.trim().length;
  const valid = length >= PORTAL_LIMITS.bodyMin && length <= PORTAL_LIMITS.bodyMax;
  const solved = status === "solved" || status === "closed";
  return (
    <form key={formKey} action={action} className="space-y-4" aria-labelledby={`${uid}-title`}>
      <h2 id={`${uid}-title`} className="text-lg font-semibold text-ink">
        {t("detail.reply.title")}
      </h2>
      <input type="hidden" name="ticketId" value={ticketId} />
      <ActionFeedback state={state} locale={locale} />
      {solved ? <Alert tone="info">{t("detail.reply.reopens")}</Alert> : status === "pending" ? <Alert tone="warn">{t("detail.reply.pendingHint")}</Alert> : null}
      <Field id={`${uid}-body`} label={t("detail.reply.body")} hint={t("detail.reply.bodyHint", limits)} error={state.fieldErrors?.body ? t("errors.body", limits) : undefined} required>
        {(control) => <Textarea {...control} name="body" value={body} onChange={(e) => setBody(e.target.value)} minLength={PORTAL_LIMITS.bodyMin} maxLength={PORTAL_LIMITS.bodyMax} rows={6} data-testid="support-reply-body" />}
      </Field>
      <AttachmentsInput id={`${uid}-attachments`} label={t("detail.reply.attachments")} locale={locale} disabled={pending} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!valid} loading={pending} loadingLabel={t("common.working")} data-testid="support-reply-send">
          {t("detail.reply.send")}
        </Button>
        <span className="text-xs tabular-nums text-ink-3">
          {length} / {PORTAL_LIMITS.bodyMax}
        </span>
      </div>
    </form>
  );
}
