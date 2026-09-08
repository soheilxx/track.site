import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  organization,
  supportEvents,
  supportMessages,
  supportTickets,
  user,
  withPlatform,
} from "@track-site/db";
import { testDb } from "@track-site/db/testing";

/**
 * Runs the report loader against the migrated test database as `tracksite_ops`: one organisation, two
 * operators (one of them no longer holding a platform role), tickets inside and outside the range in
 * several states (answered, resolved with a rating, breached, paused, spam, merged, without organisation),
 * their first agent messages and the status events. Other integration tests share the database, so every
 * assertion is relative to the rows seeded here (unique tags, category and organisation name).
 */
vi.mock("server-only", () => ({}));

import { loadSupportReportSnapshot, parseReportRange, supportReportView } from "./reports";

const t = testDb();
const NOW = new Date("2026-09-08T12:00:00Z");
const hours = (n: number, from: Date = NOW) => new Date(from.getTime() + n * 3_600_000);
const days = (n: number, from: Date = NOW) => new Date(from.getTime() + n * 86_400_000);
const stamp = Date.now();
const TAG = `rep-${stamp}`;
const CATEGORY = `report-category-${stamp}`;

let orgId = "";
let agentId = "";
let formerId = "";
const ticketIds: string[] = [];

beforeAll(async () => {
  const [org] = await t.db
    .insert(organization)
    .values({ name: `Reports Org ${stamp}`, slug: `reports-org-${stamp}` })
    .returning({ id: organization.id });
  orgId = org!.id;
  const [agent] = await t.db
    .insert(user)
    .values({
      name: `Report Agent ${stamp}`,
      email: `report-agent-${stamp}@test.local`,
      platformRole: "PLATFORM_SUPPORT",
    })
    .returning({ id: user.id });
  agentId = agent!.id;
  const [former] = await t.db
    .insert(user)
    .values({
      name: `Former Agent ${stamp}`,
      email: `report-former-${stamp}@test.local`,
      platformRole: "NONE",
    })
    .returning({ id: user.id });
  formerId = former!.id;

  await withPlatform(t.db, async (tx) => {
    const insert = async (
      values: Partial<typeof supportTickets.$inferInsert> & { createdAt: Date },
    ) => {
      const [row] = await tx
        .insert(supportTickets)
        .values({
          organizationId: orgId,
          requesterEmail: `req-${stamp}@test.local`,
          subject: "report fixture",
          channel: "email",
          tags: [TAG],
          category: CATEGORY,
          ...values,
        })
        .returning({ id: supportTickets.id });
      ticketIds.push(row!.id);
      return row!.id;
    };
    // answered on time by the agent and resolved with a rating (created 3 days ago)
    const answered = await insert({
      createdAt: days(-3),
      status: "solved",
      priority: "high",
      firstResponseDueAt: hours(4, days(-3)),
      resolutionDueAt: hours(48, days(-3)),
      firstRespondedAt: hours(1, days(-3)),
      resolvedAt: hours(10, days(-3)),
      assigneeUserId: agentId,
      satisfaction: { score: 5, comment: null, answered_at: hours(11, days(-3)).toISOString() },
    });
    await tx
      .insert(supportMessages)
      .values({
        ticketId: answered,
        organizationId: orgId,
        direction: "outbound",
        authorKind: "agent",
        authorUserId: agentId,
        textBody: "hello",
        createdAt: hours(1, days(-3)),
      });
    await tx
      .insert(supportEvents)
      .values({
        ticketId: answered,
        organizationId: orgId,
        actorKind: "agent",
        actorUserId: agentId,
        kind: "status",
        payload: { from: "open", to: "solved" },
        createdAt: hours(10, days(-3)),
      });
    // answered late by a former operator, still open and assigned to the agent (created 2 days ago, form)
    const late = await insert({
      createdAt: days(-2),
      status: "open",
      channel: "form",
      firstResponseDueAt: hours(1, days(-2)),
      resolutionDueAt: hours(72, days(-2)),
      firstRespondedAt: hours(3, days(-2)),
      assigneeUserId: agentId,
      breachedFirstResponse: true,
    });
    await tx
      .insert(supportMessages)
      .values({
        ticketId: late,
        organizationId: orgId,
        direction: "outbound",
        authorKind: "agent",
        authorUserId: formerId,
        textBody: "late",
        createdAt: hours(3, days(-2)),
      });
    // paused, unanswered, without organisation (created yesterday, dashboard) — never breached by the wall clock
    await insert({
      createdAt: days(-1),
      organizationId: null,
      status: "pending",
      channel: "dashboard",
      firstResponseDueAt: hours(-2),
      pausedAt: hours(-3),
    });
    // spam and merged tickets in range: excluded everywhere
    await insert({ createdAt: days(-1), status: "spam" });
    const target = await insert({ createdAt: days(-1), status: "closed", resolvedAt: hours(-5) });
    await insert({ createdAt: days(-1), status: "closed", mergedIntoId: target });
    // created before the range but resolved inside it: counts in "solved", not in the cohort
    await insert({ createdAt: days(-20), status: "solved", resolvedAt: hours(-6) });
  });
});

