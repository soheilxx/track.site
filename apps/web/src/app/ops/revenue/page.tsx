import { Download } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Status, buttonVariants } from "@track-site/ui";
import { OpsForbidden, OpsPageHeader, opsPageMetadata } from "@/components/ops/shell";
import { CancellationsSection, InvoicesSection, MethodNotes, OverageSection, PastDueSection, PlanRevenueSection, RevenueKpis, TopUsageSection, TrialsSection, dateTime } from "@/components/ops/revenue";
import { env } from "@/env";
import { stripe } from "@/server/billing";
import { checkPlatform, withPlatform } from "@/server/ops/platform";
import { listStripeInvoices, loadRevenueSnapshot, revenueView, stripeModeFromKey } from "@/server/ops/revenue";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return opsPageMetadata("revenue");
}

const INVOICE_LIMIT = 20;

/**
 * Revenue & billing (docs/17, task O4; admin-only). MRR/ARR by plan from active subscriptions × catalogue
 * list prices, trials, failed payments, cancellations, overage exposure, top organisations by usage,
 * the Stripe invoice list (or the honest "not permitted with the current key" state) and CSV exports.
 * Aggregates and metadata only — organisation name, slug, plan and Stripe ids; never members, event data
 * or end-user data. Reads run as `tracksite_ops` through `withPlatform`; the exports are audited.
 */
export default async function OpsRevenuePage() {
  const access = await checkPlatform("PLATFORM_ADMIN");
  if (!access.ok) return <OpsForbidden reason={access.reason} />;
  const ctx = access.ctx;
  const now = new Date();
  const [snapshot, invoices, tOps, t, locale] = await Promise.all([
    withPlatform(ctx, (tx) => loadRevenueSnapshot(tx, now)),
    listStripeInvoices(stripe(), INVOICE_LIMIT),
    getTranslations("ops"),
    getTranslations("opsRevenue"),
    getLocale(),
  ]);
  const view = revenueView(snapshot);
  const stripeKey = env().STRIPE_SECRET_KEY;
  const stripeMode = stripeModeFromKey(stripeKey);
  const exportClass = buttonVariants({ variant: "secondary", size: "sm" });
  return (
    <div className="space-y-8" data-testid="ops-revenue">
      <OpsPageHeader
        title={tOps("pages.revenue.title")}
        intro={tOps("pages.revenue.intro")}
        context={
          <>
            <span className="tabular-nums">{t("context.asOf", { at: dateTime(view.now, locale) })}</span>
            <span className="tabular-nums">{t("context.period", { period: view.periodKey })}</span>
            <span className="text-ink-3">{view.ledger.latestEventAt ? t("context.ledger", { at: dateTime(view.ledger.latestEventAt, locale) }) : t("context.ledgerNone")}</span>
            {view.ledger.failedEvents > 0 ? (
              <Status tone="warn" indicator="icon">
                {t("context.ledgerFailed", { count: view.ledger.failedEvents })}
              </Status>
            ) : null}
            <Status tone={stripeKey ? (stripeMode === "live" ? "info" : "neutral") : "warn"} indicator="dot">
              {t(`context.stripe.${stripeKey ? (stripeMode ?? "unknown") : "none"}`)}
            </Status>
          </>
        }
        actions={
          <>
            <a href="/ops/revenue/export?kind=subscriptions" download className={exportClass} data-testid="ops-revenue-export-subscriptions">
              <Download className="size-4" aria-hidden="true" />
              {t("export.subscriptions")}
            </a>
            <a href="/ops/revenue/export?kind=overage" download className={exportClass} data-testid="ops-revenue-export-overage">
              <Download className="size-4" aria-hidden="true" />
              {t("export.overage")}
            </a>
            <p className="basis-full text-xs text-ink-3 sm:text-right">{t("export.hint")}</p>
          </>
        }
      />

      <RevenueKpis summary={view.summary} locale={locale} />
      <PlanRevenueSection summary={view.summary} locale={locale} />
      <TrialsSection trials={view.trials} locale={locale} stripeMode={stripeMode} />
      <PastDueSection rows={view.pastDue} locale={locale} stripeMode={stripeMode} now={view.now} />
      <CancellationsSection cancellations={view.cancellations} locale={locale} stripeMode={stripeMode} />
      <OverageSection overage={view.overage} locale={locale} />
      <TopUsageSection rows={view.topUsage} periodKey={view.periodKey} locale={locale} />
      <InvoicesSection listing={invoices} customers={view.customers} locale={locale} stripeMode={stripeMode} />
      <MethodNotes />
    </div>
  );
}
