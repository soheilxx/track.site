/**
 * Shared constants of the ticket detail (client-safe: no server imports). The server modules
 * (`server/support/presence.ts`, `server/support/ticket.ts`) import the same values so the heartbeat
 * cadence, the staleness rule and the composer limits are defined once.
 */

/** The page sends a presence heartbeat this often (docs/18 §"Ticket detail"). */
export const PRESENCE_HEARTBEAT_MS = 15_000;
/** A presence row older than this is ignored (three missed heartbeats). */
export const PRESENCE_STALE_MS = 45_000;
/** "Typing" is reported while the operator changed the composer within this window. */
export const TYPING_WINDOW_MS = 10_000;
/** An operator counts as online in the assignee list when a heartbeat on any ticket is younger than this. */
export const OPERATOR_ONLINE_MS = 5 * 60_000;

/** Composer limits (characters of the message body; attachments are limited by `packages/db`). */
export const COMPOSER_MIN_CHARS = 1;
export const COMPOSER_MAX_CHARS = 20_000;

/** Statuses the "reply & set status" split button offers (closed and spam stay explicit actions). */
export const COMPOSER_STATUSES = ["open", "pending", "on_hold", "solved"] as const;
export type ComposerStatus = (typeof COMPOSER_STATUSES)[number];

/** The composer reports typing through this event; the presence island turns it into a `typing` heartbeat. */
export const TICKET_TYPING_EVENT = "track-support-ticket-typing";

/** Custom DOM event the keyboard shortcuts dispatch; the composer and the properties panel listen. */
export const TICKET_SHORTCUT_EVENT = "track-support-ticket-shortcut";
export type TicketShortcutAction = "reply" | "note" | "assign_self" | "solve";
