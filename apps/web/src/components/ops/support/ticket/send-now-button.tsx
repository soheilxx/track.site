"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Status } from "@track-site/ui";
import { finalizeTicketMessageAction, type TicketActionError } from "@/server/ops/actions/support-ticket";
import { errorLabel } from "./labels";

/** "Send now" for a queued (uploads interrupted) or failed outbound message; the outcome is announced. */
export function SendNowButton({ messageId, failed }: { messageId: string; failed: boolean }) {
  const t = useTranslations("supportTicket");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; error: TicketActionError | null } | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        loading={pending}
        loadingLabel={t("common.working")}
        onClick={() =>
          startTransition(async () => {
            let outcome: { ok: boolean; error: TicketActionError | null };
            try {
              outcome = await finalizeTicketMessageAction({ messageId });
            } catch {
              outcome = { ok: false, error: "generic" };
            }
            setResult(outcome);
            if (outcome.ok) router.refresh();
          })
        }
        data-testid="ticket-send-now"
      >
        {failed ? t("timeline.retrySend") : t("timeline.sendNow")}
      </Button>
      <span role="status" aria-live="polite" className="text-xs">
        {result ? (
          <Status tone={result.ok ? "ok" : "bad"} indicator="icon" className="text-xs">
            {result.ok ? t("timeline.sentNow") : errorLabel(t, result.error)}
          </Status>
        ) : null}
      </span>
    </div>
  );
}
