import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/password-forms";
import { Link } from "@/i18n/navigation";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return { title: t("forgot.title"), robots: { index: false, follow: false } };
}

export default async function ForgotPasswordPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth");
  return (
    <AuthShell
      locale={locale}
      title={t("forgot.title")}
      subtitle={t("forgot.text")}
      footer={
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          {t("forgot.back")}
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
