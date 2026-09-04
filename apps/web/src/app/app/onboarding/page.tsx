import { getTranslations } from "next-intl/server";
import { normalizeDomainInput } from "@track-site/core";
import { PlanSelectionMemo } from "@/components/app/billing";
import { SiteForm } from "@/components/app/site-form";
import { planSelectionFromSearchParams } from "@/components/marketing/pricing/plan-selection";
import { requireOrgContext } from "@/server/session";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * First site after signup. The verification callback carries the hand-overs from the marketing
 * site: the domain prefills the form, the plan + billing period chosen on the pricing page is
 * remembered in this tab so `/app/billing` can preselect it once the setup is done.
 */
export default async function SiteOnboardingPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireOrgContext();
  const query = await searchParams;
  const t = await getTranslations("app.onboarding");
  const safeDomain = typeof query.domain === "string" ? (normalizeDomainInput(query.domain) ?? "") : "";
  return (
    <div className="mx-auto max-w-lg py-8">
      <PlanSelectionMemo selection={planSelectionFromSearchParams(query)} />
      <h1 className="font-display text-2xl font-semibold text-ink">{t("siteTitle")}</h1>
      <p className="mt-2 text-ink-2">{t("siteText")}</p>
      <div className="mt-6">
        <SiteForm domain={safeDomain} />
      </div>
    </div>
  );
}
