import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { USAGE_WARNING_THRESHOLDS, findPlan } from "@track-site/catalog";
import { can } from "@track-site/core";
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle, StatCard, Status, TBody, Table, Td, Th, THead, Tr, buttonVariants } from "@track-site/ui";
import { PlanCards, type PlanView } from "@/components/app/billing";
import { count } from "@/components/app/billing/format";
import { BillingPageHeader } from "@/components/app/billing/page-header";
import { planSelectionFromSearchParams } from "@/components/marketing/pricing/plan-selection";
import { billingOverview, priceIdFor } from "@/server/billing";
import { env } from "@/env";
import { formatCents, formatDate } from "@/lib/format";
import { planLimits } from "@/server/entitlements";
import { planBullets, publicUsagePolicy } from "@/server/pricing";
import { requireOrgContext, withOrg } from "@/server/session";
import { usageGuard } from "@/server/usage";

export const dynamic = "force-dynamic";

/** Plan price in whole euros in the user's locale (`lib/format.ts`, one BCP 47 tag per app locale). */
function money(cents: number, currency: string, locale: string): string {
  return formatCents(cents, locale, { currency, minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/**
 * Billing overview: plan and subscription state, this period's billable events with the cost guard's
 * forecast and threshold state, the plan cards with the checkout / portal actions (Stripe), and the usage
 * history per period. The Usage & Cost Guard lives at /app/billing/usage.
 */
export default async function BillingPage({ searchParams }: { searchParams: Promise<{ checkout?: string; plan?: string; interval?: string }> }) {
  const q = await searchParams;
  const ctx = await requireOrgContext("billing.read");
  const t = await getTranslations("app.billing");
  const tu = await getTranslations("billingUsage");
  const locale = await getLocale();
  const [{ plans, subscription, usage, currentPeriod }, guard] = await Promise.all([billingOverview(ctx.organization.id), planLimits(ctx).then((plan) => withOrg(ctx, (tx) => usageGuard(tx, ctx.organization.id, plan)))]);
  const stripeReady = Boolean(env().STRIPE_SECRET_KEY);
  const currentPlanId = subscription?.planId ?? "starter";
  const limit = guard.plan.limit;
  const billable = guard.current.billable;
  const pct = limit != null && limit > 0 ? Math.round((billable / limit) * 100) : null;
  const [warn70, warn90, warn100] = USAGE_WARNING_THRESHOLDS;
  const policyLabel = publicUsagePolicy(locale).policies.find((p) => p.id === guard.policy.policy)?.label ?? guard.policy.policy;
  const reached = guard.thresholds?.filter((th) => th.reached).length ?? 0;
  const views: PlanView[] = plans
    .filter((p) => p.isPublic)
    .map((p) => {
      const catalog = findPlan(p.id);
      return {
        id: p.id,
        name: p.name,
        // catalogue plans render their localised bullets; a legacy row falls back to its stored feature strings
        bullets: planBullets(p.id, locale) ?? p.features,
        price: catalog?.price ? { monthly: money(catalog.price.monthlyCents, catalog.price.currency, locale), yearly: money(catalog.price.yearlyCents, catalog.price.currency, locale) } : null,
        contactSales: p.contactSales,
        hasMonthly: Boolean(priceIdFor(p, "monthly")),
        hasYearly: Boolean(priceIdFor(p, "yearly")),
      };
    });
  const status = subscription?.status ?? "none";
  return (
    <div className="space-y-6">
      <BillingPageHeader title={t("title")} description={t("intro")} />
      {q.checkout === "success" ? <Alert tone="ok">{t("checkoutSuccess")}</Alert> : q.checkout === "cancelled" ? <Alert tone="info">{t("checkoutCancelled")}</Alert> : null}
      {!stripeReady ? <Alert tone="warn">{t("stripeMissing")}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("plan")} value={plans.find((p) => p.id === currentPlanId)?.name ?? findPlan(currentPlanId)?.name ?? currentPlanId} hint={<Badge tone={status === "active" || status === "trialing" ? "ok" : status === "past_due" ? "warn" : "neutral"}>{tu(`overview.status.${status}`)}</Badge>} />
        <StatCard label={t("usage", { period: currentPeriod })} value={count(billable, locale)} hint={limit != null && pct != null ? t("ofLimit", { limit: count(limit, locale), pct }) : tu("overview.guard.noLimit")} tone={pct == null ? "neutral" : pct >= warn100 ? "bad" : pct >= warn90 ? "warn" : pct >= warn70 ? "warn" : "neutral"} />
        <StatCard label={t("periodEnd")} value={subscription?.currentPeriodEnd ? formatDate(subscription.currentPeriodEnd, locale, "short") : "—"} hint={subscription?.cancelAt ? t("cancelsAt", { date: formatDate(subscription.cancelAt, locale, "short") }) : undefined} />
        <StatCard label={t("grace")} value={subscription?.graceUntil ? formatDate(subscription.graceUntil, locale, "short") : "—"} tone={subscription?.graceUntil ? "warn" : "neutral"} />
      </div>

      <section aria-labelledby="billing-guard-title">
        <Card variant="flat" className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 id="billing-guard-title" className="text-base font-semibold text-ink">
              {tu("overview.guard.title")}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-ink-3">{tu("overview.guard.text")}</p>
            <dl className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
              <div>
                <dt className="inline text-ink-3">{tu("overview.guard.policy")}: </dt>
                <dd className="inline font-medium text-ink">{policyLabel}</dd>
              </div>
              <div>
                <dt className="inline text-ink-3">{tu("overview.guard.forecast")}: </dt>
                <dd className="inline font-medium text-ink tabular-nums">
                  {count(guard.forecast.projected, locale)}
                  {guard.forecast.basis === "none" ? <span className="ml-1 font-normal text-ink-3">({tu("overview.guard.forecastNoBasis")})</span> : null}
                </dd>
              </div>
              <div>
                <dt className="sr-only">{tu("overview.guard.title")}</dt>
                <dd>
                  {guard.current.hardLimitHitAt ? (
                    <Status tone="bad" indicator="icon">
                      {tu("overview.guard.paused")}
                    </Status>
                  ) : guard.thresholds ? (
                    <Status tone={reached >= 3 ? "bad" : reached >= 1 ? "warn" : "ok"} indicator="icon">
                      {tu("overview.guard.thresholds", { reached, total: guard.thresholds.length })}
                    </Status>
                  ) : (
                    <Status tone="neutral">{tu("overview.guard.noLimit")}</Status>
                  )}
                </dd>
              </div>
            </dl>
          </div>
          <Link href="/app/billing/usage" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            {tu("overview.guard.open")} <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Card>
      </section>

      <section id="plans" aria-labelledby="billing-plans-title" className="space-y-4 scroll-mt-6">
        <h2 id="billing-plans-title" className="text-base font-semibold text-ink">
          {tu("overview.plans")}
        </h2>
        {can(ctx.role, "billing.manage") ? <PlanCards plans={views} currentPlanId={currentPlanId} status={status} hasCustomer={Boolean(subscription?.stripeCustomerId)} preselected={planSelectionFromSearchParams(q)} /> : <p className="text-sm text-ink-3">{t("readOnly")}</p>}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>{t("history")}</CardTitle>
        </CardHeader>
        <CardContent>
          {usage.length === 0 ? (
            <p className="text-sm text-ink-3">{t("noUsage")}</p>
          ) : (
            <Table caption={tu("overview.history.caption")}>
              <THead>
                <Tr>
                  <Th>{t("period")}</Th>
                  <Th className="text-right">{t("accepted")}</Th>
                  <Th className="text-right">{t("billable")}</Th>
                  <Th className="text-right">{t("dropped")}</Th>
                  <Th className="text-right">{t("dedup")}</Th>
                  <Th className="text-right">{t("limit")}</Th>
                </Tr>
              </THead>
              <TBody>
                {usage.map((u) => (
                  <Tr key={u.id}>
                    <Td label={t("period")} className="font-mono text-xs">
                      {u.periodKey}
                    </Td>
                    <Td label={t("accepted")} numeric>
                      {count(u.acceptedEvents, locale)}
                    </Td>
                    <Td label={t("billable")} numeric className="font-medium text-ink">
                      {count(u.billableEvents, locale)}
                    </Td>
                    <Td label={t("dropped")} numeric className="text-ink-3">
                      {count(u.droppedEvents, locale)}
                    </Td>
                    <Td label={t("dedup")} numeric className="text-ink-3">
                      {count(u.deduplicatedEvents, locale)}
                    </Td>
                    <Td label={t("limit")} numeric className="text-ink-3">
                      {u.limitEvents != null ? count(u.limitEvents, locale) : "—"}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
