import type { Tone } from "@track-site/ui";
import type { OpsAuditCategory } from "@/server/ops/audit";

/**
 * Label helpers of the Audit module. `t` is the `opsAudit` namespace translator; unknown codes fall back
 * to the raw value so nothing is ever hidden or invented.
 */
export type TranslateFn = ((key: string, values?: Record<string, string | number | Date>) => string) & { has: (key: string) => boolean };

const pick = (t: TranslateFn, key: string, fallback: string): string => (t.has(key) ? t(key) : fallback);

export function actorKindLabel(t: TranslateFn, kind: string): string {
  return pick(t, `actorKinds.${kind}`, kind);
}

export function categoryLabel(t: TranslateFn, category: OpsAuditCategory): string {
  return pick(t, `categories.${category}`, category);
}

export function scopeLabel(t: TranslateFn, scope: string): string {
  return pick(t, `filters.scopes.${scope}`, scope);
}

/** Operator and console actions stand out (info); customer-side categories stay neutral. */
export function categoryTone(category: OpsAuditCategory): Tone {
  return category === "platform" ? "info" : "neutral";
}

/** An entry belongs to the break-glass trail when its action or its metadata carries a grant. */
export function isBreakGlassEntry(entry: { action: string; metadata: ReadonlyArray<{ path: string }> }): boolean {
  return entry.action.includes("break_glass") || entry.metadata.some((row) => row.path === "breakGlassId");
}
