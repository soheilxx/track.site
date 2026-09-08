import { describe, expect, it, vi } from "vitest";

// the loaders' runtime dependencies are server-only; the rules under test are pure
vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({ env: () => ({}) }));
vi.mock("@/server/db", () => ({ db: vi.fn(), logger: { warn: vi.fn() } }));
vi.mock("@/server/ops/platform", () => ({ withPlatform: vi.fn() }));

import {
  MACRO_PLACEHOLDERS,
  MACRO_TAGS_MAX,
  applyMacro,
  canCreateScope,
  canManageMacro,
  canUseMacro,
  macroActionEntries,
  macroActionsFromForm,
  macroAuditDiff,
  macroCategories,
  macroTicketChanges,
  macroValuesFor,
  normalizeMacroActions,
  normalizeTag,
  parseTagList,
  renderMacroTemplate,
  unknownPlaceholders,
  usedPlaceholders,
  type MacroAgent,
  type MacroTicket,
} from "./macros";

const admin: MacroAgent = { id: "a1", name: "Ada Admin", platformRole: "PLATFORM_ADMIN" };
const support: MacroAgent = { id: "s1", name: "Sam Support", platformRole: "PLATFORM_SUPPORT" };

const ticket: MacroTicket = {
  id: "t1",
  number: 1042,
  subject: "Pixel fires twice",
  requesterName: "Ada Lovelace",
  requesterEmail: "ada@example.com",
  organizationName: "Acme",
  status: "new",
  priority: "normal",
  tags: ["pixel", "billing"],
  assigneeUserId: null,
};

describe("templates", () => {
  it("fills known placeholders, leaves unknown ones and renders missing values empty", () => {
    const body = "Hello {requester_name}, ticket #{ticket_number} ({ticket_subject}) by {agent_name} for {organization_name} — {unknown_thing} {requester_email}";
    expect(renderMacroTemplate(body, macroValuesFor(ticket, support))).toBe("Hello Ada Lovelace, ticket #1042 (Pixel fires twice) by Sam Support for Acme — {unknown_thing} ada@example.com");
    expect(renderMacroTemplate("Hi {requester_name}!", { requester_name: null })).toBe("Hi !");
    expect(renderMacroTemplate("Hi {requester_name}!", {})).toBe("Hi !");
  });
  it("lists used and unknown placeholders once, in order", () => {
    const body = "{agent_name} {typo} {requester_name} {agent_name} {typo} {Not_Valid}";
    expect(usedPlaceholders(body)).toEqual(["agent_name", "requester_name"]);
    expect(unknownPlaceholders(body)).toEqual(["typo"]);
    expect(MACRO_PLACEHOLDERS).toContain("ticket_number");
  });
  it("never invents a requester name or organisation", () => {
    const values = macroValuesFor({ ...ticket, requesterName: "  ", organizationName: null }, support);
    expect(values.requester_name).toBeNull();
    expect(values.organization_name).toBeNull();
    expect(values.ticket_number).toBe(1042);
  });
});

describe("tags", () => {
  it("normalises tags and parses lists", () => {
    expect(normalizeTag(" Billing Issue ")).toBe("billing-issue");
    expect(normalizeTag("!!!")).toBeNull();
    expect(normalizeTag("--x--")).toBe("x");
    expect(normalizeTag("a".repeat(60))).toHaveLength(40);
    expect(parseTagList("Pixel, billing,pixel\nOnboarding, ,")).toEqual(["pixel", "billing", "onboarding"]);
    expect(parseTagList(Array.from({ length: 15 }, (_, i) => `t${i}`).join(","))).toHaveLength(MACRO_TAGS_MAX);
  });
});

