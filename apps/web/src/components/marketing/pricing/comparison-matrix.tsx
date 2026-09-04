import { Check, ChevronDown, Minus } from "lucide-react";
import type { FeatureGroup, PlanId } from "@track-site/catalog";
import { Tab, TabList, TabPanel, Table, Tabs, Td, Th, THead, Tr, buttonVariants, cn } from "@track-site/ui";
import { Link } from "@/i18n/navigation";
import type { PricingPageCopy } from "@/lib/marketing-copy/pricing";
import type { FeatureMatrix, PublicPlan } from "@/server/pricing";
import { CONTACT_SALES_HREF, fill, formatAmount, formatInteger, signupHref } from "./pricing-helpers";

type Cell = { kind: "bool"; value: boolean } | { kind: "text"; value: string };
interface Row {
  key: string;
  label: string;
  cells: Record<PlanId, Cell>;
}
interface Group {
  key: "limits" | FeatureGroup;
  label: string;
  rows: Row[];
}

export interface ComparisonMatrixProps {
  locale: string;
  /** all four plans in display order */
  plans: PublicPlan[];
  matrix: FeatureMatrix;
  copy: PricingPageCopy["matrix"];
  labels: { recommended: string; start: string; contactSales: string };
}

/**
 * Full comparison of every plan (supplement §5): grouped table on desktop; on small screens a real
 * plan view with tabs per plan and one accordion per group instead of a squeezed table. Included /
 * not included is conveyed by icon shape and visually hidden text, never by colour alone.
 */
