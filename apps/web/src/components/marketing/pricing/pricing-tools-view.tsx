import { Check } from "lucide-react";
import { useId, type ReactNode } from "react";
import { isPaidPlanId, type BillingInterval, type PaidPlanId } from "@track-site/catalog";
import { Alert, Button, Input, Label, ProductStage, Select, buttonVariants, cn } from "@track-site/ui";
import { Link } from "@/i18n/navigation";
import type { PricingCopy } from "@/lib/marketing-copy/types";
import type { PublicPlan } from "@/server/pricing";
import { CONTACT_SALES_HREF, EVENT_STOPS, FINDER_DEFAULT_EVENTS_INDEX, FINDER_EVENT_OPTIONS, calculate, fill, findPlanFor, formatCompact, formatInteger, formatList, formatMoney, largestPaidEventLimit, longestPaidRetentionMonths, nearestStopIndex, retentionOptions, signupHref } from "./pricing-helpers";

/*
 * Plan finder and event-volume calculator (supplement §5) as stateless views. Two renderers share
 * them with identical markup: the server-rendered initial state (`pricing-tools-static.tsx`, no
 * handlers, uncontrolled controls with the same default values) and the interactive island
 * (`pricing-tools.tsx`, state + `actions`). Every number comes from the tariff catalogue through
 * `./pricing-helpers`; this module only lays it out. Server-safe: no directive, no hooks beyond
 * `useId`, and no function is created for a control unless `actions` is present.
 */

export interface PricingToolsProps {
  locale: string;
  /** paid plans in display order (calculator plan choice) */
  plans: PublicPlan[];
  finder: PricingCopy["finder"];
  calculator: PricingCopy["calculator"];
  /** warning thresholds in percent (from the catalogue) */
  thresholds: number[];
}

/** One light product stage with the finder on the left and the calculator on the right. */
export function PricingToolsStage({ children }: { children: ReactNode }) {
  return (
    <ProductStage as="div" tone="light" padding="md" className="bg-surface">
      <div className="grid gap-10 lg:grid-cols-2 lg:gap-12">{children}</div>
    </ProductStage>
  );
}