describe("actions", () => {
  it("normalises to the keys that carry an effect and lists entries for display", () => {
    expect(normalizeMacroActions({ status: undefined, tags_add: [], assign_to_self: false })).toEqual({});
    expect(normalizeMacroActions({ priority: "high", tags_remove: ["x"], assign_to_self: true })).toEqual({ priority: "high", tags_remove: ["x"], assign_to_self: true });
    expect(macroActionEntries({ status: "pending", tags_add: ["a", "b"] })).toEqual([
      { kind: "status", value: "pending" },
      { kind: "tags_add", value: "a, b" },
    ]);
    expect(macroActionEntries(null)).toEqual([]);
  });
  it("computes only the ticket fields that change", () => {
    expect(macroTicketChanges(ticket, {}, "s1")).toEqual({});
    expect(macroTicketChanges(ticket, { status: "new", priority: "normal" }, "s1")).toEqual({});
    expect(macroTicketChanges(ticket, { status: "open", priority: "high", assign_to_self: true }, "s1")).toEqual({ status: "open", priority: "high", assigneeUserId: "s1" });
    expect(macroTicketChanges({ ...ticket, assigneeUserId: "s1" }, { assign_to_self: true }, "s1")).toEqual({});
    expect(macroTicketChanges(ticket, { tags_add: ["pixel"] }, "s1")).toEqual({});
    expect(macroTicketChanges(ticket, { tags_add: ["urgent"], tags_remove: ["billing"] }, "s1")).toEqual({ tags: ["pixel", "urgent"] });
    // present in both lists: removed first, then added back — the ticket ends up as it was
    expect(macroTicketChanges(ticket, { tags_add: ["billing"], tags_remove: ["billing"] }, "s1")).toEqual({});
    expect(macroTicketChanges({ ...ticket, tags: [] }, { tags_add: ["billing"], tags_remove: ["billing"] }, "s1")).toEqual({ tags: ["billing"] });
  });
  it("reads the editor fields", () => {
    const fields: Record<string, string> = { actionStatus: "pending", actionPriority: "", tagsAdd: "Needs Info, waiting", tagsRemove: "new", assignToSelf: "on" };
    const parsed = macroActionsFromForm((n) => fields[n] ?? "", (n) => fields[n] === "on");
    expect(parsed.errors).toEqual({});
    expect(parsed.actions).toEqual({ status: "pending", tags_add: ["needs-info", "waiting"], tags_remove: ["new"], assign_to_self: true });
    const bad = macroActionsFromForm((n) => ({ actionStatus: "nope", actionPriority: "sky-high", tagsAdd: "a", tagsRemove: "a" })[n] ?? "", () => false);
    expect(bad.errors).toEqual({ actionStatus: "invalid", actionPriority: "invalid", tagsRemove: "overlap" });
    const many = macroActionsFromForm((n) => (n === "tagsAdd" ? Array.from({ length: 12 }, (_, i) => `t${i}`).join(",") : ""), () => false);
    expect(many.errors).toEqual({ tagsAdd: "too_many" });
  });
});

describe("scope rules", () => {
  const global = { scope: "global" as const, ownerUserId: null };
  const own = { scope: "personal" as const, ownerUserId: "s1" };
  const other = { scope: "personal" as const, ownerUserId: "x9" };
  it("global macros are for everyone, personal ones for the owner only", () => {
    expect(canUseMacro(support, global)).toBe(true);
    expect(canUseMacro(support, own)).toBe(true);
    expect(canUseMacro(support, other)).toBe(false);
    expect(canUseMacro(admin, other)).toBe(false);
  });
  it("admins manage global macros; owners manage their personal ones", () => {
    expect(canManageMacro(admin, global)).toBe(true);
    expect(canManageMacro(support, global)).toBe(false);
    expect(canManageMacro(support, own)).toBe(true);
    expect(canManageMacro(admin, other)).toBe(false);
    expect(canCreateScope(support, "personal")).toBe(true);
    expect(canCreateScope(support, "global")).toBe(false);
    expect(canCreateScope(admin, "global")).toBe(true);
  });
  it("collects distinct categories, sorted", () => {
    expect(macroCategories([{ category: "billing" }, { category: null }, { category: "Access" }, { category: "billing" }])).toEqual(["Access", "billing"]);
  });
});

describe("applyMacro", () => {
  it("renders the text for the ticket and reports the changes without writing anything", () => {
    const applied = applyMacro(ticket, { id: "m1", bodyText: "Hello {requester_name},\r\n\r\nticket #{ticket_number} is with {agent_name}.", actions: { status: "open", assign_to_self: true, tags_add: ["ack"] } }, support);
    expect(applied.macroId).toBe("m1");
    expect(applied.text).toBe("Hello Ada Lovelace,\n\nticket #1042 is with Sam Support.");
    expect(applied.changes).toEqual({ status: "open", assigneeUserId: "s1", tags: ["pixel", "billing", "ack"] });
    expect(applied.actions).toEqual({ status: "open", tags_add: ["ack"], assign_to_self: true });
    expect(applied.values.agent_name).toBe("Sam Support");
  });
  it("is a no-op change set for a text-only macro", () => {
    const applied = applyMacro(ticket, { id: "m2", bodyText: "Thanks!", actions: null }, admin);
    expect(applied.changes).toEqual({});
    expect(applied.text).toBe("Thanks!");
  });
});

describe("audit diff", () => {
  const base = { name: "Ack", category: "general", scope: "global" as const, ownerUserId: null, bodyText: "Hello {requester_name}", actions: { status: "open" as const } };
  it("lists every field but the body on creation", () => {
    expect(macroAuditDiff(null, base)).toEqual({ name: "Ack", category: "general", scope: "global", ownerUserId: null, actions: { status: "open" }, bodyLength: base.bodyText.length });
  });
  it("records field changes and the body as changed + lengths only", () => {
    expect(macroAuditDiff(base, base)).toEqual({});
    const diff = macroAuditDiff(base, { ...base, name: "Acknowledge", bodyText: "Hello there, {requester_name}", actions: { status: "open", assign_to_self: true }, scope: "personal", ownerUserId: "a1" });
    expect(diff).toEqual({
      name: { before: "Ack", after: "Acknowledge" },
      scope: { before: "global", after: "personal" },
      ownerUserId: { before: null, after: "a1" },
      actions: { before: { status: "open" }, after: { status: "open", assign_to_self: true } },
      bodyText: { changed: true, lengthBefore: base.bodyText.length, lengthAfter: "Hello there, {requester_name}".length },
    });
    expect(JSON.stringify(diff)).not.toContain("Hello");
  });
});
