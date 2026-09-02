import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthCard } from "@/components/auth/auth-card";
import { ResendVerification } from "@/components/auth/resend-verification";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return { title: t("verify.title"), robots: { index: false, follow: false } };
}

export default async function VerifyEmailPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ email?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { email } = await searchParams;
  const t = await getTranslations("auth");
  const safeEmail = email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
  return (
    <AuthCard title={t("verify.title")}>
      <p className="text-ink-2">{safeEmail ? t("verify.text", { email: safeEmail }) : t("verify.textGeneric")}</p>
      <p className="mt-3 text-sm text-ink-3">{t("verify.spam")}</p>
      <div className="mt-6">
        <ResendVerification email={safeEmail} />
      </div>
    </AuthCard>
  );
}
