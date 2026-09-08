import type { InboxActionError } from "@/server/ops/actions/inbox";

type Translate = (key: string, values?: Record<string, string | number>) => string;

const KNOWN: ReadonlySet<string> = new Set([
  "forbidden",
  "invalid",
  "not_found",
  "unchanged",
  "invalid_transition",
  "confirmation_required",
  "invalid_assignee",
  "mail_failed",
  "generic",
]);

/** Localized message for an inbox action error; unknown codes fall back to the generic text. */
export function errorLabel(t: Translate, error: InboxActionError | string | null | undefined): string {
  return t(`errors.${error && KNOWN.has(error) ? error : "generic"}`);
}
