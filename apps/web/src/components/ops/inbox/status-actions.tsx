"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ContactRequestStatus } from "@track-site/db";
import { Button, Dialog, Status } from "@track-site/ui";
import { setContactStatusAction, type InboxActionError } from "@/server/ops/actions/inbox";
import { errorLabel } from "./labels";

/**
 * Status transitions of one request. Spam (hides the request) is confirmed in a dialog and sent with the
 * `confirmed` literal; every other transition is a direct, reversible click. The outcome is announced.
 */
export function StatusActions({
  requestId,
  status,
  transitions,
  confirmRequired,
}: {
  requestId: string;
  status: ContactRequestStatus;
  transitions: ContactRequestStatus[];
  confirmRequired: ContactRequestStatus[];
}) {
  const t = useTranslations("opsInbox");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<ContactRequestStatus | null>(null);
  const [result, setResult] = useState<{ ok: boolean; error: InboxActionError | null } | null>(null);

  const run = (next: ContactRequestStatus, confirmed: boolean) =>
    startTransition(async () => {
      let outcome: { ok: boolean; error: InboxActionError | null };
      try {
        outcome = await setContactStatusAction({ requestId, status: next, confirmed });
      } catch {
        outcome = { ok: false, error: "generic" };
      }
      setResult(outcome);
      if (outcome.ok) {
        setConfirm(null);
        router.refresh();
      }
    });

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-2">
        {t("detail.status.current")}: <span className="font-medium text-ink">{t(`status.${status}`)}</span>
      </p>
      <div className="flex flex-wrap gap-2">
        {transitions.map((next) => {
          const needsConfirm = confirmRequired.includes(next);
          return (
            <Button
              key={next}
              type="button"
              size="sm"
              variant={next === "spam" ? "ghost" : next === "done" ? "primary" : "secondary"}
              loading={pending && !needsConfirm}
              loadingLabel={t("common.working")}
              aria-haspopup={needsConfirm ? "dialog" : undefined}
              onClick={() => (needsConfirm ? setConfirm(next) : run(next, false))}
              data-testid={`inbox-status-${next}`}
            >
              {t("detail.status.moveTo", { status: t(`status.${next}`) })}
            </Button>
          );
        })}
      </div>
      <span role="status" aria-live="polite" className="block text-xs">
        {result ? (
          <Status tone={result.ok ? "ok" : "bad"} indicator="icon" className="text-xs">
            {result.ok ? t("detail.status.changed") : errorLabel(t, result.error)}
          </Status>
        ) : null}
      </span>

      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={t("detail.status.spamDialog.title")}
        description={t("detail.status.spamDialog.description")}
        closeLabel={t("common.close")}
        size="sm"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setConfirm(null)} data-autofocus>
              {t("common.cancel")}
            </Button>
            <Button type="button" variant="danger" loading={pending} loadingLabel={t("common.working")} onClick={() => confirm && run(confirm, true)}>
              {t("detail.status.spamDialog.confirm")}
            </Button>
          </>
        }
      >
        {result && !result.ok && confirm ? (
          <Status tone="bad" indicator="icon" className="text-xs">
            {errorLabel(t, result.error)}
          </Status>
        ) : null}
      </Dialog>
    </div>
  );
}
