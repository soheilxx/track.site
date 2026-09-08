"use client";

import { useTranslations } from "next-intl";
import { useId, useState, type FormEvent } from "react";
import { Alert, Button, Checkbox, Dialog, Field } from "@track-site/ui";
import { PasswordInput } from "@/components/auth/password-input";
import { disableTwoFactor, regenerateBackupCodes } from "@/server/actions/security";
import { BackupCodes } from "./backup-codes";
import type { TwoFactorErrorKey } from "./two-factor";

type ErrorKey = TwoFactorErrorKey | "passwordRequired";

/**
 * Disable two-factor: password plus an explicit confirmation. The server action `disableTwoFactor`
 * runs the change through better-auth and writes the audit entry in the same call. The panel remounts
 * the dialog (`key`) on every opening, so no state survives a closed dialog.
 */
export function DisableTwoFactorDialog({ open, onClose, onDisabled }: { open: boolean; onClose: () => void; onDisabled: (result: { auditFailed: boolean }) => void }) {
  const t = useTranslations("security");
  const id = useId();
  const [password, setPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<ErrorKey | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !confirmed) return;
    if (!password) {
      setError("passwordRequired");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await disableTwoFactor({ password });
      if (!res.ok) {
        setError(res.error ?? "generic");
        return;
      }
      setPassword("");
      onDisabled({ auditFailed: res.auditFailed });
    } catch {
      setError("generic");
    } finally {
      setBusy(false);
    }
  };

  const errorText = error ? t(`errors.${error}`) : null;
  return (
    <Dialog open={open} onClose={onClose} title={t("disable.title")} description={t("disable.text")} closeLabel={t("common.close")} size="sm">
      <form onSubmit={(event) => void submit(event)} noValidate className="space-y-4" data-testid="security-disable-form">
        {errorText ? <Alert tone="bad">{errorText}</Alert> : null}
        <Field id={`${id}-password`} label={t("disable.password")} error={error === "password" || error === "passwordRequired" ? errorText : undefined}>
          {(control) => <PasswordInput {...control} name="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.currentTarget.value)} data-autofocus data-testid="security-disable-password" />}
        </Field>
        <Checkbox label={t("disable.confirm")} checked={confirmed} onChange={(event) => setConfirmed(event.currentTarget.checked)} data-testid="security-disable-confirm" />
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" variant="danger" disabled={!confirmed} loading={busy} loadingLabel={t("common.working")} data-testid="security-disable-submit">
            {t("disable.submit")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/**
 * New backup codes: password, then the codes shown once with copy/download and the confirmation
 * checkbox; the server action `regenerateBackupCodes` writes the audit entry (`backup_codes_regenerated`)
 * in the same call that creates the codes.
 */
export function RegenerateBackupCodesDialog({ open, onClose, account, onRegenerated }: { open: boolean; onClose: () => void; account: string; onRegenerated: (result: { auditFailed: boolean }) => void }) {
  const t = useTranslations("security");
  const id = useId();
  const [password, setPassword] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [auditFailed, setAuditFailed] = useState(false);
  const [closeGuard, setCloseGuard] = useState(false);
  const [error, setError] = useState<ErrorKey | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!password) {
      setError("passwordRequired");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await regenerateBackupCodes({ password });
      if (!res.ok || res.backupCodes.length === 0) {
        setError(res.error ?? "generic");
        return;
      }
      setAuditFailed(res.auditFailed);
      setPassword("");
      setCodes(res.backupCodes);
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
    onRegenerated({ auditFailed });
  };

  const errorText = error ? t(`errors.${error}`) : null;
  return (
    <Dialog open={open} onClose={codes ? finish : onClose} title={t("regenerate.title")} description={codes ? undefined : t("regenerate.text")} closeLabel={t("common.close")} size="md">
      {codes ? (
        <div className="space-y-4">
          <Alert tone="ok">{t("regenerate.success")}</Alert>
          <p className="text-sm text-ink-2">{t("enable.backup.text")}</p>
          {closeGuard && !confirmed ? <Alert tone="warn">{t("enable.backup.closeGuard")}</Alert> : null}
          <BackupCodes codes={codes} account={account} confirmed={confirmed} onConfirmedChange={setConfirmed} />
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button type="button" onClick={finish} disabled={!confirmed} data-testid="security-regenerate-done">
              {t("enable.backup.done")}
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={(event) => void submit(event)} noValidate className="space-y-4" data-testid="security-regenerate-form">
          {errorText ? <Alert tone="bad">{errorText}</Alert> : null}
          <Field id={`${id}-password`} label={t("regenerate.password")} error={error === "password" || error === "passwordRequired" ? errorText : undefined}>
            {(control) => <PasswordInput {...control} name="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.currentTarget.value)} data-autofocus data-testid="security-regenerate-password" />}
          </Field>
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" loading={busy} loadingLabel={t("common.working")} data-testid="security-regenerate-submit">
              {t("regenerate.submit")}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
