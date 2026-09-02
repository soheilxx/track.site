"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert, Button, FieldError, Input, Label } from "@track-site/ui";
import { Link, useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { signupSchema, type SignupInput } from "@/lib/validation/auth";

export function SignupForm({ domain }: { domain: string | null }) {
  const t = useTranslations("auth");
  const locale = useLocale();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<SignupInput>({ resolver: zodResolver(signupSchema), defaultValues: { name: "", email: "", password: "", company: "", domain: domain ?? "", website: "" } });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    if (values.website) return; // honeypot
    const callbackURL = `/app/onboarding${values.domain ? `?domain=${encodeURIComponent(values.domain)}` : ""}`;
    const res = await authClient.signUp.email({ name: values.name, email: values.email, password: values.password, callbackURL, locale } as never);
    if (res.error) {
      const code = res.error.code ?? "";
      if (res.error.status === 429) setError(t("errors.rateLimited"));
      else if (code === "USER_ALREADY_EXISTS" || code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") setError(t("errors.userExists"));
      else setError(t("errors.generic"));
      return;
    }
    try {
      sessionStorage.setItem("ts-signup-email", values.email);
      if (values.company) sessionStorage.setItem("ts-signup-company", values.company);
    } catch {
      /* ignore */
    }
    router.push(`/verify-email?email=${encodeURIComponent(values.email)}`);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {error ? <Alert tone="bad">{error}</Alert> : null}
      {domain ? <Alert tone="info">{t("signup.domainNote", { domain })}</Alert> : null}
      <div>
        <Label htmlFor="name">{t("name")}</Label>
        <Input id="name" autoComplete="name" className="mt-1" aria-invalid={Boolean(form.formState.errors.name)} aria-describedby="name-error" {...form.register("name")} />
        <FieldError id="name-error">{form.formState.errors.name ? t("errors.name") : null}</FieldError>
      </div>
      <div>
        <Label htmlFor="company">{t("company")}</Label>
        <Input id="company" autoComplete="organization" className="mt-1" {...form.register("company")} />
      </div>
      <div>
        <Label htmlFor="email">{t("email")}</Label>
        <Input id="email" type="email" autoComplete="email" inputMode="email" className="mt-1" aria-invalid={Boolean(form.formState.errors.email)} aria-describedby="email-error" {...form.register("email")} />
        <FieldError id="email-error">{form.formState.errors.email ? t("errors.email") : null}</FieldError>
      </div>
      <div>
        <Label htmlFor="password">{t("password")}</Label>
        <Input id="password" type="password" autoComplete="new-password" className="mt-1" aria-invalid={Boolean(form.formState.errors.password)} aria-describedby="password-help password-error" {...form.register("password")} />
        <p id="password-help" className="mt-1 text-xs text-ink-3">
          {t("passwordHint")}
        </p>
        <FieldError id="password-error">{form.formState.errors.password ? t("errors.password") : null}</FieldError>
      </div>
      <div className="hidden" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input id="website" tabIndex={-1} autoComplete="off" {...form.register("website")} />
      </div>
      <input type="hidden" {...form.register("domain")} />
      <p className="text-xs text-ink-3">
        {t("signup.terms")}{" "}
        <Link href="/terms" className="text-primary underline">
          Terms
        </Link>{" "}
        ·{" "}
        <Link href="/data-processing" className="text-primary underline">
          DPA
        </Link>
      </p>
      <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
        {t("signup.submit")}
      </Button>
    </form>
  );
}
