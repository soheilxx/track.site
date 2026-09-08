"use client";

import { KeyRound, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PlatformRole } from "@track-site/core";
import { Alert, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Status, buttonVariants, cn } from "@track-site/ui";
import { formatDate } from "@/lib/format";
import { EnableTwoFactorDialog } from "./enable-dialog";
import { DisableTwoFactorDialog, RegenerateBackupCodesDialog } from "./password-dialogs";

export interface TwoFactorPanelProps {
  enabled: boolean;
  /** ISO time of the newest `user.two_factor.enabled` audit row, or null when unknown */
  enabledSince: string | null;
  /** unused backup codes, or null when the plugin could not say */
  backupCodesRemaining: number | null;
  /** the signed-in e-mail (label of the QR code and the export) */
  account: string;
  platformRole: PlatformRole;
  locale: string;
}

type DialogKind = "enable" | "disable" | "regenerate" | null;

/**
 * Security settings: the two-factor status card (state, since when, backup codes left), the three
 * flows as dialogs, a page-level notice region for their outcome, and — for accounts with a platform
 * role — the reminder that Track Operations requires two-factor (docs/17 §3) with the way back to /ops.
 */
export function TwoFactorPanel({ enabled, enabledSince, backupCodesRemaining, account, platformRole, locale }: TwoFactorPanelProps) {
  const t = useTranslations("security");
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogKind>(null);
  // increments on every opening and closing: the dialogs are keyed on it, so each one mounts with fresh state and a
  // closed one is unmounted at once (no secret or backup code lingers in memory between two flows)
  const [opening, setOpening] = useState(0);
  const [notice, setNotice] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);

  const openDialog = (kind: Exclude<DialogKind, null>) => {
    setOpening((n) => n + 1);
    setDialog(kind);
  };

  const closeDialog = () => {
    setDialog(null);
    setOpening((n) => n + 1);
  };

  const finish = (successKey: string, result: { auditFailed: boolean }) => {
    closeDialog();
    setNotice(result.auditFailed ? { tone: "warn", text: `${t(successKey)} ${t("errors.audit")}` } : { tone: "ok", text: t(successKey) });
    router.refresh();
  };

  const operator = platformRole !== "NONE";
  return (
    <div className="space-y-4">
      <div role="status" aria-live="polite" data-testid="security-notice">
        {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      </div>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="size-4 text-ink-3" aria-hidden="true" />
              {t("status.title")}
            </CardTitle>
            <Status tone={enabled ? "ok" : "neutral"} chip indicator="both" data-testid="security-status" data-enabled={enabled ? "true" : "false"}>
              {enabled ? t("status.enabled") : t("status.disabled")}
            </Status>
          </div>
          <CardDescription>{enabled ? t("status.textEnabled") : t("status.textDisabled")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {enabled ? (
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              {enabledSince ? (
                <div>
                  <dt className="text-xs font-medium tracking-wide text-ink-3 uppercase">{t("status.title")}</dt>
                  <dd className="mt-0.5 text-ink" data-testid="security-since">
                    {t("status.since", { date: formatDate(enabledSince, locale, "long") })}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className="text-xs font-medium tracking-wide text-ink-3 uppercase">{t("enable.backup.list")}</dt>
                <dd className="mt-0.5 text-ink tabular-nums" data-testid="security-backup-remaining">
                  {backupCodesRemaining === null ? t("status.backupCodesUnknown") : t("status.backupCodes", { count: backupCodesRemaining })}
                </dd>
              </div>
            </dl>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {enabled ? (
              <>
                <Button type="button" variant="secondary" size="sm" onClick={() => openDialog("regenerate")} data-testid="security-regenerate">
                  {t("status.regenerate")}
                </Button>
                <Button type="button" variant="danger" size="sm" onClick={() => openDialog("disable")} data-testid="security-disable">
                  {t("status.disable")}
                </Button>
              </>
            ) : (
              <Button type="button" size="sm" onClick={() => openDialog("enable")} data-testid="security-enable">
                {t("status.enable")}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {operator ? (
        <Alert tone={enabled ? "info" : "warn"} title={t("ops.title")} className="items-start">
          <p>{enabled ? t("ops.textEnabled") : t("ops.textDisabled")}</p>
          {enabled ? (
            // button-styled link: interactive elements are never nested
            <Link href="/ops" className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "mt-3")} data-testid="security-open-ops">
              <ShieldCheck className="size-4" aria-hidden="true" />
              {t("ops.open")}
            </Link>
          ) : null}
        </Alert>
      ) : null}

      <EnableTwoFactorDialog key={`enable-${opening}`} open={dialog === "enable"} onClose={closeDialog} account={account} onEnabled={(result) => finish("enable.success", result)} />
      <DisableTwoFactorDialog key={`disable-${opening}`} open={dialog === "disable"} onClose={closeDialog} onDisabled={(result) => finish("disable.success", result)} />
      <RegenerateBackupCodesDialog key={`regenerate-${opening}`} open={dialog === "regenerate"} onClose={closeDialog} account={account} onRegenerated={(result) => finish("regenerate.success", result)} />
    </div>
  );
}
