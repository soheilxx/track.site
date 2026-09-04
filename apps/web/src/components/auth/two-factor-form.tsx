"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert, Button, Checkbox, Field, Input } from "@track-site/ui";
import { authClient } from "@/lib/auth-client";
import { totpSchema } from "@/lib/validation/auth";

export function TwoFactorForm({ next }: { next: string }) {
  const t = useTranslations("auth");
  const [error, setError] = useState<string | null>(null);
  const [useBackup, setUseBackup] = useState(false);
  const form = useForm<{ code: string; trust?: boolean }>({ resolver: zodResolver(totpSchema), defaultValues: { code: "", trust: false } });
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/app";
  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={form.handleSubmit(async ({ code, trust }) => {
        setError(null);
        const res = useBackup ? await authClient.twoFactor.verifyBackupCode({ code, trustDevice: trust }) : await authClient.twoFactor.verifyTotp({ code, trustDevice: trust });
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
          setUseBackup((v) => !v);
          form.clearErrors("code");
        }}
      >
        {useBackup ? t("twoFactor.useApp") : t("twoFactor.backup")}
      </Button>
    </form>
  );
}
