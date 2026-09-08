import { getTranslations } from "next-intl/server";
import { StatCard } from "@track-site/ui";
import type { SubscriptionSummary } from "@/server/ops/revenue";
import { count, money } from "./format";

/** MRR, ARR, paying subscriptions and MRR at risk — list prices from the catalogue, never Stripe amounts. */
export async function RevenueKpis({ summary, locale }: { summary: SubscriptionSummary; locale: string }) {
  const t = await getTranslations("opsRevenue.kpis");
  const priced = summary.paying.total - summary.excluded.custom_price - summary.excluded.unknown_plan - summary.excluded.unknown_interval;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="ops-revenue-kpis">
      <StatCard label={t("mrr.label")} value={money(summary.mrrCents, locale)} hint={t("mrr.hint", { count: priced })} />
      <StatCard label={t("arr.label")} value={money(summary.arrCents, locale)} hint={t("arr.hint")} />
      <StatCard label={t("paying.label")} value={count(summary.paying.total, locale)} hint={t("paying.hint", { monthly: count(summary.paying.monthly, locale), yearly: count(summary.paying.yearly, locale) })} />
      <StatCard label={t("atRisk.label")} value={money(summary.atRisk.mrrCents, locale)} hint={t("atRisk.hint", { count: summary.atRisk.count })} tone={summary.atRisk.count > 0 ? "warn" : "neutral"} />
    </div>
  );
}
