"use client";

import { Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Alert, Button, Dialog, Field, Input } from "@track-site/ui";
import { PasswordInput } from "@/components/auth/password-input";
import { confirmTwoFactorEnrolment, startTwoFactorEnrolment } from "@/server/actions/security";
import { BackupCodes } from "./backup-codes";
import { QrCode } from "./qr-code";
import { groupSecret, parseTotpUri, type TwoFactorErrorKey } from "./two-factor";

type Step = "password" | "scan" | "verify" | "backup";
const STEPS: readonly Step[] = ["password", "scan", "verify", "backup"];

export interface EnableResult {
  /** the audit entry could not be written although two-factor is enabled */
  auditFailed: boolean;
}

/**
 * Enrolment wizard (four steps in one dialog): password → QR code + manual key → six-digit code →
 * backup codes shown once. Both state changes run through server actions: `startTwoFactorEnrolment`
 * lets better-auth create the (unverified) secret, `confirmTwoFactorEnrolment` verifies the code —
 * the moment the account switches to two-factor — and writes the audit entry in the same call, before
 * the codes are shown, so an abandoned last step still leaves a record. Closing at the last step needs
 * the confirmation checkbox — the codes cannot be shown again (only regenerated). The panel remounts
 * the dialog (`key`) on every opening, so nothing of a previous enrolment stays in memory.
 */
