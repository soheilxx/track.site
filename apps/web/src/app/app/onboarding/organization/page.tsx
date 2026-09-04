import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { normalizeDomainInput } from "@track-site/core";
import { PlanSelectionMemo } from "@/components/app/billing";
import { OrganizationForm } from "@/components/app/organization-form";
import { planSelectionFromSearchParams, planSelectionQuery } from "@/components/marketing/pricing/plan-selection";
import { getOrgContext } from "@/server/session";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function OrganizationOnboardingPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await getOrgContext();
  const query = await searchParams;
  // the hand-overs from signup are re-validated on every hop; only a bare hostname and a catalogue plan travel on
  const safeDomain = typeof query.domain === "string" ? normalizeDomainInput(query.domain) : null;
  const selection = planSelectionFromSearchParams(query);
  if (ctx) redirect(`/app/onboarding${safeDomain ? `?domain=${encodeURIComponent(safeDomain)}` : ""}${planSelectionQuery(selection, !safeDomain)}`);
  const t = await getTranslations("app.onboarding");
  return (
    <div className="mx-auto max-w-lg py-8">
      <PlanSelectionMemo selection={selection} />
      <h1 className="font-display text-2xl font-semibold text-ink">{t("orgTitle")}</h1>
      <p className="mt-2 text-ink-2">{t("orgText")}</p>
      <div className="mt-6">
        <OrganizationForm domain={safeDomain ?? ""} />
      </div>
    </div>
  );
}
