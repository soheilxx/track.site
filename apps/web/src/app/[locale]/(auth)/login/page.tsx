import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { Link } from "@/i18n/navigation";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return { title: t("login.title"), robots: { index: false, follow: false } };
}

export default async function LoginPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ next?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { next } = await searchParams;
  const t = await getTranslations("auth");
  return (
    <AuthShell
      locale={locale}
      title={t("login.title")}
      subtitle={t("login.subtitle")}
      preview
      footer={
        <>
          {t("login.noAccount")}{" "}
          <Link href="/signup" className="font-medium text-primary underline-offset-4 hover:underline">
            {t("login.signup")}
          </Link>
        </>
      }
    >
      <LoginForm next={next ?? "/app"} />
    </AuthShell>
  );
}
