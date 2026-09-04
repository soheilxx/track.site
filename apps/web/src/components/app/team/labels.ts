/**
 * Label helpers shared by the server and client components of the Team & Access module. `t` is the
 * `team` namespace translator (`getTranslations("team")` or `useTranslations("team")`); unknown codes
 * fall back to a generic message or the raw value so nothing is ever hidden.
 */
export type TranslateFn = ((key: string, values?: Record<string, string | number | Date>) => string) & { has: (key: string) => boolean };

/** Action error code → message (unknown codes read as the generic error). */
export function errorLabel(t: TranslateFn, code: string | null | undefined, values?: Record<string, string | number>): string {
  const key = `errors.${code ?? "generic"}`;
  return t.has(key) ? t(key, values) : t("errors.generic");
}

/** Localized role name (the raw code for an unknown stored role). */
export function roleLabel(t: TranslateFn, role: string): string {
  const key = `roles.labels.${role}`;
  return t.has(key) ? t(key) : role;
}

export function permissionLabel(t: TranslateFn, permission: string): string {
  const key = `roles.permissions.${permission.replace(".", "_")}`;
  return t.has(key) ? t(key) : permission;
}

export function areaLabel(t: TranslateFn, area: string): string {
  const key = `roles.areas.${area}`;
  return t.has(key) ? t(key) : area;
}

export function changeTypeLabel(t: TranslateFn, changeType: string): string {
  const key = `approvals.types.${changeType}.label`;
  return t.has(key) ? t(key) : changeType;
}

export function categoryLabel(t: TranslateFn, category: string): string {
  const key = `audit.categories.${category}`;
  return t.has(key) ? t(key) : category;
}
