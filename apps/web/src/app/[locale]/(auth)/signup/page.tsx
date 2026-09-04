import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { findPlan } from "@track-site/catalog";
import { AuthShell } from "@/components/auth/auth-shell";
import { safeDomain } from "@/components/auth/domain";
import { SignupForm } from "@/components/auth/signup-form";
import { planSelectionFromSearchParams } from "@/components/marketing/pricing/plan-selection";
import { fill } from "@/components/marketing/pricing/pricing-helpers";
import { Link } from "@/i18n/navigation";
import { AUTH_COPY, pick } from "@/lib/marketing-copy";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return { title: t("signup.title"), robots: { index: false, follow: false } };
}

/**
 * Signup. Two hand-overs arrive in the query string and are re-validated here: the domain from the
 * hero (`?domain=`) and the plan + billing period from a pricing CTA (`?plan=&interval=`, contract in
 * components/marketing/pricing/plan-selection.ts). The plan is shown as a note above the form and
 * carried on by the form through verification and onboarding into a preselected checkout.
 */
export default async function SignupPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  const selection = planSelectionFromSearchParams(query);
  const plan = selection ? findPlan(selection.planId) : null;
  const t = await getTranslations("auth");
  const c = pick(locale, AUTH_COPY);
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
      {selection && plan ? (
        <p className="mb-5 rounded-[var(--radius-control)] border border-line bg-surface-2 px-4 py-3 text-sm text-ink-2" data-plan={selection.planId} data-interval={selection.interval}>
          {fill(c.plan.selected, { plan: plan.name, interval: c.plan.intervals[selection.interval] })}
        </p>
      ) : null}
      <SignupForm domain={safeDomain(query.domain)} selection={selection} />
    </AuthShell>
  );
}
