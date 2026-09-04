import { regionGroupOf } from "@track-site/policy";

/**
 * Consent coverage from real decisions. The evidentiary record is `consent_snapshots`: one row per
 * distinct consent state a site has seen, with `event_count` = number of stored events that carried
 * it. Shares are therefore event-weighted ("x % of stored events carried an explicit signal"), the
 * only measurement the platform actually has. No snapshots → `null`, never a made-up figure.
 */
export interface ConsentSnapshotRow {
  granted: string[];
  source: string;
  region: string | null;
  gpc: boolean | null;
  eventCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
}

export interface CoverageSlice {
  key: string;
  events: number;
  /** Share of all counted events. */
  share: number;
  explicitShare: number;
  analyticsShare: number;
  marketingShare: number;
}

export interface CoverageSummary {
  /** Stored events that reference a consent state. */
  events: number;
  /** Distinct consent states. */
  states: number;
  explicitShare: number;
  purposeShare: { analytics: number; marketing: number; personalization: number };
  gpcShare: number;
  byRegion: CoverageSlice[];
  bySource: CoverageSlice[];
  firstSeenAt: Date;
  lastSeenAt: Date;
  /** No decision recorded for more than `COVERAGE_STALE_AFTER_MS`. */
  stale: boolean;
}

export const COVERAGE_STALE_AFTER_MS = 7 * 86_400_000;

const ratio = (part: number, total: number): number => (total > 0 ? part / total : 0);

interface Acc {
  events: number;
  explicit: number;
  analytics: number;
  marketing: number;
}

function slice(key: string, acc: Acc, total: number): CoverageSlice {
  return { key, events: acc.events, share: ratio(acc.events, total), explicitShare: ratio(acc.explicit, acc.events), analyticsShare: ratio(acc.analytics, acc.events), marketingShare: ratio(acc.marketing, acc.events) };
}

export function summarizeCoverage(rows: ConsentSnapshotRow[], now: Date = new Date()): CoverageSummary | null {
  const counted = rows.filter((r) => Number.isFinite(r.eventCount) && r.eventCount > 0);
  const events = counted.reduce((sum, r) => sum + r.eventCount, 0);
  if (events === 0) return null;

  let explicit = 0;
  let analytics = 0;
  let marketing = 0;
  let personalization = 0;
  let gpc = 0;
  const byRegion = new Map<string, Acc>();
  const bySource = new Map<string, Acc>();
  let firstSeenAt = counted[0]!.firstSeenAt;
  let lastSeenAt = counted[0]!.lastSeenAt;

  for (const r of counted) {
    const isExplicit = r.source !== "default";
    const hasAnalytics = r.granted.includes("analytics");
    // GPC is an opt-out of sale/sharing: marketing counts as granted only without it (mirrors applyGpc)
    const hasMarketing = r.granted.includes("marketing") && !r.gpc;
    if (isExplicit) explicit += r.eventCount;
    if (hasAnalytics) analytics += r.eventCount;
    if (hasMarketing) marketing += r.eventCount;
    if (r.granted.includes("personalization") && !r.gpc) personalization += r.eventCount;
    if (r.gpc) gpc += r.eventCount;
    for (const [map, key] of [
      [byRegion, regionGroupOf(r.region)],
      [bySource, r.source],
    ] as const) {
      const acc = map.get(key) ?? { events: 0, explicit: 0, analytics: 0, marketing: 0 };
      acc.events += r.eventCount;
      if (isExplicit) acc.explicit += r.eventCount;
      if (hasAnalytics) acc.analytics += r.eventCount;
      if (hasMarketing) acc.marketing += r.eventCount;
      map.set(key, acc);
    }
    if (r.firstSeenAt < firstSeenAt) firstSeenAt = r.firstSeenAt;
    if (r.lastSeenAt > lastSeenAt) lastSeenAt = r.lastSeenAt;
  }

  const toSlices = (map: Map<string, Acc>) =>
    Array.from(map.entries())
      .map(([key, acc]) => slice(key, acc, events))
      .sort((a, b) => b.events - a.events || a.key.localeCompare(b.key));

  return {
    events,
    states: counted.length,
    explicitShare: ratio(explicit, events),
    purposeShare: { analytics: ratio(analytics, events), marketing: ratio(marketing, events), personalization: ratio(personalization, events) },
    gpcShare: ratio(gpc, events),
    byRegion: toSlices(byRegion),
    bySource: toSlices(bySource),
    firstSeenAt,
    lastSeenAt,
    stale: now.getTime() - lastSeenAt.getTime() > COVERAGE_STALE_AFTER_MS,
  };
}
