import { CLICK_ID_PARAMS } from "@track-site/core";
import { DESTINATION_CLICK_IDS, isConnectorType } from "@track-site/policy";

/**
 * Attribution & Click-ID Health (redesign supplement §8, module 11) — the pure part.
 *
 * Everything here is a deterministic derivation from stored records; `insights.ts` runs the SQL and
 * hands the grouped rows to these functions. The module keeps three evidence classes strictly apart:
 *
 * - observed: counted from `events.click_ids`, `events.consent`, `events.deliveries` and
 *   `attribution_touchpoints` exactly as the pipeline stored them;
 * - modelled: a hint derived with a stated heuristic or extrapolation (paid-traffic markers, the
 *   consent gap). Every modelled value carries the assumption it rests on and is `null` whenever the
 *   inputs are missing — it is never a substitute for a fact;
 * - unknown: what Track cannot know (click ids on events without marketing consent are never
 *   captured; vendor-side acceptance of a forwarded id is not visible to the router).
 */

export const RANGE_DAYS = [7, 30] as const;
export type RangeDays = (typeof RANGE_DAYS)[number];

/** `?range=` query value → 7 or 30 days (30 is the default and the maximum window). */
export function parseRange(value: string | string[] | undefined): RangeDays {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "7" ? 7 : 30;
}

export function windowFor(
  days: RangeDays,
  now: Date = new Date(),
): { from: Date; to: Date; days: RangeDays } {
  const to = new Date(now.getTime());
  const from = new Date(to.getTime() - days * 86_400_000);
  return { from, to, days };
}

/** Vendor family of a click-id parameter (from the core allow-list); unknown parameters are `other`. */
export function vendorOf(param: string): string {
  return (CLICK_ID_PARAMS as Record<string, string>)[param] ?? "other";
}

/** Click-id parameters a destination may receive (never cross-vendor); empty for unknown connector types. */
export function acceptedClickIds(connectorType: string): string[] {
  return isConnectorType(connectorType) ? [...DESTINATION_CLICK_IDS[connectorType]] : [];
}

/**
 * Paid-traffic markers for the modelled hint "paid traffic without a click id": UTM mediums that
 * advertisers use for paid campaigns and referrer hosts that only ad servers use. A `google.com`
 * or `facebook.com` referrer is deliberately NOT in the list — it is mostly organic — which is why
 * this stays a hint and never a fact.
 */
export const PAID_MEDIUMS = [
  "cpc",
  "ppc",
  "paid",
  "paidsearch",
  "paid_search",
  "paid-search",
  "paidsocial",
  "paid_social",
  "paid-social",
  "display",
  "cpm",
  "retargeting",
  "remarketing",
  "sem",
  "social-paid",
  "affiliate",
] as const;
export const AD_SERVER_REFERRER_PATTERN =
  "^https?://([a-z0-9-]+\\.)*(googleadservices\\.com|doubleclick\\.net|googlesyndication\\.com|syndicatedsearch\\.goog|bat\\.bing\\.com|ads\\.tiktok\\.com|ads\\.linkedin\\.com|ads\\.reddit\\.com|ads\\.pinterest\\.com|ads\\.snapchat\\.com|ads\\.x\\.com|taboola\\.com|outbrain\\.com|adroll\\.com|criteo\\.com|awin1\\.com|impact\\.com)(/|$)";

/** One grouped row per click-id parameter, as `insights.ts` selects it. */
export interface ClickIdRow {
  param: string;
  events: number;
  values: number;
  originUrl: number;
  originStorage: number;
  originServer: number;
  originInherited: number;
  withoutConsent: number;
  firstSeen: Date | null;
  lastSeen: Date | null;
  /** Observed `expires_at - captured_at` in seconds (min/max across the window); null when absent. */
  ttlMinSeconds: number | null;
  ttlMaxSeconds: number | null;
  /** Median / maximum span between the first and the last event carrying the same id value, in seconds. */
  medianSpanSeconds: number | null;
  maxSpanSeconds: number | null;
}

export type ClickIdOrigin = "url" | "storage" | "server" | "inherited";

export interface ClickIdSummary extends ClickIdRow {
  vendor: string;
  /** Observed lifetime in whole days (min/max); null when the window has no such id. */
  ttlDays: { min: number; max: number } | null;
  origins: Array<{ origin: ClickIdOrigin; count: number; share: number }>;
  medianSpanHours: number | null;
  maxSpanHours: number | null;
}

const secondsToDays = (s: number) => Math.round(s / 86_400);
const secondsToHours = (s: number) => Math.round((s / 3_600) * 10) / 10;

