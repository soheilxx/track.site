/**
 * Constants shared by the client components and the server module of the customer support portal
 * (`server/support/portal.ts` re-exports them). No server import lives here, so the client bundle never
 * pulls the database client (docs/17 §"Client bundles").
 */

/** Categories a customer can pick when opening a ticket; stored on `support_tickets.category`. */
export const SUPPORT_CATEGORIES = ["tracking", "integrations", "consent", "billing", "account", "other"] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export const PORTAL_LIMITS = {
  subjectMin: 3,
  subjectMax: 200,
  bodyMin: 10,
  bodyMax: 10_000,
  csatCommentMax: 1000,
  /** tickets shown in the list (newest activity first) */
  listLimit: 200,
} as const;

/** Priorities a customer may suggest (mirrors `SUPPORT_TICKET_PRIORITIES` of packages/db without importing it). */
export const PORTAL_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type PortalPriority = (typeof PORTAL_PRIORITIES)[number];

/** List views of the customer portal: tickets that still need something, resolved ones, or everything. */
export const PORTAL_VIEWS = ["open", "solved", "all"] as const;
export type PortalView = (typeof PORTAL_VIEWS)[number];

/** Attachment limits as enforced by `packages/db` (`SUPPORT_ATTACHMENT_MAX_*`) and the CHECK on `size_bytes`. */
export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const ATTACHMENT_MAX_PER_MESSAGE = 5;

/** `accept` of the file input — the allow-list of `server/support/inbound.ts` (`ATTACHMENT_ALLOWED_TYPES`) as MIME types plus extensions. */
export const ATTACHMENT_ACCEPT = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/json",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "message/rfc822",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".pdf",
  ".txt",
  ".csv",
  ".json",
  ".docx",
  ".xlsx",
  ".eml",
].join(",");

/** Debounce of the Tracking Knowledge suggestions while the customer types (milliseconds). */
export const SUGGESTION_DEBOUNCE_MS = 450;
/** Characters of subject + message before suggestions are requested. */
export const SUGGESTION_MIN_CHARS = 6;