export function ComparisonMatrix({ locale, plans, matrix, copy, labels }: ComparisonMatrixProps) {
  const groups = buildGroups(plans, matrix, copy, locale);
  const defaultPlan = plans.find((p) => p.recommended)?.id ?? plans[0]?.id ?? "starter";
  return (
    <>
      <div className="hidden md:block">
        <Table stack={false} caption={copy.title} className="min-w-[44rem]" wrapperClassName="rounded-[var(--radius-card)] border border-line bg-surface">
          <THead>
            <tr>
              <Th scope="col" className="w-[34%] px-4 py-3">
                {copy.feature}
              </Th>
              {plans.map((p) => (
                <Th key={p.id} scope="col" className="px-4 py-3 text-center">
                  <span className="block text-small font-semibold tracking-normal text-ink normal-case">{p.name}</span>
                  {p.recommended ? <span className="block text-micro font-medium tracking-normal text-primary normal-case">{labels.recommended}</span> : null}
                </Th>
              ))}
            </tr>
          </THead>
          {groups.map((g) => (
            <tbody key={g.key} className="border-t border-line">
              <tr>
                <th scope="rowgroup" colSpan={plans.length + 1} className="bg-surface-2 px-4 py-2 text-left text-micro font-semibold tracking-wide text-ink-3 uppercase">
                  {g.label}
                </th>
              </tr>
              {g.rows.map((r) => (
                <Tr key={r.key} className="border-t border-line">
                  <th scope="row" className="px-4 py-2.5 text-left text-small font-normal text-ink-2">
                    {r.label}
                  </th>
                  {plans.map((p) => (
                    <Td key={p.id} className="px-4 py-2.5 text-center text-small">
                      <CellView cell={r.cells[p.id]} copy={copy} />
                    </Td>
                  ))}
                </Tr>
              ))}
            </tbody>
          ))}
          <tfoot>
            <tr className="border-t border-line">
              <td className="px-4 py-4" />
              {plans.map((p) => (
                <td key={p.id} className="px-4 py-4 text-center">
                  <PlanCta plan={p} labels={labels} size="sm" />
                </td>
              ))}
            </tr>
          </tfoot>
        </Table>
      </div>

      <div className="md:hidden">
        <Tabs defaultValue={defaultPlan}>
          <TabList variant="pill" aria-label={copy.planLabel} className="w-full">
            {plans.map((p) => (
              <Tab key={p.id} value={p.id} className="flex-1 justify-center px-2 text-xs sm:text-sm">
                {p.name}
              </Tab>
            ))}
          </TabList>
          {plans.map((p) => (
            <TabPanel key={p.id} value={p.id} className="mt-5">
              <p className="text-small text-ink-2">
                <span className="font-semibold text-ink">{p.name}</span>
                {p.recommended ? <span className="ml-2 text-micro font-medium text-primary">{labels.recommended}</span> : null}
                <span className="block text-ink-3">{p.audience}</span>
              </p>
              <div className="mt-4 border-y border-line">
                {groups.map((g, i) => {
                  const included = g.rows.filter((r) => {
                    const c = r.cells[p.id];
                    return c.kind === "text" || c.value;
                  }).length;
                  return (
                    <details key={g.key} open={i === 0} className="group border-b border-line last:border-b-0">
                      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-3 text-small font-semibold text-ink [&::-webkit-details-marker]:hidden">
                        <span>{g.label}</span>
                        <span className="flex shrink-0 items-center gap-2 text-micro font-normal text-ink-3">
                          {g.key === "limits" ? null : fill(copy.summaryCount, { included: formatInteger(included, locale), total: formatInteger(g.rows.length, locale) })}
                          <ChevronDown className="size-4 motion-safe:transition-transform motion-safe:duration-[var(--motion-base)] group-open:rotate-180" aria-hidden="true" />
                        </span>
                      </summary>
                      <ul className="space-y-2 pb-4">
                        {g.rows.map((r) => (
                          <li key={r.key} className="flex items-start justify-between gap-4 text-small">
                            <span className="text-ink-2">{r.label}</span>
                            <span className="shrink-0 text-right">
                              <CellView cell={r.cells[p.id]} copy={copy} />
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  );
                })}
              </div>
              <div className="mt-5">
                <PlanCta plan={p} labels={labels} size="md" className="w-full" />
              </div>
            </TabPanel>
          ))}
        </Tabs>
      </div>
    </>
  );
}

function PlanCta({ plan, labels, size, className }: { plan: PublicPlan; labels: ComparisonMatrixProps["labels"]; size: "sm" | "md"; className?: string }) {
  return (
    <Link href={plan.contactSales ? CONTACT_SALES_HREF : signupHref(plan.id, "monthly")} className={cn(buttonVariants({ variant: plan.recommended ? "primary" : "secondary", size }), className)}>
      {plan.contactSales ? labels.contactSales : labels.start}
    </Link>
  );
}

function CellView({ cell, copy }: { cell: Cell; copy: PricingPageCopy["matrix"] }) {
  if (cell.kind === "text") return <span className="font-medium text-ink tabular-nums">{cell.value}</span>;
  return cell.value ? (
    <>
      <Check className="mx-auto inline size-4 text-primary" aria-hidden="true" strokeWidth={2.5} />
      <span className="sr-only">{copy.included}</span>
    </>
  ) : (
    <>
      <Minus className="mx-auto inline size-4 text-ink-3" aria-hidden="true" />
      <span className="sr-only">{copy.notIncluded}</span>
    </>
  );
}

function buildGroups(plans: PublicPlan[], matrix: FeatureMatrix, copy: PricingPageCopy["matrix"], locale: string): Group[] {
  const text = (fn: (p: PublicPlan) => string): Record<PlanId, Cell> => {
    const cells = {} as Record<PlanId, Cell>;
    for (const p of plans) cells[p.id] = { kind: "text", value: fn(p) };
    return cells;
  };
  const int = (n: number) => formatInteger(n, locale);
  const limits: Row[] = [
    { key: "sites", label: copy.rows.sites, cells: text((p) => (p.limits.sites == null ? copy.custom : int(p.limits.sites))) },
    { key: "events", label: copy.rows.events, cells: text((p) => (p.limits.eventsPerMonth == null ? copy.custom : int(p.limits.eventsPerMonth))) },
    { key: "team", label: copy.rows.team, cells: text((p) => (p.limits.teamMembers == null ? (p.contactSales ? copy.custom : copy.unlimited) : int(p.limits.teamMembers))) },
    { key: "retention", label: copy.rows.retention, cells: text((p) => (p.limits.retentionMonths != null ? fill(copy.months, { n: int(p.limits.retentionMonths) }) : p.limits.retentionDays != null ? fill(copy.days, { n: int(p.limits.retentionDays) }) : copy.custom)) },
    { key: "monthly", label: copy.rows.monthly, cells: text((p) => (p.monthly ? `${formatAmount(p.monthly.amount, p.monthly.currency, locale)} ${copy.perMonth}` : copy.custom)) },
    { key: "yearly", label: copy.rows.yearly, cells: text((p) => (p.yearly ? `${formatAmount(p.yearly.amount, p.yearly.currency, locale)} ${copy.perYear}` : copy.custom)) },
    { key: "overage", label: copy.rows.overage, cells: text((p) => (p.overage ? fill(copy.pack, { price: formatAmount(p.overage.price.amount, p.overage.price.currency, locale), events: int(p.overage.events) }) : copy.contractual)) },
  ];
  const featureGroups: Group[] = matrix.groups.map((g) => ({
    key: g,
    label: copy.groups[g],
    rows: matrix.rows
      .filter((r) => r.group === g)
      .map((r) => {
        const cells = {} as Record<PlanId, Cell>;
        for (const p of plans) cells[p.id] = { kind: "bool", value: r.plans[p.id] };
        return { key: r.key, label: r.label, cells };
      }),
  }));
  return [{ key: "limits", label: copy.groups.limits, rows: limits }, ...featureGroups];
}
