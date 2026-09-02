"use client";

import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button, FieldError, Input, Label } from "@track-site/ui";
import { useRouter } from "@/i18n/navigation";

const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** Domain entry that starts the onboarding: the value is carried into signup and the AI setup. */
export function DomainStartForm() {
  const t = useTranslations("home");
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <form
      className="flex w-full max-w-xl flex-col gap-2 sm:flex-row sm:items-start"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const host = value
          .trim()
          .toLowerCase()
          .replace(/^https?:\/\//, "")
          .replace(/\/.*$/, "");
        if (!DOMAIN_RE.test(host)) {
          setError(t("domainPlaceholder"));
          return;
        }
        setError(null);
        setPending(true);
        try {
          sessionStorage.setItem("ts-onboarding-domain", host);
        } catch {
          /* ignore */
        }
        router.push(`/signup?domain=${encodeURIComponent(host)}`);
      }}
    >
      <div className="flex-1">
        <Label htmlFor="domain" className="sr-only">
          {t("domainLabel")}
        </Label>
        <Input id="domain" name="domain" inputMode="url" autoComplete="url" placeholder={t("domainPlaceholder")} value={value} onChange={(e) => setValue(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby="domain-help" className="h-12 text-base" />
        <FieldError id="domain-error">{error ? `${t("domainLabel")}: ${error}` : null}</FieldError>
        <p id="domain-help" className="mt-2 text-sm text-ink-3">
          {t("domainHelp")}
        </p>
      </div>
      <Button type="submit" size="lg" loading={pending} className="sm:h-12">
        {t("cta")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Button>
    </form>
  );
}
