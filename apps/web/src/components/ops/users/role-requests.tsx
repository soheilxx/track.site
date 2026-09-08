"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { Badge, Button, Dialog, FieldHint, Label, Status, TBody, THead, Table, Td, Textarea, Th, Tr } from "@track-site/ui";
import { formatDateTime } from "@/components/app/alerts/format";
import { approveRoleRequestAction, declineRoleRequestAction } from "@/server/ops/actions/users";
import type { RoleRequestView } from "@/server/ops/users";
import { ROLE_REASON_MAX } from "./constants";
import { ActionFeedback, initialState, useCloseOnSuccess } from "./action-feedback";
import { REQUEST_STATE_TONE, requestStateLabel, roleLabel } from "./labels";

type Decision = { request: RoleRequestView; kind: "approve" | "decline" | "withdraw" };

/**
 * Pending role changes with the viewer's decisions: apply (a different admin than the proposer — the
 * refusal reason is shown otherwise), decline (any other admin except the affected account) or withdraw (the proposer). Every decision
 * runs from a confirmation dialog; the hidden `confirm` field is what the server re-checks.
 */
export function RoleRequests({ requests, locale }: { requests: RoleRequestView[]; locale: string }) {
  const t = useTranslations("opsUsers");
  const [decision, setDecision] = useState<Decision | null>(null);
  const [approveState, approve, approving] = useActionState(approveRoleRequestAction, initialState);
  const [declineState, decline, declining] = useActionState(declineRoleRequestAction, initialState);
  const id = useId();
  useCloseOnSuccess(approveState, () => setDecision(null));
  useCloseOnSuccess(declineState, () => setDecision(null));
  const feedback = approveState.ok || approveState.error ? approveState : declineState.ok || declineState.error ? declineState : null;
  const target = (r: RoleRequestView) => r.target.name ?? r.target.email ?? t("common.former");
  if (requests.length === 0) {
    return (
      <div className="space-y-3">
        {feedback ? <ActionFeedback state={feedback} /> : null}
        <p className="text-sm text-ink-3">{t("requests.empty")}</p>
      </div>
    );
  }
  const isApprove = decision?.kind === "approve";
  const dialogTitle = decision ? t(`requests.dialog.${decision.kind}Title`, { name: target(decision.request) }) : "";
  const dialogText = decision ? (isApprove ? t("requests.dialog.approveText", { from: roleLabel(t, decision.request.fromRole), to: roleLabel(t, decision.request.toRole) }) : t(`requests.dialog.${decision.kind}Text`)) : "";
  return (
    <div className="space-y-3">
      {feedback && !decision ? <ActionFeedback state={feedback} /> : null}
      <div className="rounded-[var(--radius-card)] border border-line bg-surface px-2 py-2 sm:px-3">
        <Table caption={t("requests.caption")}>
          <THead>
            <Tr>
              <Th>{t("requests.account")}</Th>
              <Th>{t("requests.change")}</Th>
              <Th>{t("requests.reason")}</Th>
              <Th>{t("requests.proposer")}</Th>
              <Th>{t("requests.decision")}</Th>
            </Tr>
          </THead>
          <TBody>
            {requests.map((r) => {
              const approveVerdict = r.viewer.approve;
              return (
                <Tr key={r.id} data-testid="ops-role-request">
                  <Td label={t("requests.account")}>
                    <Link href={`/ops/users/${r.target.id}`} className="inline-flex min-h-9 items-center rounded-[var(--radius-control-sm)] font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary pointer-coarse:min-h-11">
                      {target(r)}
                    </Link>
                    {r.target.email ? <p className="text-xs break-all text-ink-3">{r.target.email}</p> : null}
                    <Status tone={REQUEST_STATE_TONE[r.state] ?? "neutral"} indicator="dot" chip className="mt-1">
                      {requestStateLabel(t, r.state)}
                    </Status>
                  </Td>
                  <Td label={t("requests.change")}>
                    <p className="text-ink">{t("requests.changeValue", { from: roleLabel(t, r.fromRole), to: roleLabel(t, r.toRole) })}</p>
                    {r.state === "stale" ? <p className="text-xs text-warn">{t("requests.staleHint", { role: roleLabel(t, r.target.platformRole) })}</p> : null}
                    <p className="text-xs text-ink-3">
                      {t("requests.filed", { date: formatDateTime(r.createdAt, locale) ?? "" })} · {t("requests.expires", { date: formatDateTime(r.expiresAt, locale) ?? "" })}
                    </p>
                  </Td>
                  <Td label={t("requests.reason")}>
                    <p className="text-sm text-ink-2">{r.reason || t("common.none")}</p>
                    <p className="text-xs text-ink-3">{r.ticketRef ? `${t("requests.ticket")}: ${r.ticketRef}` : t("requests.noTicket")}</p>
                  </Td>
                  <Td label={t("requests.proposer")}>
                    <p className="text-ink">{r.proposer.name ?? t("common.former")}</p>
                    {r.viewer.isProposer ? <Badge tone="neutral">{t("requests.cannot.fourEyes")}</Badge> : null}
                  </Td>
                  <Td label={t("requests.decision")}>
                    <div className="flex flex-col items-start gap-2">
                      <Button size="sm" onClick={() => setDecision({ request: r, kind: "approve" })} disabled={!approveVerdict?.ok} aria-haspopup="dialog" aria-label={t("requests.dialog.approveTitle", { name: target(r) })}>
                        {t("requests.approve")}
                      </Button>
                      {approveVerdict && !approveVerdict.ok ? <p className="max-w-xs text-xs text-ink-3">{t(`requests.cannot.${approveVerdict.reason}`)}</p> : null}
                      <Button size="sm" variant="secondary" onClick={() => setDecision({ request: r, kind: r.viewer.decline })} disabled={r.viewer.isTarget} aria-haspopup="dialog" aria-label={t(`requests.dialog.${r.viewer.decline}Title`, { name: target(r) })}>
                        {r.viewer.decline === "withdraw" ? t("requests.withdraw") : t("requests.decline")}
                      </Button>
                      {r.viewer.isTarget && approveVerdict?.ok !== false ? <p className="max-w-xs text-xs text-ink-3">{t("requests.cannot.self")}</p> : null}
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      </div>

      <Dialog open={decision !== null} onClose={() => setDecision(null)} title={dialogTitle} description={dialogText} closeLabel={t("common.close")} size="md">
        {decision ? (
          <form action={isApprove ? approve : decline} className="space-y-4 py-2" key={`${decision.kind}-${decision.request.id}`}>
            <input type="hidden" name="requestId" value={decision.request.id} />
            <input type="hidden" name="confirm" value={isApprove ? "approve" : "decline"} />
            {isApprove && approveState.error ? <ActionFeedback state={approveState} /> : null}
            {!isApprove && declineState.error ? <ActionFeedback state={declineState} /> : null}
            {!isApprove ? (
              <div>
                <Label htmlFor={`${id}-note`}>{t("requests.dialog.reason")}</Label>
                <Textarea id={`${id}-note`} name="reason" maxLength={ROLE_REASON_MAX} rows={2} className="mt-1.5" aria-describedby={`${id}-note-hint`} data-autofocus />
                <FieldHint id={`${id}-note-hint`}>{t("requests.dialog.reasonHint", { max: ROLE_REASON_MAX })}</FieldHint>
              </div>
            ) : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="secondary" onClick={() => setDecision(null)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" variant={isApprove ? "primary" : "danger"} loading={isApprove ? approving : declining} data-autofocus={isApprove ? true : undefined}>
                {t(`requests.dialog.${decision.kind}Confirm`)}
              </Button>
            </div>
          </form>
        ) : null}
      </Dialog>
    </div>
  );
}
