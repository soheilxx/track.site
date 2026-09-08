/**
 * Limits and enumerations of the ticket queue (docs/18 §"Ticket list"), shared by the client components and
 * the server modules `@/server/support/tickets` / `@/server/support/views` (which re-export them). No imports:
 * this file is safe in either bundle (docs/17 §10 "Client bundles").
 */
export const TICKET_PAGE_SIZE = 50;
export const TICKET_EXPORT_MAX_ROWS = 5000;
/** tickets one bulk action may touch at once */
export const TICKET_BULK_MAX = 100;
export const TICKET_TAG_MAX = 20;
export const TICKET_TAG_LENGTH_MAX = 32;
/** lower-case slug-like tags: letters, digits, `-` and `_` */
export const TICKET_TAG_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;
export const TICKET_SEARCH_MAX = 80;
/**
 * An agent counts as "viewing" while their presence row is younger than this — the same window as the ticket
 * page's `PRESENCE_STALE_MS` (`../ticket/constants.ts`, three missed 15 s heartbeats), so the queue never shows
 * a colleague on a ticket the ticket page already treats as left.
 */
export const PRESENCE_TTL_MS = 45_000;
export const VIEW_NAME_MAX = 60;
export const SAVED_VIEWS_MAX = 50;
export const DATE_RANGE_MAX_DAYS = 365;

/** Mirrors of the `@track-site/db` enumerations for client bundles (a unit test guards against drift). */
export const TICKET_STATUSES = ["new", "open", "pending", "on_hold", "solved", "closed", "spam"] as const;
export const TICKET_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export const TICKET_CHANNELS = ["email", "form", "dashboard", "api"] as const;

export const TICKET_SORTS = ["updated_desc", "updated_asc", "created_desc", "created_asc", "priority_desc", "sla_due_asc", "number_desc", "number_asc"] as const;
export type TicketSort = (typeof TICKET_SORTS)[number];

/** SLA filter values (`any` = no filter); the live states are computed from real timestamps only. */
export const SLA_FILTERS = ["any", "on_track", "breached", "paused", "none"] as const;
export type SlaFilter = (typeof SLA_FILTERS)[number];

export const DATE_FIELDS = ["created", "updated", "resolved"] as const;
export type DateField = (typeof DATE_FIELDS)[number];

export const ASSIGNEE_FILTERS = ["any", "unassigned", "me"] as const;

export const DEFAULT_VIEW_KEYS = ["unassigned", "mine", "open", "pending", "breached", "solved_7d", "spam"] as const;
export type DefaultViewKey = (typeof DEFAULT_VIEW_KEYS)[number];

export const BULK_ACTIONS = ["assign", "status", "priority", "tags", "merge"] as const;
export type BulkAction = (typeof BULK_ACTIONS)[number];

export const VIEW_SCOPES = ["personal", "shared"] as const;
export type ViewScope = (typeof VIEW_SCOPES)[number];
