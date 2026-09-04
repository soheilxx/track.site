"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import type { BillingInterval } from "@track-site/catalog";
import { Alert, Badge, Button, Card, cn } from "@track-site/ui";
import { storePlanSelection, type PlanSelection } from "@/components/marketing/pricing/plan-selection";
import { useStoredPlanSelection } from "@/components/marketing/pricing/use-stored-plan-selection";
import { openPortalAction, startCheckoutAction } from "@/server/actions/billing";
import type { ActionState } from "@/server/actions/organization";

const initial: ActionState = { ok: false, error: null };

export interface PlanView {
  id: string;
  name: string;
  /** localised limits + highlights from the tariff catalogue (already resolved on the server) */
  bullets: string[];
  /** formatted catalogue list prices; null for custom-priced plans */
  price: { monthly: string; yearly: string } | null;
  contactSales: boolean;
  hasMonthly: boolean;
  hasYearly: boolean;
}

/**
 * Remembers the plan + billing period handed over from the pricing page (verification callback →
 * onboarding) in this tab, so `/app/billing` can preselect it after the setup. Renders nothing.
 */
export function PlanSelectionMemo({ selection }: { selection: PlanSelection | null }) {
  const planId = selection?.planId ?? null;
  const interval = selection?.interval ?? null;
  useEffect(() => {
    if (planId && interval) storePlanSelection({ planId, interval });
  }, [planId, interval]);
  return null;
}

export interface PlanCardsProps {
  plans: PlanView[];
  currentPlanId: string;
  status: string;
  hasCustomer: boolean;
  /** Plan + interval from `?plan=&interval=` (validated on the server); falls back to the selection remembered in this tab. */
  preselected?: PlanSelection | null;
}

/**
 * Plan cards with the monthly/yearly toggle and the checkout actions. A selection handed over from
 * the pricing page preselects the interval and marks that plan's card (its CTA is the primary one,
 * the others step back), so the customer lands on what they picked without choosing again.
 */
export function PlanCards({ plans, currentPlanId, status, hasCustomer, preselected = null }: PlanCardsProps) {
  const t = useTranslations("app.billing");
  const stored = useStoredPlanSelection();
  // the query string wins; without it the selection the onboarding remembered in this tab applies
  const selection = preselected ?? stored;
  // an explicit toggle choice wins over the handed-over interval; monthly is the default (supplement §5)
  const [chosenInterval, setChosenInterval] = useState<BillingInterval | null>(null);
  const interval: BillingInterval = chosenInterval ?? selection?.interval ?? "monthly";
  const [state, action, pending] = useActionState(startCheckoutAction, initial);
  const [portalState, portal, portalPending] = useActionState(openPortalAction, initial);
  return (
    <div className="space-y-4">
      {state.error ? <Alert tone="bad">{t(`errors.${state.error}`)}</Alert> : null}
      {portalState.error ? <Alert tone="bad">{t(`errors.${portalState.error}`)}</Alert> : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-full bg-surface-2 p-1 text-xs">
          {(["monthly", "yearly"] as const).map((i) => (
            <button key={i} type="button" onClick={() => setChosenInterval(i)} className={`rounded-full px-3 py-1 ${interval === i ? "bg-surface text-ink shadow-sm" : "text-ink-3"}`} aria-pressed={interval === i}>
              {t(i)}
            </button>
          ))}
        </div>
        {hasCustomer ? (
          <form action={portal}>
            <Button type="submit" variant="secondary" size="sm" loading={portalPending}>
              {t("portal")}
            </Button>
          </form>
        ) : null}
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((p) => {
          const current = p.id === currentPlanId && status !== "none";
          const chosen = !current && !p.contactSales && selection?.planId === p.id;
          return (
            <Card key={p.id} className={cn("flex flex-col p-4", current && "border-primary", chosen && "border-primary ring-1 ring-primary/20")} data-plan={p.id} data-preselected={chosen ? "true" : undefined}>
              <div className="flex items-center justify-between">
                <p className="font-semibold text-ink">{p.name}</p>
                {current ? <Badge tone="ok">{t("current")}</Badge> : null}
              </div>
              {p.price ? (
                <p className="mt-2 text-sm text-ink">
                  <span className="font-display text-xl font-semibold">{interval === "monthly" ? p.price.monthly : p.price.yearly}</span> <span className="text-xs text-ink-3">{t(interval)}</span>
                </p>
              ) : null}
              <ul className="mt-3 space-y-1 text-xs text-ink-2">
                {p.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
              <div className="mt-auto pt-4">
                {p.contactSales ? (
                  <Link href="/contact?topic=enterprise" className="text-sm font-medium text-primary hover:underline">
                    {t("contactSales")}
                  </Link>
                ) : current ? null : (
                  <form action={action}>
                    <input type="hidden" name="planId" value={p.id} />
                    <input type="hidden" name="interval" value={interval} />
                    <Button type="submit" size="sm" variant={selection && !chosen ? "secondary" : "primary"} loading={pending} disabled={interval === "monthly" ? !p.hasMonthly : !p.hasYearly}>
                      {status === "none" ? t("choose") : t("switch")}
                    </Button>
                  </form>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
