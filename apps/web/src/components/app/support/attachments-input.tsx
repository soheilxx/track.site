"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { FieldHint, Label } from "@track-site/ui";
import { ATTACHMENT_ACCEPT, ATTACHMENT_MAX_BYTES, ATTACHMENT_MAX_PER_MESSAGE } from "./constants";
import { formatBytes } from "./format";

/**
 * Multiple-file input for a ticket message (`name="attachments"`). The limits are stated in the hint and
 * checked on the client for immediate feedback (count, size, type); the server screens every file again
 * and refuses the whole submission when one does not pass, so nothing is dropped silently.
 */
export function AttachmentsInput({ id, label, locale, disabled }: { id: string; label: string; locale: string; disabled?: boolean }) {
  const t = useTranslations("supportPortal");
  const [problems, setProblems] = useState<Array<{ fileName: string; reason: string }>>([]);
  const [count, setCount] = useState(0);
  const hintId = `${id}-hint`;
  const errorId = problems.length ? `${id}-error` : undefined;
  const maxSize = formatBytes(ATTACHMENT_MAX_BYTES, locale);
  return (
    <div className="min-w-0">
      <Label htmlFor={id}>
        {label} <span className="text-xs font-normal text-ink-3">({t("common.optional")})</span>
      </Label>
      <input
        id={id}
        name="attachments"
        type="file"
        multiple
        accept={ATTACHMENT_ACCEPT}
        disabled={disabled}
        aria-describedby={[errorId, hintId].filter(Boolean).join(" ")}
        aria-invalid={problems.length ? true : undefined}
        className="mt-1.5 block w-full min-h-11 cursor-pointer rounded-[var(--radius-control)] border border-line-2 bg-surface px-3 py-2 text-sm text-ink file:mr-3 file:rounded-[var(--radius-control-sm)] file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink hover:border-ink-3 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-bad"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          const next: Array<{ fileName: string; reason: string }> = [];
          files.forEach((f, i) => {
            if (i >= ATTACHMENT_MAX_PER_MESSAGE) next.push({ fileName: f.name, reason: "too_many" });
            else if (f.size > ATTACHMENT_MAX_BYTES) next.push({ fileName: f.name, reason: "too_large" });
          });
          setProblems(next);
          setCount(files.length);
        }}
      />
      {problems.length ? (
        <ul id={errorId} role="alert" className="mt-1 list-disc pl-5 text-sm text-bad">
          {problems.map((p, i) => (
            <li key={`${p.fileName}-${i}`}>
              <span className="break-all">{p.fileName}</span> — {t(`attachmentReasons.${p.reason}`, { size: maxSize })}
            </li>
          ))}
        </ul>
      ) : null}
      <FieldHint id={hintId}>
        {t("form.attachmentsHint", { count: ATTACHMENT_MAX_PER_MESSAGE, size: maxSize })}
        {count ? <span className="ml-1 tabular-nums text-ink-2">{t("form.selected", { count })}</span> : null}
      </FieldHint>
    </div>
  );
}
