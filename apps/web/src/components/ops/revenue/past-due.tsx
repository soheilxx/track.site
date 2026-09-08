import { getTranslations } from "next-intl/server";
import { findPlan } from "@track-site/catalog";
import { EmptyState, Status, TBody, THead, Table, Td, Th, Tr } from "@track-site/ui";
import { monthlyListCents, type RevenueSubscription, type StripeMode } from "@/server/ops/revenue";
import { OrgCell, Section, StripeLinks, TableFrame } from "./cells";
import { day, money } from "./format";

/** Subscriptions with a failed payment, shortest grace period first. */
export async function PastDueSection({
  rows,
  locale,
  stripeMode,
  now,
}: {
  rows: RevenueSubscription[];
  locale: string;
  stripeMode: StripeMode | null;
  now: Date;
}) {
  const [t, tStatus] = await Promise.all([
    getTranslations("opsRevenue.pastDue"),
    getTranslations("opsRevenue.status"),
  ]);
  return (
    <Section id="ops-revenue-past-due" title={t("title")} intro={t("intro")}>
      {rows.length === 0 ? (
        <EmptyState title={t("empty.title")} description={t("empty.text")} />
      ) : (
        <TableFrame>
          <Table caption={t("caption")}>
            <THead>
              <Tr>
                <Th>{t("columns.organisation")}</Th>
                <Th>{t("columns.plan")}</Th>
                <Th>{t("columns.status")}</Th>
                <Th>{t("columns.grace")}</Th>
                <Th>{t("columns.periodEnd")}</Th>
                <Th className="text-right">{t("columns.mrr")}</Th>
                <Th>{t("columns.stripe")}</Th>
              </Tr>
            </THead>
            <TBody>
              {rows.map((s) => {
                const price = monthlyListCents(s.planId, s.interval).cents;
                const graceOver = s.graceUntil != null && s.graceUntil.getTime() <= now.getTime();
                return (
                  <Tr key={s.id} data-testid="ops-revenue-past-due-row">
                    <Td label={t("columns.organisation")}>
                      <OrgCell
                        id={s.organizationId}
                        name={s.organizationName}
                        slug={s.organizationSlug}
                        suspendedAt={s.suspendedAt}
                      />
                    </Td>
                    <Td label={t("columns.plan")}>{findPlan(s.planId)?.name ?? s.planId}</Td>
                    <Td label={t("columns.status")}>
                      <Status tone={s.status === "unpaid" ? "bad" : "warn"} indicator="icon">
                        {tStatus(s.status)}
                      </Status>
                    </Td>
                    <Td
                      label={t("columns.grace")}
                      className={
                        graceOver ? "whitespace-nowrap text-bad" : "whitespace-nowrap text-ink-2"
                      }
                    >
                      {s.graceUntil ? (
                        <time dateTime={s.graceUntil.toISOString()}>
                          {day(s.graceUntil, locale)}
                        </time>
                      ) : (
                        "—"
                      )}
                      {graceOver ? <p className="text-xs">{t("graceOver")}</p> : null}
                    </Td>
                    <Td label={t("columns.periodEnd")} className="whitespace-nowrap text-ink-2">
                      {s.currentPeriodEnd ? (
                        <time dateTime={s.currentPeriodEnd.toISOString()}>
                          {day(s.currentPeriodEnd, locale)}
                        </time>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td label={t("columns.mrr")} numeric className="font-medium text-ink">
                      {price == null ? "—" : money(price, locale)}
                    </Td>
                    <Td label={t("columns.stripe")}>
                      <StripeLinks
                        customerId={s.stripeCustomerId}
                        subscriptionId={s.stripeSubscriptionId}
                        mode={stripeMode}
                      />
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        </TableFrame>
      )}
    </Section>
  );
}
