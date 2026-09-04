import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { can } from "@track-site/core";
import { Alert, Badge, EmptyState, StatCard, Status, TBody, Table, Td, Th, THead, Tr, buttonVariants } from "@track-site/ui";
import { CostComparison } from "@/components/app/billing/cost-comparison";
import { DailyChart } from "@/components/app/billing/daily-chart";
import { count, formatDateTime, formatDayKey, percent, signedPercent } from "@/components/app/billing/format";
import { OveragePolicyForm } from "@/components/app/billing/overage-policy-form";
import { BillingPageHeader } from "@/components/app/billing/page-header";
import { UsageMeter } from "@/components/app/billing/usage-meter";
import { formatCents, formatDate } from "@/lib/format";
import { planLimits } from "@/server/entitlements";
import { publicUsagePolicy } from "@/server/pricing";
import { requireOrgContext, withOrg } from "@/server/session";
import { COST_LIMIT_BOUNDS, dayKey, usageGuard } from "@/server/usage";
import { activeSite } from "@/server/workspace";

export const dynamic = "force-dynamic";

/**
 * Usage & Cost Guard (owner supplement §8 module 12): current usage from the ledger and the period
 * counters, the labelled 7-day forecast, overage in packs at list price, unusual load against the
 * 4-week baseline, the 70/90/100 % thresholds with their state, the customer's explicit overage
 * choice and the honest pack-vs-plan comparison. Usage is measured per organization; the active
 * site is only highlighted in the per-site breakdown.
 */
