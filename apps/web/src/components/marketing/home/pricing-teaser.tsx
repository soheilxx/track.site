import { ArrowRight } from "lucide-react";
import { TRIAL, labelIn, planById, publicPlanOrder, type Plan } from "@track-site/catalog";
import { Badge, buttonVariants, cn } from "@track-site/ui";
import { Link } from "@/i18n/navigation";
import type { HomeCopy } from "@/lib/marketing-copy/types";
import { fill, plural } from "@/components/marketing/demo/text";
import { HomeSection } from "./section";

function intlLocale(locale: string): string {
  return locale === "de" ? "de-DE" : "en-IE";
}

function money(cents: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(intlLocale(locale), { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
}

function count(n: number, locale: string): string {
  return new Intl.NumberFormat(intlLocale(locale)).format(n);
}

/** Pricing teaser from the tariff catalogue: real list prices and limits, monthly view, one link to the full page. */
export function HomePricingTeaser({ copy, locale }: { copy: HomeCopy; locale: string }) {
  const c = copy.pricing;
  const paid = publicPlanOrder().filter((p): p is Plan & { price: NonNullable<Plan["price"]> } => p.price !== null);
  const enterprise = planById("enterprise");
  const trialPlan = planById(TRIAL.planId);
  return (
    <HomeSection id="pricing" eyebrow={c.eyebrow} title={c.title} text={c.text}>
      <ul className="grid gap-4 md:grid-cols-3">
        {paid.map((plan) => (
          <li key={plan.id} className={cn("flex flex-col rounded-[var(--radius-card)] border bg-surface p-6", plan.recommended ? "border-primary shadow-card" : "border-line")}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-h3 font-semibold text-ink">{plan.name}</h3>
              {plan.recommended ? <Badge tone="primary">{c.recommended}</Badge> : null}
            </div>
            <p className="mt-1 min-h-10 text-small text-ink-3">{labelIn(plan.audience, locale) ?? plan.audience.en}</p>
            <p className="mt-4">
              <span className="font-display text-3xl font-semibold text-ink tabular-nums">{money(plan.price.monthlyCents, plan.price.currency, locale)}</span>
              <span className="ml-1 text-small text-ink-3">{c.perMonth}</span>
            </p>
            <ul className="mt-4 space-y-1.5 text-small text-ink-2">
              {plan.limits.eventsPerMonth != null ? <li>{fill(c.events, { n: count(plan.limits.eventsPerMonth, locale) })}</li> : null}
              {plan.limits.sites != null ? <li>{plural(c.sites, plan.limits.sites, { n: count(plan.limits.sites, locale) })}</li> : null}
            </ul>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface-2 px-6 py-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="text-small font-semibold text-ink">
            {enterprise.name} <span className="font-normal text-ink-3">· {c.custom}</span>
          </p>
          <p className="text-small text-ink-2">{labelIn(enterprise.audience, locale) ?? c.enterpriseText}</p>
        </div>
        <Link href="/contact" className="inline-flex min-h-11 items-center gap-1 text-small font-medium text-primary underline-offset-4 hover:underline">
          {c.contact} <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-small text-ink-3">
          <p>{fill(c.trial, { days: TRIAL.days, plan: trialPlan.name })}</p>
          <p className="mt-1">{c.taxNote}</p>
        </div>
        <Link href="/pricing" className={buttonVariants({ variant: "secondary", size: "lg" })}>
          {c.all} <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </HomeSection>
  );
}
