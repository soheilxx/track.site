"use client";

import { CircleCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Button, Dialog } from "@track-site/ui";
import { markTicketSolvedAction, type SupportActionState } from "@/server/actions/support";
import { ActionFeedback, useCloseOnSuccess } from "./feedback";

const initial: SupportActionState = { ok: false, error: null, notice: null };

/** "Mark as solved" behind a confirmation dialog; the dialog's form sends the `confirm` literal the action re-checks. */
export function SolveDialog({ ticketId, number, locale }: { ticketId: string; number: string; locale: string }) {
  const t = useTranslations("supportPortal");
  const [state, action, pending] = useActionState(markTicketSolvedAction, initial);
  const [open, setOpen] = useState(false);
  useCloseOnSuccess(state, setOpen);
  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)} aria-haspopup="dialog" leadingIcon={<CircleCheck className="size-4" aria-hidden="true" />} data-testid="support-solve-open">
        {t("detail.solve.button")}
      </Button>
      {state.ok && state.notice ? (
        <div className="basis-full">
          <ActionFeedback state={state} locale={locale} />
        </div>
      ) : null}
      <Dialog open={open} onClose={() => setOpen(false)} title={t("detail.solve.title")} description={t("detail.solve.description", { number })} closeLabel={t("common.close")} size="sm">
        <form action={action} className="space-y-3 py-2">
          <input type="hidden" name="ticketId" value={ticketId} />
          <input type="hidden" name="confirm" value="solve" />
          {!state.ok && state.error ? <ActionFeedback state={state} locale={locale} /> : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" loading={pending} loadingLabel={t("common.working")} data-autofocus data-testid="support-solve-confirm">
              {t("detail.solve.confirm")}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
