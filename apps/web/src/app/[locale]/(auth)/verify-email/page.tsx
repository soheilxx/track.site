import { MailCheck } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { safeDomain } from "@/components/auth/domain";
import { ResendVerification } from "@/components/auth/resend-verification";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return { title: t("verify.title"), robots: { index: false, follow: false } };
}

export default async function VerifyEmailPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ email?: string; domain?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { email, domain } = await searchParams;
  const t = await getTranslations("auth");
  const safeEmail = email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
  return (
    <AuthShell locale={locale} title={t("verify.title")} step={2}>
      <div className="flex items-start gap-4">
        <span aria-hidden="true" className="inline-flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-primary-soft text-primary">
          <MailCheck className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-ink-2">{safeEmail ? t("verify.text", { email: safeEmail }) : t("verify.textGeneric")}</p>
          <p className="mt-3 text-sm text-ink-3">{t("verify.spam")}</p>
        </div>
      </div>
      <div className="mt-6">
        <ResendVerification email={safeEmail} domain={safeDomain(domain)} />
      </div>
    </AuthShell>
  );
}
