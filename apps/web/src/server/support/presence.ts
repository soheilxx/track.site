import "server-only";
import { and, eq, gt, lt, ne, sql } from "drizzle-orm";
import { supportPresence, user, type SupportPresenceMode, type Tx } from "@track-site/db";
import { PRESENCE_STALE_MS } from "@/components/ops/support/ticket/constants";
import { onlineAgentIds } from "@/server/support/notifications";

/**
 * Presence and collision detection of the ticket detail (docs/18 §"Ticket detail"). The page sends a
 * heartbeat every 15 s through a server action (`presenceHeartbeatAction`) that upserts
 * `support_presence (ticket_id, user_id) → last_seen_at, mode`; rows older than 45 s are treated as gone.
 * Heartbeats are deliberately not audited (they are not a change to any ticket and would flood the log);
 * the row itself is the record. Nothing here is visible to customers (operator-only table, RLS revoked).
 */

export interface PresenceView {
  userId: string;
  /** display name of the operator (never the e-mail) */
  name: string;
  mode: SupportPresenceMode;
  lastSeenAt: string;
}

/** True when a heartbeat is older than the staleness window relative to `now`. */
export function presenceStale(lastSeenAt: Date | string, now: Date, staleMs: number = PRESENCE_STALE_MS): boolean {
  const at = lastSeenAt instanceof Date ? lastSeenAt.getTime() : Date.parse(lastSeenAt);
  return !Number.isFinite(at) || now.getTime() - at > staleMs;
}

/** Records (or refreshes) the caller's presence on a ticket. */
export async function touchPresence(tx: Tx, ticketId: string, userId: string, mode: SupportPresenceMode, now: Date = new Date()): Promise<void> {
  await tx
    .insert(supportPresence)
    .values({ ticketId, userId, mode, lastSeenAt: now })
    .onConflictDoUpdate({ target: [supportPresence.ticketId, supportPresence.userId], set: { mode, lastSeenAt: now } });
}

/** Removes the caller's presence row (the page leaves the ticket). */
export async function clearPresence(tx: Tx, ticketId: string, userId: string): Promise<void> {
  await tx.delete(supportPresence).where(and(eq(supportPresence.ticketId, ticketId), eq(supportPresence.userId, userId)));
}

/** Other operators on the ticket whose heartbeat is not stale, typing first, then most recent. */
export async function loadPresence(tx: Tx, ticketId: string, selfUserId: string, now: Date = new Date()): Promise<PresenceView[]> {
  const since = new Date(now.getTime() - PRESENCE_STALE_MS);
  const rows = await tx
    .select({ userId: supportPresence.userId, name: user.name, mode: supportPresence.mode, lastSeenAt: supportPresence.lastSeenAt })
    .from(supportPresence)
    .innerJoin(user, eq(user.id, supportPresence.userId))
    .where(and(eq(supportPresence.ticketId, ticketId), ne(supportPresence.userId, selfUserId), gt(supportPresence.lastSeenAt, since)))
    .orderBy(sql`case when ${supportPresence.mode} = 'typing' then 0 else 1 end`, sql`${supportPresence.lastSeenAt} desc`);
  return rows.map((r) => ({ userId: r.userId, name: r.name, mode: r.mode, lastSeenAt: r.lastSeenAt.toISOString() }));
}

/**
 * Operators online for the "online" dot of the assignee list: one rule for the whole desk since the integration
 * pass — a bell poll of the console or a heartbeat on any ticket within `AGENT_ONLINE_MS` (notifications.ts
 * `onlineAgentIds`; `OPERATOR_ONLINE_MS` of the ticket constants is the same window).
 */
export async function onlineOperatorIds(tx: Tx, now: Date = new Date()): Promise<Set<string>> {
  return onlineAgentIds(tx, now);
}

/** Opportunistic cleanup: rows nobody refreshed for an hour (the worker slice owns the scheduled expiry). */
export async function purgeStalePresence(tx: Tx, now: Date = new Date(), olderThanMs: number = 60 * 60_000): Promise<void> {
  await tx.delete(supportPresence).where(lt(supportPresence.lastSeenAt, new Date(now.getTime() - olderThanMs)));
}
