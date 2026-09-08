"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";
import { Alert, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Dialog, EmptyState, Field, Input, Status, TBody, THead, Table, Td, Textarea, Th, Tr } from "@track-site/ui";
import { formatNumber } from "@/lib/format";
import { lookupOrganizationAction, suspendOrganizationAction, unsuspendOrganizationAction, type ControlsActionState } from "@/server/ops/actions/controls";
import type { OrganizationLookup } from "@/server/ops/controls";
import { ActionFeedback } from "./feedback";
import { formatDateTime } from "./format";
import { errorLabel, fieldErrorLabel, planLabel } from "./labels";

export interface SuspensionsProps {
  suspended: OrganizationLookup[];
  activeCount: number;
  locale: string;
}

type Dialogs = { kind: "suspend"; org: OrganizationLookup } | { kind: "unsuspend"; org: OrganizationLookup } | null;

/**
 * Tenant kill switch: the list of suspended organizations (metadata only) with a confirmed "lift"
 * action, and a lookup-then-confirm flow to suspend one organization by slug or id with a mandatory
 * reason. Effects are named honestly: ingestion and config delivery pause for every site of the
 * organization within the collector's cache window; the dashboard and API answer 403 for its members
 * (requireOrgContext → assertOrganizationActive) until the suspension is lifted.
 */
