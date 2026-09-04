"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Status } from "@track-site/ui";
import { resolveAlertEventAction, type AlertActionError } from "@/server/actions/alerts";
import { errorLabel } from "./labels";

/** Marks one open alert as resolved by hand; the outcome is announced next to the button. */
export function ResolveButton({ eventId }: { eventId: string }) {
  const t = useTranslations("alerts");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; error: AlertActionError | null } | null>(
    null,
  );
  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        size="sm"
        variant="secondary"
        loading={pending}
        loadingLabel={t("history.resolving")}
        disabled={result?.ok}
        onClick={() =>
          startTransition(async () => {
            let next: { ok: boolean; error: AlertActionError | null };
            try {
              next = await resolveAlertEventAction({ eventId });
            } catch {
              next = { ok: false, error: "generic" };
            }
            setResult(next);
            if (next.ok) router.refresh();
          })
        }
        data-testid="alert-resolve"
      >
        {t("history.resolve")}
      </Button>
      <span role="status" aria-live="polite" className="text-xs">
        {result ? (
          <Status tone={result.ok ? "ok" : "bad"} indicator="icon" className="text-xs">
            {result.ok ? t("history.resolved") : errorLabel(t, result.error)}
          </Status>
        ) : null}
      </span>
    </div>
  );
}
