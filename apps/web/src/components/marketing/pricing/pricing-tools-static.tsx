import { EventCalculatorView, PlanFinderView, PricingToolsStage, initialCalculatorState, initialFinderState, type PricingToolsProps } from "./pricing-tools-view";

/**
 * Server-rendered initial state of the plan finder and the calculator: the same views with the same
 * default values (1 site, 500 000 events, 2 members, 90 days; Growth at 2 000 000 events, monthly)
 * and no handlers, so the pricing page's hydration bundle carries neither the tools nor the tariff
 * catalogue. The island replaces it with the interactive component when the section comes into view.
 */
export function PricingToolsStatic(props: PricingToolsProps) {
  return (
    <PricingToolsStage>
      <PlanFinderView locale={props.locale} copy={props.finder} interval="monthly" state={initialFinderState()} />
      <EventCalculatorView locale={props.locale} plans={props.plans} copy={props.calculator} thresholds={props.thresholds} interval="monthly" state={initialCalculatorState(props.plans, props.locale)} />
    </PricingToolsStage>
  );
}
