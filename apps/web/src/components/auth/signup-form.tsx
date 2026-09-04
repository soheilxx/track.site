"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Alert, Button, Field, Input } from "@track-site/ui";
import { Link, useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { signupSchema, type SignupInput } from "@/lib/validation/auth";
import { domainQuery, readStoredDomain, safeDomain, storeDomain } from "./domain";
import { PasswordInput } from "./password-input";

const linkClass = "font-medium text-primary underline underline-offset-4 hover:text-primary-strong";

/**
 * Signup with the domain handed over from the hero: prefilled from the validated `?domain=` query
 * (or the value the start page remembered in this tab), visible, editable and re-validated before
 * it travels on to verification and onboarding.
 */
export function SignupForm({ domain }: { domain: string | null }) {
  const t = useTranslations("auth");
  const locale = useLocale();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<SignupInput>({ resolver: zodResolver(signupSchema), defaultValues: { name: "", email: "", password: "", company: "", domain: domain ?? "", website: "" } });
  const errors = form.formState.errors;
  const domainValue = useWatch({ control: form.control, name: "domain" });
  // "taken over" hint while the prefilled value is untouched; the generic hint once the user edits it
  const prefilled = Boolean(domainValue) && !form.formState.dirtyFields.domain;

  useEffect(() => {
    // no query value: fall back to the domain the start page remembered in this tab (client-only storage)
    if (domain) return;
    const stored = readStoredDomain();
    if (stored && !form.getValues("domain")) form.setValue("domain", stored);
  }, [domain, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    if (values.website) return; // honeypot
    const host = values.domain?.trim() ? safeDomain(values.domain) : null;
    if (values.domain?.trim() && !host) {
      form.setError("domain", { type: "validate" });
      return;
    }
    const callbackURL = `/app/onboarding${domainQuery(host)}`;
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
    storeDomain(host);
    router.push(`/verify-email?email=${encodeURIComponent(values.email)}${domainQuery(host, false)}`);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {error ? <Alert tone="bad">{error}</Alert> : null}
      <Field id="name" label={t("name")} error={errors.name ? t("errors.name") : undefined}>
        {(control) => <Input {...control} autoComplete="name" {...form.register("name")} />}
      </Field>
      <Field id="email" label={t("email")} error={errors.email ? t("errors.email") : undefined}>
        {(control) => <Input {...control} type="email" autoComplete="email" inputMode="email" {...form.register("email")} />}
      </Field>
      <Field id="password" label={t("password")} hint={t("passwordHint")} error={errors.password ? t("errors.password") : undefined}>
        {(control) => <PasswordInput {...control} autoComplete="new-password" {...form.register("password")} />}
      </Field>
      <Field id="company" label={t("company")} meta={t("optional")}>
        {(control) => <Input {...control} autoComplete="organization" {...form.register("company")} />}
      </Field>
      <Field id="domain" label={t("signup.domain")} meta={t("optional")} hint={prefilled ? t("signup.domainPrefilled") : t("signup.domainHint")} error={errors.domain ? t("errors.domain") : undefined}>
        {(control) => <Input {...control} inputMode="url" autoComplete="url" placeholder="shop.example.com" {...form.register("domain")} />}
      </Field>
      <div className="hidden" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input id="website" tabIndex={-1} autoComplete="off" {...form.register("website")} />
      </div>
      <p className="text-xs text-ink-3">
        {t.rich("signup.terms", {
          terms: (chunks) => (
            <Link href="/terms" className={linkClass}>
              {chunks}
            </Link>
          ),
          dpa: (chunks) => (
            <Link href="/data-processing" className={linkClass}>
              {chunks}
            </Link>
          ),
        })}
      </p>
      <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
        {t("signup.submit")}
      </Button>
    </form>
  );
}
