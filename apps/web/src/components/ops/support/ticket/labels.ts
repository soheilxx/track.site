import type { SupportDeliveryStatus, SupportTicketPriority, SupportTicketStatus } from "@track-site/db";
import type { Tone } from "@track-site/ui";
import type { TicketActionError } from "@/server/ops/actions/support-ticket";
import type { SlaClockState } from "@/server/support/ticket";

/**
 * Label helpers of the ticket detail. `t` is the `supportTicket` namespace translator; vocabulary
 * (statuses, priorities, …) lives in the shared `support` namespace and is passed as its own translator
 * where needed. Unknown codes fall back to the generic text, never to a hidden state.
 */
export type TranslateFn = ((key: string, values?: Record<string, string | number | Date>) => string) & { has: (key: string) => boolean };

const KNOWN_ERRORS: ReadonlySet<string> = new Set([
  "forbidden",
  "invalid",
  "not_found",
  "unchanged",
  "invalid_transition",
  "invalid_state",
  "confirmation_required",
  "invalid_assignee",
  "invalid_macro",
  "invalid_target",
  "mail_failed",
  "generic",
]);

export function errorLabel(t: TranslateFn, error: TicketActionError | string | null | undefined): string {
  return t(`errors.${error && KNOWN_ERRORS.has(error) ? error : "generic"}`);
}

/** Upload refusals of `/api/support/attachments` (the route's `code`). */
export function uploadErrorLabel(t: TranslateFn, code: string | null | undefined): string {
  const key = `upload.errors.${code ?? "generic"}`;
  return t.has(key) ? t(key) : t("upload.errors.generic");
}

export const STATUS_TONE: Record<SupportTicketStatus, Tone> = {
  new: "info",
  open: "warn",
  pending: "neutral",
  on_hold: "neutral",
  solved: "ok",
  closed: "neutral",
  spam: "bad",
};

export const PRIORITY_TONE: Record<SupportTicketPriority, Tone> = {
  low: "neutral",
  normal: "info",
  high: "warn",
  urgent: "bad",
};

export const DELIVERY_TONE: Record<SupportDeliveryStatus, Tone> = {
  queued: "neutral",
  sent: "info",
  delivered: "ok",
  bounced: "bad",
  complained: "bad",
  failed: "bad",
  na: "neutral",
};

export const SLA_TONE: Record<SlaClockState, Tone> = {
  none: "neutral",
  met: "ok",
  late: "warn",
  paused: "neutral",
  breached: "bad",
  warning: "warn",
  on_track: "ok",
};
