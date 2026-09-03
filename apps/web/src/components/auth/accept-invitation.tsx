"use client";

import { useLocale, useTranslations } from "next-intl";
import NextLink from "next/link";
import { useState } from "react";
import { Alert, Button, buttonVariants } from "@track-site/ui";
import { Link } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";

export function AcceptInvitation({ invitationId, signedIn }: { invitationId: string | null; signedIn: boolean }) {
  const t = useTranslations("auth");
  const locale = useLocale();
  const [state, setState] = useState<"idle" | "done" | "error">("idle");
  const [pending, setPending] = useState(false);
  if (!invitationId) return <Alert tone="bad">{t("invitation.invalid")}</Alert>;
  if (!signedIn) {
    // full path including the locale: the login form opens it with a document load after sign-in
    const next = `/${locale}/accept-invitation/${invitationId}`;
    return (
      <div className="space-y-4">
        <Alert tone="info">{t("invitation.loginFirst")}</Alert>
        <div className="flex gap-2">
          <Link href={`/login?next=${encodeURIComponent(next)}`} className={buttonVariants()}>
            {t("login.submit")}
          </Link>
          <Link href="/signup" className={buttonVariants({ variant: "secondary" })}>
            {t("signup.submit")}
          </Link>
        </div>
      </div>
    );
  }
  if (state === "done") {
    return (
      <div className="space-y-4">
        <Alert tone="ok">{t("invitation.accepted")}</Alert>
        <NextLink href="/app" className="text-sm font-medium text-primary hover:underline">
          {t("invitation.openApp")}
        </NextLink>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {state === "error" ? <Alert tone="bad">{t("invitation.invalid")}</Alert> : null}
      <Button
        loading={pending}
        onClick={async () => {
          setPending(true);
          const res = await authClient.organization.acceptInvitation({ invitationId });
          setPending(false);
          if (res.error) setState("error");
          else {
            setState("done");
            window.location.assign("/app");
          }
        }}
      >
        {t("invitation.accept")}
      </Button>
    </div>
  );
}
