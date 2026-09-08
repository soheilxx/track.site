"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, useTransition } from "react";
import type { SupportTicketPriority, SupportTicketStatus } from "@track-site/db";
import { Button, Dialog, Input, Label, Select, Status } from "@track-site/ui";
import { assignTicketAction, setTicketCategoryAction, setTicketPriorityAction, setTicketStatusAction, setTicketTagsAction, type TicketActionError } from "@/server/ops/actions/support-ticket";
import type { OperatorView } from "@/server/support/ticket";
import { TICKET_SHORTCUT_EVENT, type TicketShortcutAction } from "./constants";
import { errorLabel } from "./labels";

export interface PropertiesPanelProps {
  ticketId: string;
  status: SupportTicketStatus;
  /** statuses reachable from the current one (workflow, computed on the server) */
  transitions: SupportTicketStatus[];
  confirmRequired: SupportTicketStatus[];
  priority: SupportTicketPriority;
  priorities: SupportTicketPriority[];
  category: string | null;
  tags: string[];
  assigneeId: string | null;
  operators: OperatorView[];
  selfId: string;
  canWrite: boolean;
  canAssign: boolean;
}

type Outcome = { ok: boolean; error: TicketActionError | null; what: string } | null;

/**
 * Status, priority, assignee (with online dots and "assign to me"), category and tags of the ticket. Every
 * control saves through its own server action, announces the outcome and refreshes the page; spam and
 * closed are confirmed in a dialog. Listens for the `a` (assign to me) and `e` (solve) shortcuts.
 */
