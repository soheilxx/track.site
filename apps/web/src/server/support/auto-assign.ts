import "server-only";
import { eq, inArray, sql } from "drizzle-orm";
import { recordAudit, supportEvents, supportSettings, supportTickets, type SupportAutoAssignStrategy, type Tx } from "@track-site/db";
import { db, logger } from "@/server/db";
import { AGENT_ONLINE_MS, listOnlineAgents, type OnlineAgent } from "@/server/support/notifications";
import { teamMemberIds } from "@/server/support/teams";

/**
 * Auto-assignment of new tickets (docs/18 §"Macros and desk settings" → "Round robin", wired by the
 * integration pass). Kept apart from `settings.ts` so the ticket-creation paths can import it without the
 * settings module's dependencies (the inbound handler is imported *by* `settings.ts` for the acknowledgement
 * copy — a cycle otherwise); `settings.ts` re-exports the helpers for the settings pages and their tests.
 *
 * "Online" is one rule for the whole desk: `listOnlineAgents` (notifications.ts) unites the console's bell
 * poll (`support_agent_settings.last_seen_at`) with the ticket-page heartbeats (`support_presence`) within
 * `AGENT_ONLINE_MS`, so an operator who has the console open on the queue counts as much as one on a ticket.
 *
 * Every creation path calls `autoAssignNewTicket` once the ticket row exists: the inbound store inside its
 * worker transaction, the public contact form inside its application transaction, the customer portal
 * after its tenant transaction committed (`autoAssignTicketAfterCommit` — the tenant role has no privilege
 * on the settings and presence tables). Nobody online, strategy `none`, or a spam ticket → nothing happens
 * and the ticket stays unassigned; nothing is guessed. A pick writes, in the caller's transaction, three
 * things at once: `assignee_user_id`, one `assignee` event (actor `system`, `reason: "round_robin"` — the
 * shape the timeline and the notification fan-out (→ `assignment`) understand) and one `audit_log` row
 * `support.ticket.auto_assign` (`AUTO_ASSIGN_AUDIT_ACTION`; actor `{ kind: "system", name: "auto_assign" }`,
 * the ticket's organisation, target `support_ticket`, diff = ids, the pool size and the strategy, metadata
 * `module`, `ticketNumber`, `source`) — an assignment an operator will act on is traceable in the audit trail
 * like an operator's own `platform.support_ticket.assign`, not only in the timeline. The contact form
 * additionally carries the outcome in its creation audit (`autoAssigneeUserId`, `autoAssignCandidates`);
 * the inbound handler records no creation audit (system processing, docs/18 §4) and the portal assigns after
 * its commit, so for those two paths this row is the audit trail of the assignment.
 *
 * Teams (migration 0017, docs/18 §"Agent-created tickets and teams"): the candidates of a ticket that sits in
 * a team are the online **members of that team** (`teamMemberIds`); nobody of the team online → the ticket
 * stays unassigned (never handed to another team). A ticket without `team_id` draws from every agent online
 * as before. The pick records the team in the event payload and the audit diff (`teamId`).
 */

/** Audit action of a round-robin assignment (target type `support_ticket`, actor `AUTO_ASSIGN_ACTOR`). */
export const AUTO_ASSIGN_AUDIT_ACTION = "support.ticket.auto_assign";
/** The system actor of the audit row — never a user id: nobody chose, the desk did. */
export const AUTO_ASSIGN_ACTOR = { kind: "system", name: "auto_assign" } as const;

/** Minutes of the online window, for the settings pages ("seen in the last n minutes"). */
export const ONLINE_WINDOW_MINUTES = AGENT_ONLINE_MS / 60_000;

const OPEN_STATUSES = ["new", "open", "pending", "on_hold"] as const;

export interface AgentOnline {
  userId: string;
  name: string;
  lastSeenAt: string;
}