export function toInt(raw: string): number {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Label + control with the same markup as the `Field` primitive (which takes a render prop and is
 * therefore not usable from a server component). No hint or error slot is needed here.
 */
function ToolField({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
      </div>
      {children(id)}
    </div>
  );
}

/* ------------------------------------------------------------ plan finder */

export interface FinderState {
  sites: string;
  eventsIndex: number;
  team: string;
  retentionId: string;
}

export interface FinderActions {
  setSites: (value: string) => void;
  /** normalises the typed value on blur */
  blurSites: () => void;
  setEventsIndex: (index: number) => void;
  setTeam: (value: string) => void;
  blurTeam: () => void;
  setRetentionId: (id: string) => void;
}

export function initialFinderState(): FinderState {
  return { sites: "1", eventsIndex: FINDER_DEFAULT_EVENTS_INDEX, team: "2", retentionId: retentionOptions()[0]?.id ?? "d90" };
}

export function PlanFinderView({ locale, copy, interval, state, actions }: { locale: string; copy: PricingCopy["finder"]; interval: BillingInterval; state: FinderState; actions?: FinderActions }) {
  const headingId = useId();
  const options = retentionOptions();
  const longest = longestPaidRetentionMonths();
  const largest = largestPaidEventLimit();
  const eventsWanted = FINDER_EVENT_OPTIONS[state.eventsIndex] ?? 0;
  const retention = options.find((o) => o.id === state.retentionId) ?? options[0];
  const result = findPlanFor({ sites: toInt(state.sites), eventsPerMonth: eventsWanted, teamMembers: toInt(state.team), retentionDays: retention?.days ?? 0 });

  const eventsLabel = (v: number) => (Number.isFinite(v) ? formatInteger(v, locale) : fill(copy.eventsMore, { n: formatInteger(largest, locale) }));
  const retentionLabel = (o: (typeof options)[number]) => (o.longer ? fill(copy.retentionLonger, { n: formatInteger(longest, locale) }) : o.months != null ? fill(copy.retentionMonths, { n: formatInteger(o.months, locale) }) : fill(copy.retentionDays, { n: formatInteger(o.days, locale) }));
  const limitLabel = (key: string, limit: number | null): string | null => {
    if (limit == null) return null;
    if (key === "events") return formatInteger(limit, locale);
    if (key === "retention") return result.plan.limits.retentionMonths != null ? fill(copy.retentionMonths, { n: formatInteger(result.plan.limits.retentionMonths, locale) }) : fill(copy.retentionDays, { n: formatInteger(limit, locale) });
    return formatInteger(limit, locale);
  };
  const wantedLabel = (key: string, wanted: number): string => {
    if (key === "events") return eventsLabel(wanted);
    if (key === "retention") return retention ? retentionLabel(retention) : formatInteger(wanted, locale);
    return formatInteger(wanted, locale);
  };

  const isEnterprise = result.plan.contactSales;
  const price = result.plan.price;
  const priceLine = price ? (interval === "monthly" ? fill(copy.priceMonthly, { price: formatMoney(price.monthlyCents, price.currency, locale) }) : fill(copy.priceYearly, { price: formatMoney(price.yearlyCents, price.currency, locale) })) : null;
  // controlled with handlers, uncontrolled (same default values) in the server-rendered initial state
  const valueProps = <T,>(value: T) => (actions ? { value } : { defaultValue: value });

  return (
    <section aria-labelledby={headingId} className="min-w-0">
      <h3 id={headingId} className="font-display text-h3 font-semibold text-ink">
        {copy.title}
      </h3>
      <p className="mt-2 text-small text-ink-2">{copy.text}</p>
      <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={actions ? (e) => e.preventDefault() : undefined}>
        <ToolField label={copy.sites}>{(id) => <Input id={id} type="number" inputMode="numeric" min={1} max={500} step={1} {...valueProps(state.sites)} onChange={actions ? (e) => actions.setSites(e.target.value) : undefined} onBlur={actions ? () => actions.blurSites() : undefined} />}</ToolField>
        <ToolField label={copy.events}>
          {(id) => (
            <Select id={id} {...valueProps(String(state.eventsIndex))} onChange={actions ? (e) => actions.setEventsIndex(Number.parseInt(e.target.value, 10) || 0) : undefined}>
              {FINDER_EVENT_OPTIONS.map((v, i) => (
                <option key={i} value={i}>
                  {eventsLabel(v)}
                </option>
              ))}
            </Select>
          )}
        </ToolField>
        <ToolField label={copy.team}>{(id) => <Input id={id} type="number" inputMode="numeric" min={1} max={1000} step={1} {...valueProps(state.team)} onChange={actions ? (e) => actions.setTeam(e.target.value) : undefined} onBlur={actions ? () => actions.blurTeam() : undefined} />}</ToolField>
        <ToolField label={copy.retention}>
          {(id) => (
            <Select id={id} {...valueProps(state.retentionId)} onChange={actions ? (e) => actions.setRetentionId(e.target.value) : undefined}>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {retentionLabel(o)}
                </option>
              ))}
            </Select>
          )}
        </ToolField>
      </form>
      <div role="status" aria-live="polite" className="mt-6 rounded-[var(--radius-card)] border border-line bg-surface-2 p-5">
        <p className="text-micro font-semibold tracking-wide text-ink-3 uppercase">{copy.resultLabel}</p>
        <p className="mt-1 font-display text-h3 font-semibold text-ink">{isEnterprise ? copy.resultEnterprise : fill(copy.result, { plan: result.plan.name })}</p>
        <p className="mt-1 text-small text-ink-2">{isEnterprise ? copy.resultEnterpriseText : priceLine}</p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {result.checks.map((c) => {
            const limit = limitLabel(c.key, c.limit);
            const wanted = wantedLabel(c.key, c.wanted);
            return (
              <li key={c.key} className="flex items-start gap-2 text-small text-ink-2">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" strokeWidth={2.5} />
                <span>
                  <span className="text-ink-3">{copy.checks[c.key]}: </span>
                  <span className="font-medium text-ink tabular-nums">{limit == null ? fill(copy.noCap, { wanted }) : fill(copy.limitOf, { wanted, limit })}</span>
                </span>
              </li>
            );
          })}
        </ul>
        <div className="mt-5">
          <Link href={isEnterprise ? CONTACT_SALES_HREF : signupHref(result.planId, interval)} className={buttonVariants({ variant: isEnterprise ? "secondary" : "primary" })}>
            {isEnterprise ? copy.ctaEnterprise : fill(copy.cta, { plan: result.plan.name })}
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------ event calculator */

export interface CalculatorState {
  planId: PaidPlanId;
  events: number;
  eventsText: string;
}

export interface CalculatorActions {
  setPlanId: (id: PaidPlanId) => void;
  setSlider: (index: number) => void;
  setTyped: (raw: string) => void;
  /** re-formats the typed volume on blur */
  blurTyped: () => void;
}

const DEFAULT_EVENTS = 2_000_000;

export function initialCalculatorState(plans: PublicPlan[], locale: string): CalculatorState {
  const paid = plans.filter((p) => isPaidPlanId(p.id));
  const preferred = paid.find((p) => p.recommended)?.id ?? paid[0]?.id;
  return { planId: isPaidPlanId(preferred) ? preferred : "growth", events: DEFAULT_EVENTS, eventsText: formatInteger(DEFAULT_EVENTS, locale) };
}