export function EnableTwoFactorDialog({ open, onClose, account, onEnabled }: { open: boolean; onClose: () => void; account: string; onEnabled: (result: EnableResult) => void }) {
  const t = useTranslations("security");
  const id = useId();
  const [step, setStep] = useState<Step>("password");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [auditFailed, setAuditFailed] = useState(false);
  const [error, setError] = useState<TwoFactorErrorKey | "passwordRequired" | "codeFormat" | null>(null);
  const [closeGuard, setCloseGuard] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const stepHeading = useRef<HTMLHeadingElement>(null);

  // the step heading takes focus so screen readers announce the new step inside the dialog
  useEffect(() => {
    if (open && step !== "password") stepHeading.current?.focus();
  }, [open, step]);

  useEffect(() => {
    if (!copyFeedback) return;
    const timer = setTimeout(() => setCopyFeedback(null), 3000);
    return () => clearTimeout(timer);
  }, [copyFeedback]);

  const parsed = totpUri ? parseTotpUri(totpUri) : null;
  const stepIndex = STEPS.indexOf(step);

  const submitPassword = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!password) {
      setError("passwordRequired");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await startTwoFactorEnrolment({ password });
      if (!res.ok || !res.totpUri || !parseTotpUri(res.totpUri)) {
        setError(res.error ?? "generic");
        return;
      }
      setTotpUri(res.totpUri);
      setBackupCodes(res.backupCodes);
      setPassword("");
      setStep("scan");
    } catch {
      setError("generic");
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const digits = code.replace(/\s+/g, "");
    if (!/^\d{6}$/.test(digits)) {
      setError("codeFormat");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // verifies the code, switches the account to two-factor and writes the audit entry in one server call
      const res = await confirmTwoFactorEnrolment({ code: digits });
      if (!res.ok) {
        setError(res.error ?? "generic");
        return;
      }
      setAuditFailed(res.auditFailed);
      setCode("");
      setStep("backup");
    } catch {
      setError("generic");
    } finally {
      setBusy(false);
    }
  };

  const finish = () => {
    if (!confirmed) {
      setCloseGuard(true);
      return;
    }
    onEnabled({ auditFailed });
  };

  const requestClose = () => {
    if (step === "backup") finish();
    else onClose();
  };

  const copyKey = async () => {
    if (!parsed) return;
    try {
      await navigator.clipboard.writeText(parsed.secret);
      setCopyFeedback(t("enable.scan.copied"));
    } catch {
      // no clipboard (insecure context, denied permission): say so instead of staying silent — the key stays readable above
      setCopyFeedback(t("errors.generic"));
    }
  };

  const errorText = error ? t(`errors.${error}`) : null;
  const heading = (
    <h3 ref={stepHeading} tabIndex={-1} className="text-base font-semibold text-ink outline-none" data-testid={`security-step-${step}`}>
      {t("enable.stepOf", { step: stepIndex + 1, total: STEPS.length, name: t(`enable.steps.${step}`) })}
    </h3>
  );

  return (
    <Dialog open={open} onClose={requestClose} title={t("enable.title")} closeLabel={t("common.close")} size="md">
      {step === "password" ? (
        <form onSubmit={(event) => void submitPassword(event)} noValidate className="space-y-4" data-testid="security-enable-form">
          {heading}
          <p className="text-sm text-ink-2">{t("enable.password.hint")}</p>
          {errorText ? <Alert tone="bad">{errorText}</Alert> : null}
          <Field id={`${id}-password`} label={t("enable.password.label")} error={error === "password" || error === "passwordRequired" ? errorText : undefined}>
            {(control) => <PasswordInput {...control} name="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.currentTarget.value)} data-autofocus data-testid="security-password" />}
          </Field>
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" loading={busy} loadingLabel={t("common.working")} data-testid="security-password-submit">
              {t("enable.password.submit")}
            </Button>
          </div>
        </form>
      ) : null}

      {step === "scan" && parsed && totpUri ? (
        <div className="space-y-4">
          {heading}
          <p className="text-sm text-ink-2">{t("enable.scan.text")}</p>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <QrCode
              value={totpUri}
              label={t("enable.scan.qrAlt", { account: parsed.account ?? account })}
              className="shrink-0"
              // a URI beyond version 10 (a very long account label) has no image: the manual key next to it is the way in
              fallback={
                <p role="status" className="max-w-[14rem] shrink-0 text-sm text-ink-2" data-testid="security-qr-unavailable">
                  {t("enable.scan.qrUnavailable")}
                </p>
              }
            />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-sm font-medium text-ink">{t("enable.scan.manual")}</p>
              <code className="block break-all rounded-[var(--radius-control)] border border-line bg-surface-2 px-3 py-2 font-mono text-sm text-ink" data-testid="security-manual-key" data-secret={parsed.secret}>
                {groupSecret(parsed.secret)}
              </code>
              <p className="text-xs text-ink-3">
                {t("enable.scan.issuer")}: {parsed.issuer ?? "Track"} · {parsed.account ?? account}
              </p>
              <p className="text-xs text-ink-3">{t("enable.scan.manualText")}</p>
              <div className="flex items-center gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => void copyKey()} leadingIcon={<Copy className="size-4" aria-hidden="true" />}>
                  {t("enable.scan.copyKey")}
                </Button>
                <span role="status" aria-live="polite" className="text-xs text-ink-3">
                  {copyFeedback}
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="button" onClick={() => setStep("verify")} data-testid="security-scan-next">
              {t("enable.scan.next")}
            </Button>
          </div>
        </div>
      ) : null}

      {step === "verify" ? (
        <form onSubmit={(event) => void submitCode(event)} noValidate className="space-y-4" data-testid="security-verify-form">
          {heading}
          <p className="text-sm text-ink-2">{t("enable.verify.text")}</p>
          {errorText ? <Alert tone="bad">{errorText}</Alert> : null}
          <Field id={`${id}-code`} label={t("enable.verify.label")} error={error === "code" || error === "codeFormat" ? errorText : undefined}>
            {(control) => (
              <Input
                {...control}
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                spellCheck={false}
                className="text-center font-mono text-lg tracking-[0.4em]"
                value={code}
                onChange={(event) => setCode(event.currentTarget.value)}
                data-autofocus
                data-testid="security-code"
              />
            )}
          </Field>
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => setStep("scan")}>
              {t("common.back")}
            </Button>
            <Button type="submit" loading={busy} loadingLabel={t("common.working")} data-testid="security-verify-submit">
              {t("enable.verify.submit")}
            </Button>
          </div>
        </form>
      ) : null}

      {step === "backup" ? (
        <div className="space-y-4">
          {heading}
          <Alert tone="ok">{t("enable.success")}</Alert>
          <p className="text-sm text-ink-2">{t("enable.backup.text")}</p>
          {closeGuard && !confirmed ? <Alert tone="warn">{t("enable.backup.closeGuard")}</Alert> : null}
          <BackupCodes codes={backupCodes} account={account} confirmed={confirmed} onConfirmedChange={setConfirmed} />
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button type="button" onClick={finish} disabled={!confirmed} data-testid="security-done">
              {t("enable.backup.done")}
            </Button>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
