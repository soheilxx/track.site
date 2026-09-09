import { describe, expect, it } from "vitest";
import { AGENT_TICKET_BODY_MAX, AGENT_TICKET_SUBJECT_MAX, REQUESTER_MODES, agentTicketStatus, fillTicketNumber } from "@/components/ops/support/new/constants";

/**
 * Pure helpers of the agent-created tickets (docs/18 §"Agent-created tickets and teams"): the status rule and
 * the late substitution of the ticket number. The creation, the send path and the first-reply hook are
 * covered by `agent-tickets.integration.test.ts`.
 */
describe("agent tickets — status", () => {
  it("waits for the customer after a sent message and stays open for a note-only ticket", () => {
    expect(agentTicketStatus(true)).toBe("pending");
    expect(agentTicketStatus(false)).toBe("open");
  });
});

describe("agent tickets — ticket number placeholder", () => {
  it("fills both placeholder forms and leaves everything else untouched", () => {
    expect(fillTicketNumber("Ticket {ticket_number} / {{ticket.number}} / {{ ticket.number }} / {requester_name}", 1234)).toBe("Ticket 1234 / 1234 / 1234 / {requester_name}");
    expect(fillTicketNumber("no placeholder", 7)).toBe("no placeholder");
  });

  it("keeps sensible limits", () => {
    expect(AGENT_TICKET_SUBJECT_MAX).toBe(200);
    expect(AGENT_TICKET_BODY_MAX).toBe(20_000);
    expect([...REQUESTER_MODES]).toEqual(["member", "email"]);
  });
});
