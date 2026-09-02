import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthCard } from "@/components/auth/auth-card";
import { ResetPasswordForm } from "@/components/auth/password-forms";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return { title: t("reset.title"), robots: { index: false, follow: false } };
}

export default async function ResetPasswordPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ token?: string; error?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { token, error } = await searchParams;
  const t = await getTranslations("auth");
  return (
    <AuthCard title={t("reset.title")}>
      <ResetPasswordForm token={token ?? null} invalid={Boolean(error)} />
    </AuthCard>
  );
}