export function Suspensions({ suspended, activeCount, locale }: SuspensionsProps) {
  const t = useTranslations("opsControls.suspensions");
  const tc = useTranslations("opsControls");
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [reason, setReason] = useState("");
  const [ref, setRef] = useState("");
  const [found, setFound] = useState<OrganizationLookup | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [result, setResult] = useState<ControlsActionState | null>(null);
  const [pending, startTransition] = useTransition();
  const [looking, startLookup] = useTransition();
  const refId = useId();
  const reasonId = useId();

  const lookup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLookupError(null);
    setFound(null);
    setResult(null);
    startLookup(async () => {
      try {
        const r = await lookupOrganizationAction({ ref: ref.trim() });
        if (r.ok && r.organization) setFound(r.organization);
        else setLookupError(r.error === "not_found" ? t("suspendForm.notFound") : errorLabel(tc, r.error));
      } catch {
        setLookupError(errorLabel(tc, "generic"));
      }
    });
  };

  const confirm = () => {
    if (!dialog) return;
    startTransition(async () => {
      let r: ControlsActionState;
      try {
        r = dialog.kind === "suspend" ? await suspendOrganizationAction({ organizationId: dialog.org.id, reason: reason.trim(), confirmed: true }) : await unsuspendOrganizationAction({ organizationId: dialog.org.id, confirmed: true });
      } catch {
        r = { ok: false, error: "generic" };
      }
      setResult(r);
      if (r.ok) {
        setDialog(null);
        setFound(null);
        setRef("");
        setReason("");
        router.refresh();
      }
    });
  };

  return (
    <section aria-labelledby="ops-suspensions-title" className="space-y-4" data-testid="ops-suspensions">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="ops-suspensions-title" className="text-lg font-semibold text-ink">
          {t("title")}
        </h2>
        <p className="text-sm text-ink-3">{t("activeCount", { count: formatNumber(activeCount, locale) })}</p>
      </div>
      <p className="max-w-3xl text-sm text-ink-3">{t("intro")}</p>
      <ActionFeedback state={result && result.ok ? result : null} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {suspended.length === 0 ? (
          <EmptyState title={t("empty")} description={t("emptyText")} />
        ) : (
          <Card variant="flat">
            <CardContent className="px-2 py-2 sm:px-3">
              <Table caption={t("table.caption")}>
                <THead>
                  <Tr>
                    <Th>{t("table.organisation")}</Th>
                    <Th>{t("table.plan")}</Th>
                    <Th>{t("table.sites")}</Th>
                    <Th>{t("table.suspendedAt")}</Th>
                    <Th>{t("table.reason")}</Th>
                    <Th>{t("table.actions")}</Th>
                  </Tr>
                </THead>
                <TBody>
                  {suspended.map((org) => (
                    <Tr key={org.id} data-testid="ops-suspended-row">
                      <Td label={t("table.organisation")}>
                        <p className="font-medium text-ink">{org.name}</p>
                        <p className="font-mono text-xs text-ink-3">{org.slug}</p>
                      </Td>
                      <Td label={t("table.plan")}>{planLabel(tc, org.planId)}</Td>
                      <Td label={t("table.sites")} numeric>
                        {formatNumber(org.siteCount, locale)}
                      </Td>
                      <Td label={t("table.suspendedAt")}>{formatDateTime(org.suspendedAt, locale) ?? tc("common.unknown")}</Td>
                      <Td label={t("table.reason")} className="max-w-xs break-words">
                        {org.suspendedReason ?? "—"}
                      </Td>
                      <Td label={t("table.actions")}>
                        <Button size="sm" variant="secondary" disabled={pending} onClick={() => setDialog({ kind: "unsuspend", org })} aria-haspopup="dialog">
                          {t("unsuspend")}
                        </Button>
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>{t("suspendForm.title")}</CardTitle>
            <CardDescription>{t("suspendForm.text")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={lookup} className="space-y-3">
              <Field id={refId} label={t("suspendForm.ref")} hint={t("suspendForm.refHint")} error={lookupError ?? undefined}>
                {(control) => <Input {...control} name="ref" value={ref} onChange={(e) => setRef(e.target.value)} autoComplete="off" spellCheck={false} maxLength={120} />}
              </Field>
              <Button type="submit" variant="secondary" loading={looking} loadingLabel={tc("common.working")} disabled={ref.trim().length === 0} leadingIcon={<Search className="size-4" aria-hidden="true" />}>
                {t("suspendForm.lookup")}
              </Button>
            </form>
            {found ? (
              <div className="rounded-[var(--radius-card)] border border-line bg-surface-2 p-4 text-sm" data-testid="ops-suspend-found">
                <p className="font-medium text-ink">{found.name}</p>
                <p className="font-mono text-xs text-ink-3">{found.slug}</p>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-ink-3">
                  <dt>{t("found.plan")}</dt>
                  <dd className="text-ink-2">{planLabel(tc, found.planId)}</dd>
                  <dt>{t("found.sites")}</dt>
                  <dd className="text-ink-2 tabular-nums">{formatNumber(found.siteCount, locale)}</dd>
                  <dt>{t("found.created")}</dt>
                  <dd className="text-ink-2">{formatDateTime(found.createdAt, locale)}</dd>
                </dl>
                <div className="mt-3">
                  {found.suspendedAt ? (
                    <Status tone="warn" indicator="both">
                      {t("found.alreadySuspended", { when: formatDateTime(found.suspendedAt, locale) ?? "" })}
                    </Status>
                  ) : (
                    <Button variant="danger" size="sm" onClick={() => setDialog({ kind: "suspend", org: found })} aria-haspopup="dialog" data-testid="ops-suspend-open">
                      {t("dialog.suspendConfirm")}
                    </Button>
                  )}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={dialog !== null}
        onClose={() => (pending ? undefined : setDialog(null))}
        title={dialog ? (dialog.kind === "suspend" ? t("dialog.suspendTitle", { name: dialog.org.name }) : t("dialog.unsuspendTitle", { name: dialog.org.name })) : ""}
        description={dialog ? (dialog.kind === "suspend" ? t("dialog.suspendText") : t("dialog.unsuspendText")) : ""}
        closeLabel={tc("common.close")}
        size="sm"
        footer={
          <>
            <Button variant="secondary" disabled={pending} onClick={() => setDialog(null)}>
              {tc("common.cancel")}
            </Button>
            <Button variant={dialog?.kind === "suspend" ? "danger" : "primary"} loading={pending} loadingLabel={tc("common.working")} disabled={dialog?.kind === "suspend" && reason.trim().length < 3} onClick={confirm} data-testid="ops-suspend-confirm">
              {dialog?.kind === "suspend" ? t("dialog.suspendConfirm") : t("dialog.unsuspendConfirm")}
            </Button>
          </>
        }
      >
        <div className="space-y-3 py-2">
          {result && !result.ok ? <Alert tone="bad">{errorLabel(tc, result.error)}</Alert> : null}
          {dialog?.kind === "suspend" ? (
            <Field id={reasonId} label={t("dialog.reason")} hint={t("dialog.reasonHint")} required error={fieldErrorLabel(tc, result?.fieldErrors?.reason)}>
              {(control) => <Textarea {...control} name="reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={3} data-autofocus="" />}
            </Field>
          ) : dialog ? (
            <p className="text-sm text-ink-2">
              {t("dialog.currentReason")}: {dialog.org.suspendedReason ?? "—"}
            </p>
          ) : null}
        </div>
      </Dialog>
    </section>
  );
}
