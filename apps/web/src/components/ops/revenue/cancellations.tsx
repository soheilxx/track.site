import { getTranslations } from "next-intl/server";
import { findPlan } from "@track-site/catalog";
import { TBody, THead, Table, Td, Th, Tr } from "@track-site/ui";
import { monthlyListCents, type CancellationSummary, type RevenueSubscription, type StripeMode } from "@/server/ops/revenue";
import { Figure, OrgCell, Section, StripeLinks, TableFrame } from "./cells";
import { count, day, money } from "./format";

async function CancellationTable({ rows, caption, dateColumn, locale, stripeMode }: { rows: RevenueSubscription[]; caption: string; dateColumn: "canceledAt" | "cancelAt"; locale: string; stripeMode: StripeMode | null }) {
  const [t, tInterval] = await Promise.all([getTranslations("opsRevenue.cancellations"), getTranslations("opsRevenue.interval")]);
  return (
    <TableFrame>
      <Table caption={caption}>
        <THead>
          <Tr>
            <Th>{t("columns.organisation")}</Th>
            <Th>{t("columns.plan")}</Th>
            <Th>{t("columns.interval")}</Th>
            <Th>{t(`columns.${dateColumn}`)}</Th>
            <Th className="text-right">{t("columns.mrr")}</Th>
            <Th>{t("columns.stripe")}</Th>
          </Tr>
        </THead>
        <TBody>
          {rows.map((s) => {
            const at = s[dateColumn];
            const price = monthlyListCents(s.planId, s.interval).cents;
            return (
              <Tr key={s.id}>
                <Td label={t("columns.organisation")}>
                  <OrgCell id={s.organizationId} name={s.organizationName} slug={s.organizationSlug} suspendedAt={s.suspendedAt} />
                </Td>
                <Td label={t("columns.plan")}>{findPlan(s.planId)?.name ?? s.planId}</Td>
                <Td label={t("columns.interval")} className="text-ink-2">
                  {tInterval(s.interval === "monthly" || s.interval === "yearly" ? s.interval : "unknown")}
                </Td>
                <Td label={t(`columns.${dateColumn}`)} className="whitespace-nowrap text-ink-2">
                  {at ? <time dateTime={at.toISOString()}>{day(at, locale)}</time> : "—"}
                </Td>
                <Td label={t("columns.mrr")} numeric className="font-medium text-ink">
                  {price == null ? "—" : money(price, locale)}
                </Td>
                <Td label={t("columns.stripe")}>
                  <StripeLinks customerId={s.stripeCustomerId} subscriptionId={s.stripeSubscriptionId} mode={stripeMode} />
                </Td>
              </Tr>
            );
          })}
        </TBody>
      </Table>
    </TableFrame>
  );
}

/** Cancellations per window (30 / 90 days) with lost list-price MRR, the recent ones and the scheduled ones. */
export async function CancellationsSection({ cancellations, locale, stripeMode }: { cancellations: CancellationSummary; locale: string; stripeMode: StripeMode | null }) {
  const t = await getTranslations("opsRevenue.cancellations");
  const longest = Math.max(0, ...cancellations.windows.map((w) => w.days));
  return (
    <Section
      id="ops-revenue-cancellations"
      title={t("title")}
      intro={t("intro")}
      aside={
        <div className="flex flex-wrap gap-2">
          {cancellations.windows.map((w) => (
            <Figure key={w.days} label={t("window", { days: w.days })} value={count(w.count, locale)} hint={t("lost", { amount: money(w.mrrCents, locale) })} tone={w.count > 0 ? "warn" : "neutral"} />
          ))}
          <Figure label={t("pending")} value={count(cancellations.pending.count, locale)} hint={t("pendingHint", { amount: money(cancellations.pending.mrrCents, locale) })} tone={cancellations.pending.count > 0 ? "warn" : "neutral"} />
        </div>
      }
    >
      <div className="space-y-6">
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-ink">{t("recentTitle", { days: longest })}</h3>
          {cancellations.recent.length === 0 ? <p className="text-sm text-ink-3">{t("emptyRecent", { days: longest })}</p> : <CancellationTable rows={cancellations.recent} caption={t("recentCaption")} dateColumn="canceledAt" locale={locale} stripeMode={stripeMode} />}
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-ink">{t("pendingTitle")}</h3>
          {cancellations.pending.rows.length === 0 ? <p className="text-sm text-ink-3">{t("emptyPending")}</p> : <CancellationTable rows={cancellations.pending.rows} caption={t("pendingCaption")} dateColumn="cancelAt" locale={locale} stripeMode={stripeMode} />}
        </div>
      </div>
    </Section>
  );
}
