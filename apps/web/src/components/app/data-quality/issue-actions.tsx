"use client";

import { ExternalLink, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useActionState, useCallback, useId, useState } from "react";
import { Alert, Button, Dialog, Field, Input, Select, Textarea, buttonVariants } from "@track-site/ui";
import { useAssistant } from "@/components/chat/assistant-store";
import { prepareFixDraftAction, setIssueStatusAction, type DataQualityActionState } from "@/server/actions/data-quality";
import type { FixPlan, InboxStatus } from "@/server/data-quality";

export interface IssueActionsIssue {
  id: string;
  kind: string;
  title: string;
  summary: string;
  status: InboxStatus;
  fixPlan: FixPlan;
  fixDraftId: string | null;
  /** first redacted sample (for the event explorer link) */
  sampleEventId: string | null;
  eventName: string | null;
}

const INITIAL: DataQualityActionState = { ok: false, error: null };

/** Links for fixes that live outside the configuration (shop connection, destinations, consent, billing, site code). */
function unavailableHref(reason: NonNullable<FixPlan["reason"]>, siteId: string): { href: string; key: "shop" | "destinations" | "consent" | "billing" | "setup" | "releases" } | null {
  switch (reason) {
    case "connect_shop":
      return { href: `/app/sites/${siteId}/shop`, key: "shop" };
    case "needs_mapping":
    case "destination_health":
      return { href: "/app/destinations", key: "destinations" };
    case "consent":
      return { href: "/app/consent", key: "consent" };
    case "billing":
      return { href: "/app/billing", key: "billing" };
    case "site_change":
    case "no_bundle":
      return { href: "/app/ai-setup", key: "setup" };
    case "already_drafted":
      return { href: "/app/releases", key: "releases" };
    default:
      return null;
  }
}

/**
 * Workflow controls of one inbox issue: acknowledge / resolve / reopen directly, mute and fix draft behind a
 * confirmation dialog (a mute hides a measured problem, a draft touches the configuration), plus the event
 * explorer link and a Track AI hand-over that only pre-fills the composer.
 */