/** Adds vendor family, origin shares and readable lifetimes; sorts by volume, then name. */
export function summarizeClickIds(rows: ClickIdRow[]): ClickIdSummary[] {
  return rows
    .map((row) => {
      const originCounts: Array<[ClickIdOrigin, number]> = [
        ["url", row.originUrl],
        ["storage", row.originStorage],
        ["server", row.originServer],
        ["inherited", row.originInherited],
      ];
      const total = originCounts.reduce((a, [, n]) => a + n, 0);
      return {
        ...row,
        vendor: vendorOf(row.param),
        ttlDays:
          row.ttlMinSeconds === null || row.ttlMaxSeconds === null
            ? null
            : { min: secondsToDays(row.ttlMinSeconds), max: secondsToDays(row.ttlMaxSeconds) },
        origins: originCounts
          .filter(([, n]) => n > 0)
          .map(([origin, count]) => ({ origin, count, share: total > 0 ? count / total : 0 })),
        medianSpanHours:
          row.medianSpanSeconds === null ? null : secondsToHours(row.medianSpanSeconds),
        maxSpanHours: row.maxSpanSeconds === null ? null : secondsToHours(row.maxSpanSeconds),
      };
    })
    .sort((a, b) => b.events - a.events || a.param.localeCompare(b.param));
}

export interface Totals {
  total: number;
  marketing: number;
  withClickIds: number;
  clickIdsWithoutConsent: number;
  firstEventAt: Date | null;
  lastEventAt: Date | null;
}

/** Share of events with marketing consent that carry at least one click id; null when nothing is measurable. */
export function captureRate(t: Pick<Totals, "marketing" | "withClickIds">): number | null {
  if (t.marketing <= 0) return null;
  return Math.min(1, t.withClickIds / t.marketing);
}

/**
 * Modelled: how many click ids the missing marketing consent may have cost. Assumes the consented and
 * the non-consented visitors arrive from paid channels at the same rate — an extrapolation, so it is
 * `null` unless a capture rate was actually observed and there are events without consent.
 */
export function consentGapEstimate(
  t: Pick<Totals, "total" | "marketing" | "withClickIds">,
): number | null {
  const rate = captureRate(t);
  const withoutConsent = t.total - t.marketing;
  if (rate === null || rate === 0 || withoutConsent <= 0) return null;
  return Math.round(withoutConsent * rate);
}

export interface DestinationInput {
  id: string;
  name: string;
  connectorType: string;
  status: string;
  testMode: boolean;
  pausedAt: Date | null;
}

/** One grouped row per (destination, click-id parameter), as `insights.ts` selects it. */
export interface ForwardingRow {
  integrationId: string;
  param: string;
  eligible: number;
  delivered: number;
  failed: number;
  pending: number;
  notRouted: number;
  expiredAtDelivery: number;
  lastDeliveredAt: Date | null;
}

export type ForwardingVerdict =
  | "forwarding"
  | "partial"
  | "failing"
  | "not_delivered"
  | "no_eligible"
  | "inactive"
  | "unsupported";

export interface DestinationForwarding extends DestinationInput {
  accepts: string[];
  verdict: ForwardingVerdict;
  eligible: number;
  /** Delivered while the id was still valid (the router drops expired ids before dispatch). */
  deliveredWithId: number;
  expiredAtDelivery: number;
  failed: number;
  pending: number;
  notRouted: number;
  lastForwardedAt: Date | null;
  perParam: Array<{ param: string; eligible: number; deliveredWithId: number; failed: number }>;
}

/** Whether the integration is in a state in which the router dispatches events to it at all. */
export function isActiveDestination(d: Pick<DestinationInput, "status" | "pausedAt">): boolean {
  return d.status === "connected" && d.pausedAt === null;
}

export function forwardingVerdict(
  d: Pick<DestinationInput, "status" | "pausedAt">,
  accepts: string[],
  agg: {
    eligible: number;
    deliveredWithId: number;
    failed: number;
    pending: number;
    notRouted: number;
    expiredAtDelivery: number;
  },
): ForwardingVerdict {
  if (accepts.length === 0) return "unsupported";
  if (!isActiveDestination(d)) return "inactive";
  if (agg.eligible === 0) return "no_eligible";
  if (agg.deliveredWithId > 0)
    return agg.failed === 0 &&
      agg.notRouted === 0 &&
      agg.expiredAtDelivery === 0 &&
      agg.pending === 0
      ? "forwarding"
      : "partial";
  return agg.failed > 0 ? "failing" : "not_delivered";
}

