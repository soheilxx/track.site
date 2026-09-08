/**
 * Track Operations → Growth (docs/17, task O7). Server components except the recharts island in
 * `charts.tsx`; every figure comes from `@/server/ops/growth` (counts and rates over the platform's own
 * tables — never event payloads or end-user data).
 */
export { GrowthKpis } from "./kpis";
export { SignupsSection } from "./signups";
export { FunnelSection } from "./funnel";
export { RetentionSection } from "./retention";
export { PlanMixSection } from "./plan-mix";
export { ConnectorsSection } from "./connectors";
export { MethodNotes } from "./method";
export { Figure, Section, ShareBar, TableDisclosure, TableFrame } from "./section";
export { count, dateTime, day, daysValue, percent, shortDay, signedDelta } from "./format";
