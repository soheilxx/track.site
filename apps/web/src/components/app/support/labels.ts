import type { SupportActionError } from "@/server/actions/support";

/**
 * Label helpers shared by the server and client components of the support portal. `t` is the
 * `supportPortal` namespace translator; `tVocab` the shared `support` vocabulary (statuses, priorities,
 * channels, event kinds). Unknown codes fall back to a generic message or the raw value — nothing is hidden.
 */
export type TranslateFn = ((key: string, values?: Record<string, string | number | Date>) => string) & { has: (key: string) => boolean };

/** Semantic tone of a ticket status for the customer (text always accompanies the colour). */
export type StatusTone = "ok" | "warn" | "bad" | "info" | "neutral";

export function statusTone(status: string): StatusTone {
  switch (status) {
    case "new":
      return "info";
    case "open":
      return "info";
    case "pending":
      return "warn";
    case "on_hold":
      return "neutral";
    case "solved":
      return "ok";
    case "closed":
      return "neutral";
    default:
      return "neutral";
  }
}

export function priorityTone(priority: string): StatusTone {
  switch (priority) {
    case "urgent":
      return "bad";
    case "high":
      return "warn";
    default:
      return "neutral";
  }
}

const KNOWN_ERRORS: ReadonlySet<string> = new Set(["forbidden", "invalid", "not_found", "invalid_state", "attachments", "confirmation_required", "already_rated", "csat_disabled", "generic"]);

/** Action error code → message (unknown codes read as the generic error). */
export function errorLabel(t: TranslateFn, code: SupportActionError | string | null | undefined): string {
  return t(`errors.${code && KNOWN_ERRORS.has(code) ? code : "generic"}`);
}

/** Localized category (the stored value for one the portal does not know, e.g. a contact-form topic). */
export function categoryLabel(t: TranslateFn, category: string | null | undefined): string {
  if (!category) return t("common.none");
  const key = `categories.${category}`;
  return t.has(key) ? t(key) : category;
}

/** Vocabulary label from the shared `support` namespace (`status.<x>`, `priority.<x>`, `channel.<x>`, `eventKind.<x>`). */
export function vocabLabel(tVocab: TranslateFn, group: "status" | "priority" | "channel" | "eventKind", value: string): string {
  const key = `${group}.${value}`;
  return tVocab.has(key) ? tVocab(key) : value;
}
