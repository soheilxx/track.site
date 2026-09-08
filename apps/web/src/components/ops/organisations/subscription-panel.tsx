import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Badge, Status } from "@track-site/ui";
import { formatDateTime } from "@/components/app/alerts/format";
import { formatDate, formatNumber } from "@/lib/format";
import type { OrganisationHeader, SubscriptionView } from "@/server/ops/organisations";
import { subscriptionStatusLabel, subscriptionStatusTone } from "./labels";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-3 py-1.5 text-sm">
      <dt className="text-ink-3">{label}</dt>
      <dd className="min-w-0 text-ink">{children}</dd>
    </div>
  );
}

/** Subscription facts from the billing ledger and the organisation settings — no Stripe ids, no invoices (those live in Revenue). */
export async function SubscriptionPanel({
  subscription,
  organization,
  locale,
}: {
  subscription: SubscriptionView;
  organization: OrganisationHeader;
  locale: string;
}) {
  const t = await getTranslations("opsOrganisations.detail.subscription");
  const tc = await getTranslations("opsOrganisations.common");
  const tStatus = await getTranslations("opsOrganisations");
  const limits = subscription.planLimits;
  const dt = (iso: string | null) => (iso ? formatDateTime(iso, locale) : tc("none"));
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* the "no subscription row" note stays outside the <dl>: a definition list may only contain dt/dd groups (axe `definition-list`) */}
      <div>
        {!subscription.exists ? <p className="pb-1.5 text-sm text-ink-3">{t("noRow")}</p> : null}
        <dl className="divide-y divide-line">
          <Row label={t("plan")}>
            <span className="font-medium">{subscription.planName}</span>
          </Row>
          <Row label={t("status")}>
            <Badge tone={subscriptionStatusTone(subscription.status)}>
              {subscriptionStatusLabel(tStatus, subscription.status)}
            </Badge>
          </Row>
          {subscription.exists ? (
            <>
              <Row label={t("interval")}>
                {subscription.interval === "yearly"
                  ? t("yearly")
                  : subscription.interval === "monthly"
                    ? t("monthly")
                    : tc("none")}
              </Row>
              <Row label={t("period")}>
                {subscription.currentPeriodStart && subscription.currentPeriodEnd
                  ? t("periodRange", {
                      from: formatDate(subscription.currentPeriodStart, locale, "short"),
                      to: formatDate(subscription.currentPeriodEnd, locale, "short"),
                    })
                  : tc("none")}
              </Row>
              {subscription.trialEnd ? (
                <Row label={t("trialEnds")}>{dt(subscription.trialEnd)}</Row>
              ) : null}
              {subscription.cancelAt ? (
                <Row label={t("cancelAt")}>{dt(subscription.cancelAt)}</Row>
              ) : null}
              {subscription.canceledAt ? (
                <Row label={t("canceledAt")}>{dt(subscription.canceledAt)}</Row>
              ) : null}
              {subscription.graceUntil ? (
                <Row label={t("graceUntil")}>{dt(subscription.graceUntil)}</Row>
              ) : null}
              <Row label={t("stripe")}>
                <Status tone={subscription.stripeLinked ? "ok" : "neutral"} indicator="icon">
                  {subscription.stripeLinked ? t("linked") : t("notLinked")}
                </Status>
              </Row>
            </>
          ) : null}
          {limits ? (
            <Row label={t("limits")}>
              <ul className="space-y-0.5">
                <li>
                  {limits.sites == null
                    ? t("limitSitesNoCap")
                    : t("limitSites", { count: limits.sites })}
                </li>
                <li>
                  {limits.eventsPerMonth == null
                    ? t("limitEventsNoCap")
                    : t("limitEvents", { count: formatNumber(limits.eventsPerMonth, locale) })}
                </li>
                <li>
                  {limits.teamMembers == null
                    ? t("limitMembersNoCap")
                    : t("limitMembers", { count: limits.teamMembers })}
                </li>
                <li>
                  {limits.retentionDays == null
                    ? t("limitRetentionNoCap")
                    : t("limitRetention", { count: limits.retentionDays })}
                </li>
              </ul>
            </Row>
          ) : null}
        </dl>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-ink">{t("settings")}</h3>
        {organization.settings ? (
          <dl className="mt-1 divide-y divide-line">
            <Row label={t("region")}>{organization.settings.dataRegion.toUpperCase()}</Row>
            <Row label={t("killSwitch")}>
              <Status tone={organization.settings.killSwitch ? "bad" : "ok"} indicator="icon">
                {organization.settings.killSwitch ? tc("on") : tc("off")}
              </Status>
            </Row>
            <Row label={t("aiEnabled")}>
              {organization.settings.aiEnabled ? tc("on") : tc("off")}
            </Row>
            <Row label={t("maxSites")}>
              {organization.settings.maxSites == null
                ? tc("none")
                : formatNumber(organization.settings.maxSites, locale)}
            </Row>
          </dl>
        ) : (
          <p className="mt-1 text-sm text-ink-3">{t("noSettings")}</p>
        )}
      </div>
    </div>
  );
}
