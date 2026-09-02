"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert, Button, FieldError, Input, Label } from "@track-site/ui";
import { Link, useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";

export function LoginForm({ next }: { next: string }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/app";

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    const res = await authClient.signIn.email({ email: values.email, password: values.password, callbackURL: safeNext });
    if (res.error) {
      const code = res.error.code ?? "";
      if (res.error.status === 429) setError(t("errors.rateLimited"));
      else if (code === "EMAIL_NOT_VERIFIED") setError(t("errors.emailNotVerified"));
      else if (code === "INVALID_EMAIL_OR_PASSWORD" || res.error.status === 401) setError(t("errors.invalidCredentials"));
      else setError(t("errors.generic"));
      return;
    }
    const data = res.data as { twoFactorRedirect?: boolean } | null;
    if (data?.twoFactorRedirect) {
      router.push(`/two-factor?next=${encodeURIComponent(safeNext)}`);
      return;
    }
    window.location.assign(safeNext);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {error ? <Alert tone="bad">{error}</Alert> : null}
      <div>
        <Label htmlFor="email">{t("email")}</Label>
        <Input id="email" type="email" autoComplete="email" inputMode="email" className="mt-1" aria-invalid={Boolean(form.formState.errors.email)} aria-describedby="email-error" {...form.register("email")} />
        <FieldError id="email-error">{form.formState.errors.email ? t("errors.email") : null}</FieldError>
      </div>
      <div>
        <div className="flex items-center justify-between">
          <Label htmlFor="password">{t("password")}</Label>
          <Link href="/forgot-password" className="text-xs font-medium text-primary hover:underline">
            {t("login.forgot")}
          </Link>
        </div>
        <Input id="password" type="password" autoComplete="current-password" className="mt-1" aria-invalid={Boolean(form.formState.errors.password)} aria-describedby="password-error" {...form.register("password")} />
        <FieldError id="password-error">{form.formState.errors.password ? t("errors.password") : null}</FieldError>
      </div>
      <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
        {t("login.submit")}
      </Button>
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        onClick={async () => {
          setError(null);
          const res = await authClient.signIn.passkey();
          if (res?.error) setError(t("errors.generic"));
          else window.location.assign(safeNext);
        }}
      >
        {t("login.passkey")}
      </Button>
    </form>
  );
}
