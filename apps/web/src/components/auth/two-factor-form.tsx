"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert, Button, Checkbox, Field, Input } from "@track-site/ui";
import { authClient } from "@/lib/auth-client";
import { twoFactorSchema, type TwoFactorInput } from "@/lib/validation/auth";

/**
 * Second factor after the password: the six-digit authenticator code by default, or one of the
 * saved backup codes (alphanumeric, `abcde-12345`). The form's `mode` selects the matching branch of
 * `twoFactorSchema`, so a backup code never has to pass the digit rule and a TOTP never loosens it.
 */
export function TwoFactorForm({ next }: { next: string }) {
  const t = useTranslations("auth");
  const [error, setError] = useState<string | null>(null);
  const [useBackup, setUseBackup] = useState(false);
  const form = useForm<TwoFactorInput>({ resolver: zodResolver(twoFactorSchema), defaultValues: { mode: "totp", code: "", trust: false } });
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/app";
  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={form.handleSubmit(async ({ mode, code, trust }) => {
        setError(null);
        const res = mode === "backup" ? await authClient.twoFactor.verifyBackupCode({ code, trustDevice: trust }) : await authClient.twoFactor.verifyTotp({ code, trustDevice: trust });
        if (res.error) setError(t("errors.generic"));
        else window.location.assign(safeNext);
      })}
    >
      {error ? <Alert tone="bad">{error}</Alert> : null}
      <Field id="code" label={useBackup ? t("twoFactor.backupCode") : t("twoFactor.code")} hint={useBackup ? t("twoFactor.backupText") : undefined} error={form.formState.errors.code ? t("errors.code") : undefined}>
        {(control) => (
          <Input
            {...control}
            inputMode={useBackup ? "text" : "numeric"}
            autoComplete="one-time-code"
            pattern={useBackup ? undefined : "[0-9]*"}
            spellCheck={false}
            className={useBackup ? "font-mono" : "text-center font-mono text-lg tracking-[0.4em]"}
            {...form.register("code")}
          />
        )}
      </Field>
      <Checkbox label={t("twoFactor.trust")} {...form.register("trust")} />
      <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
        {t("twoFactor.submit")}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-full text-primary"
        onClick={() => {
          const backup = !useBackup;
          setUseBackup(backup);
          form.setValue("mode", backup ? "backup" : "totp");
          form.clearErrors("code");
        }}
      >
        {useBackup ? t("twoFactor.useApp") : t("twoFactor.backup")}
      </Button>
    </form>
  );
}
