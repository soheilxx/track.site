"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Alert, Button, FieldError, Input, Label } from "@track-site/ui";
import type { ActionState } from "@/server/actions/organization";
import { createSiteAction } from "@/server/actions/sites";

const initial: ActionState = { ok: false, error: null };

export function SiteForm({ domain }: { domain: string }) {
  const t = useTranslations("app.onboarding");
  const [state, action, pending] = useActionState(createSiteAction, initial);
  const [domainValue, setDomainValue] = useState(domain);
  return (
    <form action={action} className="space-y-4">
      {state.error ? <Alert tone="bad">{t(`errors.${state.error}`)}</Alert> : null}
      <div>
        <Label htmlFor="domain">{t("siteDomain")}</Label>
        <Input id="domain" name="domain" inputMode="url" autoComplete="url" required value={domainValue} onChange={(e) => setDomainValue(e.target.value)} placeholder="shop.example.com" className="mt-1" aria-invalid={Boolean(state.fieldErrors?.domain)} />
        <FieldError>{state.fieldErrors?.domain ? t("errors.domain") : null}</FieldError>
      </div>
      <div>
        <Label htmlFor="name">{t("siteName")}</Label>
        <Input id="name" name="name" maxLength={80} placeholder={domainValue || "My shop"} className="mt-1" />
      </div>
      <Button type="submit" loading={pending}>
        {t("siteSubmit")}
      </Button>
    </form>
  );
}
