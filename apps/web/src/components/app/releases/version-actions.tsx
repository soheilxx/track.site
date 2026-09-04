"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { Alert, Button, Dialog } from "@track-site/ui";
import { rollbackAction, type ReleaseActionState } from "@/server/actions/releases";
import { errorLabel } from "./labels";

const initial: ReleaseActionState = { ok: false, error: null };

/**
 * One-click rollback behind an explicit confirmation: the dialog names the version that is live now
 * and the one that replaces it; the confirmation travels as a form field and the server action
 * re-checks it, refuses an already active version and audits the rollback.
 */
export function RollbackButton({ versionId, version, activeVersion, environmentLabel }: { versionId: string; version: number; activeVersion: number | null; environmentLabel: string }) {
  const t = useTranslations("releases");
  const router = useRouter();
  const [state, action, pending] = useActionState(rollbackAction, initial);
  const [open, setOpen] = useState(false);
  // close the dialog once for each successful result (state adjusted during render, no effect needed)
  const [handled, setHandled] = useState<ReleaseActionState | null>(null);
  if (state.ok && handled !== state) {
    setHandled(state);
    setOpen(false);
  }

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  return (
    <div className="space-y-2">
      {state.ok ? <Alert tone="ok">{t("actions.rolledBackOk", { version })}</Alert> : state.error ? <Alert tone="bad">{errorLabel(t, state.error)}</Alert> : null}
      <Button variant="danger" onClick={() => setOpen(true)} disabled={state.ok} data-testid="release-rollback">
        {t("actions.rollback")}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={t("actions.rollbackDialogTitle", { environment: environmentLabel, version })} description={activeVersion === null ? t("actions.rollbackDialogNoActive", { environment: environmentLabel, version }) : t("actions.rollbackDialogText", { active: activeVersion, version })} closeLabel={t("close")} size="sm">
        <form action={action} className="flex flex-col-reverse gap-2 py-2 sm:flex-row sm:justify-end">
          <input type="hidden" name="versionId" value={versionId} />
          <input type="hidden" name="confirm" value="rollback" />
          <Button type="button" variant="secondary" onClick={() => setOpen(false)} data-autofocus>
            {t("cancel")}
          </Button>
          <Button type="submit" variant="danger" loading={pending}>
            {t("actions.rollbackConfirm", { version })}
          </Button>
        </form>
      </Dialog>
    </div>
  );
}
