import { getTranslations } from "next-intl/server";
import { findPlan } from "@track-site/catalog";
import { EmptyState, TBody, THead, Table, Td, Th, Tr } from "@track-site/ui";
import { TRIAL_ENDING_SOON_DAYS, type StripeMode, type TrialSummary } from "@/server/ops/revenue";
import { Figure, OrgCell, Section, StripeLinks, TableFrame } from "./cells";
import { count, day } from "./format";

/** Trials as the ledger carries them; an honest "no trial data" state when nothing is marked trialing. */
export async function TrialsSection({ trials, locale, stripeMode }: { trials: TrialSummary; locale: string; stripeMode: StripeMode | null }) {
  const t = await getTranslations("opsRevenue.trials");
  const intro = t("intro", { days: trials.catalogue.days, plan: trials.catalogue.planName, card: t(trials.catalogue.cardRequired ? "card" : "noCard") });
  if (!trials.hasData) {
    return (
      <Section id="ops-revenue-trials" title={t("title")} intro={intro}>
        <EmptyState title={t("noData.title")} description={t("noData.text")} />
      </Section>
    );
  }
  return (
    <Section
      id="ops-revenue-trials"
      title={t("title")}
      intro={intro}
      aside={
        <div className="flex flex-wrap gap-2">
          <Figure label={t("stats.active")} value={count(trials.active, locale)} />
          <Figure label={t("stats.endingSoon", { days: TRIAL_ENDING_SOON_DAYS })} value={count(trials.endingSoon, locale)} tone={trials.endingSoon > 0 ? "warn" : "neutral"} />
          <Figure label={t("stats.expired")} value={count(trials.expired, locale)} tone={trials.expired > 0 ? "warn" : "neutral"} />
        </div>
      }
    >
      {trials.rows.length === 0 ? (
        <EmptyState title={t("noData.title")} description={t("noData.text")} />
      ) : (
        <TableFrame>
          <Table caption={t("caption")}>
            <THead>
              <Tr>
                <Th>{t("columns.organisation")}</Th>
                <Th>{t("columns.plan")}</Th>
                <Th>{t("columns.trialEnd")}</Th>
                <Th>{t("columns.remaining")}</Th>
                <Th>{t("columns.stripe")}</Th>
              </Tr>
            </THead>
            <TBody>
              {trials.rows.map(({ subscription: s, daysLeft }) => (
                <Tr key={s.id}>
                  <Td label={t("columns.organisation")}>
                    <OrgCell id={s.organizationId} name={s.organizationName} slug={s.organizationSlug} suspendedAt={s.suspendedAt} />
                  </Td>
                  <Td label={t("columns.plan")}>{findPlan(s.planId)?.name ?? s.planId}</Td>
                  <Td label={t("columns.trialEnd")} className="whitespace-nowrap text-ink-2">
                    {s.trialEnd ? <time dateTime={s.trialEnd.toISOString()}>{day(s.trialEnd, locale)}</time> : <span className="text-ink-3">{t("noEnd")}</span>}
                  </Td>
                  <Td label={t("columns.remaining")} className={daysLeft != null && daysLeft < 0 ? "text-warn" : daysLeft != null && daysLeft <= TRIAL_ENDING_SOON_DAYS ? "text-warn" : "text-ink-2"}>
                    {daysLeft == null ? "—" : daysLeft < 0 ? t("ended", { count: -daysLeft }) : t("daysLeft", { count: daysLeft })}
                  </Td>
                  <Td label={t("columns.stripe")}>
                    <StripeLinks customerId={s.stripeCustomerId} subscriptionId={s.stripeSubscriptionId} mode={stripeMode} />
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </TableFrame>
      )}
    </Section>
  );
}
