/**
 * Agent notification centre of the ops shell (docs/18 §"Notifications"): the bell in the header polls
 * `pollSupportNotificationsAction` and opens the panel. `constants.ts` is client-safe and shared with
 * `@/server/support/notifications`.
 */
export { NotificationBell } from "./notification-bell";
export { AGENT_ONLINE_MS, NOTIFICATION_KINDS, NOTIFICATION_LIST_LIMIT, NOTIFICATION_MAIL_KINDS, NOTIFICATION_POLL_MS, NOTIFICATION_RETENTION_DAYS, type NotificationKind } from "./constants";
