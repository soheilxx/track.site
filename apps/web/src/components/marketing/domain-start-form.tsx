"use client";

import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Button, FieldError, Input, Label } from "@track-site/ui";
import { useRouter } from "@/i18n/navigation";

const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export interface DomainStartFormCopy {
  label: string;
  placeholder: string;
  help: string;
  cta: string;
  /** Validation message; says what a valid entry looks like (only a format check runs here). */
  invalid: string;
}

/**
 * Domain entry that starts the onboarding: the value is validated (format only — no site analysis),
 * carried into signup via the query string and session storage, and the AI setup picks it up.
 * `copy` comes from the page's typed copy module; without it the form reads the message catalog.
 */
export function DomainStartForm({ copy }: { copy?: DomainStartFormCopy }) {
  const t = useTranslations("home");
  const id = useId();
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const texts: DomainStartFormCopy = copy ?? { label: t("domainLabel"), placeholder: t("domainPlaceholder"), help: t("domainHelp"), cta: t("cta"), invalid: `${t("domainLabel")}: ${t("domainPlaceholder")}` };
  const inputId = `${id}-domain`;
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
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
          setError(texts.invalid);
          return;
        }
        setError(null);
        setPending(true);
        try {
          sessionStorage.setItem("ts-onboarding-domain", host);
        } catch {
          /* storage may be unavailable; the query string carries the value anyway */
        }
        router.push(`/signup?domain=${encodeURIComponent(host)}`);
      }}
    >
      <div className="flex-1">
        <Label htmlFor={inputId} className="sr-only">
          {texts.label}
        </Label>
        <Input
          id={inputId}
          name="domain"
          inputMode="url"
          autoComplete="url"
          placeholder={texts.placeholder}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          state={error ? "error" : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${errorId} ${helpId}` : helpId}
          className="h-12 text-base"
        />
        <FieldError id={errorId}>{error}</FieldError>
        <p id={helpId} className="mt-2 text-sm text-ink-3">
          {texts.help}
        </p>
      </div>
      {/* below `sm` the button spans the column and its label may wrap: a long localized label ("Commencer avec votre domaine")
          must not force the hero column past a 320 px viewport */}
      <Button type="submit" size="lg" loading={pending} className="w-full whitespace-normal sm:h-12 sm:w-auto sm:whitespace-nowrap">
        {texts.cta} <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Button>
    </form>
  );
}
