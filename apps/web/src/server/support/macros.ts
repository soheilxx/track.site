import "server-only";
import { and, asc, eq, or, sql } from "drizzle-orm";
import { supportMacros, type SupportMacroActions, type SupportMacroScope, type SupportTicketPriority, type SupportTicketStatus, type Tx } from "@track-site/db";
import {
  MACRO_PRIORITY_OPTIONS,
  MACRO_STATUS_OPTIONS,
  MACRO_TAGS_MAX,
  macroTicketChanges,
  normalizeMacroActions,
  parseTagList,
  renderMacroTemplate,
  type MacroTicketChanges,
  type MacroTicketState,
  type MacroValues,
} from "@/components/ops/support/macros/constants";
import { withPlatform, type ActivePlatformRole, type PlatformContext } from "@/server/ops/platform";

export * from "@/components/ops/support/macros/constants";

/**
 * Support desk → macros (docs/18 §"Macros", task T5): canned answers with optional actions.
 *
 * Visibility and rights (`platform.macros.manage`, scope note in packages/core rbac.ts):
 * - `global` macros (owner null) are usable by every operator and created / edited / deleted by
 *   PLATFORM_ADMIN only.
 * - `personal` macros belong to one operator (`owner_user_id`); nobody else sees them — not even an admin.
 *
 * Loaders run as `tracksite_ops` through `withPlatform`; mutations live in `server/ops/actions/support-macros.ts`.
 * `applyMacro(ticket, macro, agent)` is the helper the ticket detail slice calls when an agent picks a macro:
 * it renders the body for that ticket and computes the ticket changes the actions ask for (pure, no writes);
 * `loadMacroForUse` fetches a macro with the scope check and `recordMacroUsage` bumps `usage_count`.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SupportMacroRow = typeof supportMacros.$inferSelect;

/** The acting operator as the macro rules see them. */
export interface MacroAgent {
  id: string;
  name: string;
  platformRole: ActivePlatformRole;
}

export const agentOf = (ctx: PlatformContext): MacroAgent => ({ id: ctx.user.id, name: ctx.user.name, platformRole: ctx.platformRole });

export interface MacroScopeRef {
  scope: SupportMacroScope;
  ownerUserId: string | null;
}

/** Global macros are for everyone; a personal macro only for its owner. */
export function canUseMacro(agent: Pick<MacroAgent, "id">, macro: MacroScopeRef): boolean {
  return macro.scope === "global" || macro.ownerUserId === agent.id;
}

/** Global macros are managed by admins; a personal macro by its owner. */
export function canManageMacro(agent: Pick<MacroAgent, "id" | "platformRole">, macro: MacroScopeRef): boolean {
  return macro.scope === "global" ? agent.platformRole === "PLATFORM_ADMIN" : macro.ownerUserId === agent.id;
}

/** Whether the agent may create a macro of that scope. */
export function canCreateScope(agent: Pick<MacroAgent, "platformRole">, scope: SupportMacroScope): boolean {
  return scope === "personal" || agent.platformRole === "PLATFORM_ADMIN";
}

export interface MacroView {
  id: string;
  name: string;
  category: string | null;
  bodyText: string;
  actions: SupportMacroActions;
  scope: SupportMacroScope;
  ownerUserId: string | null;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
  /** the current operator may edit / delete it (`canManageMacro`) */
  editable: boolean;
}

/** Compact form for a picker in the ticket detail (no body: it is rendered on use). */
export interface MacroOption {
  id: string;
  name: string;
  category: string | null;
  scope: SupportMacroScope;
  actions: SupportMacroActions;
  usageCount: number;
}

const visibleTo = (agent: Pick<MacroAgent, "id">) => or(eq(supportMacros.scope, "global"), and(eq(supportMacros.scope, "personal"), eq(supportMacros.ownerUserId, agent.id)))!;

const macroOrder = [sql`${supportMacros.category} ASC NULLS LAST`, asc(supportMacros.name), asc(supportMacros.id)];

function macroView(row: SupportMacroRow, agent: MacroAgent): MacroView {
  return {
    id: row.id,
    name: row.name,
    category: row.category ?? null,
    bodyText: row.bodyText,
    actions: normalizeMacroActions(row.actions),
    scope: row.scope,
    ownerUserId: row.ownerUserId ?? null,
    usageCount: row.usageCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    editable: canManageMacro(agent, row),
  };
}

/** Every macro the operator may use: the global ones and their own personal ones (category, name). */
export async function listMacros(ctx: PlatformContext): Promise<MacroView[]> {
  const agent = agentOf(ctx);
  const rows = await withPlatform(ctx, (tx) => tx.select().from(supportMacros).where(visibleTo(agent)).orderBy(...macroOrder));
  return rows.map((row) => macroView(row, agent));
}

