"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Alert, Badge, Button, Dialog } from "@track-site/ui";
import { createConsentDraftAction, discardConsentDraftAction, publishConsentPolicyAction } from "@/server/actions/consent";
import type { ActionState } from "@/server/actions/organization";
import { LEGAL_NOTE_MIN_LENGTH } from "@/server/consent-policy";
import { errorLabel } from "./labels";

const initial: ActionState = { ok: false, error: null };

function Feedback({ state, okText }: { state: ActionState; okText: string }) {
  const t = useTranslations("consent");
  if (state.ok) return <Alert tone="ok">{okText}</Alert>;
  if (state.error) return <Alert tone="bad">{errorLabel(t, state.error, { min: LEGAL_NOTE_MIN_LENGTH })}</Alert>;
  return null;
}

/** Creates the next draft version (not risky: nothing changes for live traffic). */
export function CreateDraftButton({ siteId }: { siteId: string }) {
  const t = useTranslations("consent.policy");
  const [state, action, pending] = useActionState(createConsentDraftAction, initial);
  return (
    <div className="space-y-3">
      <Feedback state={state} okText={t("createdOk")} />
      <form action={action}>
        <input type="hidden" name="siteId" value={siteId} />
        <Button type="submit" loading={pending}>
          {t("createDraft")}
        </Button>
      </form>
    </div>
  );
}

export interface DraftChange {
  text: string;
  weaker: boolean;
}

/**
 * Publish and discard, each behind an explicit confirmation dialog (publishing changes what the
 * pipeline does with every new event; discarding archives the work). The confirmation travels as a
 * form field and is re-checked by the server action.
 */
export function DraftActions({ policyId, version, changes, weaker }: { policyId: string; version: number; changes: DraftChange[]; weaker: boolean }) {
  const t = useTranslations("consent.policy");
  const tc = useTranslations("consent");
  const [publishState, publishAction, publishing] = useActionState(publishConsentPolicyAction, initial);
  const [discardState, discardAction, discarding] = useActionState(discardConsentDraftAction, initial);
  const [publishRequested, setPublishOpen] = useState(false);
  const [discardRequested, setDiscardOpen] = useState(false);
  // A dialog closes by itself once its action succeeded (derived, no effect): the success alert takes over.
  const publishOpen = publishRequested && !publishState.ok;
  const discardOpen = discardRequested && !discardState.ok;

  return (
    <div className="space-y-3">
      <Feedback state={publishState} okText={t("publishedOk")} />
      <Feedback state={discardState} okText={t("discardedOk")} />
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setPublishOpen(true)} disabled={publishState.ok || discardState.ok}>
          {t("publish")}
        </Button>
        <Button variant="ghost" onClick={() => setDiscardOpen(true)} disabled={publishState.ok || discardState.ok}>
          {t("discard")}
        </Button>
      </div>

      <Dialog open={publishOpen} onClose={() => setPublishOpen(false)} title={t("publishDialog.title", { version })} description={t("publishDialog.description")} closeLabel={tc("close")}>
        <div className="space-y-4 py-2">
          {weaker ? <Alert tone="warn">{t("publishDialog.weakerWarning")}</Alert> : null}
          {changes.length ? (
            <ul className="space-y-1.5">
              {changes.map((c) => (
                <li key={c.text} className="flex flex-wrap items-center gap-2 text-sm text-ink">
                  <span>{c.text}</span>
                  {c.weaker ? <Badge tone="warn">{t("weakerBadge")}</Badge> : <Badge tone="ok">{t("stricterBadge")}</Badge>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-3">{t("noChanges")}</p>
          )}
          <form action={publishAction} className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <input type="hidden" name="policyId" value={policyId} />
            <input type="hidden" name="confirm" value="publish" />
            <Button type="button" variant="secondary" onClick={() => setPublishOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" variant={weaker ? "danger" : "primary"} loading={publishing} data-autofocus>
              {t("publishDialog.confirm")}
            </Button>
          </form>
        </div>
      </Dialog>

      <Dialog open={discardOpen} onClose={() => setDiscardOpen(false)} title={t("discardDialog.title", { version })} description={t("discardDialog.description")} closeLabel={tc("close")} size="sm">
        <form action={discardAction} className="flex flex-col-reverse gap-2 py-2 sm:flex-row sm:justify-end">
          <input type="hidden" name="policyId" value={policyId} />
          <input type="hidden" name="confirm" value="discard" />
          <Button type="button" variant="secondary" onClick={() => setDiscardOpen(false)} data-autofocus>
            {tc("cancel")}
          </Button>
          <Button type="submit" variant="danger" loading={discarding}>
            {t("discardDialog.confirm")}
          </Button>
        </form>
      </Dialog>
    </div>
  );
}
