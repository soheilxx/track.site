"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Alert } from "@track-site/ui";
import type { SupportActionState } from "@/server/actions/support";
import { formatBytes } from "./format";
import { ATTACHMENT_MAX_BYTES } from "./constants";
import { errorLabel } from "./labels";

/**
 * Closes a confirmation dialog once its action succeeded — "state adjusted during render" (the last seen
 * action state is tracked) instead of an effect, so no cascading render.
 */
export function useCloseOnSuccess(state: SupportActionState, setOpen: (open: boolean) => void): void {
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state.ok) setOpen(false);
  }
}

/** Result of a portal action: the notice on success, the mapped error (with the refused attachments) otherwise. */
export function ActionFeedback({ state, locale }: { state: SupportActionState; locale: string }) {
  const t = useTranslations("supportPortal");
  if (state.ok && state.notice) return <Alert tone="ok">{t(`notices.${state.notice}`)}</Alert>;
  if (!state.error) return null;
  return (
    <Alert tone="bad">
      {errorLabel(t, state.error)}
      {state.refused?.length ? (
        <ul className="mt-1 list-disc pl-5">
          {state.refused.map((r, i) => (
            <li key={`${r.fileName}-${i}`}>
              <span className="break-all">{r.fileName}</span> — {t.has(`attachmentReasons.${r.reason}`) ? t(`attachmentReasons.${r.reason}`, { size: formatBytes(ATTACHMENT_MAX_BYTES, locale) }) : r.reason}
            </li>
          ))}
        </ul>
      ) : null}
    </Alert>
  );
}
