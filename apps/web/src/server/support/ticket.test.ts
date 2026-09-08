import { describe, expect, it, vi } from "vitest";

// the loaders' runtime dependencies are server-only; the helpers under test are pure
vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({ env: () => ({}) }));
vi.mock("@/server/db", () => ({ db: vi.fn(), logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/ops/platform", () => ({ withPlatform: vi.fn() }));

import { markdownToHtml, markdownToText } from "@/components/ops/support/ticket/markdown";
import { applyPlaceholders, firstNameOf, unresolvedPlaceholders } from "@/components/ops/support/ticket/placeholders";
import { presenceStale } from "./presence";
import {
  TICKET_TRANSITIONS,
  canTransitionTicket,
  isReopen,
  normalizeCategory,
  normalizeTags,
  parseTagInput,
  resolutionRestartedAt,
  slaView,
  tagDiff,
  ticketRef,
  type ClockEvent,
  type SlaPolicyView,
} from "./ticket";

const at = (iso: string) => new Date(iso);

/** Mon–Fri 09:00–18:00 Berlin; the warning share is the engine's default of 80 % elapsed (20 % of the target left). */
const POLICY: SlaPolicyView = {
  id: "policy",
  name: "Default",
  priorities: { normal: { first_response_minutes: 120, resolution_minutes: 480 }, urgent: { first_response_minutes: 30, resolution_minutes: 120 } },
  businessHours: { timezone: "Europe/Berlin", days: { mon: [[540, 1080]], tue: [[540, 1080]], wed: [[540, 1080]], thu: [[540, 1080]], fri: [[540, 1080]] } },
  escalation: { warning_percent: 80 },
};

// created Monday 2026-09-07 08:00 UTC = 10:00 Berlin: first response due after 120 business minutes (12:00
// Berlin = 10:00 UTC), resolution after 480 (18:00 Berlin = 16:00 UTC)
const baseTicket = {
  status: "open" as const,
  priority: "normal" as const,
  pausedAt: null as Date | null,
  pauseTotalMs: 0,
  firstResponseDueAt: at("2026-09-07T10:00:00Z") as Date | null,
  resolutionDueAt: at("2026-09-07T16:00:00Z") as Date | null,
  firstRespondedAt: null as Date | null,
  resolvedAt: null as Date | null,
  closedAt: null as Date | null,
  mergedIntoId: null as string | null,
  reopenCount: 0,
  breachedFirstResponse: false,
  breachedResolution: false,
};

describe("workflow", () => {
  it("allows the documented transitions only and never a self transition", () => {
    expect(canTransitionTicket("new", "open")).toBe(true);
    expect(canTransitionTicket("open", "closed")).toBe(false);
    expect(canTransitionTicket("solved", "closed")).toBe(true);
    expect(canTransitionTicket("closed", "open")).toBe(true);
    expect(canTransitionTicket("spam", "solved")).toBe(false);
    for (const [from, targets] of Object.entries(TICKET_TRANSITIONS)) expect(targets, from).not.toContain(from);
    expect(isReopen("solved", "open")).toBe(true);
    expect(isReopen("closed", "open")).toBe(true);
    expect(isReopen("solved", "closed")).toBe(false);
    expect(isReopen("open", "pending")).toBe(false);
    expect(ticketRef(1042)).toBe("#1042");
  });

  it("normalises tags and categories without inventing values", () => {
    expect(normalizeTags([" Billing ", "billing", "Consent Mode", "x".repeat(60), "", "!!!"])).toEqual(["billing", "consent-mode", "x".repeat(40)]);
    expect(parseTagInput("a, b\nc,,")).toEqual(["a", "b", "c"]);
    expect(normalizeTags(Array.from({ length: 30 }, (_, i) => `t${i}`))).toHaveLength(20);
    expect(tagDiff(["a", "b"], ["b", "c"])).toEqual({ added: ["c"], removed: ["a"] });
    expect(normalizeCategory("  Billing   issues ")).toBe("Billing issues");
    expect(normalizeCategory("   ")).toBeNull();
    expect(normalizeCategory(null)).toBeNull();
  });
});

describe("resolutionRestartedAt", () => {
  const ev = (kind: ClockEvent["kind"], iso: string): ClockEvent => ({ kind, createdAt: at(iso) });

  it("is null for a ticket never reopened, else the latest reopening — whatever the order of the events", () => {
    expect(resolutionRestartedAt([])).toBeNull();
    expect(resolutionRestartedAt([ev("status", "2026-09-01T09:00:00Z"), ev("reply", "2026-09-01T10:00:00Z")])).toBeNull();
    const events = [ev("reopened", "2026-09-03T08:00:00Z"), ev("status", "2026-09-04T08:00:00Z"), ev("reopened", "2026-09-07T08:00:00Z"), ev("status", "2026-09-07T09:00:00Z")];
    expect(resolutionRestartedAt(events)).toEqual(at("2026-09-07T08:00:00Z"));
    expect(resolutionRestartedAt([...events].reverse())).toEqual(at("2026-09-07T08:00:00Z"));
  });
});

describe("slaView", () => {
  it("reports on-track, warning, breached, paused, met, late and none from real timestamps only", () => {
    const early = slaView(baseTicket, POLICY, at("2026-09-07T08:30:00Z"));
    expect(early.firstResponse).toMatchObject({ state: "on_track", remainingMs: 90 * 60_000, breachedFlag: false });
    expect(early.policy).toEqual({ id: "policy", name: "Default" });
    // the engine's warning share: 20 % of the 120-minute target = 24 business minutes left, i.e. from 11:36 Berlin
    expect(slaView(baseTicket, POLICY, at("2026-09-07T09:35:00Z")).firstResponse.state).toBe("on_track");
    expect(slaView(baseTicket, POLICY, at("2026-09-07T09:40:00Z")).firstResponse.state).toBe("warning");
    expect(slaView(baseTicket, POLICY, at("2026-09-07T10:01:00Z")).firstResponse.state).toBe("breached");
    expect(slaView({ ...baseTicket, breachedFirstResponse: true }, POLICY, at("2026-09-07T09:00:00Z")).firstResponse.state).toBe("breached");
    const paused = slaView({ ...baseTicket, pausedAt: at("2026-09-07T09:00:00Z") }, POLICY, at("2026-09-07T11:00:00Z"));
    expect(paused.paused).toBe(true);
    expect(paused.firstResponse).toMatchObject({ state: "paused", remainingMs: 60 * 60_000 });
    expect(slaView({ ...baseTicket, firstRespondedAt: at("2026-09-07T09:00:00Z") }, POLICY, at("2026-09-08T00:00:00Z")).firstResponse).toMatchObject({ state: "met", remainingMs: 60 * 60_000 });
    expect(slaView({ ...baseTicket, firstRespondedAt: at("2026-09-07T11:00:00Z") }, POLICY, at("2026-09-08T00:00:00Z")).firstResponse).toMatchObject({ state: "late", remainingMs: -60 * 60_000 });
    const none = slaView({ ...baseTicket, firstResponseDueAt: null, resolutionDueAt: null }, null, at("2026-09-07T08:30:00Z"));
    expect(none.policy).toBeNull();
    expect(none.firstResponse).toMatchObject({ state: "none", remainingMs: null, dueAt: null });
    expect(none.resolution.state).toBe("none");
    expect(none.resolutionRestartedAt).toBeNull();
  });

  it("warns exactly when the worker would: by the remaining business minutes of the target, never by the ticket's lifetime", () => {
    // reopened on the 7th 08:00 UTC (10:00 Berlin) as urgent: a 120-minute resolution target, due 10:00 UTC
    const reopened = { ...baseTicket, priority: "urgent" as const, firstRespondedAt: at("2026-09-01T09:00:00Z"), resolutionDueAt: at("2026-09-07T10:00:00Z"), reopenCount: 1 };
    const restartedAt = at("2026-09-07T08:00:00Z");
    const view = slaView(reopened, POLICY, at("2026-09-07T08:30:00Z"), restartedAt);
    expect(view.resolution).toMatchObject({ state: "on_track", remainingMs: 90 * 60_000 });
    expect(view.resolutionRestartedAt).toBe("2026-09-07T08:00:00.000Z");
    // 24 business minutes left (20 % of 120): the engine's `due_soon`, the panel's "warning" — the same instant the worker warns
    expect(slaView(reopened, POLICY, at("2026-09-07T09:40:00Z"), restartedAt).resolution.state).toBe("warning");
    // the restart time is shown, never measured against: the state is the same without it
    const unshown = slaView(reopened, POLICY, at("2026-09-07T08:30:00Z"));
    expect(unshown.resolution.state).toBe("on_track");
    expect(unshown.resolutionRestartedAt).toBeNull();
    // only business minutes count: 90 wall-clock minutes before a Monday 09:30 due time are 30 business minutes
    const overnight = { ...baseTicket, priority: "urgent" as const, firstResponseDueAt: at("2026-09-14T07:30:00Z") };
    expect(slaView(overnight, POLICY, at("2026-09-14T06:00:00Z")).firstResponse.state).toBe("on_track");
    expect(slaView(overnight, POLICY, at("2026-09-14T07:26:00Z")).firstResponse.state).toBe("warning");
    // the first-response clock is unaffected by the restart
    expect(view.firstResponse.state).toBe("met");
  });

  it("ends a merged ticket's resolution clock at its closing without a resolution stamp", () => {
    const merged = { ...baseTicket, mergedIntoId: "00000000-0000-4000-8000-000000000001", closedAt: at("2026-09-07T09:00:00Z") };
    const view = slaView(merged, POLICY, at("2026-09-09T00:00:00Z"));
    expect(view.resolution).toMatchObject({ state: "met", completedAt: "2026-09-07T09:00:00.000Z" });
    // a plain closed ticket without a resolution time (not merged) keeps measuring
    expect(slaView({ ...baseTicket, closedAt: at("2026-09-07T09:00:00Z") }, POLICY, at("2026-09-09T00:00:00Z")).resolution.state).toBe("breached");
  });
});

describe("presence", () => {
  it("treats a heartbeat older than 45 s as stale", () => {
    const now = at("2026-09-07T08:00:45Z");
    expect(presenceStale(at("2026-09-07T08:00:01Z"), now)).toBe(false);
    expect(presenceStale("2026-09-07T07:59:59Z", now)).toBe(true);
    expect(presenceStale("not a date", now)).toBe(true);
  });
});

describe("markdown subset", () => {
  it("renders the supported markup, escapes everything else and limits link schemes", () => {
    expect(markdownToHtml("Hello **world** and *it* and _you_ with `x < y`")).toBe("<p>Hello <strong>world</strong> and <em>it</em> and <em>you</em> with <code>x &lt; y</code></p>");
    expect(markdownToHtml("line one\nline two\n\nnext")).toBe("<p>line one<br>line two</p>\n<p>next</p>");
    expect(markdownToHtml("- a\n- b\n\n1. x\n2. y")).toBe("<ul><li>a</li><li>b</li></ul>\n<ol><li>x</li><li>y</li></ol>");
    expect(markdownToHtml("> quoted\n> more")).toBe("<blockquote><p>quoted<br>more</p></blockquote>");
    expect(markdownToHtml("```\n<script>alert(1)</script>\n```")).toBe("<pre><code>&lt;script&gt;alert(1)&lt;/script&gt;</code></pre>");
    expect(markdownToHtml("[docs](https://track.site/docs?a=1&b=2)")).toBe('<p><a href="https://track.site/docs?a=1&amp;b=2" rel="noopener noreferrer nofollow" target="_blank">docs</a></p>');
    expect(markdownToHtml("[bad](javascript:alert(1))")).toBe("<p>[bad](javascript:alert(1))</p>");
    expect(markdownToHtml("see https://track.site/x, ok")).toBe('<p>see <a href="https://track.site/x" rel="noopener noreferrer nofollow" target="_blank">https://track.site/x</a>, ok</p>');
    expect(markdownToHtml('<img src=x onerror="alert(1)">')).toBe("<p>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</p>");
    expect(markdownToHtml("")).toBe("");
    expect(markdownToHtml("code `a` then 3 and `b`")).toBe("<p>code <code>a</code> then 3 and <code>b</code></p>");
  });

  it("produces a plain-text variant for the text part of a mail", () => {
    expect(markdownToText("**bold** *it* `c` [docs](https://t.example)")).toBe("bold it c docs (https://t.example)");
  });
});

describe("macro placeholders", () => {
  const values = { ticketNumber: 1042, requesterName: "Ada Lovelace", requesterEmail: "ada@example.test", agentName: "Marco Rossi", organisationName: "Acme GmbH" };

  it("substitutes every supported form and leaves unknown placeholders visible", () => {
    expect(applyPlaceholders("Hi {{requester.first_name}}, ticket {{ticket.number}} at {{organisation.name}} — {{agent.name}} / {{agent.first_name}}", values)).toBe("Hi Ada, ticket 1042 at Acme GmbH — Marco Rossi / Marco");
    expect(applyPlaceholders("Hello {requester_name}, #{ticket_number}, {agent_name}", values)).toBe("Hello Ada Lovelace, #1042, Marco Rossi");
    expect(applyPlaceholders("{{organization.name}} {{requester.email}} {{unknown.thing}}", values)).toBe("Acme GmbH ada@example.test {{unknown.thing}}");
    expect(unresolvedPlaceholders("a {{x.y}} b {{x.y}} {{z}}")).toEqual(["x.y", "z"]);
  });

  it("falls back to the address for a missing first name and to an empty organisation", () => {
    expect(applyPlaceholders("Hi {{requester.first_name}} of {{organisation.name}}.", { ...values, requesterName: null, organisationName: null })).toBe("Hi ada of .");
    expect(firstNameOf('"Grace" Hopper')).toBe("Grace");
    expect(firstNameOf("  ")).toBe("");
  });
});
