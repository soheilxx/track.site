"use client";

import { useTranslations } from "next-intl";
import NextLink from "next/link";
import { useState } from "react";
import { Alert, Button } from "@track-site/ui";
import { Link } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";

export function AcceptInvitation({ invitationId, signedIn }: { invitationId: string | null; signedIn: boolean }) {
  const t = useTranslations("auth");
  const [state, setState] = useState<"idle" | "done" | "error">("idle");
  const [pending, setPending] = useState(false);
  if (!invitationId) return <Alert tone="bad">{t("invitation.invalid")}</Alert>;
  if (!signedIn) {
    const next = `/accept-invitation/${invitationId}`;
    return (
      <div className="space-y-4">
        <Alert tone="info">{t("invitation.loginFirst")}</Alert>
        <div className="flex gap-2">
          <Link href={`/login?next=${encodeURIComponent(next)}`}>
            <Button>{t("login.submit")}</Button>
          </Link>
          <Link href="/signup">
            <Button variant="secondary">{t("signup.submit")}</Button>
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
          track.site
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
