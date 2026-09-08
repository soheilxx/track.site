"use server";

import { and, eq, isNull, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { SUPPORT_TICKET_PRIORITIES, SUPPORT_TICKET_STATUSES, supportEvents, supportTickets, supportViews, user, type SupportEventKind, type Tx } from "@track-site/db";
import { SAVED_VIEWS_MAX, TICKET_BULK_MAX, TICKET_TAG_MAX, VIEW_SCOPES } from "@/components/ops/support/list/constants";
import { PlatformAccessError, auditPlatform, requirePlatform, withPlatform, type PlatformContext } from "@/server/ops/platform";
import { fanOutAfterMutation } from "@/server/support/notifications";
import { applyTags, canTicketTransition, getTicketByNumber, loadTicketExport, loadTicketPolicies, lockTickets, ticketPolicyOf, ticketPriorityChange, ticketStatusChange, ticketsCsv, type LockedTicket } from "@/server/support/tickets";
import { canManageView, getSavedView, isUuid, loadSavedViews, parseTicketFilters, resolveViewBase, viewFiltersSchema, viewHref, viewNameSchema, viewSortSchema } from "@/server/support/views";

/**
 * Track Operations → Support → queue mutations (docs/18 §1). Every action resolves the operator with
 * `requirePlatform("PLATFORM_SUPPORT", <permission>)`, validates its input with zod, runs as `tracksite_ops`,
 * locks the affected rows, re-applies the workflow rules per ticket and writes one `support_events` row and
 * one `auditPlatform` entry **per ticket** (organisation id of the ticket's tenant, target `support_ticket`,
 * diffs with ids and field changes only — never subjects, message bodies or requester details) inside the
 * same transaction. Bulk actions need the `confirmed` literal the confirmation dialog sends; tickets the rule
 * does not allow (an impossible transition, an already merged ticket) are skipped and counted, never forced.
 * Saved views: personal views belong to their owner; shared views are created, edited and deleted by admins.
 */

const PATH = "/ops/support";
const VIEWS_PATH = "/ops/support/views";
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const ticketIds = z.array(uuid).min(1).max(TICKET_BULK_MAX);
const confirmed = z.literal(true);
const tagList = z.array(z.string().trim().max(64)).max(TICKET_TAG_MAX);

export type SupportTicketActionError =
  | "forbidden"
  | "invalid"
  | "not_found"
  | "confirmation_required"
  | "invalid_assignee"
  | "invalid_target"
  | "nothing_applied"
  | "too_many_views"
  | "generic";

export interface BulkActionResult {
  ok: boolean;
  error: SupportTicketActionError | null;
  /** tickets the change was applied to */
  applied: number;
  /** selected tickets the rule skipped (impossible transition, already in that state, merged) */
  skipped: number;
}

export type ExportResult =
  | { ok: true; error: null; csv: string; fileName: string; rows: number; total: number; truncated: boolean }
  | { ok: false; error: SupportTicketActionError };

export interface ViewActionState {
  ok: boolean;
  error: SupportTicketActionError | null;
  fieldErrors?: Record<string, string>;
}

type Permission = "platform.tickets.read" | "platform.tickets.write" | "platform.tickets.assign";

async function contextOr(permission: Permission): Promise<PlatformContext | null> {
  try {
    return await requirePlatform("PLATFORM_SUPPORT", permission);
  } catch (e) {
    if (e instanceof PlatformAccessError) return null;
    throw e;
  }
}

const bulkFail = (error: SupportTicketActionError): BulkActionResult => ({ ok: false, error, applied: 0, skipped: 0 });

function revalidate(): void {
  revalidatePath(PATH);
  revalidatePath(VIEWS_PATH);
}

async function recordEvent(tx: Tx, ctx: PlatformContext, ticket: Pick<LockedTicket, "id" | "organizationId">, kind: SupportEventKind, payload: Record<string, unknown>): Promise<void> {
  await tx.insert(supportEvents).values({ ticketId: ticket.id, organizationId: ticket.organizationId, actorKind: "agent", actorUserId: ctx.user.id, kind, payload });
}

async function auditTicket(tx: Tx, ctx: PlatformContext, ticket: Pick<LockedTicket, "id" | "organizationId" | "number">, action: string, diff: Record<string, unknown>, metadata: Record<string, unknown>): Promise<void> {
  await auditPlatform(ctx, { action, organizationId: ticket.organizationId, targetType: "support_ticket", targetId: ticket.id, diff: { ...diff, number: Number(ticket.number) }, metadata: { module: "support", ...metadata } }, tx);
}

/** Assigns the selected tickets to a platform operator (or clears the assignee). Requires `platform.tickets.assign`. */
export async function bulkAssignTicketsAction(input: { ticketIds: string[]; assigneeUserId: string | null; confirmed?: boolean }): Promise<BulkActionResult> {
  const ctx = await contextOr("platform.tickets.assign");
  if (!ctx) return bulkFail("forbidden");
  const parsed = z.object({ ticketIds, assigneeUserId: uuid.nullable(), confirmed: confirmed.optional() }).safeParse(input);
  if (!parsed.success) return bulkFail("invalid");
  if (parsed.data.confirmed !== true) return bulkFail("confirmation_required");
  const { assigneeUserId } = parsed.data;
  const result = await withPlatform(ctx, async (tx): Promise<BulkActionResult> => {
    if (assigneeUserId) {
      const [operator] = await tx.select({ id: user.id, platformRole: user.platformRole }).from(user).where(eq(user.id, assigneeUserId)).limit(1);
      if (!operator || (operator.platformRole !== "PLATFORM_SUPPORT" && operator.platformRole !== "PLATFORM_ADMIN")) return bulkFail("invalid_assignee");
    }
    const rows = await lockTickets(tx, parsed.data.ticketIds);
    if (rows.length === 0) return bulkFail("not_found");
    let applied = 0;
    for (const row of rows) {
      if ((row.assigneeUserId ?? null) === assigneeUserId) continue;
      await tx.update(supportTickets).set({ assigneeUserId }).where(eq(supportTickets.id, row.id));
      await recordEvent(tx, ctx, row, "assignee", { from: row.assigneeUserId ?? null, to: assigneeUserId, self: assigneeUserId === ctx.user.id });
      await auditTicket(tx, ctx, row, "platform.support_ticket.assign", { from: row.assigneeUserId ?? null, to: assigneeUserId, self: assigneeUserId === ctx.user.id }, { bulk: rows.length > 1, selected: rows.length });
      applied += 1;
    }
    return applied ? { ok: true, error: null, applied, skipped: rows.length - applied } : { ...bulkFail("nothing_applied"), skipped: rows.length };
  });
  if (result.ok) {
    revalidate();
    // assignment notifications (and their e-mails) go out now rather than on the next bell poll
    await fanOutAfterMutation((fn) => withPlatform(ctx, fn));
  }
  return result;
}

/**
 * Moves the selected tickets along the workflow (`TICKET_TRANSITIONS`); the SLA clock bookkeeping is the
 * engine's `statusTransition` with each ticket's own policy (`ticketStatusChange`, docs/18 §10) — the same call
 * the ticket page's `applyTicketChanges` makes. Tickets whose current status does not allow the target, tickets already
 * in it and merged tickets are skipped. Requires `platform.tickets.write`.
 */
export async function bulkStatusTicketsAction(input: { ticketIds: string[]; status: string; confirmed?: boolean }): Promise<BulkActionResult> {
  const ctx = await contextOr("platform.tickets.write");
  if (!ctx) return bulkFail("forbidden");
  const parsed = z.object({ ticketIds, status: z.enum(SUPPORT_TICKET_STATUSES), confirmed: confirmed.optional() }).safeParse(input);
  if (!parsed.success) return bulkFail("invalid");
  if (parsed.data.confirmed !== true) return bulkFail("confirmation_required");
  const { status } = parsed.data;
  const now = new Date();
  const result = await withPlatform(ctx, async (tx): Promise<BulkActionResult> => {
    const rows = await lockTickets(tx, parsed.data.ticketIds);
    if (rows.length === 0) return bulkFail("not_found");
    const policies = await loadTicketPolicies(tx, rows);
    let applied = 0;
    for (const row of rows) {
      if (row.status === status || !canTicketTransition(row.status, status) || row.mergedIntoId) continue;
      const change = ticketStatusChange(ticketPolicyOf(policies, row), row, status, now);
      await tx.update(supportTickets).set(change.set).where(eq(supportTickets.id, row.id));
      await recordEvent(tx, ctx, row, "status", { from: row.status, to: status, pauseEndedMs: change.pauseEndedMs });
      // same payload as the ticket page's reopening (`count`, `resolutionDueAt`) so both timelines render it
      if (change.reopened) await recordEvent(tx, ctx, row, "reopened", { from: row.status, to: status, count: change.set.reopenCount ?? row.reopenCount, resolutionDueAt: change.set.resolutionDueAt?.toISOString() ?? null });
      await auditTicket(
        tx,
        ctx,
        row,
        "platform.support_ticket.status",
        { from: row.status, to: status, reopened: change.reopened, pauseEndedMs: change.pauseEndedMs, slaPolicyId: row.slaPolicyId ?? null },
        { bulk: rows.length > 1, selected: rows.length },
      );
      applied += 1;
    }
    return applied ? { ok: true, error: null, applied, skipped: rows.length - applied } : { ...bulkFail("nothing_applied"), skipped: rows.length };
  });
  if (result.ok) revalidate();
  return result;
}

/**
 * Sets the priority of the selected tickets and moves their running SLA clocks with it: the engine's
 * `applyPolicyOnPriorityChange` with each ticket's own policy (`ticketPriorityChange`, docs/18 §10) — the same
 * call the ticket page makes, so the due times agree whichever path changed the priority; without a policy
 * the running due times are cleared. Tickets already at that priority are skipped. Requires `platform.tickets.write`.
 */
export async function bulkPriorityTicketsAction(input: { ticketIds: string[]; priority: string; confirmed?: boolean }): Promise<BulkActionResult> {
  const ctx = await contextOr("platform.tickets.write");
  if (!ctx) return bulkFail("forbidden");
  const parsed = z.object({ ticketIds, priority: z.enum(SUPPORT_TICKET_PRIORITIES), confirmed: confirmed.optional() }).safeParse(input);
  if (!parsed.success) return bulkFail("invalid");
  if (parsed.data.confirmed !== true) return bulkFail("confirmation_required");
  const { priority } = parsed.data;
  const now = new Date();
  const result = await withPlatform(ctx, async (tx): Promise<BulkActionResult> => {
    const rows = await lockTickets(tx, parsed.data.ticketIds);
    if (rows.length === 0) return bulkFail("not_found");
    const policies = await loadTicketPolicies(tx, rows);
    let applied = 0;
    for (const row of rows) {
      const change = ticketPriorityChange(ticketPolicyOf(policies, row), row, priority, now);
      if (!change.changed) continue;
      await tx.update(supportTickets).set(change.set).where(eq(supportTickets.id, row.id));
      await recordEvent(tx, ctx, row, "priority", { from: row.priority, to: priority });
      // field changes only: the clocks the engine moved (ISO) next to the priority and the policy id
      const clocks = {
        ...(change.set.firstResponseDueAt !== undefined ? { firstResponseDueAt: change.set.firstResponseDueAt?.toISOString() ?? null } : {}),
        ...(change.set.resolutionDueAt !== undefined ? { resolutionDueAt: change.set.resolutionDueAt?.toISOString() ?? null } : {}),
      };
      await auditTicket(tx, ctx, row, "platform.support_ticket.priority", { from: row.priority, to: priority, slaPolicyId: row.slaPolicyId ?? null, ...clocks }, { bulk: rows.length > 1, selected: rows.length });
      applied += 1;
    }
    return applied ? { ok: true, error: null, applied, skipped: rows.length - applied } : { ...bulkFail("nothing_applied"), skipped: rows.length };
  });
  if (result.ok) revalidate();
  return result;
}

/** Adds and removes tags on the selected tickets (normalised, ≤ TICKET_TAG_MAX per ticket). Requires `platform.tickets.write`. */
export async function bulkTagTicketsAction(input: { ticketIds: string[]; add: string[]; remove: string[]; confirmed?: boolean }): Promise<BulkActionResult> {
  const ctx = await contextOr("platform.tickets.write");
  if (!ctx) return bulkFail("forbidden");
  const parsed = z.object({ ticketIds, add: tagList, remove: tagList, confirmed: confirmed.optional() }).safeParse(input);
  if (!parsed.success) return bulkFail("invalid");
  if (parsed.data.confirmed !== true) return bulkFail("confirmation_required");
  const { add, remove } = parsed.data;
  if (add.length === 0 && remove.length === 0) return bulkFail("invalid");
  const result = await withPlatform(ctx, async (tx): Promise<BulkActionResult> => {
    const rows = await lockTickets(tx, parsed.data.ticketIds);
    if (rows.length === 0) return bulkFail("not_found");
    let applied = 0;
    for (const row of rows) {
      const next = applyTags(row.tags ?? [], add, remove);
      if (!next.changed) continue;
      await tx.update(supportTickets).set({ tags: next.tags }).where(eq(supportTickets.id, row.id));
      await recordEvent(tx, ctx, row, "tags", { added: next.added, removed: next.removed });
      await auditTicket(tx, ctx, row, "platform.support_ticket.tags", { added: next.added, removed: next.removed }, { bulk: rows.length > 1, selected: rows.length });
      applied += 1;
    }
    return applied ? { ok: true, error: null, applied, skipped: rows.length - applied } : { ...bulkFail("nothing_applied"), skipped: rows.length };
  });
  if (result.ok) revalidate();
  return result;
}

/**
 * Merges the selected tickets into the ticket with `targetNumber`: every source is closed with
 * `merged_into_id` (the closing goes through the SLA engine like any other status change, whatever the
 * source's status — merging is the one exception to `TICKET_TRANSITIONS`), **without `resolved_at`** and
 * without a resolution breach flag — the target answers the request, so a merged ticket never counts as
 * resolved or late in the reports (same rule as the ticket page's merge, docs/18 §"Ticket detail"). Both
 * sides get a `merged` event in the shape the ticket timeline and the customer portal read (`direction`,
 * `ticketId`, `number`, `intoNumber`; one event per source on the target), the source a `status` event with
 * `reason: "merged"`; the conversation stays readable on the source. The target must exist, be neither merged
 * nor spam nor among the sources; a source of another organisation than the target is skipped (never a
 * cross-tenant link). Requires `platform.tickets.write`.
 */
export async function bulkMergeTicketsAction(input: { ticketIds: string[]; targetNumber: number | string; confirmed?: boolean }): Promise<BulkActionResult> {
  const ctx = await contextOr("platform.tickets.write");
  if (!ctx) return bulkFail("forbidden");
  const parsed = z
    .object({
      ticketIds,
      targetNumber: z.union([z.number(), z.string()]).transform((v) => (typeof v === "number" ? v : Number.parseInt(v.replace(/^#/, "").trim(), 10))),
      confirmed: confirmed.optional(),
    })
    .safeParse(input);
  if (!parsed.success || !Number.isInteger(parsed.data.targetNumber) || parsed.data.targetNumber < 1 || parsed.data.targetNumber > 1e12) return bulkFail("invalid");
  if (parsed.data.confirmed !== true) return bulkFail("confirmation_required");
  const targetNumber = parsed.data.targetNumber;
  const now = new Date();
  const result = await withPlatform(ctx, async (tx): Promise<BulkActionResult> => {
    const target = await getTicketByNumber(tx, targetNumber);
    if (!target || target.mergedIntoId || target.status === "spam" || parsed.data.ticketIds.includes(target.id)) return bulkFail("invalid_target");
    const rows = await lockTickets(tx, parsed.data.ticketIds);
    if (rows.length === 0) return bulkFail("not_found");
    const policies = await loadTicketPolicies(tx, rows);
    let applied = 0;
    const mergedNumbers: number[] = [];
    const targetNo = Number(target.number);
    for (const row of rows) {
      if (row.mergedIntoId || row.id === target.id) continue;
      // never across tenants: the `merged` events are customer-visible on both sides (docs/18 §3), so a ticket of
      // organisation A must not point at (or be listed on) a ticket of organisation B; tickets without an
      // organisation may join either side
      if (row.organizationId && target.organizationId && row.organizationId !== target.organizationId) continue;
      // an already closed source keeps its stamps (empty patch); every other status is closed by the engine,
      // which also books an open pause — but a merge is not a resolution: the stamps the engine would set on a
      // still unresolved source (`resolved_at`, the late flag) stay as they are, `closed_at` is stamped
      const change = ticketStatusChange(ticketPolicyOf(policies, row), row, "closed", now);
      const { resolvedAt: _resolvedAt, breachedResolution: _breachedResolution, ...set } = change.set;
      await tx
        .update(supportTickets)
        .set({ ...set, mergedIntoId: target.id })
        .where(eq(supportTickets.id, row.id));
      if (change.events.includes("status")) await recordEvent(tx, ctx, row, "status", { from: row.status, to: "closed", pauseEndedMs: change.pauseEndedMs, reason: "merged" });
      await recordEvent(tx, ctx, row, "merged", { direction: "into", ticketId: target.id, number: targetNo, intoNumber: targetNo });
      await recordEvent(tx, ctx, target, "merged", { direction: "from", ticketId: row.id, number: Number(row.number) });
      await auditTicket(tx, ctx, row, "platform.support_ticket.merge", { from: row.status, to: "closed", mergedInto: target.id, mergedIntoNumber: targetNo, pauseEndedMs: change.pauseEndedMs }, { bulk: rows.length > 1, selected: rows.length });
      mergedNumbers.push(Number(row.number));
      applied += 1;
    }
    if (applied) await auditTicket(tx, ctx, target, "platform.support_ticket.merge_target", { mergedFromNumbers: mergedNumbers }, { bulk: rows.length > 1, selected: rows.length });
    return applied ? { ok: true, error: null, applied, skipped: rows.length - applied } : { ...bulkFail("nothing_applied"), skipped: rows.length };
  });
  if (result.ok) revalidate();
  return result;
}

/**
 * CSV of the queue as currently filtered (`query` = the page's query string): ticket metadata only, at most
 * TICKET_EXPORT_MAX_ROWS rows, audited with the filters and the row count. The client turns the text into a
 * download; nothing is written to disk on the server. Requires `platform.tickets.read`.
 */
export async function exportTicketsAction(query: string): Promise<ExportResult> {
  const ctx = await contextOr("platform.tickets.read");
  if (!ctx) return { ok: false, error: "forbidden" };
  const parsed = z.string().max(2000).safeParse(query);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const q: Record<string, string | string[]> = {};
  for (const [key, value] of new URLSearchParams(parsed.data.replace(/^\?/, ""))) {
    const existing = q[key];
    q[key] = existing == null ? value : Array.isArray(existing) ? [...existing, value] : [existing, value];
  }
  const base = await resolveViewBase(ctx, q);
  const filters = parseTicketFilters(q, base);
  const now = new Date();
  const { rows, total, truncated } = await loadTicketExport(ctx, filters, now);
  await auditPlatform(ctx, {
    action: "platform.support_ticket.export",
    targetType: "support_ticket_queue",
    metadata: {
      module: "support",
      filters: { view: filters.view, status: filters.status, priority: filters.priority, channel: filters.channel, assignee: filters.assignee, organization: filters.organization, plan: filters.plan, tags: filters.tags, sla: filters.sla, dateField: filters.dateField, from: filters.from, to: filters.to, lastDays: filters.lastDays, q: filters.q ? filters.q.length : null, sort: filters.sort },
      rows: rows.length,
      total,
      truncated,
    },
  });
  const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return { ok: true, error: null, csv: ticketsCsv(rows), fileName: `support-tickets-${stamp}.csv`, rows: rows.length, total, truncated };
}

// ---------------------------------------------------------------------------------------------------
// Saved views
// ---------------------------------------------------------------------------------------------------

const str = (formData: FormData, name: string): string => {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
};
const all = (formData: FormData, name: string): string[] => formData.getAll(name).filter((v): v is string => typeof v === "string" && v.length > 0);
const optional = (value: string): string | null => (value.trim() ? value.trim() : null);

const viewInputSchema = z.object({
  id: uuid.optional(),
  name: viewNameSchema,
  scope: z.enum(VIEW_SCOPES),
  sort: viewSortSchema,
  filters: viewFiltersSchema,
});

function readViewForm(formData: FormData) {
  const lastDaysRaw = str(formData, "lastDays").trim();
  const lastDays = lastDaysRaw ? Number.parseInt(lastDaysRaw, 10) : null;
  return viewInputSchema.safeParse({
    id: str(formData, "id") || undefined,
    name: str(formData, "name"),
    scope: str(formData, "scope") || "personal",
    sort: str(formData, "sort") || "updated_desc",
    filters: {
      status: all(formData, "status"),
      priority: all(formData, "priority"),
      channel: all(formData, "channel"),
      assignee: str(formData, "assignee") || "any",
      organization: optional(str(formData, "org")),
      plan: optional(str(formData, "plan")),
      tags: str(formData, "tags")
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
      sla: str(formData, "sla") || "any",
      dateField: str(formData, "dateField") || "updated",
      from: optional(str(formData, "from")),
      to: optional(str(formData, "to")),
      lastDays: Number.isFinite(lastDays) ? lastDays : null,
    },
  });
}

function fieldErrorsOf(issues: z.ZodIssue[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) out[String(issue.path[0] ?? "form")] = "invalid";
  return out;
}

/**
 * Creates or updates a saved view from the view editor form. Personal views belong to the operator;
 * `shared` needs PLATFORM_ADMIN (creating, editing and changing the scope). Redirects to the queue of the
 * view on success. Requires `platform.tickets.read`.
 */
export async function saveSupportViewAction(_prev: ViewActionState, formData: FormData): Promise<ViewActionState> {
  const ctx = await contextOr("platform.tickets.read");
  if (!ctx) return { ok: false, error: "forbidden" };
  const parsed = readViewForm(formData);
  if (!parsed.success) return { ok: false, error: "invalid", fieldErrors: fieldErrorsOf(parsed.error.issues) };
  const { id, name, scope, sort, filters } = parsed.data;
  if (scope === "shared" && ctx.platformRole !== "PLATFORM_ADMIN") return { ok: false, error: "forbidden" };
  const ownerUserId = scope === "personal" ? ctx.user.id : null;
  const outcome = await withPlatform(ctx, async (tx): Promise<ViewActionState & { viewId?: string }> => {
    if (id) {
      const existing = await getSavedView(ctx, id, tx);
      if (!existing) return { ok: false, error: "not_found" };
      if (!canManageView(ctx, existing)) return { ok: false, error: "forbidden" };
      await tx.update(supportViews).set({ name, ownerUserId, filters, sort }).where(eq(supportViews.id, existing.id));
      await auditPlatform(
        ctx,
        {
          action: "platform.support_view.update",
          targetType: "support_view",
          targetId: existing.id,
          diff: { name: { from: existing.name, to: name }, scope: { from: existing.scope, to: scope }, sort: { from: existing.sort, to: sort }, filters: { from: existing.filters, to: filters } },
          metadata: { module: "support" },
        },
        tx,
      );
      return { ok: true, error: null, viewId: existing.id };
    }
    const mine = await loadSavedViews(ctx, tx);
    if (mine.length >= SAVED_VIEWS_MAX) return { ok: false, error: "too_many_views" };
    const [positionRow] = await tx
      .select({ next: sql<number>`coalesce(max(${supportViews.position}), 0) + 1` })
      .from(supportViews)
      .where(or(isNull(supportViews.ownerUserId), eq(supportViews.ownerUserId, ctx.user.id)));
    const [created] = await tx
      .insert(supportViews)
      .values({ name, ownerUserId, filters, sort, position: Number(positionRow?.next ?? 1) })
      .returning({ id: supportViews.id });
    await auditPlatform(ctx, { action: "platform.support_view.create", targetType: "support_view", targetId: created!.id, diff: { name, scope, sort, filters }, metadata: { module: "support" } }, tx);
    return { ok: true, error: null, viewId: created!.id };
  });
  if (!outcome.ok || !outcome.viewId) return { ok: outcome.ok, error: outcome.error };
  revalidate();
  redirect(viewHref(outcome.viewId));
}

/** Deletes a saved view (own personal view, or a shared one as admin) after confirmation; redirects to the views page. */
export async function deleteSupportViewAction(_prev: ViewActionState, formData: FormData): Promise<ViewActionState> {
  const ctx = await contextOr("platform.tickets.read");
  if (!ctx) return { ok: false, error: "forbidden" };
  const id = str(formData, "id");
  if (!isUuid(id)) return { ok: false, error: "invalid" };
  if (str(formData, "confirm") !== "true") return { ok: false, error: "confirmation_required" };
  const outcome = await withPlatform(ctx, async (tx): Promise<ViewActionState> => {
    const existing = await getSavedView(ctx, id, tx);
    if (!existing) return { ok: false, error: "not_found" };
    if (!canManageView(ctx, existing)) return { ok: false, error: "forbidden" };
    await tx.delete(supportViews).where(and(eq(supportViews.id, existing.id)));
    await auditPlatform(ctx, { action: "platform.support_view.delete", targetType: "support_view", targetId: existing.id, diff: { name: existing.name, scope: existing.scope }, metadata: { module: "support" } }, tx);
    return { ok: true, error: null };
  });
  if (!outcome.ok) return outcome;
  revalidate();
  redirect(VIEWS_PATH);
}
