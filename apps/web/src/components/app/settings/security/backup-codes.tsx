"use client";

import { Copy, Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button, Checkbox } from "@track-site/ui";
import { backupCodesFilename, formatBackupCodesText } from "./two-factor";

const noSubscription = () => () => {};
/** Clipboard availability without a hydration mismatch (false on the server, the real value after hydration). */
const useCanCopy = () => useSyncExternalStore(noSubscription, () => typeof navigator !== "undefined" && !!navigator.clipboard, () => false);

/**
 * The one-time display of backup codes (after enabling and after regenerating): the list, copy and
 * download as `.txt`, and the confirmation checkbox the caller gates its "Done" on. Feedback of copy
 * and download is announced politely; the codes never go anywhere but the clipboard or the file.
 */
export function BackupCodes({
  codes,
  account,
  confirmed,
  onConfirmedChange,
  disabled = false,
}: {
  codes: readonly string[];
  account: string;
  confirmed: boolean;
  onConfirmedChange: (confirmed: boolean) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("security");
  const [feedback, setFeedback] = useState<string | null>(null);
  const canCopy = useCanCopy();
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 3000);
    return () => clearTimeout(timer);
  }, [feedback]);

  const text = () =>
    formatBackupCodesText(codes, {
      account,
      generatedAt: new Date(),
      labels: { title: t("file.title"), account: t("file.account"), generated: t("file.generated"), note: t("file.note") },
    });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setFeedback(t("enable.backup.copied"));
    } catch {
      setFeedback(t("errors.generic"));
    }
  };

  const download = () => {
    const blob = new Blob([text()], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = backupCodesFilename(new Date());
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setFeedback(t("enable.backup.downloaded"));
  };

  return (
    <div className="space-y-4">
      <ol aria-label={t("enable.backup.list")} className="grid grid-cols-1 gap-x-6 gap-y-1.5 rounded-[var(--radius-control)] border border-line bg-surface-2 px-4 py-3 font-mono text-sm text-ink tabular-nums sm:grid-cols-2" data-testid="security-backup-codes">
        {codes.map((code, i) => (
          <li key={code} className="flex items-baseline gap-2">
            <span aria-hidden="true" className="w-5 text-right text-xs text-ink-3">
              {i + 1}.
            </span>
            <span data-testid="security-backup-code">{code}</span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        {canCopy ? (
          <Button type="button" variant="secondary" size="sm" onClick={() => void copy()} leadingIcon={<Copy className="size-4" aria-hidden="true" />} data-testid="security-backup-copy">
            {t("enable.backup.copy")}
          </Button>
        ) : null}
        <Button type="button" variant="secondary" size="sm" onClick={download} leadingIcon={<Download className="size-4" aria-hidden="true" />} data-testid="security-backup-download">
          {t("enable.backup.download")}
        </Button>
        <span role="status" aria-live="polite" className="text-xs text-ink-3">
          {feedback}
        </span>
      </div>
      <Checkbox label={t("enable.backup.confirm")} checked={confirmed} onChange={(event) => onConfirmedChange(event.currentTarget.checked)} disabled={disabled} data-testid="security-backup-confirm" />
    </div>
  );
}
