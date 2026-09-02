"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Alert, Button } from "@track-site/ui";
import { authClient } from "@/lib/auth-client";

export function ResendVerification({ email }: { email: string | null }) {
  const t = useTranslations("auth");
  const [state, setState] = useState<"idle" | "sent" | "error">("idle");
  const [pending, setPending] = useState(false);
  if (!email) return null;
  return (
    <div className="space-y-3">
      {state === "sent" ? <Alert tone="ok">{t("verify.resent")}</Alert> : null}
      {state === "error" ? <Alert tone="bad">{t("errors.generic")}</Alert> : null}
      <Button
        variant="secondary"
        loading={pending}
        onClick={async () => {
          setPending(true);
          const res = await authClient.sendVerificationEmail({ email, callbackURL: "/app/onboarding" });
          setPending(false);
          setState(res.error ? "error" : "sent");
        }}
      >
        {t("verify.resend")}
      </Button>
    </div>
  );
}