afterAll(async () => {
  if (ticketIds.length)
    await t.db.delete(supportTickets).where(inArray(supportTickets.id, ticketIds));
  if (orgId) await t.db.delete(organization).where(eq(organization.id, orgId));
  await t.db.delete(user).where(inArray(user.id, [agentId, formerId].filter(Boolean)));
  await t.close();
});

describe("loadSupportReportSnapshot (tracksite_ops)", () => {
  it("collects volume, backlog, cohort, first responders, agent counts and organisations for the range", async () => {
    const range = parseReportRange({ days: "7" }, NOW);
    const snapshot = await withPlatform(t.db, (tx) => loadSupportReportSnapshot(tx, range, NOW));

    const mine = (
      rows: Array<{ bucket: string; count: number; channel?: string }>,
      bucket: string,
      channel?: string,
    ) =>
      rows
        .filter((r) => r.bucket === bucket && (channel === undefined || r.channel === channel))
        .reduce((s, r) => s + r.count, 0);
    expect(
      mine(snapshot.created, days(-3).toISOString().slice(0, 10), "email"),
    ).toBeGreaterThanOrEqual(1);
    expect(
      mine(snapshot.created, days(-2).toISOString().slice(0, 10), "form"),
    ).toBeGreaterThanOrEqual(1);
    expect(
      mine(snapshot.created, days(-1).toISOString().slice(0, 10), "dashboard"),
    ).toBeGreaterThanOrEqual(1);
    // resolved instants of today: the closed target and the old ticket resolved inside the range
    expect(mine(snapshot.solved, NOW.toISOString().slice(0, 10))).toBeGreaterThanOrEqual(2);

    const cohortIds = new Set(snapshot.cohort.map((c) => c.id));
    const ours = snapshot.cohort.filter((c) => c.tags.includes(TAG));
    expect(ours).toHaveLength(4);
    expect(ours.every((c) => c.status !== "spam")).toBe(true);
    expect(cohortIds.has(ticketIds[6]!)).toBe(false);
    expect(snapshot.cohortTotal).toBeGreaterThanOrEqual(4);
    const rated = ours.find((c) => c.satisfactionScore === 5)!;
    expect(rated).toMatchObject({
      priority: "high",
      status: "solved",
      breachedFirstResponse: false,
    });
    expect(rated.firstRespondedAt?.toISOString()).toBe(hours(1, days(-3)).toISOString());

    const responders = snapshot.firstResponders.filter(
      (r) => cohortIds.has(r.ticketId) && ours.some((c) => c.id === r.ticketId),
    );
    expect(responders).toHaveLength(2);
    expect(responders.find((r) => r.authorUserId === agentId)?.respondedAt.toISOString()).toBe(
      hours(1, days(-3)).toISOString(),
    );
    expect(responders.find((r) => r.authorUserId === formerId)).toBeDefined();

    expect(snapshot.agents.some((a) => a.id === agentId)).toBe(true);
    expect(snapshot.agents.some((a) => a.id === formerId)).toBe(false);
    expect(snapshot.agentOpen.find((a) => a.userId === agentId)?.count).toBeGreaterThanOrEqual(1);
    expect(snapshot.agentReplies.find((a) => a.userId === agentId)?.count).toBeGreaterThanOrEqual(
      1,
    );
    expect(snapshot.agentReplies.find((a) => a.userId === formerId)?.count).toBeGreaterThanOrEqual(
      1,
    );
    expect(snapshot.agentSolved.find((a) => a.userId === agentId)?.count).toBeGreaterThanOrEqual(1);

    expect(snapshot.backlog.find((b) => b.status === "pending")?.count).toBeGreaterThanOrEqual(1);
    expect(snapshot.unassignedOpen).toBeGreaterThanOrEqual(1);
    expect(snapshot.oldestOpenCreatedAt).not.toBeNull();

    const org = snapshot.organisations.find((o) => o.organizationId === orgId);
    // the top-10 list may be crowded by other fixtures; when ours is listed its counts are exact
    if (org)
      expect(org).toMatchObject({
        name: `Reports Org ${stamp}`,
        slug: `reports-org-${stamp}`,
        tickets: 3,
        open: 1,
        resolved: 2,
      });
    expect(snapshot.organisationsDistinct).toBeGreaterThanOrEqual(1);
    expect(snapshot.withoutOrganisation).toBeGreaterThanOrEqual(1);
    expect(typeof snapshot.csatEnabled).toBe("boolean");

    const view = supportReportView(snapshot);
    expect(view.volume.total).toBeGreaterThanOrEqual(4);
    expect(view.sla.firstResponse.met).toBeGreaterThanOrEqual(1);
    expect(view.sla.firstResponse.breached).toBeGreaterThanOrEqual(1);
    expect(view.csat.responses).toBeGreaterThanOrEqual(1);
    expect(view.categories.rows.some((r) => r.key === CATEGORY)).toBe(true);
    expect(view.tags.rows.find((r) => r.key === TAG)?.count).toBe(4);
    const agentRow = view.agents.rows.find((r) => r.id === agentId)!;
    expect(agentRow.firstResponses).toBeGreaterThanOrEqual(1);
    expect(agentRow.solved).toBeGreaterThanOrEqual(1);
    expect(view.agents.rows.find((r) => r.id === "former")?.replies).toBeGreaterThanOrEqual(1);
  });

  it("keeps the first responders on the loaded sample when the cohort is capped", async () => {
    const range = parseReportRange({ days: "7" }, NOW);
    // cap the cohort right after our "late" ticket: the sample then holds "answered" and "late" (both with a
    // first agent message) and leaves our younger tickets of the range out, whatever other fixtures exist
    const full = await withPlatform(t.db, (tx) => loadSupportReportSnapshot(tx, range, NOW));
    const cap = full.cohort.findIndex((c) => c.id === ticketIds[1]) + 1;
    expect(cap).toBeGreaterThan(0);

    const { snapshot, answered } = await withPlatform(t.db, async (tx) => {
      const snapshot = await loadSupportReportSnapshot(tx, range, NOW, cap);
      const ids = snapshot.cohort.map((c) => c.id);
      const rows = await tx
        .selectDistinct({ ticketId: supportMessages.ticketId })
        .from(supportMessages)
        .where(
          and(
            inArray(supportMessages.ticketId, ids),
            eq(supportMessages.direction, "outbound"),
            eq(supportMessages.authorKind, "agent"),
          ),
        );
      return { snapshot, answered: rows.map((r) => r.ticketId).sort() };
    });

    expect(snapshot.cohort).toHaveLength(cap);
    expect(snapshot.cohort.at(-1)?.id).toBe(ticketIds[1]);
    expect(snapshot.cohortTotal).toBeGreaterThan(cap);
    expect(supportReportView(snapshot).cohort).toMatchObject({ loaded: cap, truncated: true });

    // exactly the loaded tickets that have a first agent message — no more, no fewer
    const cohortIds = new Set(snapshot.cohort.map((c) => c.id));
    expect(snapshot.firstResponders.every((r) => cohortIds.has(r.ticketId))).toBe(true);
    expect(snapshot.firstResponders.map((r) => r.ticketId).sort()).toEqual(answered);
    expect(answered).toEqual(expect.arrayContaining([ticketIds[0], ticketIds[1]]));
    for (const responder of snapshot.firstResponders) {
      expect(responder.ticketCreatedAt).toBeInstanceOf(Date);
      expect(responder.respondedAt).toBeInstanceOf(Date);
      const ticket = snapshot.cohort.find((c) => c.id === responder.ticketId)!;
      expect(responder.ticketCreatedAt.toISOString()).toBe(ticket.createdAt.toISOString());
    }
    expect(
      snapshot.firstResponders.find((r) => r.ticketId === ticketIds[0])?.authorUserId,
    ).toBe(agentId);
    expect(
      snapshot.firstResponders.find((r) => r.ticketId === ticketIds[1])?.authorUserId,
    ).toBe(formerId);
  });

  it("buckets by ISO week and honours the range boundaries", async () => {
    const range = parseReportRange(
      {
        from: days(-4).toISOString().slice(0, 10),
        to: days(-2).toISOString().slice(0, 10),
        bucket: "week",
      },
      NOW,
    );
    const snapshot = await withPlatform(t.db, (tx) => loadSupportReportSnapshot(tx, range, NOW));
    const ours = snapshot.cohort.filter((c) => c.tags.includes(TAG));
    expect(ours).toHaveLength(2);
    for (const row of snapshot.created)
      expect(new Date(`${row.bucket}T00:00:00Z`).getUTCDay()).toBe(1);
    const view = supportReportView(snapshot);
    expect(view.volume.buckets.every((b) => /^\d{4}-\d{2}-\d{2}$/.test(b.key))).toBe(true);
    expect(view.volume.total).toBeGreaterThanOrEqual(2);
  });
});
