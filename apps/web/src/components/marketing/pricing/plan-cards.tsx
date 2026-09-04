"use client";

import { Check } from "lucide-react";
import { Badge, Card, buttonVariants, cn } from "@track-site/ui";
import { Link } from "@/i18n/navigation";
import type { PricingCopy } from "@/lib/marketing-copy/types";
import type { PublicPlan } from "@/server/pricing";
import { useBillingInterval } from "./interval";
import { fill, formatAmount, formatInteger, signupHref } from "./pricing-helpers";

export interface PlanCardsProps {
  locale: string;
  /** the three paid plans in display order (Enterprise has its own panel) */
  plans: PublicPlan[];
  copy: PricingCopy["plan"];
  trial: { planId: string; days: number };
}

/**
 * Three generous, comparable main cards (supplement §5): audience, price for the selected interval,
 * CTA, the central event limit with the other hard limits, then at most six purchase-deciding
 * highlights (exactly one localised list per plan). Growth is subtly highlighted as recommended.
 */
export function PlanCards({ locale, plans, copy, trial }: PlanCardsProps) {
  const { interval } = useBillingInterval();
  return (
    <ul className="grid gap-6 lg:grid-cols-3">
      {plans.map((p) => (
        <li key={p.id} className="flex">
          <PlanCard plan={p} locale={locale} copy={copy} interval={interval} trial={trial} />
        </li>
      ))}
    </ul>
  );
}

function PlanCard({ plan: p, locale, copy, interval, trial }: { plan: PublicPlan; locale: string; copy: PricingCopy["plan"]; interval: "monthly" | "yearly"; trial: { planId: string; days: number } }) {
  const price = interval === "monthly" ? p.monthly : p.yearly;
  const headingId = `plan-${p.id}-title`;
  const retention = p.limits.retentionMonths != null ? fill(copy.months, { n: formatInteger(p.limits.retentionMonths, locale) }) : p.limits.retentionDays != null ? fill(copy.days, { n: formatInteger(p.limits.retentionDays, locale) }) : "–";
  const team = p.limits.teamMembers == null ? copy.unlimited : formatInteger(p.limits.teamMembers, locale);
  const sites = p.limits.sites == null ? "–" : formatInteger(p.limits.sites, locale);
  return (
    <Card variant="raised" className={cn("relative flex w-full flex-col p-6 sm:p-8", p.recommended && "border-primary shadow-pop ring-1 ring-primary/20")} data-plan={p.id}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={headingId} className="font-display text-h3 font-semibold text-ink">
            {p.name}
          </h2>
          <p className="mt-1 text-small text-ink-3">{p.audience}</p>
        </div>
        {p.recommended ? <Badge tone="primary">{copy.recommended}</Badge> : null}
      </div>

      <div className="mt-6 min-h-[6.25rem]" data-interval={interval}>
        {price ? (
          <>
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-display text-4xl font-bold tracking-tight text-ink tabular-nums">{formatAmount(price.amount, price.currency, locale)}</span>
              <span className="text-small text-ink-3">{interval === "monthly" ? copy.perMonth : copy.perYear}</span>
            </p>
            <p className="mt-2 text-small text-ink-3">
              {interval === "monthly" || !p.yearly
                ? copy.billedMonthly
                : [fill(copy.billedYearly, { total: formatAmount(p.yearly.amount, p.yearly.currency, locale) }), fill(copy.equivalent, { monthly: formatAmount(p.yearly.monthlyEquivalent, p.yearly.currency, locale, 2) }), p.yearly.instalments != null ? fill(copy.instalments, { n: formatInteger(p.yearly.instalments, locale) }) : null]
                    .filter(Boolean)
                    .join(" · ")}
            </p>
          </>
        ) : null}
      </div>

      <Link href={signupHref(p.id, interval)} className={cn(buttonVariants({ variant: p.recommended ? "primary" : "secondary", size: "lg" }), "mt-6 w-full")}>
        {fill(copy.choose, { plan: p.name })}
      </Link>
      <p className="mt-2 min-h-5 text-center text-micro text-ink-3">{p.id === trial.planId ? fill(copy.trialHint, { days: formatInteger(trial.days, locale) }) : null}</p>

      <div className="mt-8 border-t border-line pt-6">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-display text-2xl font-semibold text-ink tabular-nums">{p.limits.eventsPerMonth == null ? "–" : formatInteger(p.limits.eventsPerMonth, locale)}</span>
          <span className="text-small text-ink-3">{copy.eventsLabel}</span>
        </p>
        <dl className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(5.5rem,1fr))] gap-3 text-small">
          <div className="min-w-0">
            <dt className="text-ink-3">{copy.sites}</dt>
            <dd className="mt-0.5 font-medium text-ink tabular-nums">{sites}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-ink-3">{copy.team}</dt>
            <dd className="mt-0.5 font-medium text-ink tabular-nums">{team}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-ink-3">{copy.retention}</dt>
            <dd className="mt-0.5 font-medium text-ink tabular-nums">{retention}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-6">
        {p.inherits ? <p className="text-micro font-semibold tracking-wide text-ink-3 uppercase">{p.inherits}</p> : null}
        <ul className={cn("space-y-2 text-small text-ink-2", p.inherits && "mt-3")} aria-label={fill(copy.listLabel, { plan: p.name })}>
          {p.highlights.slice(0, 6).map((h) => (
            <li key={h} className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" strokeWidth={2.5} />
              <span>{h}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-auto pt-6 text-micro text-ink-3">{p.overage ? fill(copy.overageHint, { price: formatAmount(p.overage.price.amount, p.overage.price.currency, locale), events: formatInteger(p.overage.events, locale) }) : null}</p>
    </Card>
  );
}
