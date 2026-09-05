"use client";

import { useState } from "react";
import type { PaidPlanId } from "@track-site/catalog";
import { useBillingInterval } from "./interval";
import { EVENT_STOPS, formatInteger, parseEventsInput } from "./pricing-helpers";
import { EventCalculatorView, PlanFinderView, PricingToolsStage, initialCalculatorState, initialFinderState, toInt, type CalculatorState, type FinderState, type PricingToolsProps } from "./pricing-tools-view";

export type { PricingToolsProps } from "./pricing-tools-view";

/**
 * Interactive plan finder and event-volume calculator (supplement §5): the state owner of the views
 * in `pricing-tools-view.tsx`. Loaded by `pricing-tools-island.tsx` once the section comes near the
 * viewport; until then the server-rendered initial state (`pricing-tools-static.tsx`) is on screen.
 */
export function PricingTools(props: PricingToolsProps) {
  return (
    <PricingToolsStage>
      <PlanFinder {...props} />
      <EventCalculator {...props} />
    </PricingToolsStage>
  );
}

function PlanFinder({ locale, finder }: PricingToolsProps) {
  const { interval } = useBillingInterval();
  const [state, setState] = useState<FinderState>(initialFinderState);
  const patch = (next: Partial<FinderState>) => setState((s) => ({ ...s, ...next }));
  return (
    <PlanFinderView
      locale={locale}
      copy={finder}
      interval={interval}
      state={state}
      actions={{
        setSites: (sites) => patch({ sites }),
        blurSites: () => patch({ sites: String(Math.max(1, toInt(state.sites))) }),
        setEventsIndex: (eventsIndex) => patch({ eventsIndex }),
        setTeam: (team) => patch({ team }),
        blurTeam: () => patch({ team: String(Math.max(1, toInt(state.team))) }),
        setRetentionId: (retentionId) => patch({ retentionId }),
      }}
    />
  );
}

function EventCalculator({ locale, plans, calculator, thresholds }: PricingToolsProps) {
  const { interval } = useBillingInterval();
  const [state, setState] = useState<CalculatorState>(() => initialCalculatorState(plans, locale));
  const patch = (next: Partial<CalculatorState>) => setState((s) => ({ ...s, ...next }));
  return (
    <EventCalculatorView
      locale={locale}
      plans={plans}
      copy={calculator}
      thresholds={thresholds}
      interval={interval}
      state={state}
      actions={{
        setPlanId: (planId: PaidPlanId) => patch({ planId }),
        setSlider: (index) => {
          const next = EVENT_STOPS[index];
          if (next !== undefined) patch({ events: next, eventsText: formatInteger(next, locale) });
        },
        setTyped: (raw) => {
          const parsed = parseEventsInput(raw);
          patch(parsed != null ? { eventsText: raw, events: parsed } : { eventsText: raw });
        },
        blurTyped: () => patch({ eventsText: formatInteger(state.events, locale) }),
      }}
    />
  );
}
