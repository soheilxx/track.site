import { getTranslations } from "next-intl/server";
import { normalizeDomainInput } from "@track-site/core";
import { SiteForm } from "@/components/app/site-form";
import { requireOrgContext } from "@/server/session";

export default async function SiteOnboardingPage({ searchParams }: { searchParams: Promise<{ domain?: string }> }) {
  await requireOrgContext();
  const { domain } = await searchParams;
  const t = await getTranslations("app.onboarding");
  const safeDomain = domain ? (normalizeDomainInput(domain) ?? "") : "";
  return (
    <div className="mx-auto max-w-lg py-8">
      <h1 className="font-display text-2xl font-semibold text-ink">{t("siteTitle")}</h1>
      <p className="mt-2 text-ink-2">{t("siteText")}</p>
      <div className="mt-6">
        <SiteForm domain={safeDomain} />
      </div>
    </div>
  );
}
