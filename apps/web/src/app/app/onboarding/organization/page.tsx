import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { OrganizationForm } from "@/components/app/organization-form";
import { getOrgContext } from "@/server/session";

export default async function OrganizationOnboardingPage({ searchParams }: { searchParams: Promise<{ domain?: string }> }) {
  const ctx = await getOrgContext();
  const { domain } = await searchParams;
  if (ctx) redirect(`/app/onboarding${domain ? `?domain=${encodeURIComponent(domain)}` : ""}`);
  const t = await getTranslations("app.onboarding");
  return (
    <div className="mx-auto max-w-lg py-8">
      <h1 className="font-display text-2xl font-semibold text-ink">{t("orgTitle")}</h1>
      <p className="mt-2 text-ink-2">{t("orgText")}</p>
      <div className="mt-6">
        <OrganizationForm domain={domain ?? ""} />
      </div>
    </div>
  );
}
