import {
  ALERT_THRESHOLD_DEFAULTS,
  ALERT_THRESHOLD_FIELDS,
  type AlertRuleKind,
  type AlertThreshold,
  type AlertThresholdField,
} from "@track-site/db/schema";

/**
 * Threshold form parsing of the alert rules (client-safe, no server imports): the rule form and the
 * server action parse the same raw form values with the same bounds (`ALERT_THRESHOLD_FIELDS` of
 * `@track-site/db`), and the plain-language preview reads the same normalized numbers. Nothing is
 * invented: a missing or unparsable field is an error, never silently replaced by a default — the
 * defaults only pre-fill an empty form.
 */
export type ThresholdFieldError = "required" | "number" | "integer" | "range";

export type ThresholdParseResult =
  | { ok: true; threshold: AlertThreshold }
  | { ok: false; errors: Record<string, ThresholdFieldError> };

export function thresholdFields(kind: AlertRuleKind): readonly AlertThresholdField[] {
  return ALERT_THRESHOLD_FIELDS[kind];
}

export function thresholdDefaults(kind: AlertRuleKind): AlertThreshold {
  return { ...ALERT_THRESHOLD_DEFAULTS[kind] };
}

/** Raw form values (strings from inputs or numbers from stored rules) → validated threshold. */
export function parseThresholdInput(
  kind: AlertRuleKind,
  raw: Record<string, unknown>,
): ThresholdParseResult {
  const threshold: AlertThreshold = {};
  const errors: Record<string, ThresholdFieldError> = {};
  for (const field of ALERT_THRESHOLD_FIELDS[kind]) {
    const value = raw[field.key];
    const text =
      typeof value === "number"
        ? String(value)
        : typeof value === "string"
          ? value.trim().replace(",", ".")
          : "";
    if (text === "") {
      errors[field.key] = "required";
      continue;
    }
    const num = Number(text);
    if (!Number.isFinite(num)) {
      errors[field.key] = "number";
      continue;
    }
    if (field.integer && !Number.isInteger(num)) {
      errors[field.key] = "integer";
      continue;
    }
    if (num < field.min || num > field.max) {
      errors[field.key] = "range";
      continue;
    }
    threshold[field.key] = num;
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, threshold };
}

/** Values the preview sentence needs, derived from the threshold with the field defaults for anything missing. */
export function previewValues(
  kind: AlertRuleKind,
  threshold: Partial<AlertThreshold>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const field of ALERT_THRESHOLD_FIELDS[kind]) {
    const v = threshold[field.key];
    out[field.key] =
      typeof v === "number" && Number.isFinite(v) ? v : ALERT_THRESHOLD_DEFAULTS[kind][field.key]!;
  }
  if (typeof out.windowMinutes === "number")
    out.windowHours = Math.round((out.windowMinutes / 60) * 10) / 10;
  if (typeof out.lagSeconds === "number")
    out.lagMinutes = Math.round((out.lagSeconds / 60) * 10) / 10;
  return out;
}

/** Reads `threshold.<key>` fields of a submitted form into the raw record the parser expects. */
export function thresholdFromForm(
  kind: AlertRuleKind,
  get: (name: string) => unknown,
): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  for (const field of ALERT_THRESHOLD_FIELDS[kind]) raw[field.key] = get(`threshold.${field.key}`);
  return raw;
}
