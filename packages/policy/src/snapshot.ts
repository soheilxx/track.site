import { canonicalJson, sha256Hex } from "@track-site/core";
import type { ConsentState } from "@track-site/events";

/**
 * Consent snapshots are the evidentiary record referenced by events. Identical states are
 * deduplicated per site via a stable hash so millions of events share a handful of rows.
 */
export interface ConsentSnapshotInput {
  siteId: string;
  policyVersion: string | null;
  granted: string[];
  vendors: string[];
  source: string;
  region: string | null;
  gpc: boolean | null;
}

export function consentSnapshotHash(input: ConsentSnapshotInput): string {
  return sha256Hex(
    canonicalJson({
      s: input.siteId,
      p: input.policyVersion,
      g: [...input.granted].sort(),
      v: [...input.vendors].sort(),
      src: input.source,
      r: input.region,
      gpc: input.gpc,
    }),
  );
}

export function snapshotFromConsent(siteId: string, consent: ConsentState, vendors: string[] = []): ConsentSnapshotInput {
  return {
    siteId,
    policyVersion: consent.policy_version,
    granted: consent.granted,
    vendors,
    source: consent.source,
    region: consent.region,
    gpc: consent.gpc,
  };
}
