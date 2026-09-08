"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Button, Dialog, Input, Label, Select, Status } from "@track-site/ui";
import { bulkAssignTicketsAction, bulkMergeTicketsAction, bulkPriorityTicketsAction, bulkStatusTicketsAction, bulkTagTicketsAction, type BulkActionResult } from "@/server/ops/actions/support-tickets";
import type { SupportOperator } from "@/server/support/tickets";
import { BULK_ACTIONS, TICKET_BULK_MAX, TICKET_PRIORITIES, TICKET_STATUSES, type BulkAction } from "./constants";
import { errorLabel } from "./labels";

/**
 * Bulk toolbar of the queue: one action (assign, status, priority, tags, merge into) with its parameters,
 * applied to the selected tickets after a confirmation dialog that names the count. Results (applied /
 * skipped) are announced; the list refreshes and the selection is cleared on success. Counts are passed as
 * numbers — the strings pluralise and format them per locale (ICU `plural`).
 */
export function BulkActions({ selectedIds, operators, selfId, canAssign, canWrite, onDone }: { selectedIds: string[]; operators: SupportOperator[]; selfId: string; canAssign: boolean; canWrite: boolean; onDone: () => void }) {
  const t = useTranslations("supportTickets.bulk");
  const te = useTranslations("supportTickets");
  const tv = useTranslations("support");
  const router = useRouter();
  const id = useId();
  const [pending, startTransition] = useTransition();
  const available = BULK_ACTIONS.filter((a) => (a === "assign" ? canAssign : canWrite));
  const [action, setAction] = useState<BulkAction>(available[0] ?? "assign");
  const [assignee, setAssignee] = useState<string>(selfId);
  const [status, setStatus] = useState<string>("open");
  const [priority, setPriority] = useState<string>("normal");
  const [tagsAdd, setTagsAdd] = useState("");
  const [tagsRemove, setTagsRemove] = useState("");
  const [target, setTarget] = useState("");
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<BulkActionResult | null>(null);

  const count = selectedIds.length;
  const tooMany = count > TICKET_BULK_MAX;
  const ready = count > 0 && !tooMany && (action !== "merge" || /^#?\d{1,12}$/.test(target.trim())) && (action !== "tags" || tagsAdd.trim().length > 0 || tagsRemove.trim().length > 0);

  const run = () =>
    startTransition(async () => {
      const ids = selectedIds.slice(0, TICKET_BULK_MAX);
      const split = (v: string) => v.split(",").map((s) => s.trim()).filter(Boolean);
      let outcome: BulkActionResult;
      try {
        switch (action) {
          case "assign":
            outcome = await bulkAssignTicketsAction({ ticketIds: ids, assigneeUserId: assignee === "none" ? null : assignee, confirmed: true });
            break;
          case "status":
            outcome = await bulkStatusTicketsAction({ ticketIds: ids, status, confirmed: true });
            break;
          case "priority":
            outcome = await bulkPriorityTicketsAction({ ticketIds: ids, priority, confirmed: true });
            break;
          case "tags":
            outcome = await bulkTagTicketsAction({ ticketIds: ids, add: split(tagsAdd), remove: split(tagsRemove), confirmed: true });
            break;
          case "merge":
            outcome = await bulkMergeTicketsAction({ ticketIds: ids, targetNumber: target.trim(), confirmed: true });
            break;
        }
      } catch {
        outcome = { ok: false, error: "generic", applied: 0, skipped: 0 };
      }
      setResult(outcome);
      setOpen(false);
      if (outcome.ok) {
        onDone();
        router.refresh();
      }
    });

  const summary = (): string => {
    switch (action) {
      case "assign":
        return assignee === "none" ? t("summary.unassign") : t("summary.assign", { name: operators.find((o) => o.id === assignee)?.name ?? te("common.you") });
      case "status":
        return t("summary.status", { status: tv(`status.${status}`) });
      case "priority":
        return t("summary.priority", { priority: tv(`priority.${priority}`) });
      case "tags":
        return t("summary.tags", { add: tagsAdd.trim() || te("common.none"), remove: tagsRemove.trim() || te("common.none") });
      case "merge":
        return t("summary.merge", { number: target.trim().replace(/^#/, "") });
    }
  };

  if (available.length === 0) return null;
  return (
    <section aria-labelledby={`${id}-title`} className="rounded-[var(--radius-card)] border border-primary/40 bg-primary-soft/40 p-4" data-testid="support-bulk">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="text-sm font-semibold text-ink">
            {t("title")}
          </h2>
          <p className="text-xs text-ink-2" aria-live="polite">
            {t("selected", { count })}
            {tooMany ? ` · ${t("tooMany", { max: TICKET_BULK_MAX })}` : ""}
          </p>
        </div>
        <div className="min-w-0">
          <Label htmlFor={`${id}-action`}>{t("action")}</Label>
          <Select id={`${id}-action`} value={action} onChange={(e) => setAction(e.target.value as BulkAction)} className="mt-1">
            {available.map((a) => (
              <option key={a} value={a}>
                {t(`actions.${a}`)}
              </option>
            ))}
          </Select>
        </div>
        {action === "assign" ? (
          <div className="min-w-0">
            <Label htmlFor={`${id}-assignee`}>{t("assignTo")}</Label>
            <Select id={`${id}-assignee`} value={assignee} onChange={(e) => setAssignee(e.target.value)} className="mt-1">
              <option value={selfId}>{te("common.you")}</option>
              <option value="none">{te("common.unassigned")}</option>
              {operators
                .filter((o) => o.id !== selfId)
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
            </Select>
          </div>
        ) : null}
        {action === "status" ? (
          <div className="min-w-0">
            <Label htmlFor={`${id}-status`}>{t("newStatus")}</Label>
            <Select id={`${id}-status`} value={status} onChange={(e) => setStatus(e.target.value)} className="mt-1">
              {TICKET_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {tv(`status.${s}`)}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
        {action === "priority" ? (
          <div className="min-w-0">
            <Label htmlFor={`${id}-priority`}>{t("newPriority")}</Label>
            <Select id={`${id}-priority`} value={priority} onChange={(e) => setPriority(e.target.value)} className="mt-1">
              {TICKET_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {tv(`priority.${p}`)}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
        {action === "tags" ? (
          <>
            <div className="min-w-0">
              <Label htmlFor={`${id}-tags-add`}>{t("tagsAdd")}</Label>
              <Input id={`${id}-tags-add`} value={tagsAdd} onChange={(e) => setTagsAdd(e.target.value)} maxLength={200} placeholder={t("tagsPlaceholder")} className="mt-1" />
            </div>
            <div className="min-w-0">
              <Label htmlFor={`${id}-tags-remove`}>{t("tagsRemove")}</Label>
              <Input id={`${id}-tags-remove`} value={tagsRemove} onChange={(e) => setTagsRemove(e.target.value)} maxLength={200} placeholder={t("tagsPlaceholder")} className="mt-1" />
            </div>
          </>
        ) : null}
        {action === "merge" ? (
          <div className="min-w-0">
            <Label htmlFor={`${id}-target`}>{t("mergeTarget")}</Label>
            <Input id={`${id}-target`} value={target} onChange={(e) => setTarget(e.target.value)} inputMode="numeric" maxLength={14} placeholder="#1234" className="mt-1" />
          </div>
        ) : null}
        <Button type="button" disabled={!ready} onClick={() => setOpen(true)} aria-haspopup="dialog" data-testid="support-bulk-open">
          {t("apply")}
        </Button>
      </div>
      {action === "tags" ? <p className="mt-2 text-xs text-ink-3">{t("tagsHint")}</p> : null}
      {action === "merge" ? <p className="mt-2 text-xs text-ink-3">{t("mergeHint")}</p> : null}
      {action === "status" ? <p className="mt-2 text-xs text-ink-3">{t("statusHint")}</p> : null}
      {action === "priority" ? <p className="mt-2 text-xs text-ink-3">{t("priorityHint")}</p> : null}
      <span role="status" aria-live="polite" className="mt-2 block text-xs">
        {result ? (
          <Status tone={result.ok ? "ok" : "bad"} indicator="icon" className="text-xs">
            {result.ok ? t("result.applied", { applied: result.applied, skipped: result.skipped }) : `${errorLabel(te, result.error)}${result.skipped ? ` ${t("result.skippedOnly", { skipped: result.skipped })}` : ""}`}
          </Status>
        ) : null}
      </span>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t("dialog.title", { count })}
        description={t("dialog.description")}
        closeLabel={te("common.close")}
        size="sm"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} data-autofocus>
              {te("common.cancel")}
            </Button>
            <Button type="button" variant={action === "merge" || (action === "status" && (status === "spam" || status === "closed")) ? "danger" : "primary"} loading={pending} loadingLabel={te("common.working")} onClick={run} data-testid="support-bulk-confirm">
              {t("dialog.confirm")}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink">{summary()}</p>
      </Dialog>
    </section>
  );
}
