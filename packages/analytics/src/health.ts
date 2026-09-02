/**
 * Tracking Health Score (0-100) from consent coverage, event coverage, schema quality,
 * dedup rate and delivery health. Shared by dashboard, agent tools and alerts.
 */
export interface HealthInputs {
  /** share of accepted events carrying an explicit consent signal (0..1) */
  consentCoverage: number | null;
  /** planned critical events that produced at least one event in the window */
  criticalEventsSeen: number;
  criticalEventsPlanned: number;
  /** share of events without schema/PII findings (0..1) */
  schemaQuality: number | null;
  /** share of duplicates among received (0..1) */
  duplicateRate: number | null;
  /** share of successful deliveries (0..1) */
  deliverySuccess: number | null;
  /** integrations with expired or invalid credentials */
  unhealthyIntegrations: number;
  totalIntegrations: number;
  /** minutes since the last accepted browser event; null when never */
  minutesSinceLastBrowserEvent: number | null;
}

export interface HealthComponent {
  score: number;
  weight: number;
  detail: string;
}

export interface HealthScore {
  score: number;
  components: Record<string, HealthComponent>;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function computeHealthScore(i: HealthInputs): HealthScore {
  const components: Record<string, HealthComponent> = {};
  components.consent = {
    score: i.consentCoverage === null ? 50 : clamp(i.consentCoverage * 100),
    weight: 0.2,
    detail: i.consentCoverage === null ? "No events yet" : `${Math.round(i.consentCoverage * 100)}% of events carry an explicit consent signal`,
  };
  const coverage = i.criticalEventsPlanned === 0 ? 1 : i.criticalEventsSeen / i.criticalEventsPlanned;
  components.coverage = {
    score: clamp(coverage * 100),
    weight: 0.25,
    detail: `${i.criticalEventsSeen} of ${i.criticalEventsPlanned} critical events observed`,
  };
  components.schema = {
    score: i.schemaQuality === null ? 50 : clamp(i.schemaQuality * 100),
    weight: 0.15,
    detail: i.schemaQuality === null ? "No events yet" : `${Math.round(i.schemaQuality * 100)}% of events pass schema and PII checks`,
  };
  const dup = i.duplicateRate ?? 0;
  components.dedup = {
    score: clamp(100 - dup * 400),
    weight: 0.1,
    detail: `${(dup * 100).toFixed(1)}% duplicates`,
  };
  const deliveryScore = i.deliverySuccess === null ? 50 : clamp(i.deliverySuccess * 100);
  const credentialPenalty = i.totalIntegrations === 0 ? 0 : (i.unhealthyIntegrations / i.totalIntegrations) * 50;
  components.delivery = {
    score: clamp(deliveryScore - credentialPenalty),
    weight: 0.2,
    detail:
      i.deliverySuccess === null
        ? "No deliveries yet"
        : `${Math.round(i.deliverySuccess * 100)}% delivered, ${i.unhealthyIntegrations} integration(s) with credential problems`,
  };
  const staleness = i.minutesSinceLastBrowserEvent;
  components.liveness = {
    score: staleness === null ? 0 : staleness < 60 ? 100 : staleness < 24 * 60 ? 70 : 20,
    weight: 0.1,
    detail: staleness === null ? "No browser event received yet" : `Last browser event ${staleness} min ago`,
  };
  const total = Object.values(components).reduce((acc, c) => acc + c.score * c.weight, 0);
  const weight = Object.values(components).reduce((acc, c) => acc + c.weight, 0);
  return { score: clamp(total / weight), components };
}
