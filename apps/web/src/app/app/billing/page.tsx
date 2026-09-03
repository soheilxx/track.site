import { getTranslations } from "next-intl/server";
import { can } from "@track-site/core";
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle, StatCard } from "@track-site/ui";
import { PlanCards, type PlanView } from "@/components/app/billing";
import { billingOverview, priceIdFor } from "@/server/billing";
import { env } from "@/env";
import { requireOrgContext } from "@/server/session";

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const q = await searchParams;
  const ctx = await requireOrgContext("billing.read");
  const t = await getTranslations("app.billing");
  const { plans, subscription, usage, currentPeriod } = await billingOverview(ctx.organization.id);
  const stripeReady = Boolean(env().STRIPE_SECRET_KEY);
  const current = usage.find((u) => u.periodKey === currentPeriod) ?? null;
  const limit = current?.limitEvents ?? plans.find((p) => p.id === (subscription?.planId ?? "starter"))?.limits.eventsPerMonth ?? null;
  const pct = limit && current ? Math.min(100, Math.round((current.billableEvents / limit) * 100)) : 0;
  const views: PlanView[] = plans.filter((p) => p.isPublic).map((p) => ({ id: p.id, name: p.name, limits: p.limits, features: p.features, contactSales: p.contactSales, hasMonthly: Boolean(priceIdFor(p, "monthly")), hasYearly: Boolean(priceIdFor(p, "yearly")) }));
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">{t("title")}</h1>
        <p className="mt-1 text-sm text-ink-3">{t("intro")}</p>
      </div>
      {q.checkout === "success" ? <Alert tone="ok">{t("checkoutSuccess")}</Alert> : q.checkout === "cancelled" ? <Alert tone="info">{t("checkoutCancelled")}</Alert> : null}
      {!stripeReady ? <Alert tone="warn">{t("stripeMissing")}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("plan")} value={plans.find((p) => p.id === (subscription?.planId ?? "starter"))?.name ?? "Starter"} hint={<Badge tone={subscription?.status === "active" || subscription?.status === "trialing" ? "ok" : subscription?.status === "past_due" ? "warn" : "neutral"}>{subscription?.status ?? "none"}</Badge>} />
        <StatCard label={t("usage", { period: currentPeriod })} value={current?.billableEvents.toLocaleString() ?? "0"} hint={limit ? t("ofLimit", { limit: limit.toLocaleString(), pct }) : undefined} tone={pct >= 100 ? "bad" : pct >= 80 ? "warn" : "neutral"} />
        <StatCard label={t("periodEnd")} value={subscription?.currentPeriodEnd ? subscription.currentPeriodEnd.toLocaleDateString() : "—"} hint={subscription?.cancelAt ? t("cancelsAt", { date: subscription.cancelAt.toLocaleDateString() }) : undefined} />
        <StatCard label={t("grace")} value={subscription?.graceUntil ? subscription.graceUntil.toLocaleDateString() : "—"} tone={subscription?.graceUntil ? "warn" : "neutral"} />
      </div>
      {can(ctx.role, "billing.manage") ? <PlanCards plans={views} currentPlanId={subscription?.planId ?? "starter"} status={subscription?.status ?? "none"} hasCustomer={Boolean(subscription?.stripeCustomerId)} /> : <p className="text-sm text-ink-3">{t("readOnly")}</p>}
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
