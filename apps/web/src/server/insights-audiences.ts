/**
 * Consent-aware audiences (Insights › Audiences) — the pure part. Segments are derived on read from
 * first-party events with marketing consent; nothing is exported to vendors from here. Identity is
 * `user_id`, else `anonymous_id`; events without either cannot be assigned and are counted as such.
 */
export const AUDIENCE_EVENTS = [
  "purchase",
  "generate_lead",
  "add_to_cart",
  "begin_checkout",
  "sign_up",
] as const;
export type AudienceEvent = (typeof AUDIENCE_EVENTS)[number];

export const HIGH_VALUE_THRESHOLD = 100;

export interface AudienceEventRow {
  name: string;
  subject: string | null;
  marketing: boolean;
  value: number | null;
}

export type SegmentKey = "buyers" | "highValue" | "abandoners" | "leads" | "signups";

export interface AudienceSegments {
  segments: Array<{ key: SegmentKey; size: number; events: string }>;
  /** Events that were excluded because marketing consent was not granted (never inferred). */
  withoutConsent: number;
  /** Events with consent but neither user id nor anonymous id — they belong to no segment. */
  withoutIdentity: number;
  considered: number;
}

export function audienceSegments(rows: AudienceEventRow[]): AudienceSegments {
  const consented = rows.filter((r) => r.marketing);
  const subjects = (
    name: AudienceEvent,
    predicate: (r: AudienceEventRow) => boolean = () => true,
  ) =>
    new Set(
      consented.filter((r) => r.name === name && r.subject && predicate(r)).map((r) => r.subject!),
    );
  const buyers = subjects("purchase");
  const highValue = subjects("purchase", (r) => (r.value ?? 0) >= HIGH_VALUE_THRESHOLD);
  const abandoners = new Set(
    [...subjects("add_to_cart"), ...subjects("begin_checkout")].filter((id) => !buyers.has(id)),
  );
  return {
    segments: [
      { key: "buyers", size: buyers.size, events: "purchase" },
      { key: "highValue", size: highValue.size, events: `purchase ≥ ${HIGH_VALUE_THRESHOLD}` },
      { key: "abandoners", size: abandoners.size, events: "add_to_cart / begin_checkout" },
      { key: "leads", size: subjects("generate_lead").size, events: "generate_lead" },
      { key: "signups", size: subjects("sign_up").size, events: "sign_up" },
    ],
    withoutConsent: rows.length - consented.length,
    withoutIdentity: consented.filter((r) => !r.subject).length,
    considered: rows.length,
  };
}
