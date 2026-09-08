/**
 * Track Operations → Support → Reports (docs/18 §"Reports", task T7). Server components except the recharts
 * island in `charts.tsx`; every figure comes from `@/server/support/reports` (counts, durations and rates over
 * the support tables — never subjects, message bodies or requester details).
 */
export { RangeFilter } from "./range-filter";
export { ExportForm } from "./export-form";
export { ReportKpis } from "./kpis";
export { VolumeSection } from "./volume";
export { BacklogSection } from "./backlog";
export { TimesSection } from "./times";
export { SlaSection } from "./sla";
export { AgentsSection } from "./agents";
export { CsatSection } from "./csat";
export { CategoriesSection, TagsSection } from "./top-lists";
export { OrganisationsSection } from "./organisations";
export { MethodNotes } from "./method";
export { Figure, Note, Section, ShareBar, TableDisclosure, TableFrame } from "./section";
export { count, dateTime, day, decimal, duration, percent, shortDay } from "./format";
