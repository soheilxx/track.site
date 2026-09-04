"use client";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useId, useState } from "react";
import { Badge, Button, Dialog, Label, Textarea } from "@track-site/ui";
import { decideApprovalRequestAction, withdrawApprovalRequestAction, type TeamActionState } from "@/server/actions/team";
import { formatDateTime } from "./format";
import { changeTypeLabel, roleLabel } from "./labels";
import { ActionFeedback, useCloseOnSuccess } from "./members";

const initial: TeamActionState = { ok: false, error: null, notice: null };

export interface RequestRowData {
  id: string;
  changeType: string;
  targetType: string;
  targetId: string;
  targetLabel: string | null;
  payload: Record<string, unknown>;
  requestedBy: { userId: string; name: string | null };
  status: "pending" | "applied" | "rejected" | "withdrawn" | "expired";
  decidedBy: { userId: string; name: string | null } | null;
  /** ISO strings */
  decidedAt: string | null;
  decisionNote: string | null;
  expiresAt: string;
  createdAt: string;
  canDecide: boolean;
  canWithdraw: boolean;
}

const STATUS_TONE = { pending: "info", applied: "ok", rejected: "bad", withdrawn: "neutral", expired: "warn" } as const;

function ChangeSummary({ request }: { request: RequestRowData }) {
  const t = useTranslations("team");
  if (request.changeType === "member_role_change") {
    const from = typeof request.payload.fromRole === "string" ? roleLabel(t, request.payload.fromRole) : "–";
    const to = typeof request.payload.role === "string" ? roleLabel(t, request.payload.role) : "–";
    return <span className="tabular-nums">{t("requests.roleChange", { from, to })}</span>;
  }
  const json = JSON.stringify(request.payload);
  return <code className="text-xs text-ink-2 break-all">{json.length > 120 ? `${json.slice(0, 120)}…` : json}</code>;
}

