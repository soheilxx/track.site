import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { normalizeDomainInput } from "@track-site/core";
import { AuthCard } from "@/components/auth/auth-card";
import { SignupForm } from "@/components/auth/signup-form";
import { Link } from "@/i18n/navigation";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return { title: t("signup.title"), robots: { index: false, follow: false } };
}

export default async function SignupPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ domain?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { domain } = await searchParams;
  const t = await getTranslations("auth");
  const safeDomain = domain ? normalizeDomainInput(domain) : null;
  return (
    <AuthCard
      title={t("signup.title")}
      subtitle={t("signup.subtitle")}
      footer={
        <span>
          {t("signup.haveAccount")}{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            {t("signup.login")}
          </Link>
        </span>
      }
    >
      <SignupForm domain={safeDomain} />
    </AuthCard>
  );
}