export function PropertiesPanel({ ticketId, status, transitions, confirmRequired, priority, priorities, category, tags, assigneeId, operators, selfId, canWrite, canAssign }: PropertiesPanelProps) {
  const t = useTranslations("supportTicket");
  const tv = useTranslations("support");
  const router = useRouter();
  const ids = { status: useId(), priority: useId(), assignee: useId(), category: useId(), tags: useId() };
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [confirm, setConfirm] = useState<SupportTicketStatus | null>(null);
  const [assignee, setAssignee] = useState(assigneeId ?? "");
  const [categoryValue, setCategoryValue] = useState(category ?? "");
  const [tagInput, setTagInput] = useState("");
  const [tagList, setTagList] = useState(tags);

  const run = (what: string, fn: () => Promise<{ ok: boolean; error: TicketActionError | null }>) => {
    setBusy(what);
    startTransition(async () => {
      let result: { ok: boolean; error: TicketActionError | null };
      try {
        result = await fn();
      } catch {
        result = { ok: false, error: "generic" };
      }
      setOutcome({ ...result, what });
      setBusy(null);
      if (result.ok) {
        setConfirm(null);
        router.refresh();
      }
    });
  };

  const changeStatus = (next: SupportTicketStatus, confirmed: boolean) => run("status", () => setTicketStatusAction({ ticketId, status: next, confirmed }));
  const assignSelf = () => run("assignee", () => assignTicketAction({ ticketId, assigneeUserId: selfId }));

  useEffect(() => {
    const onShortcut = (event: Event) => {
      const action = (event as CustomEvent<TicketShortcutAction>).detail;
      if (action === "assign_self" && canAssign && assigneeId !== selfId) assignSelf();
      if (action === "solve" && canWrite && transitions.includes("solved")) changeStatus("solved", false);
    };
    window.addEventListener(TICKET_SHORTCUT_EVENT, onShortcut);
    return () => window.removeEventListener(TICKET_SHORTCUT_EVENT, onShortcut);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the handlers close over the current props; re-binding on every render is intended
  }, [assigneeId, selfId, canAssign, canWrite, transitions]);

  const saveTags = (next: string[]) =>
    run("tags", async () => {
      const result = await setTicketTagsAction({ ticketId, tags: next });
      if (result.ok) setTagList(next);
      return result;
    });
  const addTagsFromInput = () => {
    const parts = tagInput
      .split(/[,\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return;
    setTagInput("");
    saveTags([...tagList, ...parts]);
  };

  const feedback = (what: string) =>
    outcome && outcome.what === what ? (
      <Status tone={outcome.ok ? "ok" : "bad"} indicator="icon" className="mt-1 text-xs">
        {outcome.ok ? t("properties.saved") : errorLabel(t, outcome.error)}
      </Status>
    ) : null;

  return (
    <section aria-labelledby="ticket-properties-title" className="rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-5" data-testid="ticket-properties">
      <h2 id="ticket-properties-title" className="text-base font-semibold text-ink">
        {t("properties.title")}
      </h2>
      <div className="mt-3 space-y-4" aria-busy={pending || undefined}>
        <div>
          <Label htmlFor={ids.status}>{t("properties.status")}</Label>
          <Select
            id={ids.status}
            value={status}
            disabled={!canWrite || pending}
            onChange={(e) => {
              const next = e.target.value as SupportTicketStatus;
              if (next === status) return;
              if (confirmRequired.includes(next)) setConfirm(next);
              else changeStatus(next, false);
            }}
            className="mt-1.5"
            data-testid="ticket-status-select"
          >
            <option value={status}>{tv(`status.${status}`)}</option>
            {transitions.map((s) => (
              <option key={s} value={s}>
                {tv(`status.${s}`)}
              </option>
            ))}
          </Select>
          {feedback("status")}
        </div>

        <div>
          <Label htmlFor={ids.priority}>{t("properties.priority")}</Label>
          <Select id={ids.priority} value={priority} disabled={!canWrite || pending} onChange={(e) => run("priority", () => setTicketPriorityAction({ ticketId, priority: e.target.value as SupportTicketPriority }))} className="mt-1.5" data-testid="ticket-priority-select">
            {priorities.map((p) => (
              <option key={p} value={p}>
                {tv(`priority.${p}`)}
              </option>
            ))}
          </Select>
          {feedback("priority")}
        </div>

        <div>
          <Label htmlFor={ids.assignee}>{t("properties.assignee")}</Label>
          <Select id={ids.assignee} value={assignee} disabled={!canAssign || pending} onChange={(e) => setAssignee(e.target.value)} className="mt-1.5" data-testid="ticket-assignee-select">
            <option value="">{t("common.unassigned")}</option>
            {operators.map((o) => (
              <option key={o.id} value={o.id}>
                {o.online ? "● " : "○ "}
                {o.name}
                {o.self ? ` (${t("common.you")})` : ""}
                {o.online ? ` · ${t("properties.online")}` : ""}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-ink-3">{t("properties.onlineHint")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" disabled={!canAssign || assignee === (assigneeId ?? "")} loading={busy === "assignee" && pending} loadingLabel={t("common.working")} onClick={() => run("assignee", () => assignTicketAction({ ticketId, assigneeUserId: assignee || null }))} data-testid="ticket-assign-save">
              {t("properties.saveAssignee")}
            </Button>
            {assigneeId !== selfId && canAssign ? (
              <Button type="button" size="sm" variant="ghost" loading={busy === "assignee" && pending} loadingLabel={t("common.working")} onClick={assignSelf} data-testid="ticket-assign-self">
                {t("properties.assignSelf")}
              </Button>
            ) : null}
          </div>
          {feedback("assignee")}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            run("category", () => setTicketCategoryAction({ ticketId, category: categoryValue.trim() || null }));
          }}
        >
          <Label htmlFor={ids.category}>{t("properties.category")}</Label>
          <div className="mt-1.5 flex gap-2">
            <Input id={ids.category} value={categoryValue} onChange={(e) => setCategoryValue(e.target.value)} maxLength={60} disabled={!canWrite || pending} placeholder={t("properties.categoryPlaceholder")} data-testid="ticket-category-input" />
            <Button type="submit" size="sm" variant="secondary" disabled={!canWrite || categoryValue.trim() === (category ?? "")} loading={busy === "category" && pending} loadingLabel={t("common.working")}>
              {t("common.save")}
            </Button>
          </div>
          {feedback("category")}
        </form>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            addTagsFromInput();
          }}
        >
          <Label htmlFor={ids.tags}>{t("properties.tags")}</Label>
          {tagList.length ? (
            <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label={t("properties.tags")}>
              {tagList.map((tag) => (
                <li key={tag} className="inline-flex items-center gap-1 rounded-[var(--radius-chip)] bg-surface-2 py-0.5 pr-0.5 pl-2.5 text-xs font-medium text-ink-2">
                  {tag}
                  {canWrite ? (
                    <button type="button" onClick={() => saveTags(tagList.filter((x) => x !== tag))} aria-label={t("properties.removeTag", { tag })} disabled={pending} className="inline-flex size-7 items-center justify-center rounded-full text-ink-3 hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary pointer-coarse:size-11">
                      <X className="size-3" aria-hidden="true" />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1.5 text-xs text-ink-3">{t("properties.noTags")}</p>
          )}
          <div className="mt-1.5 flex gap-2">
            <Input id={ids.tags} value={tagInput} onChange={(e) => setTagInput(e.target.value)} disabled={!canWrite || pending} placeholder={t("properties.tagsPlaceholder")} maxLength={200} data-testid="ticket-tags-input" />
            <Button type="submit" size="sm" variant="secondary" disabled={!canWrite || !tagInput.trim()} loading={busy === "tags" && pending} loadingLabel={t("common.working")}>
              {t("properties.addTag")}
            </Button>
          </div>
          {feedback("tags")}
        </form>
      </div>

      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm === "spam" ? t("properties.spamDialog.title") : t("properties.closeDialog.title")}
        description={confirm === "spam" ? t("properties.spamDialog.description") : t("properties.closeDialog.description")}
        closeLabel={t("common.close")}
        size="sm"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setConfirm(null)} data-autofocus>
              {t("common.cancel")}
            </Button>
            <Button type="button" variant={confirm === "spam" ? "danger" : "primary"} loading={pending} loadingLabel={t("common.working")} onClick={() => confirm && changeStatus(confirm, true)} data-testid="ticket-status-confirm">
              {confirm === "spam" ? t("properties.spamDialog.confirm") : t("properties.closeDialog.confirm")}
            </Button>
          </>
        }
      >
        {outcome && !outcome.ok && confirm ? (
          <Status tone="bad" indicator="icon" className="text-xs">
            {errorLabel(t, outcome.error)}
          </Status>
        ) : null}
      </Dialog>
    </section>
  );
}
