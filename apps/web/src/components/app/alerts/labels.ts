import type { AlertActionError } from "@/server/actions/alerts";

type Translate = (key: string, values?: Record<string, string | number>) => string;

const KNOWN: ReadonlySet<string> = new Set([
  "forbidden",
  "invalid",
  "not_found",
  "vault_missing",
  "signing",
  "unchanged",
  "lint",
  "approval_required",
  "in_use",
  "invalid_email",
  "invalid_url",
  "insecure_url",
  "credentials_in_url",
  "private_host",
  "not_slack",
  "generic",
]);

/** Localized message for an action error; unknown codes fall back to the generic text. */
export function errorLabel(
  t: Translate,
  error: AlertActionError | string | null | undefined,
): string {
  return t(`errors.${error && KNOWN.has(error) ? error : "generic"}`);
}

const FIELD_ERRORS: ReadonlySet<string> = new Set([
  "required",
  "invalid",
  "number",
  "integer",
  "range",
  "short",
]);

/** Localized message for a field error code from the server or the client-side parser. */
export function fieldErrorLabel(
  t: Translate,
  code: string | undefined,
  bounds?: { min: number; max: number },
): string | undefined {
  if (!code) return undefined;
  if (code === "range" && bounds)
    return t("fieldErrors.range", { min: bounds.min, max: bounds.max });
  if (FIELD_ERRORS.has(code)) return t(`fieldErrors.${code}`, bounds ?? {});
  if (KNOWN.has(code)) return t(`errors.${code}`);
  return t("fieldErrors.invalid");
}
