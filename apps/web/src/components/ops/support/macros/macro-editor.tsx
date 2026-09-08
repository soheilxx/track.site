"use client";

import { Save, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useId, useMemo, useState, useTransition } from "react";
import type { SupportMacroScope } from "@track-site/db";
import { Alert, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox, Dialog, Field, Input, Radio, Select, Textarea, buttonVariants } from "@track-site/ui";
import { deleteMacroAction, saveMacroAction, type SupportMacroActionState } from "@/server/ops/actions/support-macros";
import type { MacroView } from "@/server/support/macros";
import {
  MACRO_BODY_MAX,
  MACRO_CATEGORY_MAX,
  MACRO_NAME_MAX,
  MACRO_PLACEHOLDERS,
  MACRO_PRIORITY_OPTIONS,
  MACRO_STATUS_OPTIONS,
  MACRO_TAGS_MAX,
  renderMacroTemplate,
  unknownPlaceholders,
  type MacroValues,
} from "./constants";
import { errorLabel, fieldErrorLabel, noticeLabel } from "./labels";

const initial: SupportMacroActionState = { ok: false, error: null, notice: null };

export interface MacroEditorProps {
  /** null = create */
  macro: MacroView | null;
  /** the operator may create / keep global macros (PLATFORM_ADMIN) */
  canManageGlobal: boolean;
  /** display name of the operator: fills `{agent_name}` in the preview */
  agentName: string;
  /** existing categories as suggestions */
  categories: string[];
}

/**
 * Create / edit form of a macro: name, category (with suggestions), scope, body with placeholder buttons and a
 * live preview rendered with sample values, and the optional actions (status, priority, tags, assign to
 * self). Validation errors come back per field from the server action; deleting is confirmed in a dialog.
 */
