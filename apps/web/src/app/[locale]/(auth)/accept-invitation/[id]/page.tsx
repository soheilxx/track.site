import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AcceptInvitation } from "@/components/auth/accept-invitation";
import { AuthShell } from "@/components/auth/auth-shell";
import { getSession } from "@/server/session";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return { title: t("invitation.title"), robots: { index: false, follow: false } };
}

export default async function AcceptInvitationPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth");
  const session = await getSession();
  const safeId = /^[0-9a-f-]{36}$/i.test(id) ? id : null;
  return (
    <AuthShell locale={locale} title={t("invitation.title")} subtitle={t("invitation.text")}>
      <AcceptInvitation invitationId={safeId} signedIn={Boolean(session)} />
    </AuthShell>
  );
}
