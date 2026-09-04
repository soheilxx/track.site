import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Alert, Badge, TBody, Table, Td, Th, THead, Tr, buttonVariants } from "@track-site/ui";
import { formatCents } from "@/lib/format";
import type { CostComparison, Forecast } from "@/server/usage";
import { count } from "./format";

/**
 * Honest pack-vs-plan comparison for the forecast volume: the current plan with the packs it would need
 * against every higher public plan, at catalogue list prices for the customer's billing interval. The
 * cheapest option is named; nothing here changes the subscription — the plan cards on the overview do,
 * and only when the customer chooses.
 */
export async function CostComparison({ comparison, planName, basis }: { comparison: CostComparison; planName: string; basis: Forecast["basis"] }) {
  const t = await getTranslations("billingUsage.comparison");
  const locale = await getLocale();
  const period = t(`per.${comparison.interval}`);
  const cheapest = comparison.options.find((o) => o.cheapest) ?? null;
  return (
    <section aria-labelledby="cost-comparison-title" className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
      <h2 id="cost-comparison-title" className="text-base font-semibold text-ink">
        {t("title")}
      </h2>
      <p className="mt-1 text-sm text-ink-3">{basis === "ledger" ? t("intro", { events: count(comparison.eventsPerMonth, locale), period }) : t("introNoBasis", { events: count(comparison.eventsPerMonth, locale), period })}</p>
      {comparison.recommendation === "contractual" ? (
        <Alert tone="info" className="mt-4">
          {t("contractualNote")}
        </Alert>
      ) : comparison.options.length === 0 ? (
        <p className="mt-4 text-sm text-ink-3">{t("none")}</p>
      ) : (
        <>
          <Table caption={t("title")} wrapperClassName="mt-4">
            <THead>
              <Tr>
                <Th>{t("columns.option")}</Th>
                <Th className="text-right">{t("columns.base", { period })}</Th>
                <Th className="text-right">{t("columns.included")}</Th>
                <Th className="text-right">{t("columns.overage")}</Th>
                <Th className="text-right">{t("columns.overageCost", { period })}</Th>
                <Th className="text-right">{t("columns.total", { period })}</Th>
              </Tr>
            </THead>
            <TBody>
              {comparison.options.map((o) => (
                <Tr key={o.planId} data-plan={o.planId} className={o.cheapest ? "bg-primary-soft/40" : undefined}>
                  <Td label={t("columns.option")}>
                    <span className="font-medium text-ink">{o.name}</span>
                    <span className="ml-2 inline-flex flex-wrap gap-1">
                      {o.kind === "current" ? <Badge tone="neutral">{t("current")}</Badge> : null}
                      {o.cheapest ? <Badge tone="primary">{t("cheapest")}</Badge> : null}
                    </span>
                  </Td>
                  <Td label={t("columns.base", { period })} numeric>
                    {formatCents(o.baseCents, locale)}
                  </Td>
                  <Td label={t("columns.included")} numeric>
                    {count(o.includedEventsPerMonth, locale)}
                  </Td>
                  <Td label={t("columns.overage")} numeric className="text-ink-2">
                    {o.overageEventsPerMonth > 0 ? (o.contractual ? t("contractual", { events: count(o.overageEventsPerMonth, locale) }) : t("packs", { events: count(o.overageEventsPerMonth, locale), packs: count(o.packs, locale) })) : t("noOverage")}
                  </Td>
                  <Td label={t("columns.overageCost", { period })} numeric className="text-ink-2">
                    {o.contractual ? "—" : formatCents(o.overageCents, locale)}
                  </Td>
                  <Td label={t("columns.total", { period })} numeric className="font-semibold text-ink">
                    {o.contractual ? "—" : formatCents(o.totalCents, locale)}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-ink-2">
              {comparison.recommendation === "upgrade" && cheapest && comparison.savingsCents != null
                ? t("upgradeHint", { plan: cheapest.name, savings: formatCents(comparison.savingsCents, locale), period })
                : comparison.recommendation === "stay"
                  ? t("stay", { plan: planName })
                  : t("noneCheapest")}{" "}
              <span className="text-ink-3">{t("noSilent")}</span>
            </p>
            <Link href="/app/billing#plans" className={buttonVariants({ variant: "secondary", size: "sm" })}>
              {t("choosePlan")}
            </Link>
          </div>
          <p className="mt-2 text-xs text-ink-3">{t("taxNote")}</p>
        </>
      )}
    </section>
  );
}
