"use client";

import { Pin, PinOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useId, useState } from "react";
import { Badge, Button, Checkbox, FieldError, Label, Textarea } from "@track-site/ui";
import { formatDateTime } from "@/components/app/alerts/format";
import { addOpsNoteAction, setOpsNotePinnedAction } from "@/server/ops/actions/organisations";
import type { OpsNoteView } from "@/server/ops/organisations";
import { DETAIL_NOTES_LIMIT } from "./constants";
import { ActionFeedback, initialState, useCloseOnSuccess } from "./action-feedback";

function PinButton({ organizationId, note }: { organizationId: string; note: OpsNoteView }) {
  const t = useTranslations("opsOrganisations");
  const [state, action, pending] = useActionState(setOpsNotePinnedAction, initialState);
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="noteId" value={note.id} />
      <input type="hidden" name="pinned" value={note.pinned ? "false" : "true"} />
      <Button type="submit" size="sm" variant="ghost" loading={pending} leadingIcon={note.pinned ? <PinOff className="size-4" aria-hidden="true" /> : <Pin className="size-4" aria-hidden="true" />}>
        {note.pinned ? t("detail.notes.unpin") : t("detail.notes.pin")}
      </Button>
      {state.error ? (
        <span role="status" className="text-xs text-bad">
          {t(`errors.${state.error}`)}
        </span>
      ) : null}
    </form>
  );
}

/**
 * Internal operator notes of one organisation (table `ops_notes`, never tenant-visible): pinned first,
 * newest next; a form adds a note, each note can be pinned or unpinned. Both actions are audited
 * without the note body.
 */
export function OpsNotes({ organizationId, notes, locale }: { organizationId: string; notes: OpsNoteView[]; locale: string }) {
  const t = useTranslations("opsOrganisations");
  const [state, action, pending] = useActionState(addOpsNoteAction, initialState);
  const id = useId();
  // the form is re-mounted (cleared) after every successful submission
  const [resets, setResets] = useState(0);
  useCloseOnSuccess(state, () => setResets((n) => n + 1));
  const bodyError = state.fieldErrors?.body ? t("errors.invalid") : null;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div>
        {notes.length === 0 ? (
          <p className="text-sm text-ink-3">{t("detail.notes.empty")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {notes.map((note) => (
              <li key={note.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
                    {note.pinned ? <Badge tone="primary">{t("detail.notes.pinned")}</Badge> : null}
                    <span>{t("detail.notes.meta", { name: note.authorName ?? t("detail.notes.former"), date: formatDateTime(note.createdAt, locale) ?? "" })}</span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap text-ink">{note.body}</p>
                </div>
                <PinButton organizationId={organizationId} note={note} />
              </li>
            ))}
          </ul>
        )}
        {notes.length >= DETAIL_NOTES_LIMIT ? <p className="mt-2 text-xs text-ink-3">{t("detail.notes.limit", { count: DETAIL_NOTES_LIMIT })}</p> : null}
      </div>
      <form action={action} className="space-y-3 rounded-[var(--radius-card)] border border-line bg-surface p-4" key={resets}>
        <input type="hidden" name="organizationId" value={organizationId} />
        <h3 className="text-sm font-semibold text-ink">{t("detail.notes.add")}</h3>
        <ActionFeedback state={state} />
        <div>
          <Label htmlFor={`${id}-body`}>{t("detail.notes.body")}</Label>
          <Textarea id={`${id}-body`} name="body" required maxLength={2000} rows={4} placeholder={t("detail.notes.placeholder")} className="mt-1.5" state={bodyError ? "error" : undefined} aria-describedby={bodyError ? `${id}-body-error` : undefined} />
          <FieldError id={`${id}-body-error`}>{bodyError}</FieldError>
        </div>
        <Checkbox name="pinned" label={t("detail.notes.pinOnCreate")} />
        <Button type="submit" loading={pending}>
          {t("detail.notes.submit")}
        </Button>
      </form>
    </div>
  );
}
