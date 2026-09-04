"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Alert, Button } from "@track-site/ui";
import { planSelectionQuery, type PlanSelection } from "@/components/marketing/pricing/plan-selection";
import { authClient } from "@/lib/auth-client";
import { domainQuery } from "./domain";

/** Re-sends the verification link; the callback keeps the validated domain and plan selection so onboarding stays prefilled. */
export function ResendVerification({ email, domain, selection = null }: { email: string | null; domain: string | null; selection?: PlanSelection | null }) {
  const t = useTranslations("auth");
  const [state, setState] = useState<"idle" | "sent" | "error">("idle");
  const [pending, setPending] = useState(false);
  if (!email) return null;
  return (
    <div className="space-y-4">
      {state === "sent" ? <Alert tone="ok">{t("verify.resent")}</Alert> : null}
      {state === "error" ? <Alert tone="bad">{t("errors.generic")}</Alert> : null}
      <Button
        variant="secondary"
        size="lg"
        className="w-full"
        loading={pending}
        onClick={async () => {
          setPending(true);
          const res = await authClient.sendVerificationEmail({ email, callbackURL: `/app/onboarding${domainQuery(domain)}${planSelectionQuery(selection, !domain)}` });
          setPending(false);
          setState(res.error ? "error" : "sent");
        }}
      >
        {t("verify.resend")}
      </Button>
    </div>
  );
}