/** One macro the operator may see; null for an unknown id or somebody else's personal macro. */
export async function loadMacro(ctx: PlatformContext, macroId: string): Promise<MacroView | null> {
  if (!UUID.test(macroId)) return null;
  const agent = agentOf(ctx);
  const [row] = await withPlatform(ctx, (tx) => tx.select().from(supportMacros).where(and(eq(supportMacros.id, macroId), visibleTo(agent))).limit(1));
  return row ? macroView(row, agent) : null;
}

/** Distinct categories of the macros the operator may see (for the filter chips and the editor's suggestions). */
export function macroCategories(macros: ReadonlyArray<Pick<MacroView, "category">>): string[] {
  return [...new Set(macros.map((m) => m.category).filter((c): c is string => Boolean(c)))].sort((a, b) => a.localeCompare(b));
}

/** The stored row (for actions), regardless of scope — the caller applies `canManageMacro`; null for an unknown id. */
export async function getMacroRow(tx: Tx, macroId: string): Promise<SupportMacroRow | null> {
  if (!UUID.test(macroId)) return null;
  const [row] = await tx.select().from(supportMacros).where(eq(supportMacros.id, macroId)).limit(1);
  return row ?? null;
}

/** A macro the agent may *use* (global or their own), for the ticket detail; null otherwise. */
export async function loadMacroForUse(tx: Tx, macroId: string, agent: Pick<MacroAgent, "id">): Promise<SupportMacroRow | null> {
  const row = await getMacroRow(tx, macroId);
  return row && canUseMacro(agent, row) ? row : null;
}

/** Picker options for the ticket detail (global + own personal), category then name. */
export async function listMacroOptions(tx: Tx, agent: Pick<MacroAgent, "id">): Promise<MacroOption[]> {
  const rows = await tx
    .select({ id: supportMacros.id, name: supportMacros.name, category: supportMacros.category, scope: supportMacros.scope, actions: supportMacros.actions, usageCount: supportMacros.usageCount })
    .from(supportMacros)
    .where(visibleTo(agent))
    .orderBy(...macroOrder);
  return rows.map((r) => ({ id: r.id, name: r.name, category: r.category ?? null, scope: r.scope, actions: normalizeMacroActions(r.actions), usageCount: r.usageCount }));
}

/** Ticket facts a macro needs: the placeholders' sources and the state its actions may change. */
export interface MacroTicket extends MacroTicketState {
  id: string;
  number: number;
  subject: string;
  requesterName: string | null;
  requesterEmail: string;
  /** name of the requester's organisation when known */
  organizationName?: string | null;
}

/** The macro fields `applyMacro` reads (a stored row satisfies it). */
export interface MacroDefinition {
  id: string;
  bodyText: string;
  actions: SupportMacroActions | null;
}

export interface AppliedMacro {
  macroId: string;
  /** the body with the placeholders filled for this ticket (the agent's draft — reviewed before sending) */
  text: string;
  /** ticket fields the actions change (absent = unchanged); the detail slice writes them and emits the events */
  changes: MacroTicketChanges;
  /** the macro's actions as stored (normalised) */
  actions: SupportMacroActions;
  /** the values that were substituted */
  values: MacroValues;
}

/** Placeholder values of a ticket for an agent (an unknown requester name stays empty, never guessed). */
export function macroValuesFor(ticket: Pick<MacroTicket, "number" | "subject" | "requesterName" | "requesterEmail" | "organizationName">, agent: Pick<MacroAgent, "name">): MacroValues {
  return {
    requester_name: ticket.requesterName?.trim() || null,
    requester_email: ticket.requesterEmail,
    ticket_number: ticket.number,
    ticket_subject: ticket.subject,
    agent_name: agent.name,
    organization_name: ticket.organizationName?.trim() || null,
  };
}

/**
 * Applies a macro to a ticket for an agent: the rendered text and the ticket changes its actions ask for.
 * Pure — the detail slice writes the message and the changes in its own transaction, then calls
 * `recordMacroUsage`. The rendered text is a draft for the agent's reply editor, never sent unseen.
 */
export function applyMacro(ticket: MacroTicket, macro: MacroDefinition, agent: MacroAgent): AppliedMacro {
  const values = macroValuesFor(ticket, agent);
  const actions = normalizeMacroActions(macro.actions);
  return {
    macroId: macro.id,
    text: renderMacroTemplate(macro.bodyText, values).replace(/\r\n?/g, "\n"),
    changes: macroTicketChanges(ticket, actions, agent.id),
    actions,
    values,
  };
}

