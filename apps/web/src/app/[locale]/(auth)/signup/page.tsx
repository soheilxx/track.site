import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { safeDomain } from "@/components/auth/domain";
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
  return (
    <AuthShell
      locale={locale}
      title={t("signup.title")}
      subtitle={t("signup.subtitle")}
      step={1}
      preview
      footer={
        <>
          {t("signup.haveAccount")}{" "}
          <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
            {t("signup.login")}
          </Link>
        </>
      }
    >
      <SignupForm domain={safeDomain(domain)} />
    </AuthShell>
  );
}