/** Operators the desk saw within the online window (bell poll or ticket heartbeat), most recently seen first. */
export async function listAgentsOnline(tx: Tx, now: Date = new Date()): Promise<AgentOnline[]> {
  const agents: OnlineAgent[] = await listOnlineAgents(tx, now);
  return agents.map((a) => ({ userId: a.userId, name: a.name, lastSeenAt: a.lastSeenAt }));
}

export interface RoundRobinPick {
  userId: string;
  name: string;
  /** open tickets the agent already holds */
  openTickets: number;
  candidates: number;
}

/**
 * Round-robin assignee: among the agents online, the one holding the fewest open tickets, then the one whose
 * assigned tickets moved least recently, then by name — so new tickets spread evenly while people are
 * around. Null when nobody is online (the ticket stays unassigned; nothing is guessed).
 */
export async function chooseRoundRobinAssignee(tx: Tx, options: { exclude?: readonly string[]; now?: Date; teamId?: string | null } = {}): Promise<RoundRobinPick | null> {
  // team-aware pool (0017): with a team only its members count; without one every agent online does
  const members = options.teamId ? await teamMemberIds(tx, options.teamId) : null;
  const online = (await listAgentsOnline(tx, options.now)).filter((a) => !options.exclude?.includes(a.userId) && (members === null || members.has(a.userId)));
  if (!online.length) return null;
  const ids = online.map((a) => a.userId);
  const load = await tx
    .select({
      userId: supportTickets.assigneeUserId,
      open: sql<number>`count(*) FILTER (WHERE ${supportTickets.status} IN (${sql.join(OPEN_STATUSES.map((s) => sql`${s}`), sql`, `)}))::int`,
      lastMoved: sql<Date | string | null>`max(${supportTickets.updatedAt})`,
    })
    .from(supportTickets)
    .where(inArray(supportTickets.assigneeUserId, ids))
    .groupBy(supportTickets.assigneeUserId);
  const byUser = new Map(load.map((r) => [r.userId ?? "", { open: Number(r.open ?? 0), lastMoved: r.lastMoved ? new Date(r.lastMoved).getTime() : 0 }]));
  const ranked = [...online].sort((a, b) => {
    const la = byUser.get(a.userId) ?? { open: 0, lastMoved: 0 };
    const lb = byUser.get(b.userId) ?? { open: 0, lastMoved: 0 };
    return la.open - lb.open || la.lastMoved - lb.lastMoved || a.name.localeCompare(b.name);
  });
  const best = ranked[0]!;
  return { userId: best.userId, name: best.name, openTickets: byUser.get(best.userId)?.open ?? 0, candidates: online.length };
}

/** The assignee the configured strategy yields for a new ticket (null for `none` or nobody online). */
export async function resolveAutoAssignee(tx: Tx, settings: { autoAssignStrategy: SupportAutoAssignStrategy }, options: { exclude?: readonly string[]; now?: Date; teamId?: string | null } = {}): Promise<RoundRobinPick | null> {
  if (settings.autoAssignStrategy !== "round_robin") return null;
  return chooseRoundRobinAssignee(tx, options);
}

/** The creation path that asks for the assignment — recorded in the audit row's metadata, never guessed. */
export type AutoAssignSource = "inbound" | "form" | "portal" | "agent";

export interface AutoAssignInput {
  ticketId: string;
  organizationId: string | null;
  source: AutoAssignSource;
  /** the request that created the ticket (portal / form) — `null` for a webhook */
  requestId?: string | null;
  now?: Date;
}

export interface AutoAssignOutcome {
  strategy: SupportAutoAssignStrategy;
  assigneeUserId: string | null;
  candidates: number;
  /** id of the `support.ticket.auto_assign` audit row; null when nothing was assigned */
  auditId: string | null;
}

