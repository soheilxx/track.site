"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useId, useState } from "react";
import { Alert, Button, Dialog } from "@track-site/ui";
import { deleteSupportViewAction, type ViewActionState } from "@/server/ops/actions/support-tickets";
import { errorLabel } from "./labels";

const INITIAL: ViewActionState = { ok: false, error: null };

/** Deletes a saved view after a confirmation dialog; the dialog's confirm button submits the hidden form. */
export function ViewDelete({ viewId, name }: { viewId: string; name: string }) {
  const t = useTranslations("supportTickets.viewForm");
  const te = useTranslations("supportTickets");
  const formId = useId();
  const [state, action, pending] = useActionState(deleteSupportViewAction, INITIAL);
  const [open, setOpen] = useState(false);
  return (
    <>
      <form id={formId} action={action}>
        <input type="hidden" name="id" value={viewId} />
        <input type="hidden" name="confirm" value={open ? "true" : ""} />
      </form>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)} aria-haspopup="dialog" leadingIcon={<Trash2 className="size-4" aria-hidden="true" />} data-testid="support-view-delete">
        {t("delete")}
      </Button>
      {!open && state.error ? (
        <Alert tone="bad" className="mt-2">
          {errorLabel(te, state.error)}
        </Alert>
      ) : null}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t("deleteTitle", { name })}
        description={t("deleteDescription")}
        closeLabel={te("common.close")}
        size="sm"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} data-autofocus>
              {te("common.cancel")}
            </Button>
            <Button type="submit" form={formId} variant="danger" loading={pending} loadingLabel={te("common.working")} data-testid="support-view-delete-confirm">
              {t("deleteConfirm")}
            </Button>
          </>
        }
      >
        {state.error ? <Alert tone="bad">{errorLabel(te, state.error)}</Alert> : null}
      </Dialog>
    </>
  );
}
