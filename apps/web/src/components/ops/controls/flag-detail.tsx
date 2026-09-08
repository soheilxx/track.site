"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Dialog, Field, Input, Select, Status, TBody, THead, Table, Td, Textarea, Th, Tr } from "@track-site/ui";
import { removeFlagOverrideAction, setFlagDefaultAction, setFlagOverrideAction, updateFeatureFlagAction, type ControlsActionState } from "@/server/ops/actions/controls";
import type { FeatureFlagDetail, FeatureFlagOverrideView } from "@/server/ops/controls";
import { ActionFeedback } from "./feedback";
import { formatDateTime } from "./format";
import { errorLabel, fieldErrorLabel } from "./labels";

const initial: ControlsActionState = { ok: false, error: null, notice: null };

type Dialogs = { kind: "default"; enabled: boolean } | { kind: "remove"; override: FeatureFlagOverrideView } | null;

/**
 * One feature flag: the global default (flipped behind a confirmation — a flag flip is a risky action),
 * the description, and the per-organization overrides with a confirmed removal and an add/replace form
 * (organization by slug or id, value, reason). Every change is a server action with an audit entry.
 */
export function FlagDetail({ flag, locale }: { flag: FeatureFlagDetail; locale: string }) {
  const t = useTranslations("opsControls.flags");
  const tc = useTranslations("opsControls");
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ControlsActionState | null>(null);
  const [descriptionState, descriptionAction, descriptionPending] = useActionState(
    async (prev: ControlsActionState, formData: FormData) => {
      const r = await updateFeatureFlagAction(prev, formData);
      if (r.ok) router.refresh();
      return r;
    },
    initial,
  );
  const [overrideState, overrideAction, overridePending] = useActionState(
    async (prev: ControlsActionState, formData: FormData) => {
      const r = await setFlagOverrideAction(prev, formData);
      if (r.ok) router.refresh();
      return r;
    },
    initial,
  );

  const confirm = () => {
    if (!dialog) return;
    startTransition(async () => {
      let r: ControlsActionState;
      try {
        r = dialog.kind === "default" ? await setFlagDefaultAction({ key: flag.key, enabled: dialog.enabled, confirmed: true }) : await removeFlagOverrideAction({ overrideId: dialog.override.id, confirmed: true });
      } catch {
        r = { ok: false, error: "generic" };
      }
      setResult(r);
      if (r.ok) {
        setDialog(null);
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-6" data-testid="ops-flag-detail">
      <ActionFeedback state={result && result.ok ? result : null} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("detail.defaultTitle")}</CardTitle>
            <CardDescription>{t("detail.defaultText")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p>
              <Status tone={flag.defaultEnabled ? "ok" : "neutral"} indicator="both" live data-testid="ops-flag-default">
                {flag.defaultEnabled ? tc("common.on") : tc("common.off")}
              </Status>
            </p>
            <p className="flex flex-wrap gap-1 text-xs text-ink-3">
              {flag.inCode ? <Badge tone="info">{t("source.code")}</Badge> : <Badge tone="neutral">{t("source.manual")}</Badge>}
              {flag.inCode && flag.codeDefault !== null ? <span className="self-center">{t("codeDefault", { value: flag.codeDefault ? tc("common.on") : tc("common.off") })}</span> : null}
            </p>
            <p className="text-xs text-ink-3">
              {t("table.updated")}: {formatDateTime(flag.updatedAt, locale) ?? tc("common.never")}
            </p>
            <Button variant={flag.defaultEnabled ? "danger" : "primary"} onClick={() => setDialog({ kind: "default", enabled: !flag.defaultEnabled })} aria-haspopup="dialog" data-testid="ops-flag-toggle-default">
              {flag.defaultEnabled ? t("detail.disable") : t("detail.enable")}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("detail.descriptionTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={descriptionAction} className="space-y-3">
              <input type="hidden" name="key" value={flag.key} />
              <ActionFeedback state={descriptionState.ok || descriptionState.error ? descriptionState : null} />
              <Field label={t("create.description")} error={fieldErrorLabel(tc, descriptionState.fieldErrors?.description)}>
                {(control) => <Textarea {...control} name="description" defaultValue={flag.description} maxLength={500} rows={3} />}
              </Field>
              <Button type="submit" variant="secondary" loading={descriptionPending} loadingLabel={tc("common.working")}>
                {t("detail.save")}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="ops-flag-overrides-title" className="space-y-3">
        <h2 id="ops-flag-overrides-title" className="text-lg font-semibold text-ink">
          {t("detail.overridesTitle")} <Badge tone="neutral">{flag.overrides.length}</Badge>
        </h2>
        <p className="max-w-3xl text-sm text-ink-3">{t("detail.overridesText")}</p>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          {flag.overrides.length === 0 ? (
            <p className="rounded-[var(--radius-card)] border border-dashed border-line-2 px-4 py-6 text-center text-sm text-ink-3">{t("detail.overridesEmpty")}</p>
          ) : (
            <Card variant="flat">
              <CardContent className="px-2 py-2 sm:px-3">
                <Table caption={t("detail.overridesCaption")}>
                  <THead>
                    <Tr>
                      <Th>{t("detail.organisation")}</Th>
                      <Th>{t("detail.value")}</Th>
                      <Th>{t("detail.reason")}</Th>
                      <Th>{t("detail.updated")}</Th>
                      <Th>{t("table.actions")}</Th>
                    </Tr>
                  </THead>
                  <TBody>
                    {flag.overrides.map((o) => (
                      <Tr key={o.id} data-testid="ops-flag-override-row">
                        <Td label={t("detail.organisation")}>
                          <p className="font-medium text-ink">{o.organizationName}</p>
                          <p className="font-mono text-xs text-ink-3">{o.organizationSlug}</p>
                        </Td>
                        <Td label={t("detail.value")}>
                          <Status tone={o.enabled ? "ok" : "neutral"}>{o.enabled ? tc("common.on") : tc("common.off")}</Status>
                        </Td>
                        <Td label={t("detail.reason")} className="max-w-xs break-words">
                          {o.reason ?? "—"}
                        </Td>
                        <Td label={t("detail.updated")}>{formatDateTime(o.updatedAt, locale)}</Td>
                        <Td label={t("table.actions")}>
                          <Button size="sm" variant="secondary" disabled={pending} onClick={() => setDialog({ kind: "remove", override: o })} aria-haspopup="dialog">
                            {t("detail.remove")}
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
              <CardTitle>{t("detail.addTitle")}</CardTitle>
              <CardDescription>{t("detail.addText")}</CardDescription>
            </CardHeader>
            <CardContent>
              <form action={overrideAction} className="space-y-3" data-testid="ops-flag-override-form">
                <input type="hidden" name="key" value={flag.key} />
                <ActionFeedback state={overrideState.ok || overrideState.error ? overrideState : null} />
                <Field label={t("detail.organisation")} hint={t("detail.organisationHint")} required error={fieldErrorLabel(tc, overrideState.fieldErrors?.organization)}>
                  {(control) => <Input {...control} name="organization" autoComplete="off" spellCheck={false} maxLength={120} />}
                </Field>
                <Field label={t("detail.valueLabel")} required>
                  {(control) => (
                    <Select {...control} name="enabled" defaultValue={flag.defaultEnabled ? "false" : "true"}>
                      <option value="true">{tc("common.on")}</option>
                      <option value="false">{tc("common.off")}</option>
                    </Select>
                  )}
                </Field>
                <Field label={t("detail.reason")} hint={t("detail.reasonHint")} error={fieldErrorLabel(tc, overrideState.fieldErrors?.reason)}>
                  {(control) => <Input {...control} name="reason" maxLength={500} />}
                </Field>
                <Button type="submit" loading={overridePending} loadingLabel={tc("common.working")}>
                  {t("detail.submit")}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </section>

      <Dialog
        open={dialog !== null}
        onClose={() => (pending ? undefined : setDialog(null))}
        title={dialog?.kind === "default" ? t("dialog.defaultTitle", { key: flag.key }) : dialog ? t("dialog.removeTitle", { organisation: dialog.override.organizationName }) : ""}
        description={dialog?.kind === "default" ? t("dialog.defaultText", { value: dialog.enabled ? tc("common.on") : tc("common.off"), count: flag.overrides.length }) : dialog ? t("dialog.removeText", { key: flag.key }) : ""}
        closeLabel={tc("common.close")}
        size="sm"
        footer={
          <>
            <Button variant="secondary" disabled={pending} onClick={() => setDialog(null)}>
              {tc("common.cancel")}
            </Button>
            <Button variant={dialog?.kind === "default" && !dialog.enabled ? "danger" : "primary"} loading={pending} loadingLabel={tc("common.working")} onClick={confirm} data-testid="ops-flag-confirm">
              {dialog?.kind === "default" ? t("dialog.defaultConfirm") : t("dialog.removeConfirm")}
            </Button>
          </>
        }
      >
        {result && !result.ok ? (
          <div className="py-2">
            <Alert tone="bad">{errorLabel(tc, result.error)}</Alert>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