export default async function UsageGuardPage() {
  const ctx = await requireOrgContext("billing.read");
  const t = await getTranslations("billingUsage");
  const locale = await getLocale();
  const [workspace, guard] = await Promise.all([activeSite(ctx), planLimits(ctx).then((plan) => withOrg(ctx, (tx) => usageGuard(tx, ctx.organization.id, plan)))]);
  const canManage = can(ctx.role, "billing.manage");
  const rules = publicUsagePolicy(locale);
  const { plan, current, forecast, load, thresholds, overage, forecastOverage, policy, comparison, period } = guard;
  const limit = plan.limit;
  const policyLabel = rules.policies.find((p) => p.id === policy.policy)?.label ?? policy.policy;
  const hasData = current.source !== "none";
  const periodEnd = new Date(period.end.getTime() - 1);
  const usedRatio = limit != null && limit > 0 ? current.billable / limit : null;

  const header = (
    <BillingPageHeader
      title={t("title")}
      description={t("intro")}
      context={
        <>
          <Badge tone="primary">{t("context.plan", { name: plan.name })}</Badge>
          <span className="tabular-nums">{t("context.period", { from: formatDate(period.start, locale, "short"), to: formatDate(periodEnd, locale, "short") })}</span>
          <span className="text-ink-3">{current.updatedAt ? t("context.updated", { at: formatDateTime(current.updatedAt, locale) }) : t("context.noCounters")}</span>
          {guard.ledger.latestAt ? <span className="text-ink-3">{t("context.ledger", { at: formatDateTime(guard.ledger.latestAt, locale) })}</span> : null}
          {guard.ledger.stale ? (
            <Status tone="warn" indicator="icon">
              {t("context.stale")}
            </Status>
          ) : null}
        </>
      }
      actions={
        <Link href="/app/billing#plans" className={buttonVariants({ variant: "secondary", size: "sm" })}>
          {t("comparePlans")}
        </Link>
      }
    />
  );

  const policyForm = <OveragePolicyForm state={policy} limit={limit} pack={plan.pack ? { events: plan.pack.events, priceCents: plan.pack.priceCents } : null} canManage={canManage} bounds={COST_LIMIT_BOUNDS} />;

  const rulesSection = (
    <section aria-labelledby="usage-rules-title" className="rounded-[var(--radius-card)] border border-line bg-surface-2 p-5">
      <h2 id="usage-rules-title" className="text-base font-semibold text-ink">
        {t("rules.title")}
      </h2>
      <p className="mt-1 text-sm text-ink-2">{t("rules.intro")}</p>
      <ul className="mt-2 grid gap-1 text-sm text-ink-2 sm:grid-cols-2">
        {rules.notCounted.map((reason) => (
          <li key={reason} className="flex gap-2">
            <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-ink-3" />
            {reason}
          </li>
        ))}
      </ul>
    </section>
  );

  if (!hasData) {
    return (
      <div className="space-y-6">
        {header}
        {limit == null ? (
          <Alert tone="info" title={t("alerts.noLimitTitle")}>
            {t("alerts.noLimitText")}
          </Alert>
        ) : null}
        <EmptyState
          title={t("empty.title")}
          description={t("empty.text", { period: period.key })}
          action={
            <Link href="/app/events" className={buttonVariants()}>
              {t("empty.action")}
            </Link>
          }
        />
        {policyForm}
        {rulesSection}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      {current.hardLimitHitAt ? (
        <Alert tone="bad" title={t("alerts.hardLimitTitle")}>
          {t("alerts.hardLimitText", { at: formatDateTime(current.hardLimitHitAt, locale), policy: policyLabel })}
        </Alert>
      ) : limit != null && current.billable >= limit ? (
        <Alert tone="warn" title={t("alerts.softLimitTitle")}>
          {policy.effective === "allow"
            ? t("alerts.softLimitAllow")
            : policy.effective === "cost_limit"
              ? t("alerts.softLimitCostLimit", { limit: formatCents(policy.costLimitCents ?? 0, locale), pauseAt: count(policy.pauseAtEvents ?? limit, locale) })
              : t("alerts.softLimitPause", { pauseAt: count(policy.pauseAtEvents ?? limit, locale), grace: policy.gracePercent })}
        </Alert>
      ) : null}
      {guard.ledger.stale && current.updatedAt ? (
        <Alert tone="info" title={t("alerts.staleTitle")}>
          {t("alerts.staleText", { updated: formatDateTime(current.updatedAt, locale) })}
        </Alert>
      ) : null}
      {current.source === "ledger" ? (
        <Alert tone="info" title={t("alerts.ledgerOnlyTitle")}>
          {t("alerts.ledgerOnlyText")}
        </Alert>
      ) : null}
      {limit == null ? (
        <Alert tone="info" title={t("alerts.noLimitTitle")}>
          {t("alerts.noLimitText")}
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("stats.billable.label")}
          value={count(current.billable, locale)}
          hint={usedRatio != null ? t("stats.billable.ofLimit", { pct: percent(usedRatio, locale), limit: count(limit!, locale) }) : t("stats.billable.noLimit")}
          tone={usedRatio == null ? "neutral" : usedRatio >= 1 ? "bad" : usedRatio >= 0.9 ? "warn" : "neutral"}
        >
          <p className="text-xs text-ink-3">{current.source === "period" ? t("stats.billable.sourcePeriod") : t("stats.billable.sourceLedger")}</p>
        </StatCard>
        <StatCard
          label={t("stats.forecast.label")}
          value={count(forecast.projected, locale)}
          hint={forecast.basis === "ledger" ? t("stats.forecast.hint", { from: formatDayKey(forecast.window.from, locale), to: formatDayKey(forecast.window.to, locale), rate: count(Math.round(forecast.dailyRate), locale) }) : t("stats.forecast.noBasis")}
          tone={limit != null && forecast.projected >= limit ? "warn" : "neutral"}
        >
          {limit != null ? <p className="text-xs text-ink-3">{forecast.projected > limit ? t("stats.forecast.above", { events: count(forecast.projected - limit, locale) }) : t("stats.forecast.ofLimit", { pct: percent(forecast.projected / limit, locale) })}</p> : null}
        </StatCard>
        <StatCard
          label={t("stats.overage.label")}
          value={overage.contractual ? "—" : overage.packs > 0 ? formatCents(overage.costCents, locale) : t("stats.overage.none")}
          hint={
            overage.contractual
              ? t("stats.overage.contractual")
              : overage.events > 0 && overage.pack
                ? t("stats.overage.packs", { packs: count(overage.packs, locale), packEvents: count(overage.pack.events, locale), cost: formatCents(overage.costCents, locale) })
                : limit == null
                  ? t("stats.billable.noLimit")
                  : forecastOverage.packs > 0
                    ? t("stats.overage.forecast", { packs: count(forecastOverage.packs, locale), cost: formatCents(forecastOverage.costCents, locale) })
                    : t("stats.overage.forecastNone")
          }
          tone={overage.events > 0 ? "warn" : "neutral"}
        >
          {overage.events > 0 ? <p className="text-xs text-ink-3">{t("stats.overage.events", { events: count(overage.events, locale) })}</p> : null}
        </StatCard>
        <StatCard
          label={t("stats.load.label")}
          value={t(`stats.load.${load.verdict}`)}
          hint={
            load.deviation != null && load.baselineRate != null
              ? t("stats.load.deviation", { deviation: signedPercent(load.deviation, locale), recent: count(Math.round(load.recentRate), locale), baseline: count(Math.round(load.baselineRate), locale) })
              : t("stats.load.noBaseline", { from: formatDayKey(load.baseline.from, locale), to: formatDayKey(load.baseline.to, locale) })
          }
          tone={load.verdict === "elevated" ? "warn" : load.verdict === "normal" ? "ok" : "neutral"}
        >
          {load.peakDay ? <p className="text-xs text-ink-3">{t("stats.load.peak", { day: formatDayKey(load.peakDay.day, locale), events: count(load.peakDay.events, locale) })}</p> : null}
        </StatCard>
      </div>

      {limit != null && thresholds ? <UsageMeter billable={current.billable} limit={limit} thresholds={thresholds} policy={policy} hardLimitHitAt={current.hardLimitHitAt} /> : null}

      <DailyChart daily={guard.daily} recent={forecast.window} baseline={load.baseline} today={dayKey(guard.now)} />

      <div className="grid gap-6 xl:grid-cols-2">
        {policyForm}
        {limit != null ? <CostComparison comparison={comparison} planName={plan.name} basis={forecast.basis} /> : null}
      </div>

      <section aria-labelledby="usage-sites-title" className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
        <h2 id="usage-sites-title" className="text-base font-semibold text-ink">
          {t("sites.title")}
        </h2>
        <p className="mt-1 text-sm text-ink-3">{t("sites.intro")}</p>
        {guard.sites.length === 0 ? (
          <p className="mt-4 text-sm text-ink-3">{t("sites.empty")}</p>
        ) : (
          <Table caption={t("sites.title")} wrapperClassName="mt-4">
            <THead>
              <Tr>
                <Th>{t("sites.site")}</Th>
                <Th>{t("sites.trackingId")}</Th>
                <Th className="text-right">{t("sites.events")}</Th>
                <Th className="text-right">{t("sites.share")}</Th>
              </Tr>
            </THead>
            <TBody>
              {guard.sites.map((s) => {
                const active = s.siteId === workspace.site?.id;
                return (
                  <Tr key={s.siteId} className={active ? "bg-primary-soft/40" : undefined}>
                    <Td label={t("sites.site")}>
                      <span className="font-medium text-ink">{s.name}</span>
                      {active ? (
                        <Badge tone="primary" className="ml-2">
                          {t("sites.active")}
                        </Badge>
                      ) : null}
                    </Td>
                    <Td label={t("sites.trackingId")} className="font-mono text-xs text-ink-3">
                      {s.trackingId}
                    </Td>
                    <Td label={t("sites.events")} numeric>
                      {count(s.events, locale)}
                    </Td>
                    <Td label={t("sites.share")} numeric className="text-ink-2">
                      {percent(s.share, locale)}
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        )}
      </section>

      {rulesSection}
    </div>
  );
}
