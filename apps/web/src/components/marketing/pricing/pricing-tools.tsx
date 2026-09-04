"use client";

import { useId, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { isPaidPlanId, type PaidPlanId } from "@track-site/catalog";
import { Alert, Button, Field, Input, ProductStage, Select, buttonVariants, cn } from "@track-site/ui";
import { Link } from "@/i18n/navigation";
import type { PricingCopy } from "@/lib/marketing-copy/types";
import type { PublicPlan } from "@/server/pricing";
import { useBillingInterval } from "./interval";
import { CONTACT_SALES_HREF, EVENT_STOPS, FINDER_EVENT_OPTIONS, calculate, fill, findPlanFor, formatCompact, formatInteger, formatList, formatMoney, largestPaidEventLimit, longestPaidRetentionMonths, nearestStopIndex, parseEventsInput, retentionOptions, signupHref } from "./pricing-helpers";

export interface PricingToolsProps {
  locale: string;
  /** paid plans in display order (calculator plan choice) */
  plans: PublicPlan[];
  finder: PricingCopy["finder"];
  calculator: PricingCopy["calculator"];
  /** warning thresholds in percent (from the catalogue) */
  thresholds: number[];
}

/** Interactive plan finder and event-volume calculator on one light product stage (supplement §5). */
export function PricingTools(props: PricingToolsProps) {
  return (
    <ProductStage as="div" tone="light" padding="md" className="bg-surface">
      <div className="grid gap-10 lg:grid-cols-2 lg:gap-12">
        <PlanFinder {...props} />
        <EventCalculator {...props} />
      </div>
    </ProductStage>
  );
}

function toInt(raw: string): number {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/* ------------------------------------------------------------ plan finder */

function PlanFinder({ locale, finder: copy }: PricingToolsProps) {
  const { interval } = useBillingInterval();
  const headingId = useId();
  const options = useMemo(() => retentionOptions(), []);
  const longest = longestPaidRetentionMonths();
  const largest = largestPaidEventLimit();
  const [sites, setSites] = useState("1");
  const [eventsIndex, setEventsIndex] = useState(() => Math.max(0, FINDER_EVENT_OPTIONS.indexOf(500_000)));
  const [team, setTeam] = useState("2");
  const [retentionId, setRetentionId] = useState(options[0]?.id ?? "d90");

  const eventsWanted = FINDER_EVENT_OPTIONS[eventsIndex] ?? 0;
  const retention = options.find((o) => o.id === retentionId) ?? options[0];
  const result = useMemo(() => findPlanFor({ sites: toInt(sites), eventsPerMonth: eventsWanted, teamMembers: toInt(team), retentionDays: retention?.days ?? 0 }), [sites, eventsWanted, team, retention]);

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

  return (
    <section aria-labelledby={headingId} className="min-w-0">
      <h3 id={headingId} className="font-display text-h3 font-semibold text-ink">
        {copy.title}
      </h3>
      <p className="mt-2 text-small text-ink-2">{copy.text}</p>
      <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
        <Field label={copy.sites}>{(control) => <Input {...control} type="number" inputMode="numeric" min={1} max={500} step={1} value={sites} onChange={(e) => setSites(e.target.value)} onBlur={() => setSites(String(Math.max(1, toInt(sites))))} />}</Field>
        <Field label={copy.events}>
          {(control) => (
            <Select {...control} value={String(eventsIndex)} onChange={(e) => setEventsIndex(Number.parseInt(e.target.value, 10) || 0)}>
              {FINDER_EVENT_OPTIONS.map((v, i) => (
                <option key={i} value={i}>
                  {eventsLabel(v)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={copy.team}>{(control) => <Input {...control} type="number" inputMode="numeric" min={1} max={1000} step={1} value={team} onChange={(e) => setTeam(e.target.value)} onBlur={() => setTeam(String(Math.max(1, toInt(team))))} />}</Field>
        <Field label={copy.retention}>
          {(control) => (
            <Select {...control} value={retentionId} onChange={(e) => setRetentionId(e.target.value)}>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {retentionLabel(o)}
                </option>
              ))}
            </Select>
          )}
        </Field>
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

function EventCalculator({ locale, plans, calculator: copy, thresholds }: PricingToolsProps) {
  const { interval } = useBillingInterval();
  const headingId = useId();
  const sliderId = useId();
  const paid = plans.filter((p) => isPaidPlanId(p.id));
  const [planId, setPlanId] = useState<PaidPlanId>(() => {
    const preferred = paid.find((p) => p.recommended)?.id ?? paid[0]?.id;
    return isPaidPlanId(preferred) ? preferred : "growth";
  });
  const [events, setEvents] = useState(2_000_000);
  const [eventsText, setEventsText] = useState(() => formatInteger(2_000_000, locale));

  const result = useMemo(() => calculate(planId, events, interval), [planId, events, interval]);
  const stopIndex = nearestStopIndex(events);
  const first = EVENT_STOPS[0] ?? 0;
  const last = EVENT_STOPS[EVENT_STOPS.length - 1] ?? 0;

  const onSlider = (index: number) => {
    const next = EVENT_STOPS[index];
    if (next === undefined) return;
    setEvents(next);
    setEventsText(formatInteger(next, locale));
  };
  const onTyped = (raw: string) => {
    setEventsText(raw);
    const parsed = parseEventsInput(raw);
    if (parsed != null) setEvents(parsed);
  };

  const currency = result?.estimate.currency ?? "EUR";
  const money = (cents: number) => formatMoney(cents, currency, locale);
  const period = result?.estimate.periodMonths === 12 ? copy.perYear : copy.perMonth;

  return (
    <section aria-labelledby={headingId} className="min-w-0">
      <h3 id={headingId} className="font-display text-h3 font-semibold text-ink">
        {copy.title}
      </h3>
      <p className="mt-2 text-small text-ink-2">{copy.text}</p>
      <form className="mt-6 grid gap-4" onSubmit={(e) => e.preventDefault()}>
        <Field label={copy.plan}>
          {(control) => (
            <Select
              {...control}
              value={planId}
              onChange={(e) => {
                if (isPaidPlanId(e.target.value)) setPlanId(e.target.value);
              }}
            >
              {paid.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
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
            value={stopIndex}
            aria-valuetext={formatInteger(events, locale)}
            onChange={(e) => onSlider(Number.parseInt(e.target.value, 10) || 0)}
            className="mt-2 h-11 w-full cursor-pointer accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          />
          <div className="flex justify-between text-micro text-ink-3 tabular-nums" aria-hidden="true">
            <span>{formatCompact(first, locale)}</span>
            <span>{formatCompact(last, locale)}</span>
          </div>
        </div>
        <Field label={copy.eventsInput}>{(control) => <Input {...control} inputMode="numeric" autoComplete="off" value={eventsText} onChange={(e) => onTyped(e.target.value)} onBlur={() => setEventsText(formatInteger(events, locale))} />}</Field>
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
                onClick={() => {
                  const next = result.cheaper?.plan.id;
                  if (isPaidPlanId(next)) setPlanId(next);
                }}
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
            <Link href={signupHref(planId, interval)} className={cn(buttonVariants({ variant: "secondary" }))}>
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
