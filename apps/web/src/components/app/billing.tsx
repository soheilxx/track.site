"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Alert, Badge, Button, Card } from "@track-site/ui";
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

export function PlanCards({ plans, currentPlanId, status, hasCustomer }: { plans: PlanView[]; currentPlanId: string; status: string; hasCustomer: boolean }) {
  const t = useTranslations("app.billing");
  const [interval, setInterval] = useState<"monthly" | "yearly">("monthly");
  const [state, action, pending] = useActionState(startCheckoutAction, initial);
  const [portalState, portal, portalPending] = useActionState(openPortalAction, initial);
  return (
    <div className="space-y-4">
      {state.error ? <Alert tone="bad">{t(`errors.${state.error}`)}</Alert> : null}
      {portalState.error ? <Alert tone="bad">{t(`errors.${portalState.error}`)}</Alert> : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-full bg-surface-2 p-1 text-xs">
          {(["monthly", "yearly"] as const).map((i) => (
            <button key={i} type="button" onClick={() => setInterval(i)} className={`rounded-full px-3 py-1 ${interval === i ? "bg-surface text-ink shadow-sm" : "text-ink-3"}`} aria-pressed={interval === i}>
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
          return (
            <Card key={p.id} className={`flex flex-col p-4 ${current ? "border-primary" : ""}`}>
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
                    <Button type="submit" size="sm" loading={pending} disabled={interval === "monthly" ? !p.hasMonthly : !p.hasYearly}>
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
