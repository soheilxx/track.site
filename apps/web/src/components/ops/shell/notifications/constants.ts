/**
 * Shared constants of the agent notification centre (docs/18 §"Notifications"). Client-safe: no imports, so
 * the bell and the server module `@/server/support/notifications` (which re-exports them) read one value
 * for the poll cadence, the online window and the list size (docs/17 §10 "Client bundles").
 */

/** The bell polls the feed this often while the tab is visible. */
export const NOTIFICATION_POLL_MS = 30_000;
/** Items the panel shows (older ones are still counted while unread). */
export const NOTIFICATION_LIST_LIMIT = 30;
/** Notifications older than this are purged (read or not). */
export const NOTIFICATION_RETENTION_DAYS = 30;
/**
 * An agent counts as online when the console saw them (a bell poll, `support_agent_settings.last_seen_at`,
 * or a ticket heartbeat, `support_presence.last_seen_at`) within this window — ten missed polls.
 */
export const AGENT_ONLINE_MS = 5 * 60_000;

/** Mirror of `SUPPORT_NOTIFICATION_KINDS` in `@track-site/db` for client bundles (the unit test guards drift). */
export const NOTIFICATION_KINDS = ["assignment", "customer_reply", "sla_warning", "sla_breach", "mention"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** Kinds that are also e-mailed by the desk (SLA mails come from the SLA engine, mentions stay in-app). */
export const NOTIFICATION_MAIL_KINDS: readonly NotificationKind[] = ["assignment", "customer_reply"];