/** Joins the destination list with the grouped forwarding rows; destinations without rows keep zero counts. */
export function buildDestinations(
  destinations: DestinationInput[],
  rows: ForwardingRow[],
): DestinationForwarding[] {
  return destinations
    .map((d) => {
      const accepts = acceptedClickIds(d.connectorType);
      const mine = rows.filter((r) => r.integrationId === d.id && accepts.includes(r.param));
      const sum = (pick: (r: ForwardingRow) => number) => mine.reduce((a, r) => a + pick(r), 0);
      const deliveredWithId = sum((r) => Math.max(0, r.delivered - r.expiredAtDelivery));
      const agg = {
        eligible: sum((r) => r.eligible),
        deliveredWithId,
        failed: sum((r) => r.failed),
        pending: sum((r) => r.pending),
        notRouted: sum((r) => r.notRouted),
        expiredAtDelivery: sum((r) => r.expiredAtDelivery),
      };
      const lastForwardedAt = mine.reduce<Date | null>(
        (acc, r) =>
          r.lastDeliveredAt && (!acc || r.lastDeliveredAt > acc) ? r.lastDeliveredAt : acc,
        null,
      );
      return {
        ...d,
        accepts,
        verdict: forwardingVerdict(d, accepts, agg),
        ...agg,
        lastForwardedAt,
        perParam: accepts.map((param) => {
          const r = mine.find((x) => x.param === param);
          return {
            param,
            eligible: r?.eligible ?? 0,
            deliveredWithId: r ? Math.max(0, r.delivered - r.expiredAtDelivery) : 0,
            failed: r?.failed ?? 0,
          };
        }),
      };
    })
    .sort(
      (a, b) =>
        VERDICT_ORDER.indexOf(a.verdict) - VERDICT_ORDER.indexOf(b.verdict) ||
        a.name.localeCompare(b.name),
    );
}

/** Problems first, then working, then the ones with nothing to say. */
const VERDICT_ORDER: ForwardingVerdict[] = [
  "failing",
  "not_delivered",
  "partial",
  "forwarding",
  "inactive",
  "no_eligible",
  "unsupported",
];

export function verdictTone(v: ForwardingVerdict): "ok" | "warn" | "bad" | "neutral" {
  switch (v) {
    case "forwarding":
      return "ok";
    case "partial":
    case "not_delivered":
      return "warn";
    case "failing":
      return "bad";
    default:
      return "neutral";
  }
}

export interface DailyRow {
  day: string;
  total: number;
  marketing: number;
  withClickIds: number;
}

/** Fills the days of the window that have no row with zeros so the chart axis is continuous (UTC days). */
export function fillDays(rows: DailyRow[], from: Date, to: Date): DailyRow[] {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const out: DailyRow[] = [];
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  while (cursor.getTime() < to.getTime()) {
    const key = cursor.toISOString().slice(0, 10);
    out.push(byDay.get(key) ?? { day: key, total: 0, marketing: 0, withClickIds: 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

export interface TouchpointChannel {
  channel: string;
  touchpoints: number;
  visitors: number;
  withClickIds: number;
  lastAt: Date | null;
}

export interface AttributionHealth {
  window: { from: Date; to: Date; days: RangeDays };
  scope: { siteId: string; environmentId: string | null };
  /** Capture settings that were really in force: the published bundle of the environment, or the platform defaults. */
  config: {
    source: "published" | "default";
    version: number | null;
    capture: boolean;
    ttlDays: number;
  } | null;
  observed: Totals & { captureRate: number | null };
  clickIds: ClickIdSummary[];
  destinations: DestinationForwarding[];
  daily: DailyRow[];
  touchpoints: { total: number; channels: TouchpointChannel[] };
  modelled: {
    /** Events with marketing consent, a paid-traffic marker and no click id (heuristic, see PAID_MEDIUMS). */
    paidWithoutClickId: number | null;
    consentGapEstimate: number | null;
  };
  unknown: {
    eventsWithoutMarketingConsent: number;
    destinationsWithoutObservation: number;
  };
}

/** Platform behaviour when no configuration is published (worker `ingest.ts`: ttl 90 days, capture on). */
export const DEFAULT_CLICK_ID_CONFIG = { capture: true, ttlDays: 90 } as const;

export function configFromBundle(
  bundle: unknown,
  version: number | null,
): AttributionHealth["config"] {
  const consent =
    bundle && typeof bundle === "object"
      ? (bundle as { consent?: { click_ids?: { capture?: unknown; ttl_days?: unknown } } }).consent
      : undefined;
  const clickIds = consent?.click_ids;
  if (!clickIds || typeof clickIds.capture !== "boolean" || typeof clickIds.ttl_days !== "number")
    return { source: "default", version, ...DEFAULT_CLICK_ID_CONFIG };
  return { source: "published", version, capture: clickIds.capture, ttlDays: clickIds.ttl_days };
}
