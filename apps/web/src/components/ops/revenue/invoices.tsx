import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Alert, EmptyState, Status, TBody, THead, Table, Td, Th, Tr, type Tone } from "@track-site/ui";
import type { InvoiceListing, RevenueView, StripeMode } from "@/server/ops/revenue";
import { formatCurrency } from "@/lib/format";
import { Section, StripeLink, TableFrame } from "./cells";
import { day } from "./format";

const STATUS_TONE: Record<string, Tone> = { draft: "neutral", open: "info", paid: "ok", uncollectible: "bad", void: "neutral" };
const KNOWN_STATUS = new Set(["draft", "open", "paid", "uncollectible", "void"]);

/** Amount in Stripe's minor units and currency (invoices may be billed in a currency other than the catalogue's). */
function amount(cents: number, currency: string, locale: string): string {
  return formatCurrency(cents / 100, locale, { currency: currency.toUpperCase(), maximumFractionDigits: 2 });
}

/**
 * The latest invoices from Stripe. The restricted key may lack invoice access: that state is shown as
 * such ("not permitted with the current key"), the rest of the page does not depend on it.
 */
export async function InvoicesSection({ listing, customers, locale, stripeMode }: { listing: InvoiceListing; customers: RevenueView["customers"]; locale: string; stripeMode: StripeMode | null }) {
  const t = await getTranslations("opsRevenue.invoices");
  let body: ReactNode;
  if (listing.state === "not_configured") body = <Alert tone="info" title={t("notConfigured.title")}>{t("notConfigured.text")}</Alert>;
  else if (listing.state === "forbidden") body = <Alert tone="warn" title={t("forbidden.title")}>{t("forbidden.text", { detail: listing.detail })}</Alert>;
  else if (listing.state === "error") body = <Alert tone="bad" title={t("error.title")}>{t("error.text", { detail: listing.detail })}</Alert>;
  else if (listing.invoices.length === 0) body = <EmptyState title={t("empty.title")} description={t("empty.text")} />;
  else
    body = (
      <>
        <TableFrame>
          <Table caption={t("caption")}>
            <THead>
              <Tr>
                <Th>{t("columns.number")}</Th>
                <Th>{t("columns.organisation")}</Th>
                <Th>{t("columns.status")}</Th>
                <Th className="text-right">{t("columns.due")}</Th>
                <Th className="text-right">{t("columns.paid")}</Th>
                <Th>{t("columns.created")}</Th>
                <Th>{t("columns.dueDate")}</Th>
                <Th>{t("columns.stripe")}</Th>
              </Tr>
            </THead>
            <TBody>
              {listing.invoices.map((inv) => {
                const org = inv.customerId ? customers.get(inv.customerId) : undefined;
                const status = inv.status && KNOWN_STATUS.has(inv.status) ? inv.status : "unknown";
                return (
                  <Tr key={inv.id} data-testid="ops-revenue-invoice-row">
                    <Td label={t("columns.number")} className="font-mono text-xs">
                      {inv.number ?? <span className="text-ink-3">{t("noNumber")}</span>}
                    </Td>
                    <Td label={t("columns.organisation")}>
                      {org ? (
                        <>
                          <p className="font-medium text-ink">{org.name}</p>
                          <p className="font-mono text-xs text-ink-3">{org.slug}</p>
                        </>
                      ) : (
                        <span className="text-ink-3">{t("unknownCustomer")}</span>
                      )}
                    </Td>
                    <Td label={t("columns.status")}>
                      <Status tone={STATUS_TONE[status] ?? "neutral"} indicator="icon">
                        {t(`statuses.${status}`)}
                      </Status>
                    </Td>
                    <Td label={t("columns.due")} numeric className="font-medium text-ink">
                      {amount(inv.amountDueCents, inv.currency, locale)}
                    </Td>
                    <Td label={t("columns.paid")} numeric className="text-ink-2">
                      {amount(inv.amountPaidCents, inv.currency, locale)}
                    </Td>
                    <Td label={t("columns.created")} className="whitespace-nowrap text-ink-2">
                      <time dateTime={inv.createdAt.toISOString()}>{day(inv.createdAt, locale)}</time>
                    </Td>
                    <Td label={t("columns.dueDate")} className="whitespace-nowrap text-ink-2">
                      {inv.dueAt ? <time dateTime={inv.dueAt.toISOString()}>{day(inv.dueAt, locale)}</time> : "—"}
                    </Td>
                    <Td label={t("columns.stripe")}>
                      <div className="flex flex-col items-start">
                        <StripeLink kind="invoices" id={inv.id} mode={stripeMode} />
                        <StripeLink kind="customers" id={inv.customerId} mode={stripeMode} />
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        </TableFrame>
        {listing.hasMore ? <p className="text-sm text-ink-3">{t("more")}</p> : null}
      </>
    );
  return (
    <Section id="ops-revenue-invoices" title={t("title")} intro={t("intro")}>
      {body}
    </Section>
  );
}
