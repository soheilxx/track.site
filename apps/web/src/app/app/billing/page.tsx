import { getLocale, getTranslations } from "next-intl/server";
import { USAGE_WARNING_THRESHOLDS, findPlan } from "@track-site/catalog";
import { can } from "@track-site/core";
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle, StatCard } from "@track-site/ui";
import { PlanCards, type PlanView } from "@/components/app/billing";
import { planSelectionFromSearchParams } from "@/components/marketing/pricing/plan-selection";
import { billingOverview, priceIdFor } from "@/server/billing";
import { env } from "@/env";
import { formatCents } from "@/lib/format";
import { planBullets } from "@/server/pricing";
import { requireOrgContext } from "@/server/session";

/** Plan price in whole euros in the user's locale (`lib/format.ts`, one BCP 47 tag per app locale). */
function money(cents: number, currency: string, locale: string): string {
  return formatCents(cents, locale, { currency, minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ checkout?: string; plan?: string; interval?: string }> }) {
  const q = await searchParams;
  const ctx = await requireOrgContext("billing.read");
  const t = await getTranslations("app.billing");
  const locale = await getLocale();
  const { plans, subscription, usage, currentPeriod } = await billingOverview(ctx.organization.id);
  const stripeReady = Boolean(env().STRIPE_SECRET_KEY);
  const current = usage.find((u) => u.periodKey === currentPeriod) ?? null;
  const currentPlanId = subscription?.planId ?? "starter";
  // the limit comes from the usage period the worker stamped, else the plan row (synced from the catalogue); null = no fixed cap
  const limit = current?.limitEvents ?? plans.find((p) => p.id === currentPlanId)?.limits.eventsPerMonth ?? null;
  const pct = limit && current ? Math.min(100, Math.round((current.billableEvents / limit) * 100)) : 0;
  const [warn70, , warn100] = USAGE_WARNING_THRESHOLDS;
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
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">{t("title")}</h1>
        <p className="mt-1 text-sm text-ink-3">{t("intro")}</p>
      </div>
      {q.checkout === "success" ? <Alert tone="ok">{t("checkoutSuccess")}</Alert> : q.checkout === "cancelled" ? <Alert tone="info">{t("checkoutCancelled")}</Alert> : null}
      {!stripeReady ? <Alert tone="warn">{t("stripeMissing")}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("plan")} value={plans.find((p) => p.id === currentPlanId)?.name ?? findPlan(currentPlanId)?.name ?? currentPlanId} hint={<Badge tone={subscription?.status === "active" || subscription?.status === "trialing" ? "ok" : subscription?.status === "past_due" ? "warn" : "neutral"}>{subscription?.status ?? "none"}</Badge>} />
        <StatCard label={t("usage", { period: currentPeriod })} value={current?.billableEvents.toLocaleString() ?? "0"} hint={limit ? t("ofLimit", { limit: limit.toLocaleString(), pct }) : undefined} tone={pct >= warn100 ? "bad" : pct >= warn70 ? "warn" : "neutral"} />
        <StatCard label={t("periodEnd")} value={subscription?.currentPeriodEnd ? subscription.currentPeriodEnd.toLocaleDateString() : "—"} hint={subscription?.cancelAt ? t("cancelsAt", { date: subscription.cancelAt.toLocaleDateString() }) : undefined} />
        <StatCard label={t("grace")} value={subscription?.graceUntil ? subscription.graceUntil.toLocaleDateString() : "—"} tone={subscription?.graceUntil ? "warn" : "neutral"} />
      </div>
      {can(ctx.role, "billing.manage") ? <PlanCards plans={views} currentPlanId={currentPlanId} status={subscription?.status ?? "none"} hasCustomer={Boolean(subscription?.stripeCustomerId)} preselected={planSelectionFromSearchParams(q)} /> : <p className="text-sm text-ink-3">{t("readOnly")}</p>}
      <Card>
        <CardHeader>
          <CardTitle>{t("history")}</CardTitle>
        </CardHeader>
        <CardContent>
          {usage.length === 0 ? (
            <p className="text-sm text-ink-3">{t("noUsage")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-ink-3">
                <tr>
                  <th className="py-1 pr-3">{t("period")}</th>
                  <th className="py-1 pr-3">{t("accepted")}</th>
                  <th className="py-1 pr-3">{t("billable")}</th>
                  <th className="py-1 pr-3">{t("dropped")}</th>
                  <th className="py-1 pr-3">{t("dedup")}</th>
                  <th className="py-1 pr-3">{t("limit")}</th>
                </tr>
              </thead>
              <tbody>
                {usage.map((u) => (
                  <tr key={u.id} className="border-t border-line">
                    <td className="py-1.5 pr-3 font-mono text-xs">{u.periodKey}</td>
                    <td className="py-1.5 pr-3">{u.acceptedEvents.toLocaleString()}</td>
                    <td className="py-1.5 pr-3">{u.billableEvents.toLocaleString()}</td>
                    <td className="py-1.5 pr-3 text-ink-3">{u.droppedEvents.toLocaleString()}</td>
                    <td className="py-1.5 pr-3 text-ink-3">{u.deduplicatedEvents.toLocaleString()}</td>
                    <td className="py-1.5 pr-3 text-ink-3">{u.limitEvents?.toLocaleString() ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
