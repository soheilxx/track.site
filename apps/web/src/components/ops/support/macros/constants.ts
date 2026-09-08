import type { SupportMacroActions, SupportTicketPriority, SupportTicketStatus } from "@track-site/db";

/**
 * Pure macro helpers shared by the console (client components), the server module
 * (`apps/web/src/server/support/macros.ts` re-exports them) and the tests. No database, no environment —
 * a client component must never import a value from a server module (docs/17 §"Client bundles").
 */

export const MACRO_NAME_MAX = 120;
export const MACRO_CATEGORY_MAX = 40;
export const MACRO_BODY_MAX = 8000;
export const MACRO_TAG_MAX = 40;
export const MACRO_TAGS_MAX = 10;

/** Statuses / priorities a macro may set (the vocabulary of `support_tickets`; the detail slice validates the transition). */
export const MACRO_STATUS_OPTIONS = ["new", "open", "pending", "on_hold", "solved", "closed", "spam"] as const satisfies readonly SupportTicketStatus[];
export const MACRO_PRIORITY_OPTIONS = ["low", "normal", "high", "urgent"] as const satisfies readonly SupportTicketPriority[];

/**
 * Placeholders a macro body may use (`{requester_name}` …). The seeded global macros use the first three;
 * unknown tokens stay in the text as written so a typo is visible instead of silently blank.
 */
export const MACRO_PLACEHOLDERS = ["requester_name", "requester_email", "ticket_number", "ticket_subject", "agent_name", "organization_name"] as const;
export type MacroPlaceholder = (typeof MACRO_PLACEHOLDERS)[number];

/** Values for the placeholders; `null` / `undefined` renders empty (an unknown requester name is never invented). */
export type MacroValues = Partial<Record<MacroPlaceholder, string | number | null | undefined>>;

const TOKEN_RE = /\{([a-z][a-z0-9_]*)\}/g;

export function isMacroPlaceholder(value: unknown): value is MacroPlaceholder {
  return typeof value === "string" && (MACRO_PLACEHOLDERS as readonly string[]).includes(value);
}

/** Renders a macro body: known placeholders are replaced (missing values → empty), unknown tokens stay. */
export function renderMacroTemplate(body: string, values: MacroValues): string {
  return body.replace(TOKEN_RE, (match, key: string) => {
    if (!isMacroPlaceholder(key)) return match;
    const value = values[key];
    return value == null ? "" : String(value);
  });
}

/** Known placeholders used by a body, in order of first appearance. */
export function usedPlaceholders(body: string): MacroPlaceholder[] {
  const out: MacroPlaceholder[] = [];
  for (const match of body.matchAll(TOKEN_RE)) {
    const key = match[1];
    if (isMacroPlaceholder(key) && !out.includes(key)) out.push(key);
  }
  return out;
}

/** `{tokens}` in a body that the desk does not know (typos), in order of first appearance. */
export function unknownPlaceholders(body: string): string[] {
  const out: string[] = [];
  for (const match of body.matchAll(TOKEN_RE)) {
    const key = match[1]!;
    if (!isMacroPlaceholder(key) && !out.includes(key)) out.push(key);
  }
  return out;
}

/** Lower-case tag without spaces (`Billing Issue` → `billing-issue`); null when nothing usable remains. */
export function normalizeTag(raw: string): string | null {
  const tag = raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/^[-._]+|[-._]+$/g, "");
  return tag.length ? tag.slice(0, MACRO_TAG_MAX) : null;
}

/** Comma / newline separated input → unique normalised tags, at most `MACRO_TAGS_MAX`. */
export function parseTagList(input: string): string[] {
  const out: string[] = [];
  for (const part of input.split(/[,\n]/)) {
    const tag = normalizeTag(part);
    if (tag && !out.includes(tag)) out.push(tag);
    if (out.length >= MACRO_TAGS_MAX) break;
  }
  return out;
}

export type MacroActionKind = "status" | "priority" | "tags_add" | "tags_remove" | "assign_to_self";

export interface MacroActionEntry {
  kind: MacroActionKind;
  /** the status / priority / tag list; null for `assign_to_self` */
  value: string | null;
}

/** Flat list of the actions a macro carries (for tables and summaries); empty lists and `false` are omitted. */
export function macroActionEntries(actions: SupportMacroActions | null | undefined): MacroActionEntry[] {
  if (!actions) return [];
  const out: MacroActionEntry[] = [];
  if (actions.status) out.push({ kind: "status", value: actions.status });
  if (actions.priority) out.push({ kind: "priority", value: actions.priority });
  if (actions.tags_add?.length) out.push({ kind: "tags_add", value: actions.tags_add.join(", ") });
  if (actions.tags_remove?.length) out.push({ kind: "tags_remove", value: actions.tags_remove.join(", ") });
  if (actions.assign_to_self) out.push({ kind: "assign_to_self", value: null });
  return out;
}

export function hasMacroActions(actions: SupportMacroActions | null | undefined): boolean {
  return macroActionEntries(actions).length > 0;
}

/** Only the keys that carry an effect, in a stable order (what is stored and what the audit diff shows). */
export function normalizeMacroActions(actions: SupportMacroActions | null | undefined): SupportMacroActions {
  const out: SupportMacroActions = {};
  if (actions?.status) out.status = actions.status;
  if (actions?.priority) out.priority = actions.priority;
  if (actions?.tags_add?.length) out.tags_add = [...actions.tags_add];
  if (actions?.tags_remove?.length) out.tags_remove = [...actions.tags_remove];
  if (actions?.assign_to_self) out.assign_to_self = true;
  return out;
}

/** The ticket fields a macro's actions touch. */
export interface MacroTicketState {
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  tags: readonly string[];
  assigneeUserId: string | null;
}

/** Fields that differ from the ticket after the actions (absent = unchanged); the caller writes them. */
export interface MacroTicketChanges {
  status?: SupportTicketStatus;
  priority?: SupportTicketPriority;
  tags?: string[];
  assigneeUserId?: string;
}

/**
 * Applies the actions to a ticket state and returns only what changes. Tags are removed first and added
 * second (a tag in both lists ends up present); `assign_to_self` assigns the acting agent. The desired
 * status is reported as is — whether the transition is allowed from the current status stays with the
 * ticket workflow of the detail slice.
 */
export function macroTicketChanges(ticket: MacroTicketState, actions: SupportMacroActions | null | undefined, agentId: string): MacroTicketChanges {
  const changes: MacroTicketChanges = {};
  if (!actions) return changes;
  if (actions.status && actions.status !== ticket.status) changes.status = actions.status;
  if (actions.priority && actions.priority !== ticket.priority) changes.priority = actions.priority;
  if (actions.tags_add?.length || actions.tags_remove?.length) {
    const remove = new Set(actions.tags_remove ?? []);
    const next = ticket.tags.filter((tag) => !remove.has(tag));
    for (const tag of actions.tags_add ?? []) if (!next.includes(tag)) next.push(tag);
    if (next.length !== ticket.tags.length || next.some((tag, i) => tag !== ticket.tags[i])) changes.tags = next;
  }
  if (actions.assign_to_self && ticket.assigneeUserId !== agentId) changes.assigneeUserId = agentId;
  return changes;
}

export function hasMacroTicketChanges(changes: MacroTicketChanges): boolean {
  return Object.keys(changes).length > 0;
}
