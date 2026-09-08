"use client";

import { useTranslations } from "next-intl";
import { useActionState, useId, useState } from "react";
import { Alert, Button, Dialog, Field, Textarea } from "@track-site/ui";
import { replyContactAction, type ReplyState } from "@/server/ops/actions/inbox";
import { errorLabel } from "./labels";

const INITIAL: ReplyState = { ok: false, error: null, transport: null };
const MIN = 10;
const MAX = 4000;

/**
 * Free-text reply wrapped in the requester-language template. "Send reply" opens a confirmation with the
 * recipient and subject; the dialog's confirm button submits the form with the `confirmed` literal. A
 * successful send clears the text (so nothing is sent twice by accident) and announces the transport.
 */
export function ReplyForm({ requestId, email, subject, language, reference, disabled }: { requestId: string; email: string; subject: string; language: string; reference: string; disabled: boolean }) {
  const t = useTranslations("opsInbox");
  const formId = useId();
  const [state, action, pending] = useActionState(replyContactAction, INITIAL);
  const [body, setBody] = useState("");
  const [open, setOpen] = useState(false);
  // state adjusted during render (no effect): a successful send closes the dialog and clears the text once
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state.ok) {
      setOpen(false);
      setBody("");
    }
  }
  const length = body.trim().length;
  const valid = length >= MIN && length <= MAX;
  const fieldError = state.fieldErrors?.body ? t("errors.invalid") : undefined;

  if (disabled) return <Alert tone="warn">{t("detail.reply.spamBlocked")}</Alert>;
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-3">{t("detail.reply.intro", { reference })}</p>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
        <dt className="text-ink-3">{t("detail.reply.recipient")}</dt>
        <dd className="break-all text-ink">{email}</dd>
        <dt className="text-ink-3">{t("detail.locale")}</dt>
        <dd className="text-ink">{t("detail.reply.language", { language })}</dd>
      </dl>
      <form id={formId} action={action} className="space-y-3">
        <input type="hidden" name="requestId" value={requestId} />
        <input type="hidden" name="confirmed" value={open ? "true" : ""} />
        <Field label={t("detail.reply.body")} hint={t("detail.reply.bodyHint")} error={fieldError} required>
          {(props) => <Textarea {...props} name="body" value={body} onChange={(e) => setBody(e.target.value)} minLength={MIN} maxLength={MAX} rows={8} data-testid="inbox-reply-body" />}
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" disabled={!valid} onClick={() => setOpen(true)} aria-haspopup="dialog" data-testid="inbox-reply-open">
            {t("detail.reply.send")}
          </Button>
          <span className="text-xs tabular-nums text-ink-3">
            {length} / {MAX}
          </span>
        </div>
        {state.ok ? <Alert tone="ok">{state.transport === "file" ? t("detail.reply.sentFile") : t("detail.reply.sent", { transport: state.transport ?? "" })}</Alert> : null}
        {!state.ok && state.error && !open ? <Alert tone="bad">{errorLabel(t, state.error)}</Alert> : null}
      </form>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t("detail.reply.dialog.title")}
        description={t("detail.reply.dialog.description", { email, subject })}
        closeLabel={t("common.close")}
        size="md"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" form={formId} loading={pending} loadingLabel={t("common.working")} data-autofocus data-testid="inbox-reply-confirm">
              {t("detail.reply.dialog.confirm")}
            </Button>
          </>
        }
      >
        <pre className="max-h-60 overflow-auto rounded-[var(--radius-control)] bg-surface-2 p-3 font-sans text-sm whitespace-pre-wrap text-ink">{body.trim()}</pre>
        {!state.ok && state.error ? (
          <Alert tone="bad" className="mt-3">
            {errorLabel(t, state.error)}
          </Alert>
        ) : null}
      </Dialog>
    </div>
  );
}
