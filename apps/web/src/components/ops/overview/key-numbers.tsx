import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { StatCard, buttonVariants } from "@track-site/ui";
import { count, dateTime, signedDelta } from "@/components/ops/growth/format";
import { SMALL_SAMPLE_ORGANIZATIONS, type GrowthHeadline } from "@/server/ops/growth";
import { Unavailable } from "./unavailable";

/** The growth module's key numbers on the overview; `null` when the module could not be loaded. */
export async function KeyNumbers({ headline, locale }: { headline: GrowthHeadline | null; locale: string }) {
  const t = await getTranslations("opsGrowth.overview");
  return (
    <section aria-labelledby="ops-overview-key-numbers-title" className="space-y-3" data-testid="ops-overview-key-numbers">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="ops-overview-key-numbers-title" className="text-base font-semibold text-ink">
          {t("title")}
        </h2>
        <Link href="/ops/growth" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          {t("link")}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
      {!headline ? (
        <Unavailable />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label={t("organizations.label")} value={count(headline.organizations, locale)} hint={t("organizations.hint", { count: headline.users })} />
            <StatCard
              label={t("newOrganizations.label")}
              value={count(headline.newOrganizations30d, locale)}
              hint={t("newOrganizations.hint", { count: headline.newOrganizations7d, delta: signedDelta(headline.newOrganizations30d, headline.newOrganizationsPrevious30d, locale) })}
            />
            <StatCard label={t("active.label")} value={`${count(headline.active7d, locale)} / ${count(headline.active30d, locale)}`} hint={t("active.hint")} />
            <StatCard label={t("paying.label")} value={count(headline.paying, locale)} hint={t("paying.hint")} />
          </div>
          <p className="text-xs text-ink-3 tabular-nums">
            {t("asOf", { at: dateTime(headline.generatedAt, locale) })}
            {headline.smallSample ? ` · ${t("sample", { min: SMALL_SAMPLE_ORGANIZATIONS })}` : ""}
          </p>
        </>
      )}
    </section>
  );
}
