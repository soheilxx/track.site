"use client";

import { RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Dialog, Status } from "@track-site/ui";
import { reprocessInboundEventAction, type ReprocessInboundResult } from "@/server/ops/actions/support-settings";

/**
 * "Reprocess" for a failed (or interrupted) inbound delivery on the ledger (docs/18 §"Hardening"): confirmed
 * in a dialog, then the stored event runs through the real handler again — retry-safe, a mail an earlier
 * attempt already stored is answered with its ticket, never stored twice. The outcome is announced.
 */
export function ReprocessInboundButton({ eventId, providerEventId }: { eventId: string; providerEventId: string }) {
  const t = useTranslations("supportMacros.settings.overview.inbound.reprocess");
  const tc = useTranslations("supportMacros.common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ReprocessInboundResult | null>(null);

  const outcomeText = (r: ReprocessInboundResult): string => {
    if (!r.ok) return t.has(`errors.${r.error}`) ? t(`errors.${r.error}`) : t("errors.generic");
    switch (r.outcome.status) {
      case "processed":
        return r.outcome.ticketNumber != null ? t("done", { number: r.outcome.ticketNumber, route: r.outcome.route ?? "" }) : t("doneNoTicket");
      case "ignored":
        return t("ignored");
      case "duplicate":
        return t("duplicate");
      case "in_progress":
        return t("inProgress");
      default:
        return t("failed", { error: r.outcome.error ?? "" });
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)} aria-haspopup="dialog" data-testid="support-inbound-reprocess">
        <RotateCcw className="size-4" aria-hidden="true" />
        {t("button")}
      </Button>
      <span role="status" aria-live="polite" className="text-xs">
        {result ? (
          <Status tone={result.ok && result.outcome.status === "processed" ? "ok" : result.ok ? "info" : "bad"} indicator="icon" className="text-xs">
            {outcomeText(result)}
          </Status>
        ) : null}
      </span>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t("dialogTitle")}
        description={t("dialogText", { event: providerEventId })}
        closeLabel={tc("close")}
        size="sm"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} data-autofocus>
              {tc("cancel")}
            </Button>
            <Button
              type="button"
              loading={pending}
              loadingLabel={t("working")}
              onClick={() =>
                startTransition(async () => {
                  let outcome: ReprocessInboundResult;
                  try {
                    outcome = await reprocessInboundEventAction({ eventId, confirmed: true });
                  } catch {
                    outcome = { ok: false, error: "generic" };
                  }
                  setResult(outcome);
                  setOpen(false);
                  if (outcome.ok) router.refresh();
                })
              }
              data-testid="support-inbound-reprocess-confirm"
            >
              {t("confirm")}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink">{t("dialogHint")}</p>
      </Dialog>
    </div>
  );
}