/**
 * Applies the desk's auto-assignment to a freshly created ticket inside the caller's transaction (a role that
 * may read `support_settings` and the presence tables and insert into `audit_log`: `tracksite_worker`,
 * `tracksite_ops` or the application connection). Skips silently when the strategy is `none`, nobody is
 * online, the ticket is gone, spam, merged or already assigned — the row is never overwritten and nothing is
 * audited for a no-op. A pick writes the assignee, the `assignee` event and the audit row together, so the
 * three never disagree (a rolled-back savepoint takes all of them back).
 */
export async function autoAssignNewTicket(tx: Tx, input: AutoAssignInput): Promise<AutoAssignOutcome> {
  const now = input.now ?? new Date();
  const [row] = await tx.select({ autoAssignStrategy: supportSettings.autoAssignStrategy }).from(supportSettings).where(eq(supportSettings.id, 1)).limit(1);
  const strategy: SupportAutoAssignStrategy = row?.autoAssignStrategy ?? "none";
  const none = (candidates = 0): AutoAssignOutcome => ({ strategy, assigneeUserId: null, candidates, auditId: null });
  if (strategy === "none") return none();
  const [ticket] = await tx
    .select({ id: supportTickets.id, number: supportTickets.number, status: supportTickets.status, assigneeUserId: supportTickets.assigneeUserId, mergedIntoId: supportTickets.mergedIntoId, organizationId: supportTickets.organizationId, teamId: supportTickets.teamId })
    .from(supportTickets)
    .where(eq(supportTickets.id, input.ticketId))
    .limit(1);
  if (!ticket || ticket.status === "spam" || ticket.mergedIntoId || ticket.assigneeUserId) return none();
  const pick = await resolveAutoAssignee(tx, { autoAssignStrategy: strategy }, { now, teamId: ticket.teamId });
  if (!pick) return none();
  const organizationId = ticket.organizationId ?? input.organizationId;
  await tx.update(supportTickets).set({ assigneeUserId: pick.userId, updatedAt: now }).where(eq(supportTickets.id, ticket.id));
  await tx.insert(supportEvents).values({
    ticketId: ticket.id,
    organizationId,
    actorKind: "system",
    actorUserId: null,
    kind: "assignee",
    // the team is recorded only when the ticket sits in one (the event shape of a team-less pick is unchanged)
    payload: { from: null, to: pick.userId, self: false, reason: "round_robin", candidates: pick.candidates, openTickets: pick.openTickets, ...(ticket.teamId ? { teamId: ticket.teamId } : {}) },
    createdAt: now,
  });
  // the audit trail of the assignment: ids and the pool only — no subject, no address, no body
  const auditId = await recordAudit(tx, {
    organizationId,
    actor: AUTO_ASSIGN_ACTOR,
    action: AUTO_ASSIGN_AUDIT_ACTION,
    targetType: "support_ticket",
    targetId: ticket.id,
    diff: { assigneeFrom: null, assigneeTo: pick.userId, reason: "round_robin", strategy, candidates: pick.candidates, openTickets: pick.openTickets, ...(ticket.teamId ? { teamId: ticket.teamId } : {}) },
    metadata: { module: "support", ticketNumber: Number(ticket.number), source: input.source },
    requestId: input.requestId ?? null,
  });
  return { strategy, assigneeUserId: pick.userId, candidates: pick.candidates, auditId };
}

/**
 * Auto-assignment for a ticket a tenant transaction created (the customer portal): runs after the commit on
 * the application connection, in one transaction of its own — the assignee, the event and the audit row
 * land together or not at all. Never throws — a failure leaves the ticket unassigned and logs a warning.
 */
export async function autoAssignTicketAfterCommit(input: AutoAssignInput): Promise<AutoAssignOutcome | null> {
  try {
    return await db().transaction((tx) => autoAssignNewTicket(tx, input));
  } catch (e) {
    logger.warn({ ticketId: input.ticketId, err: e instanceof Error ? e.message : String(e) }, "support.auto_assign_failed");
    return null;
  }
}
