"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Alert, Button, FieldError, Input, Label } from "@track-site/ui";
import { createOrganizationAction, type ActionState } from "@/server/actions/organization";

const initial: ActionState = { ok: false, error: null };

export function OrganizationForm({ domain }: { domain: string }) {
  const t = useTranslations("app.onboarding");
  const [state, action, pending] = useActionState(createOrganizationAction, initial);
  let defaultName = "";
  try {
    defaultName = sessionStorage.getItem("ts-signup-company") ?? "";
  } catch {
    /* ssr */
  }
  return (
    <form action={action} className="space-y-4">
      {state.error ? <Alert tone="bad">{t(`errors.${state.error}`)}</Alert> : null}
      <input type="hidden" name="domain" value={domain} />
      <div>
        <Label htmlFor="name">{t("orgName")}</Label>
        <Input id="name" name="name" required minLength={2} maxLength={80} defaultValue={defaultName} className="mt-1" aria-invalid={Boolean(state.fieldErrors?.name)} />
        <FieldError>{state.fieldErrors?.name ? t("errors.orgName") : null}</FieldError>
      </div>
      <Button type="submit" loading={pending}>
        {t("orgSubmit")}
      </Button>
    </form>
  );
}
