/**
 * Label helpers of the SLA policy editor (namespace `supportSla`). `t` is the namespace translator
 * (`useTranslations("supportSla")` / `getTranslations("supportSla")`); unknown codes fall back to the
 * generic message so nothing hides behind a missing key.
 */
export type TranslateFn = ((key: string, values?: Record<string, string | number | Date>) => string) & { has: (key: string) => boolean };

export function errorLabel(t: TranslateFn, code: string | null | undefined, values?: Record<string, string | number>): string {
  const key = `errors.${code ?? "generic"}`;
  return t.has(key) ? t(key, values) : t("errors.generic");
}

export function fieldErrorLabel(t: TranslateFn, code: string | undefined): string | undefined {
  if (!code) return undefined;
  const key = `fieldErrors.${code}`;
  return t.has(key) ? t(key) : t("fieldErrors.invalid");
}

export function noticeLabel(t: TranslateFn, notice: string | null | undefined): string | null {
  if (!notice) return null;
  const key = `notices.${notice}`;
  return t.has(key) ? t(key) : null;
}

/** Catalogue plan id → localized label (the raw id for an unknown plan). */
export function planLabel(t: TranslateFn, planId: string): string {
  const key = `plans.${planId}`;
  return t.has(key) ? t(key) : planId;
}