export function EventCalculatorView({ locale, plans, copy, thresholds, interval, state, actions }: { locale: string; plans: PublicPlan[]; copy: PricingCopy["calculator"]; thresholds: number[]; interval: BillingInterval; state: CalculatorState; actions?: CalculatorActions }) {
  const headingId = useId();
  const sliderId = useId();
  const paid = plans.filter((p) => isPaidPlanId(p.id));
  const result = calculate(state.planId, state.events, interval);
  const stopIndex = nearestStopIndex(state.events);
  const first = EVENT_STOPS[0] ?? 0;
  const last = EVENT_STOPS[EVENT_STOPS.length - 1] ?? 0;
  const currency = result?.estimate.currency ?? "EUR";
  const money = (cents: number) => formatMoney(cents, currency, locale);
  const period = result?.estimate.periodMonths === 12 ? copy.perYear : copy.perMonth;
  const valueProps = <T,>(value: T) => (actions ? { value } : { defaultValue: value });

  return (
    <section aria-labelledby={headingId} className="min-w-0">
      <h3 id={headingId} className="font-display text-h3 font-semibold text-ink">
        {copy.title}
      </h3>
      <p className="mt-2 text-small text-ink-2">{copy.text}</p>
      <form className="mt-6 grid gap-4" onSubmit={actions ? (e) => e.preventDefault() : undefined}>
        <ToolField label={copy.plan}>
          {(id) => (
            <Select
              id={id}
              {...valueProps(state.planId)}
              onChange={
                actions
                  ? (e) => {
                      if (isPaidPlanId(e.target.value)) actions.setPlanId(e.target.value);
                    }
                  : undefined
              }
            >
              {paid.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          )}
        </ToolField>
        <div>
          <label htmlFor={sliderId} className="block text-sm font-medium text-ink">
            {copy.slider}
          </label>
          <input
            id={sliderId}
            type="range"
            min={0}
            max={EVENT_STOPS.length - 1}
            step={1}
            {...valueProps(stopIndex)}
            aria-valuetext={formatInteger(state.events, locale)}
            onChange={actions ? (e) => actions.setSlider(Number.parseInt(e.target.value, 10) || 0) : undefined}
            className="mt-2 h-11 w-full cursor-pointer accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          />
          <div className="flex justify-between text-micro text-ink-3 tabular-nums" aria-hidden="true">
            <span>{formatCompact(first, locale)}</span>
            <span>{formatCompact(last, locale)}</span>
          </div>
        </div>
        <ToolField label={copy.eventsInput}>{(id) => <Input id={id} inputMode="numeric" autoComplete="off" {...valueProps(state.eventsText)} onChange={actions ? (e) => actions.setTyped(e.target.value) : undefined} onBlur={actions ? () => actions.blurTyped() : undefined} />}</ToolField>
      </form>

      {result ? (
        <div className="mt-6 rounded-[var(--radius-card)] border border-line bg-surface-2 p-5">
          <dl className="divide-y divide-line text-small">
            <Row label={copy.base} value={money(result.estimate.base)} />
            <Row label={copy.included} value={formatInteger(result.estimate.includedEventsPerMonth, locale)} />
            <Row label={copy.above} value={formatInteger(result.estimate.overageEventsPerMonth, locale)} />
            <Row label={copy.packs} value={result.pack && result.estimate.overagePacks > 0 ? fill(copy.packsValue, { n: formatInteger(result.estimate.overagePacks, locale), events: formatInteger(result.pack.events, locale), price: money(result.pack.priceCents) }) : copy.packsNone} />
            <Row label={copy.overageCost} value={money(result.estimate.overageCost)} />
            <div className="flex items-baseline justify-between gap-4 pt-3">
              <dt className="font-semibold text-ink">{copy.total}</dt>
              <dd className="text-right" aria-live="polite" aria-atomic="true">
                <span className="font-display text-2xl font-bold text-ink tabular-nums">{money(result.estimate.total)}</span> <span className="text-ink-3">{period}</span>
              </dd>
            </div>
          </dl>
          {result.cheaper ? (
            <Alert tone="info" className="mt-4">
              {fill(copy.cheaper, { plan: result.cheaper.plan.name, total: money(result.cheaper.total), savings: money(result.cheaper.savings), current: result.plan.name })}{" "}
              <Button
                variant="link"
                size="sm"
                className="text-small"
                onClick={
                  actions
                    ? () => {
                        const next = result.cheaper?.plan.id;
                        if (isPaidPlanId(next)) actions.setPlanId(next);
                      }
                    : undefined
                }
              >
                {fill(copy.cheaperCta, { plan: result.cheaper.plan.name })}
              </Button>
            </Alert>
          ) : result.estimate.overageEventsPerMonth > 0 ? (
            <p className="mt-4 text-small text-ink-2">{copy.noCheaper}</p>
          ) : null}
          {result.beyondTopPlan ? <p className="mt-2 text-small text-ink-2">{copy.beyondPro}</p> : null}
          <p className="mt-4 text-micro text-ink-3">{fill(copy.policyNote, { thresholds: formatList(thresholds.map((t) => `${formatInteger(t, locale)} %`), locale) })}</p>
          <div className="mt-5">
            <Link href={signupHref(state.planId, interval)} className={cn(buttonVariants({ variant: "secondary" }))}>
              {fill(copy.cta, { plan: result.plan.name })}
            </Link>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-ink-2">{label}</dt>
      <dd className="text-right font-medium text-ink tabular-nums">{value}</dd>
    </div>
  );
}
