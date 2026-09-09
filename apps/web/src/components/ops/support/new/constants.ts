/**
 * Limits and pure helpers of the console's "New ticket" form (docs/18 §"Agent-created tickets and teams"),
 * shared by the client form and the server module `@/server/support/agent-tickets` (which re-exports them).
 * No imports: safe in either bundle (docs/17 §"Client bundles").
 */
export const AGENT_TICKET_SUBJECT_MIN = 3;
export const AGENT_TICKET_SUBJECT_MAX = 200;
export const AGENT_TICKET_BODY_MIN = 1;
export const AGENT_TICKET_BODY_MAX = 20_000;
export const REQUESTER_NAME_MAX = 120;
export const REQUESTER_SEARCH_MIN = 2;
export const REQUESTER_SEARCH_MAX = 80;
/** rows of each kind (organisations, members) a requester search returns */
export const REQUESTER_SEARCH_LIMIT = 20;
/** debounce of the requester search while typing (milliseconds) */
export const REQUESTER_SEARCH_DEBOUNCE_MS = 250;

/** How the requester was named: a member of an organisation (picked from the search) or a free address. */
export const REQUESTER_MODES = ["member", "email"] as const;
export type RequesterMode = (typeof REQUESTER_MODES)[number];

/**
 * Status of a ticket an operator opens: `pending` when the opening message went to the customer (the desk
 * waits for their answer — the engine's pause state), `open` when it starts with an internal note only (the
 * operator is working on it). Never `new`: nobody has to pick it up.
 */
export function agentTicketStatus(sendToCustomer: boolean): "pending" | "open" {
  return sendToCustomer ? "pending" : "open";
}

/**
 * The ticket-number placeholders a macro may carry (`{ticket_number}`, `{{ticket.number}}`): the client cannot
 * fill them before the ticket exists, so it leaves them as written and the server substitutes the real number
 * right after the insert. Every other placeholder is filled on the client where the operator sees the text.
 */
export function fillTicketNumber(text: string, number: number): string {
  return text.replace(/\{\{\s*ticket\.number\s*\}\}/gi, String(number)).replace(/\{ticket_number\}/gi, String(number));
}