export function IssueActions({ issue, siteId, siteName, environmentId, environmentLabel, canManage, aiEnabled }: { issue: IssueActionsIssue; siteId: string; siteName: string; environmentId: string | null; environmentLabel: string; canManage: boolean; aiEnabled: boolean }) {
  const t = useTranslations("dataQuality");
  const assistant = useAssistant();
  const [muteOpen, setMuteOpen] = useState(false);
  const [fixOpen, setFixOpen] = useState(false);
  // a successful status change closes the mute dialog; the page re-renders with the new status through revalidation
  const statusWithClose = useCallback(async (prev: DataQualityActionState, formData: FormData) => {
    const result = await setIssueStatusAction(prev, formData);
    if (result.ok) setMuteOpen(false);
    return result;
  }, []);
  const [statusState, statusAction, statusPending] = useActionState(statusWithClose, INITIAL);
  const [fixState, fixAction, fixPending] = useActionState(prepareFixDraftAction, INITIAL);
  const formId = useId();

  const askAi = () => {
    assistant.setDraft(t("ai.prompt", { title: issue.title, site: siteName, summary: issue.summary }));
    assistant.setOpen(true);
    requestAnimationFrame(() => assistant.focusComposer());
  };

  const explorerHref = issue.sampleEventId ? `/app/events/explorer?site=${siteId}&event=${encodeURIComponent(issue.sampleEventId)}&window=30d` : issue.eventName ? `/app/events/explorer?site=${siteId}&name=${encodeURIComponent(issue.eventName)}&window=30d` : `/app/events/explorer?site=${siteId}`;
  const plan = issue.fixPlan;
  const unavailable = plan.reason ? unavailableHref(plan.reason, siteId) : null;
  const statusForm = (status: InboxStatus, label: string, variant: "primary" | "secondary" | "ghost" = "secondary") => (
    <form action={statusAction}>
      <input type="hidden" name="issueId" value={issue.id} />
      <input type="hidden" name="status" value={status} />
      <Button type="submit" size="sm" variant={variant} loading={statusPending} loadingLabel={t("actions.working")}>
        {label}
      </Button>
    </form>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {canManage ? (
          <>
            {issue.status === "open" ? statusForm("acknowledged", t("actions.acknowledge"), "primary") : null}
            {issue.status === "open" || issue.status === "acknowledged" ? statusForm("resolved", t("actions.resolve")) : null}
            {issue.status === "open" || issue.status === "acknowledged" ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => setMuteOpen(true)}>
                {t("actions.mute")}
              </Button>
            ) : null}
            {issue.status === "resolved" || issue.status === "muted" || issue.status === "acknowledged" ? statusForm("open", t("actions.reopen"), "ghost") : null}
            {plan.code ? (
              <Button type="button" size="sm" variant="secondary" onClick={() => setFixOpen(true)} disabled={!environmentId}>
                {t("actions.prepareFix")}
              </Button>
            ) : null}
          </>
        ) : null}
        {issue.fixDraftId ? (
          <Link href="/app/releases" className={buttonVariants({ size: "sm", variant: "secondary" })}>
            {t("actions.viewDraft")}
          </Link>
        ) : null}
        <Link href={explorerHref} className={buttonVariants({ size: "sm", variant: "ghost" })}>
          {t("actions.openExplorer")} <ExternalLink className="size-3.5" aria-hidden="true" />
        </Link>
        {aiEnabled ? (
          <Button type="button" size="sm" variant="ghost" onClick={askAi} leadingIcon={<Sparkles className="size-4" aria-hidden="true" />}>
            {t("actions.askAi")}
          </Button>
        ) : null}
      </div>
      {!canManage ? <p className="text-xs text-ink-3">{t("actions.readOnly")}</p> : null}
      {canManage && !plan.code && plan.reason ? (
        <p className="text-xs text-ink-3">
          {t(`fix.unavailable.${plan.reason}`, { event: plan.params.event ?? "", field: plan.params.field ?? "", destination: plan.params.destination ?? "", reason: plan.params.reason ?? "" })}
          {unavailable ? (
            <>
              {" "}
              <Link href={unavailable.href} className="font-medium text-primary underline-offset-4 hover:underline">
                {t(`fix.links.${unavailable.key}`)}
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
      {statusState.error ? <Alert tone="bad">{t(`errors.${statusState.error}`)}</Alert> : null}
      {fixState.ok && fixState.draftId ? (
        <Alert tone="ok" title={t("fix.created")}>
          {fixState.lint ? t("fix.lint", { errors: fixState.lint.errors, warnings: fixState.lint.warnings }) : null}{" "}
          <Link href="/app/releases" className="font-medium text-primary underline-offset-4 hover:underline">
            {t("fix.links.releases")}
          </Link>
        </Alert>
      ) : fixState.error ? (
        <Alert tone="bad">{t(`errors.${fixState.error}`)}</Alert>
      ) : null}

      <Dialog
        open={muteOpen}
        onClose={() => setMuteOpen(false)}
        title={t("mute.title")}
        description={t("mute.description")}
        closeLabel={t("actions.cancel")}
        size="sm"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setMuteOpen(false)}>
              {t("actions.cancel")}
            </Button>
            <Button type="submit" form={`${formId}-mute`} variant="danger" loading={statusPending} loadingLabel={t("actions.working")}>
              {t("mute.confirm")}
            </Button>
          </>
        }
      >
        <form id={`${formId}-mute`} action={statusAction} className="space-y-4">
          <input type="hidden" name="issueId" value={issue.id} />
          <input type="hidden" name="status" value="muted" />
          <Field label={t("mute.reason")} hint={t("mute.reasonHint")} required>
            {(props) => <Textarea {...props} name="reason" required minLength={3} maxLength={500} rows={3} />}
          </Field>
          <Field label={t("mute.until")}>
            {(props) => (
              <Select {...props} name="until" defaultValue="30">
                <option value="7">{t("mute.durations.7")}</option>
                <option value="30">{t("mute.durations.30")}</option>
                <option value="90">{t("mute.durations.90")}</option>
                <option value="never">{t("mute.durations.never")}</option>
              </Select>
            )}
          </Field>
          {statusState.error ? <Alert tone="bad">{t(`errors.${statusState.error}`)}</Alert> : null}
        </form>
      </Dialog>

      <Dialog
        open={fixOpen}
        onClose={() => setFixOpen(false)}
        title={t("fix.title")}
        description={t("fix.description", { environment: environmentLabel })}
        closeLabel={t("actions.cancel")}
        size="md"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setFixOpen(false)}>
              {t("actions.cancel")}
            </Button>
            {fixState.ok ? null : (
              <Button type="submit" form={`${formId}-fix`} loading={fixPending} loadingLabel={t("actions.working")} disabled={!environmentId}>
                {t("fix.confirm")}
              </Button>
            )}
          </>
        }
      >
        <form id={`${formId}-fix`} action={fixAction} className="space-y-3">
          <input type="hidden" name="issueId" value={issue.id} />
          <Input type="hidden" name="environmentId" value={environmentId ?? ""} readOnly />
          {plan.code ? <p className="text-sm text-ink">{t(`fix.codes.${plan.code}`, { event: plan.params.event ?? "", platform: plan.params.platform ?? "", destination: plan.params.destination ?? "" })}</p> : null}
          <p className="text-xs text-ink-3">{t("fix.neverPublishes")}</p>
          {!environmentId ? <Alert tone="warn">{t("fix.noEnvironment")}</Alert> : null}
          {fixState.ok && fixState.draftId ? (
            <Alert tone="ok" title={t("fix.created")}>
              {fixState.lint ? t("fix.lint", { errors: fixState.lint.errors, warnings: fixState.lint.warnings }) : null}{" "}
              <Link href="/app/releases" className="font-medium text-primary underline-offset-4 hover:underline">
                {t("fix.links.releases")}
              </Link>
            </Alert>
          ) : fixState.error ? (
            <Alert tone="bad">{t(`errors.${fixState.error}`)}</Alert>
          ) : null}
        </form>
      </Dialog>
    </div>
  );
}