function PendingRequest({ request, locale }: { request: RequestRowData; locale: string }) {
  const t = useTranslations("team");
  const [decideState, decideAction, deciding] = useActionState(decideApprovalRequestAction, initial);
  const [withdrawState, withdrawAction, withdrawing] = useActionState(withdrawApprovalRequestAction, initial);
  const [dialog, setDialog] = useState<"approve" | "reject" | null>(null);
  const noteId = useId();
  useCloseOnSuccess(decideState, (open) => {
    if (!open) setDialog(null);
  });
  const appliesHere = request.changeType === "member_role_change";
  const feedback = decideState.error || decideState.notice ? decideState : withdrawState;
  return (
    <li className="space-y-3 py-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
            <span>{changeTypeLabel(t, request.changeType)}</span>
            <Badge tone="info">{t("requests.status.pending")}</Badge>
          </p>
          <p className="text-sm text-ink-2">
            <span className="text-ink-3">{t("requests.target")}: </span>
            {request.targetLabel ?? <code className="text-xs">{request.targetId}</code>}
            <span className="text-ink-3"> · {t("requests.change")}: </span>
            <ChangeSummary request={request} />
          </p>
          <p className="text-xs text-ink-3">
            {t("requests.requestedBy", { name: request.requestedBy.name ?? t("requests.former") })} · {t("requests.requestedAt", { date: formatDateTime(request.createdAt, locale) })} · {t("requests.expiresAt", { date: formatDateTime(request.expiresAt, locale) })}
          </p>
          {request.canDecide && !appliesHere ? <p className="text-xs text-ink-3">{t("requests.decidedIn")}</p> : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {request.canDecide && appliesHere ? (
            <Button size="sm" onClick={() => setDialog("approve")} aria-haspopup="dialog">
              {t("requests.approve")}
            </Button>
          ) : null}
          {request.canDecide ? (
            <Button size="sm" variant="secondary" onClick={() => setDialog("reject")} aria-haspopup="dialog">
              {t("requests.reject")}
            </Button>
          ) : null}
          {request.canWithdraw ? (
            <form action={withdrawAction}>
              <input type="hidden" name="requestId" value={request.id} />
              <Button type="submit" size="sm" variant="ghost" loading={withdrawing}>
                {t("requests.withdraw")}
              </Button>
            </form>
          ) : null}
        </div>
      </div>
      {feedback.error || feedback.notice ? <ActionFeedback state={feedback} /> : null}

      <Dialog open={dialog !== null} onClose={() => setDialog(null)} title={dialog === "reject" ? t("requests.rejectDialog.title") : t("requests.approveDialog.title")} description={dialog === "reject" ? t("requests.rejectDialog.description") : t("requests.approveDialog.description")} closeLabel={t("common.close")} size="sm">
        <form action={decideAction} className="space-y-4 py-2">
          <input type="hidden" name="requestId" value={request.id} />
          <input type="hidden" name="decision" value={dialog === "reject" ? "reject" : "approve"} />
          <input type="hidden" name="confirm" value="decide" />
          <p className="text-sm text-ink">
            {changeTypeLabel(t, request.changeType)} · {request.targetLabel ?? request.targetId} · <ChangeSummary request={request} />
          </p>
          <div>
            <Label htmlFor={noteId}>{t("requests.note")}</Label>
            <Textarea id={noteId} name="note" rows={2} maxLength={500} className="mt-1" />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setDialog(null)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" variant={dialog === "reject" ? "danger" : "primary"} loading={deciding} data-autofocus>
              {dialog === "reject" ? t("requests.rejectDialog.confirm") : t("requests.approveDialog.confirm")}
            </Button>
          </div>
        </form>
      </Dialog>
    </li>
  );
}

/** Open four-eyes requests with approve / reject / withdraw, plus the recent decisions (collapsed). */
export function ApprovalRequests({ pending, recent, locale }: { pending: RequestRowData[]; recent: RequestRowData[]; locale: string }) {
  const t = useTranslations("team");
  return (
    <section aria-labelledby="team-requests-title" className="space-y-4">
      <div>
        <h2 id="team-requests-title" className="text-lg font-semibold text-ink">
          {t("requests.title")} <Badge tone={pending.length ? "info" : "neutral"}>{pending.length}</Badge>
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-3">{t("requests.intro")}</p>
      </div>
      {pending.length ? (
        <ul className="divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface px-4">
          {pending.map((r) => (
            <PendingRequest key={r.id} request={r} locale={locale} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-3">{t("requests.empty")}</p>
      )}
      <details className="group rounded-[var(--radius-card)] border border-line bg-surface">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-[var(--radius-card)] px-4 py-2 text-sm font-medium text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
          {t("requests.recent")} <ChevronDown className="size-4 shrink-0 transition-transform duration-[var(--motion-base)] group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="border-t border-line px-4">
          {recent.length ? (
            <ul className="divide-y divide-line">
              {recent.map((r) => (
                <li key={r.id} className="space-y-1 py-3 text-sm">
                  <p className="flex flex-wrap items-center gap-2 text-ink">
                    <span className="font-medium">{changeTypeLabel(t, r.changeType)}</span>
                    <Badge tone={STATUS_TONE[r.status]}>{t(`requests.status.${r.status}`)}</Badge>
                    <span className="text-ink-2">
                      {r.targetLabel ?? <code className="text-xs">{r.targetId}</code>} · <ChangeSummary request={r} />
                    </span>
                  </p>
                  <p className="text-xs text-ink-3">
                    {t("requests.requestedBy", { name: r.requestedBy.name ?? t("requests.former") })} · {t("requests.requestedAt", { date: formatDateTime(r.createdAt, locale) })}
                    {r.decidedBy && r.decidedAt ? ` · ${t("requests.decidedBy", { status: t(`requests.status.${r.status}`), name: r.decidedBy.name ?? t("requests.former"), date: formatDateTime(r.decidedAt, locale) })}` : null}
                  </p>
                  {r.decisionNote ? <p className="text-xs text-ink-2 italic">{r.decisionNote}</p> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-3 text-sm text-ink-3">{t("requests.recentEmpty")}</p>
          )}
        </div>
      </details>
    </section>
  );
}
