import type { Connector, CredentialRequirement } from "./connector.ts";
import { AFFILIATE_PRESETS, affiliateCredentialRequirements } from "./vendors/affiliate-presets.ts";

/**
 * Credential requirements of a concrete destination. Most connectors declare a static list in their meta;
 * the affiliate connector's list depends on the preset stored in `publicConfig.preset` (CJ needs a signature,
 * TUNE/Everflow a security token, inbound presets a webhook secret …). Consumers must treat `optional`
 * entries as never gating a step.
 */
export function credentialRequirementsFor(connector: Pick<Connector, "meta"> | null | undefined, publicConfig: Record<string, unknown> | null | undefined): CredentialRequirement[] {
  if (!connector) return [];
  if (connector.meta.type === "affiliate") {
    const presetKey = typeof publicConfig?.preset === "string" ? publicConfig.preset : null;
    const preset = presetKey ? (AFFILIATE_PRESETS[presetKey] ?? null) : null;
    return affiliateCredentialRequirements(preset);
  }
  return connector.meta.requiredCredentials;
}

/** Requirements that gate readiness: every non-optional entry without an active credential is missing. */
export function missingCredentialKinds(requirements: readonly CredentialRequirement[], refs: ReadonlyArray<{ kind: string; status: string }>): string[] {
  return requirements.filter((c) => !c.optional && !refs.some((r) => r.kind === c.kind && r.status === "active")).map((c) => c.kind);
}
