import { getTranslations } from "next-intl/server";
import { StatCard } from "@track-site/ui";
import type { GrowthView } from "@/server/ops/growth";
import { count, percent, signedDelta } from "./format";

/** Organisations, new organisations (30 d, with the previous window), active 7 d / 30 d and paying organisations. */
export async function GrowthKpis({ view, locale }: { view: GrowthView; locale: string }) {
  const t = await getTranslations("opsGrowth.kpis");
  const active7 = view.active.windows.find((w) => w.days === 7);
  const active30 = view.active.windows.find((w) => w.days === 30);
  const paying = view.planMix.paying;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="ops-growth-kpis">
      <StatCard label={t("organizations.label")} value={count(view.totals.organizations, locale)} hint={t("organizations.hint", { count: view.signups.last30.organizations })} />
      <StatCard
        label={t("newOrganizations.label")}
        value={count(view.signups.last30.organizations, locale)}
        hint={t("newOrganizations.hint", { delta: signedDelta(view.signups.last30.organizations, view.signups.previous30.organizations, locale), previous: count(view.signups.previous30.organizations, locale) })}
      />
      <StatCard
        label={t("active.label")}
        value={`${count(active7?.organizations ?? 0, locale)} / ${count(active30?.organizations ?? 0, locale)}`}
        hint={t("active.hint", { share7: percent(active7?.share ?? null, locale), share30: percent(active30?.share ?? null, locale) })}
      />
      <StatCard label={t("paying.label")} value={count(paying, locale)} hint={t("paying.hint", { share: percent(view.totals.organizations > 0 ? paying / view.totals.organizations : null, locale) })} />
    </div>
  );
}
