"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert, Button, Field, Input } from "@track-site/ui";
import { Link, useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";
import { PasswordInput } from "./password-input";

export function LoginForm({ next }: { next: string }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [passkeyPending, setPasskeyPending] = useState(false);
  const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });
  const errors = form.formState.errors;
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
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {error ? <Alert tone="bad">{error}</Alert> : null}
      <Field id="email" label={t("email")} error={errors.email ? t("errors.email") : undefined}>
        {(control) => <Input {...control} type="email" autoComplete="email" inputMode="email" {...form.register("email")} />}
      </Field>
      <Field
        id="password"
        label={t("password")}
        error={errors.password ? t("errors.passwordRequired") : undefined}
        meta={
          <Link href="/forgot-password" className="inline-flex min-h-6 items-center rounded-md text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            {t("login.forgot")}
          </Link>
        }
      >
        {(control) => <PasswordInput {...control} autoComplete="current-password" {...form.register("password")} />}
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
        {t("login.submit")}
      </Button>
      <div aria-hidden="true" className="flex items-center gap-3 text-xs text-ink-3">
        <span className="h-px flex-1 bg-line" />
        {t("login.or")}
        <span className="h-px flex-1 bg-line" />
      </div>
      <Button
        type="button"
        variant="secondary"
        size="lg"
        className="w-full"
        loading={passkeyPending}
        leadingIcon={<KeyRound className="size-4" aria-hidden="true" />}
        onClick={async () => {
          setError(null);
          setPasskeyPending(true);
          const res = await authClient.signIn.passkey();
          setPasskeyPending(false);
          if (res?.error) setError(t("errors.generic"));
          else window.location.assign(safeNext);
        }}
      >
        {t("login.passkey")}
      </Button>
    </form>
  );
}