export function MacroEditor({ macro, canManageGlobal, agentName, categories }: MacroEditorProps) {
  const t = useTranslations("supportMacros");
  const ts = useTranslations("support");
  const router = useRouter();
  const ids = useId();
  const bodyId = `${ids}-body`;
  const [body, setBody] = useState(macro?.bodyText ?? "");
  const [scope, setScope] = useState<SupportMacroScope>(macro?.scope ?? "personal");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, startDelete] = useTransition();
  const [deleteState, setDeleteState] = useState<SupportMacroActionState | null>(null);
  const [state, action, pending] = useActionState(async (prev: SupportMacroActionState, formData: FormData) => {
    const result = await saveMacroAction(prev, formData);
    if (result.ok && macro) router.refresh();
    return result;
  }, initial);
  const err = (name: string) => fieldErrorLabel(t, state.fieldErrors?.[name]);

  const sample = useMemo<MacroValues>(
    () => ({
      requester_name: t("editor.sample.requesterName"),
      requester_email: "alex@example.com",
      ticket_number: 1000,
      ticket_subject: t("editor.sample.subject"),
      agent_name: agentName,
      organization_name: t("editor.sample.organization"),
    }),
    [t, agentName],
  );
  const preview = useMemo(() => renderMacroTemplate(body, sample), [body, sample]);
  const unknown = useMemo(() => unknownPlaceholders(body), [body]);

  const insert = (key: string) => {
    const el = document.getElementById(bodyId);
    const token = `{${key}}`;
    if (!(el instanceof HTMLTextAreaElement)) {
      setBody((b) => b + token);
      return;
    }
    el.setRangeText(token, el.selectionStart ?? el.value.length, el.selectionEnd ?? el.value.length, "end");
    setBody(el.value);
    el.focus();
  };

  const remove = () =>
    startDelete(async () => {
      if (!macro) return;
      let result: SupportMacroActionState;
      try {
        result = await deleteMacroAction({ macroId: macro.id, confirmed: true });
      } catch {
        result = { ok: false, error: "generic", notice: null };
      }
      setDeleteState(result);
      if (result.ok) {
        setConfirmDelete(false);
        router.push("/ops/support/macros");
        router.refresh();
      }
    });

  if (state.ok && !macro) {
    return (
      <Alert tone="ok" title={noticeLabel(t, state.notice) ?? t("notices.created")}>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link href="/ops/support/macros" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            {t("editor.backToList")}
          </Link>
          {state.id ? (
            <Link href={`/ops/support/macros/${state.id}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
              {t("editor.openSaved")}
            </Link>
          ) : null}
          <Link href="/ops/support/macros/new" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            {t("editor.createAnother")}
          </Link>
        </div>
      </Alert>
    );
  }

  return (
    <form action={action} className="space-y-6" data-testid="support-macro-form">
      {macro ? <input type="hidden" name="macroId" value={macro.id} /> : null}
      {state.ok && state.notice ? <Alert tone="ok">{noticeLabel(t, state.notice)}</Alert> : null}
      {!state.ok && state.error ? <Alert tone="bad">{errorLabel(t, state.error)}</Alert> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("editor.basicsTitle")}</CardTitle>
              <CardDescription>{t("editor.basicsText")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <Field label={t("editor.name")} hint={t("editor.nameHint")} required error={err("name")}>
                {(control) => <Input {...control} name="name" defaultValue={macro?.name ?? ""} maxLength={MACRO_NAME_MAX} autoComplete="off" data-testid="support-macro-name" />}
              </Field>
              <Field label={t("editor.category")} hint={t("editor.categoryHint")} error={err("category")}>
                {(control) => (
                  <>
                    <Input {...control} name="category" defaultValue={macro?.category ?? ""} maxLength={MACRO_CATEGORY_MAX} autoComplete="off" list={`${ids}-categories`} />
                    <datalist id={`${ids}-categories`}>
                      {categories.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </>
                )}
              </Field>
              <fieldset>
                <legend className="mb-1 text-sm font-medium text-ink">{t("editor.scope")}</legend>
                <p className="mb-2 text-sm text-ink-3">{t("editor.scopeHint")}</p>
                <Radio name="scope" value="personal" checked={scope === "personal"} onChange={() => setScope("personal")} label={ts("macroScope.personal")} description={t("editor.scopePersonalText")} />
                <Radio
                  name="scope"
                  value="global"
                  checked={scope === "global"}
                  onChange={() => setScope("global")}
                  disabled={!canManageGlobal}
                  label={ts("macroScope.global")}
                  description={canManageGlobal ? t("editor.scopeGlobalText") : t("editor.scopeGlobalAdminOnly")}
                />
                {err("scope") ? (
                  <p role="alert" className="mt-1 text-sm text-bad">
                    {err("scope")}
                  </p>
                ) : null}
              </fieldset>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("editor.bodyTitle")}</CardTitle>
              <CardDescription>{t("editor.bodyText")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="mb-2 text-sm font-medium text-ink">{t("editor.placeholders")}</p>
                <div className="flex flex-wrap gap-2">
                  {MACRO_PLACEHOLDERS.map((key) => (
                    <Button key={key} type="button" size="sm" variant="secondary" onClick={() => insert(key)} aria-label={`{${key}} — ${t("editor.insert", { placeholder: t(`editor.placeholderLabels.${key}`) })}`} className="font-mono text-xs">
                      {`{${key}}`}
                    </Button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-ink-3">{t("editor.placeholdersHint")}</p>
              </div>
              <Field id={bodyId} label={t("editor.body")} hint={t("editor.bodyHint")} required error={err("bodyText")}>
                {(control) => <Textarea {...control} name="bodyText" value={body} onChange={(e) => setBody(e.target.value)} maxLength={MACRO_BODY_MAX} rows={12} className="font-sans" data-testid="support-macro-body" />}
              </Field>
              <p className="text-xs tabular-nums text-ink-3">{t("editor.characters", { count: body.length, max: MACRO_BODY_MAX })}</p>
              {unknown.length ? <Alert tone="warn">{t("editor.unresolved", { list: unknown.map((k) => `{${k}}`).join(", ") })}</Alert> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("editor.actionsTitle")}</CardTitle>
              <CardDescription>{t("editor.actionsText")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("editor.actionStatus")} error={err("actionStatus")}>
                  {(control) => (
                    <Select {...control} name="actionStatus" defaultValue={macro?.actions.status ?? ""}>
                      <option value="">{t("editor.actionNone")}</option>
                      {MACRO_STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {ts(`status.${status}`)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label={t("editor.actionPriority")} error={err("actionPriority")}>
                  {(control) => (
                    <Select {...control} name="actionPriority" defaultValue={macro?.actions.priority ?? ""}>
                      <option value="">{t("editor.actionNone")}</option>
                      {MACRO_PRIORITY_OPTIONS.map((priority) => (
                        <option key={priority} value={priority}>
                          {ts(`priority.${priority}`)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label={t("editor.tagsAdd")} hint={t("editor.tagsHint", { max: MACRO_TAGS_MAX })} error={err("tagsAdd")}>
                  {(control) => <Input {...control} name="tagsAdd" defaultValue={macro?.actions.tags_add?.join(", ") ?? ""} autoComplete="off" spellCheck={false} />}
                </Field>
                <Field label={t("editor.tagsRemove")} hint={t("editor.tagsHint", { max: MACRO_TAGS_MAX })} error={err("tagsRemove")}>
                  {(control) => <Input {...control} name="tagsRemove" defaultValue={macro?.actions.tags_remove?.join(", ") ?? ""} autoComplete="off" spellCheck={false} />}
                </Field>
              </div>
              <Checkbox name="assignToSelf" defaultChecked={macro?.actions.assign_to_self ?? false} label={t("editor.assignToSelf")} description={t("editor.assignToSelfText")} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 lg:sticky lg:top-4 lg:self-start">
          <Card variant="panel">
            <CardHeader>
              <CardTitle>{t("editor.preview")}</CardTitle>
              <CardDescription>{t("editor.previewHint")}</CardDescription>
            </CardHeader>
            <CardContent>
              {preview.trim() ? (
                <pre className="max-h-[32rem] overflow-auto rounded-[var(--radius-control)] border border-line bg-surface p-3 font-sans text-sm whitespace-pre-wrap text-ink" data-testid="support-macro-preview">
                  {preview}
                </pre>
              ) : (
                <p className="text-sm text-ink-3">{t("editor.previewEmpty")}</p>
              )}
              <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs text-ink-3">
                <dt>{t("editor.placeholderLabels.requester_name")}</dt>
                <dd>{String(sample.requester_name)}</dd>
                <dt>{t("editor.placeholderLabels.ticket_number")}</dt>
                <dd>{ts("ticketNumber", { number: String(sample.ticket_number) })}</dd>
                <dt>{t("editor.placeholderLabels.agent_name")}</dt>
                <dd>{agentName}</dd>
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" loading={pending} loadingLabel={t("common.working")} leadingIcon={<Save className="size-4" aria-hidden="true" />} data-testid="support-macro-submit">
          {macro ? t("editor.update") : t("editor.create")}
        </Button>
        <Link href="/ops/support/macros" className={buttonVariants({ variant: "secondary" })}>
          {t("common.cancel")}
        </Link>
        {macro ? (
          <Button type="button" variant="ghost" className="sm:ml-auto" onClick={() => setConfirmDelete(true)} aria-haspopup="dialog" leadingIcon={<Trash2 className="size-4" aria-hidden="true" />} data-testid="support-macro-delete">
            {t("editor.delete")}
          </Button>
        ) : null}
      </div>

      {macro ? (
        <Dialog
          open={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          title={t("editor.deleteDialog.title")}
          description={t("editor.deleteDialog.description", { name: macro.name })}
          closeLabel={t("common.close")}
          size="sm"
          footer={
            <>
              <Button type="button" variant="secondary" onClick={() => setConfirmDelete(false)} data-autofocus>
                {t("common.cancel")}
              </Button>
              <Button type="button" variant="danger" loading={deleting} loadingLabel={t("common.working")} onClick={remove} data-testid="support-macro-delete-confirm">
                {t("editor.deleteDialog.confirm")}
              </Button>
            </>
          }
        >
          {deleteState && !deleteState.ok ? <Alert tone="bad">{errorLabel(t, deleteState.error)}</Alert> : null}
        </Dialog>
      ) : null}
    </form>
  );
}
