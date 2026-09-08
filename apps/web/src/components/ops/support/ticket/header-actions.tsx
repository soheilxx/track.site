"use client";

import { GitMerge, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Alert, Button, Dialog, Field, Input } from "@track-site/ui";
import { mergeTicketAction, reopenTicketAction, type TicketActionError } from "@/server/ops/actions/support-ticket";
import { errorLabel } from "./labels";

/**
 * Header actions of the ticket: reopen (solved / closed) and merge into another ticket by number (confirmed
 * in a dialog; the source is closed and both timelines link each other). Outcomes are announced.
 */
export function HeaderActions({ ticketId, number, canReopen, canMerge }: { ticketId: string; number: number; canReopen: boolean; canMerge: boolean }) {
  const t = useTranslations("supportTicket");
  const router = useRouter();
  const formId = useId();
  const [pending, startTransition] = useTransition();
  const [mergeOpen, setMergeOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [result, setResult] = useState<{ ok: boolean; error: TicketActionError | null; what: "reopen" | "merge" } | null>(null);

  const reopen = () =>
    startTransition(async () => {
      let outcome: { ok: boolean; error: TicketActionError | null };
      try {
        outcome = await reopenTicketAction({ ticketId });
      } catch {
        outcome = { ok: false, error: "generic" };
      }
      setResult({ ...outcome, what: "reopen" });
      if (outcome.ok) router.refresh();
    });

  const merge = () =>
    startTransition(async () => {
      const targetNumber = Number.parseInt(target.replace(/^#/, "").trim(), 10);
      let outcome: { ok: boolean; error: TicketActionError | null; targetId?: string };
      try {
        outcome = Number.isFinite(targetNumber) ? await mergeTicketAction({ ticketId, targetNumber, confirmed: true }) : { ok: false, error: "invalid" };
      } catch {
        outcome = { ok: false, error: "generic" };
      }
      setResult({ ok: outcome.ok, error: outcome.error, what: "merge" });
      if (outcome.ok) {
        setMergeOpen(false);
        router.refresh();
      }
    });

  return (
    <>
      {canReopen ? (
        <Button type="button" variant="secondary" loading={pending && result?.what !== "merge"} loadingLabel={t("common.working")} onClick={reopen} data-testid="ticket-reopen">
          <RotateCcw className="size-4" aria-hidden="true" />
          {t("header.reopen")}
        </Button>
      ) : null}
      {canMerge ? (
        <Button type="button" variant="ghost" aria-haspopup="dialog" onClick={() => setMergeOpen(true)} data-testid="ticket-merge-open">
          <GitMerge className="size-4" aria-hidden="true" />
          {t("header.merge")}
        </Button>
      ) : null}
      <span role="status" aria-live="polite" className="sr-only">
        {result && result.what === "reopen" ? (result.ok ? t("header.reopened") : errorLabel(t, result.error)) : ""}
      </span>
      {result && result.what === "reopen" && !result.ok ? (
        <Alert tone="bad" className="basis-full">
          {errorLabel(t, result.error)}
        </Alert>
      ) : null}
      <Dialog
        open={mergeOpen}
        onClose={() => setMergeOpen(false)}
        title={t("merge.title", { number })}
        description={t("merge.description")}
        closeLabel={t("common.close")}
        size="sm"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setMergeOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" form={formId} variant="danger" loading={pending} loadingLabel={t("common.working")} disabled={!target.trim()} data-testid="ticket-merge-confirm">
              {t("merge.confirm")}
            </Button>
          </>
        }
      >
        <form
          id={formId}
          onSubmit={(e) => {
            e.preventDefault();
            merge();
          }}
          className="space-y-3"
        >
          <Field label={t("merge.target")} hint={t("merge.targetHint")} required>
            {(props) => <Input {...props} inputMode="numeric" pattern="#?[0-9]+" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="#1234" data-autofocus data-testid="ticket-merge-target" />}
          </Field>
          {result && result.what === "merge" && !result.ok ? <Alert tone="bad">{errorLabel(t, result.error)}</Alert> : null}
        </form>
      </Dialog>
    </>
  );
}
