import { Badge, Table, TBody, Td, Th, THead, Tr } from "@track-site/ui";
import type { PricingCopy } from "@/lib/marketing-copy/types";
import type { PublicOveragePack, PublicUsagePolicy } from "@/server/pricing";
import { fill, formatAmount, formatInteger, formatList } from "./pricing-helpers";

/**
 * Overage and cost control (supplement §5): the event packs per plan as a small table, the explicit
 * policy choice with its default, the warning thresholds, the grace window and the honesty rule.
 */
export function OverageSection({ locale, intro, packs, policy, enterpriseName, copy }: { locale: string; intro: string; packs: PublicOveragePack[]; policy: PublicUsagePolicy; enterpriseName: string; copy: PricingCopy["overageSection"] }) {
  const thresholds = formatList(
    policy.thresholds.map((t) => `${formatInteger(t, locale)} %`),
    locale,
  );
  return (
    <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
      <div className="min-w-0">
        <p className="max-w-text text-body text-ink-2">{intro}</p>
        <h3 className="mt-8 text-small font-semibold tracking-wide text-ink-3 uppercase">{copy.packsTitle}</h3>
        <Table caption={copy.packsTitle} className="mt-3" wrapperClassName="md:rounded-[var(--radius-card)] md:border md:border-line md:bg-surface">
          <THead>
            <tr>
              <Th className="px-4 py-3">{copy.packPlan}</Th>
              <Th className="px-4 py-3 text-right">{copy.packSize}</Th>
              <Th className="px-4 py-3 text-right">{copy.packPrice}</Th>
            </tr>
          </THead>
          <TBody>
            {packs.map((p) => (
              <Tr key={p.planId}>
                <Td label={copy.packPlan} className="px-4 py-2.5 font-medium text-ink">
                  {p.planName}
                </Td>
                <Td label={copy.packSize} numeric className="px-4 py-2.5">
                  {formatInteger(p.events, locale)}
                </Td>
                <Td label={copy.packPrice} numeric className="px-4 py-2.5">
                  {formatAmount(p.price.amount, p.price.currency, locale)}
                </Td>
              </Tr>
            ))}
            <Tr>
              <Td label={copy.packPlan} className="px-4 py-2.5 font-medium text-ink">
                {enterpriseName}
              </Td>
              <Td label={copy.packSize} className="px-4 py-2.5 text-ink-2 md:text-right" colSpan={2}>
                {copy.packEnterprise}
              </Td>
            </Tr>
          </TBody>
        </Table>
      </div>
      <div className="min-w-0">
        <h3 className="text-small font-semibold tracking-wide text-ink-3 uppercase">{copy.policyTitle}</h3>
        <p className="mt-3 text-body text-ink-2">{copy.policyText}</p>
        <ol className="mt-4 space-y-3">
          {policy.policies.map((p, i) => (
            <li key={p.id} className="flex items-start gap-3">
              <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-soft font-display text-small font-bold text-primary" aria-hidden="true">
                {i + 1}
              </span>
              <span className="pt-1 text-small text-ink-2">
                {p.label}
                {p.id === policy.defaultPolicy ? (
                  <Badge tone="neutral" className="ml-2 align-middle">
                    {copy.defaultTag}
                  </Badge>
                ) : null}
              </span>
            </li>
          ))}
        </ol>
        <div className="mt-6 space-y-3 text-small text-ink-2">
          <p>{fill(copy.thresholds, { thresholds })}</p>
          <p>{fill(copy.grace, { percent: formatInteger(policy.gracePercent, locale) })}</p>
          <p>{copy.honest}</p>
        </div>
      </div>
    </div>
  );
}
