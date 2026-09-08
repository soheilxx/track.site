import type { SupportTicketPriority, SupportTicketStatus } from "@track-site/db";
import type { Tone } from "@track-site/ui";
import type { SlaStateKind } from "@/server/support/tickets";

/**
 * Label and tone helpers of the ticket queue. `t` is the `supportTickets` namespace translator; the shared
 * vocabulary (statuses, priorities, channels, SLA words) lives in namespace `support`. Unknown codes fall
 * back to the generic text so nothing is hidden or invented.
 */
export type TranslateFn = ((key: string, values?: Record<string, string | number | Date>) => string) & { has: (key: string) => boolean };

const KNOWN_ERRORS: ReadonlySet<string> = new Set(["forbidden", "invalid", "not_found", "confirmation_required", "invalid_assignee", "invalid_target", "nothing_applied", "too_many_views", "generic"]);

export function errorLabel(t: TranslateFn, code: string | null | undefined): string {
  return t(`errors.${code && KNOWN_ERRORS.has(code) ? code : "generic"}`);
}

/** Workflow status → tone (state, never decorative). */
export const STATUS_TONE: Record<SupportTicketStatus, Tone> = {
  new: "info",
  open: "info",
  pending: "warn",
  on_hold: "neutral",
  solved: "ok",
  closed: "neutral",
  spam: "neutral",
};

export const PRIORITY_TONE: Record<SupportTicketPriority, Tone> = {
  low: "neutral",
  normal: "info",
  high: "warn",
  urgent: "bad",
};

export const SLA_TONE: Record<SlaStateKind, Tone> = {
  none: "neutral",
  paused: "info",
  on_track: "ok",
  breached: "bad",
  met: "neutral",
};
