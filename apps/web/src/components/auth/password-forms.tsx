"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert, Button, FieldError, Input, Label } from "@track-site/ui";
import { Link } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { forgotSchema, resetSchema } from "@/lib/validation/auth";

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<{ email: string }>({ resolver: zodResolver(forgotSchema), defaultValues: { email: "" } });
  if (sent) return <Alert tone="ok">{t("forgot.sent")}</Alert>;
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={form.handleSubmit(async ({ email }) => {
        setError(null);
        const res = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
        if (res.error && res.error.status === 429) setError(t("errors.rateLimited"));
        else setSent(true); // never reveal whether the address exists
      })}
    >
      {error ? <Alert tone="bad">{error}</Alert> : null}
      <div>
        <Label htmlFor="email">{t("email")}</Label>
        <Input id="email" type="email" autoComplete="email" className="mt-1" aria-invalid={Boolean(form.formState.errors.email)} {...form.register("email")} />
        <FieldError>{form.formState.errors.email ? t("errors.email") : null}</FieldError>
      </div>
      <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
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
  if (!token || invalid) {
    return (
      <div className="space-y-4">
        <Alert tone="bad">{t("errors.tokenInvalid")}</Alert>
        <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">
          {t("forgot.title")}
        </Link>
      </div>
    );
  }
  if (done) {
    return (
      <div className="space-y-4">
        <Alert tone="ok">{t("reset.done")}</Alert>
        <Link href="/login" className="text-sm font-medium text-primary hover:underline">
          {t("login.submit")}
        </Link>
      </div>
    );
  }
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={form.handleSubmit(async ({ password }) => {
        setError(null);
        const res = await authClient.resetPassword({ newPassword: password, token });
        if (res.error) setError(res.error.code === "INVALID_TOKEN" ? t("errors.tokenInvalid") : t("errors.generic"));
        else setDone(true);
      })}
    >
      {error ? <Alert tone="bad">{error}</Alert> : null}
      <div>
        <Label htmlFor="password">{t("newPassword")}</Label>
        <Input id="password" type="password" autoComplete="new-password" className="mt-1" aria-invalid={Boolean(form.formState.errors.password)} aria-describedby="pw-help" {...form.register("password")} />
        <p id="pw-help" className="mt-1 text-xs text-ink-3">
          {t("passwordHint")}
        </p>
        <FieldError>{form.formState.errors.password ? t("errors.password") : null}</FieldError>
      </div>
      <div>
        <Label htmlFor="confirm">{t("confirmPassword")}</Label>
        <Input id="confirm" type="password" autoComplete="new-password" className="mt-1" aria-invalid={Boolean(form.formState.errors.confirm)} {...form.register("confirm")} />
        <FieldError>{form.formState.errors.confirm ? t("errors.passwordMatch") : null}</FieldError>
      </div>
      <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
        {t("reset.submit")}
      </Button>
    </form>
  );
}
