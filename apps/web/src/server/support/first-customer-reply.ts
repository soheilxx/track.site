import "server-only";
import { eq } from "drizzle-orm";
import { supportSettings, supportSlaPolicies, supportTickets, type Tx } from "@track-site/db";
import { computeClockStart, withDeskBusinessHours, type SlaPolicyLike } from "./sla";

/**
 * The SLA hook of agent-created tickets (docs/18 §"Agent-created tickets and teams"): a ticket an operator
 * opened has no first-response target and a paused resolution clock — both due times stay null and
 * `sla_pending_first_customer_reply` is set — until the **first customer reply** starts the clocks. The
 * inbound handler's Drizzle store (`appendMessage`, a non-spam reply) and the portal's `insertCustomerReply`
 * call `applyFirstCustomerReply` inside their transaction **after** the engine's `statusTransition`
 * (`pending → open` ends the pause first, so nothing shifts the fresh due times).
 *
 * Kept apart from `agent-tickets.ts` (which re-exports it) so the inbound handler's module graph stays free
 * of the platform access layer and the console components: this file imports the schema and the engine only.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface FirstCustomerReplyOutcome {
  ticketId: string;
  /** false when the ticket was not waiting (not agent-created, or the clocks already started) */
  applied: boolean;
  policyId: string | null;
  firstResponseDueAt: Date | null;
  resolutionDueAt: Date | null;
}

/** How the caller reads the ticket's policy (the tenant role cannot read the desk settings the default loader consults). */
export type FirstCustomerReplyPolicyLoader = (tx: Tx, policyId: string) => Promise<SlaPolicyLike | null>;

/** Default loader (`tracksite_ops` / `tracksite_worker`): the policy row on the desk's hours when it has none of its own (docs/18 §11). */
export const loadPolicyWithDeskHours: FirstCustomerReplyPolicyLoader = async (tx, policyId) => {
  const [p] = await tx.select({ id: supportSlaPolicies.id, priorities: supportSlaPolicies.priorities, businessHours: supportSlaPolicies.businessHours }).from(supportSlaPolicies).where(eq(supportSlaPolicies.id, policyId)).limit(1);
  if (!p) return null;
  const [desk] = await tx.select({ businessHours: supportSettings.businessHours }).from(supportSettings).where(eq(supportSettings.id, 1)).limit(1);
  return withDeskBusinessHours({ id: p.id, priorities: p.priorities ?? {}, businessHours: p.businessHours }, desk?.businessHours ?? null);
};

/**
 * Starts the SLA clocks of an agent-created ticket at the first customer reply: reads the row under
 * `FOR UPDATE`, books the engine's `computeClockStart(policy, priority, at)` — the due dates, the persisted
 * clock start and the targets (migration 0018) — for every clock that is still running (`first_responded_at`
 * / `resolved_at` null), resets their breach flags and clears `sla_pending_first_customer_reply`. A ticket
 * that is not waiting is left untouched (`applied: false`), so the call is safe on every inbound path.
 * Call it **after** the caller's `statusTransition`. Without a policy nothing is due (never a guess); the
 * flag is cleared anyway and the start is still recorded.
 */
export async function applyFirstCustomerReply(tx: Tx, ticketId: string, at: Date = new Date(), options: { loadPolicy?: FirstCustomerReplyPolicyLoader } = {}): Promise<FirstCustomerReplyOutcome> {
  const none: FirstCustomerReplyOutcome = { ticketId, applied: false, policyId: null, firstResponseDueAt: null, resolutionDueAt: null };
  if (!UUID.test(ticketId)) return none;
  const [row] = await tx
    .select({
      id: supportTickets.id,
      priority: supportTickets.priority,
      slaPolicyId: supportTickets.slaPolicyId,
      pending: supportTickets.slaPendingFirstCustomerReply,
      firstRespondedAt: supportTickets.firstRespondedAt,
      resolvedAt: supportTickets.resolvedAt,
    })
    .from(supportTickets)
    .where(eq(supportTickets.id, ticketId))
    .limit(1)
    .for("update");
  if (!row || !row.pending) return none;
  const policy = row.slaPolicyId ? await (options.loadPolicy ?? loadPolicyWithDeskHours)(tx, row.slaPolicyId) : null;
  const start = computeClockStart(policy, row.priority, at);
  const patch: Partial<typeof supportTickets.$inferInsert> = { slaPendingFirstCustomerReply: false, slaClockStartedAt: start.slaClockStartedAt, updatedAt: at };
  const firstResponseRunning = row.firstRespondedAt === null;
  const resolutionRunning = row.resolvedAt === null;
  if (firstResponseRunning) {
    patch.firstResponseDueAt = start.firstResponseDueAt;
    patch.firstResponseTargetMs = start.firstResponseTargetMs;
    patch.breachedFirstResponse = false;
  }
  if (resolutionRunning) {
    patch.resolutionDueAt = start.resolutionDueAt;
    patch.resolutionTargetMs = start.resolutionTargetMs;
    patch.breachedResolution = false;
  }
  await tx.update(supportTickets).set(patch).where(eq(supportTickets.id, row.id));
  return {
    ticketId: row.id,
    applied: true,
    policyId: policy?.id ?? null,
    firstResponseDueAt: firstResponseRunning ? start.firstResponseDueAt : null,
    resolutionDueAt: resolutionRunning ? start.resolutionDueAt : null,
  };
}