/** `usage_count + 1` (call it once the message that used the macro is stored). */
export async function recordMacroUsage(tx: Tx, macroId: string): Promise<void> {
  if (!UUID.test(macroId)) return;
  await tx
    .update(supportMacros)
    .set({ usageCount: sql`${supportMacros.usageCount} + 1` })
    .where(eq(supportMacros.id, macroId));
}

// ---------------------------------------------------------------------------------------------------
// Editor form → actions, audit diff
// ---------------------------------------------------------------------------------------------------

export interface MacroFormActions {
  actions: SupportMacroActions;
  /** field name → error code (`invalid`, `overlap`, `too_many`) */
  errors: Record<string, string>;
}

const isStatus = (v: string): v is SupportTicketStatus => (MACRO_STATUS_OPTIONS as readonly string[]).includes(v);
const isPriority = (v: string): v is SupportTicketPriority => (MACRO_PRIORITY_OPTIONS as readonly string[]).includes(v);

/**
 * Builds the `actions` object from the editor's fields: `actionStatus`, `actionPriority` (empty = none),
 * `tagsAdd` / `tagsRemove` (comma separated, normalised) and `assignToSelf` (checkbox). A tag in both lists is
 * an error (`overlap`); more than `MACRO_TAGS_MAX` tags per list is refused (`too_many`).
 */
export function macroActionsFromForm(get: (name: string) => string, checked: (name: string) => boolean): MacroFormActions {
  const errors: Record<string, string> = {};
  const actions: SupportMacroActions = {};
  const status = get("actionStatus").trim();
  if (status) {
    if (isStatus(status)) actions.status = status;
    else errors.actionStatus = "invalid";
  }
  const priority = get("actionPriority").trim();
  if (priority) {
    if (isPriority(priority)) actions.priority = priority;
    else errors.actionPriority = "invalid";
  }
  const tagsAddRaw = get("tagsAdd");
  const tagsRemoveRaw = get("tagsRemove");
  const tagsAdd = parseTagList(tagsAddRaw);
  const tagsRemove = parseTagList(tagsRemoveRaw);
  if (tagsAddRaw.split(/[,\n]/).filter((p) => p.trim()).length > MACRO_TAGS_MAX) errors.tagsAdd = "too_many";
  if (tagsRemoveRaw.split(/[,\n]/).filter((p) => p.trim()).length > MACRO_TAGS_MAX) errors.tagsRemove = "too_many";
  if (tagsAdd.some((tag) => tagsRemove.includes(tag))) errors.tagsRemove = "overlap";
  if (tagsAdd.length) actions.tags_add = tagsAdd;
  if (tagsRemove.length) actions.tags_remove = tagsRemove;
  if (checked("assignToSelf")) actions.assign_to_self = true;
  return { actions: normalizeMacroActions(actions), errors };
}

/** The fields an audit entry describes (the body itself is never recorded — length and a change flag only). */
export interface MacroAuditFields {
  name: string;
  category: string | null;
  scope: SupportMacroScope;
  ownerUserId: string | null;
  bodyText: string;
  actions: SupportMacroActions;
}

const sameActions = (a: SupportMacroActions, b: SupportMacroActions) => JSON.stringify(normalizeMacroActions(a)) === JSON.stringify(normalizeMacroActions(b));

/**
 * Field changes between two versions (`{ field: { before, after } }`); `bodyText` becomes
 * `{ changed, lengthBefore, lengthAfter }`. Without `before` (creation) every field is listed as `after`.
 * An empty object means nothing changed.
 */
export function macroAuditDiff(before: MacroAuditFields | null, after: MacroAuditFields): Record<string, unknown> {
  if (!before) {
    return {
      name: after.name,
      category: after.category,
      scope: after.scope,
      ownerUserId: after.ownerUserId,
      actions: normalizeMacroActions(after.actions),
      bodyLength: after.bodyText.length,
    };
  }
  const diff: Record<string, unknown> = {};
  if (before.name !== after.name) diff.name = { before: before.name, after: after.name };
  if ((before.category ?? null) !== (after.category ?? null)) diff.category = { before: before.category ?? null, after: after.category ?? null };
  if (before.scope !== after.scope) diff.scope = { before: before.scope, after: after.scope };
  if ((before.ownerUserId ?? null) !== (after.ownerUserId ?? null)) diff.ownerUserId = { before: before.ownerUserId ?? null, after: after.ownerUserId ?? null };
  if (!sameActions(before.actions, after.actions)) diff.actions = { before: normalizeMacroActions(before.actions), after: normalizeMacroActions(after.actions) };
  if (before.bodyText !== after.bodyText) diff.bodyText = { changed: true, lengthBefore: before.bodyText.length, lengthAfter: after.bodyText.length };
  return diff;
}
