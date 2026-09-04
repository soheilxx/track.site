"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert, Button, Field, Input, buttonVariants } from "@track-site/ui";
import { Link } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { forgotSchema, resetSchema } from "@/lib/validation/auth";
import { PasswordInput } from "./password-input";

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<{ email: string }>({ resolver: zodResolver(forgotSchema), defaultValues: { email: "" } });
  if (sent) {
    return (
      <div className="space-y-5">
        <Alert tone="ok">{t("forgot.sent")}</Alert>
        <Link href="/login" className={buttonVariants({ variant: "secondary", size: "lg", className: "w-full" })}>
          {t("forgot.back")}
        </Link>
      </div>
    );
  }
  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={form.handleSubmit(async ({ email }) => {
        setError(null);
        // the e-mailed link opens the reset page in the language the request was made in
        const res = await authClient.requestPasswordReset({ email, redirectTo: `/${locale}/reset-password` });
        if (res.error && res.error.status === 429) setError(t("errors.rateLimited"));
        else setSent(true); // never reveal whether the address exists
      })}
    >
      {error ? <Alert tone="bad">{error}</Alert> : null}
      <Field id="email" label={t("email")} error={form.formState.errors.email ? t("errors.email") : undefined}>
        {(control) => <Input {...control} type="email" autoComplete="email" inputMode="email" {...form.register("email")} />}
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
        {t("forgot.submit")}
      </Button>
    </form>
  );
}

export function ResetPasswordForm({ token, invalid }: { token: string | null; invalid: boolean }) {
  const t = useTranslations("auth");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<{ password: string; confirm: string }>({ resolver: zodResolver(resetSchema), defaultValues: { password: "", confirm: "" } });
  const errors = form.formState.errors;
  if (!token || invalid) {
    return (
      <div className="space-y-5">
        <Alert tone="bad">{t("errors.tokenInvalid")}</Alert>
        <Link href="/forgot-password" className={buttonVariants({ size: "lg", className: "w-full" })}>
          {t("forgot.title")}
        </Link>
      </div>
    );
  }
  if (done) {
    return (
      <div className="space-y-5">
        <Alert tone="ok">{t("reset.done")}</Alert>
        <Link href="/login" className={buttonVariants({ size: "lg", className: "w-full" })}>
          {t("login.submit")}
        </Link>
      </div>
    );
  }
  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={form.handleSubmit(async ({ password }) => {
        setError(null);
        const res = await authClient.resetPassword({ newPassword: password, token });
        if (res.error) setError(res.error.code === "INVALID_TOKEN" ? t("errors.tokenInvalid") : t("errors.generic"));
        else setDone(true);
      })}
    >
      {error ? <Alert tone="bad">{error}</Alert> : null}
      <Field id="password" label={t("newPassword")} hint={t("passwordHint")} error={errors.password ? t("errors.password") : undefined}>
        {(control) => <PasswordInput {...control} autoComplete="new-password" {...form.register("password")} />}
      </Field>
      <Field id="confirm" label={t("confirmPassword")} error={errors.confirm ? t("errors.passwordMatch") : undefined}>
        {(control) => <PasswordInput {...control} autoComplete="new-password" {...form.register("confirm")} />}
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
        {t("reset.submit")}
      </Button>
    </form>
  );
}
