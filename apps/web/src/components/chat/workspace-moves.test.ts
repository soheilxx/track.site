import { describe, expect, it } from "vitest";
import { ACTIVITY_KINDS } from "@track-site/ai";
import { EMPTY_CHAT, applyUiEvent, startTurn, type ChatState } from "./chat-reducer";
import type { ActivityView } from "./types";
import { APPROVAL_MOVE, moveForActivity, movesActive, pendingMoves } from "./workspace-moves";

const activity = (kind: string, phase: ActivityView["phase"], runId = `r-${kind}-${phase}`): ActivityView => ({ runId, activity: kind, sentence: `${kind}.${phase}`, phase, params: {}, at: 0 });

describe("workspace moves (supplement §9 'Inhaltlich sinnvolle Bewegung')", () => {
  it("maps the narrative activities to deterministic navigation/focus targets", () => {
    expect(moveForActivity(activity("site_check", "started"))).toMatchObject({ id: "setup_site", href: "/app/ai-setup", focus: "setup-site" });
    expect(moveForActivity(activity("stack_detection", "completed"))).toMatchObject({ id: "setup_site" });
    expect(moveForActivity(activity("credential_request", "completed"))).toMatchObject({ id: "setup_destinations", href: "/app/ai-setup", focus: "setup-destinations" });
    expect(moveForActivity(activity("test_event", "started"))).toMatchObject({ id: "event_explorer", href: "/app/events/explorer", focus: null });
    expect(moveForActivity(activity("processing_check", "started"))).toMatchObject({ id: "event_explorer" });
    expect(moveForActivity(activity("change_proposal", "completed"))).toEqual(APPROVAL_MOVE);
    expect(APPROVAL_MOVE).toMatchObject({ id: "config_diff", href: null, focus: "approval-card" });
    expect(moveForActivity(activity("change_review", "started"))).toMatchObject({ id: "release_center", href: "/app/releases" });
  });

  it("never moves on blocked or failed runs and never for lookups, publishing or unknown families", () => {
    for (const kind of ACTIVITY_KINDS) {
      expect(moveForActivity(activity(kind, "blocked")), kind).toBeNull();
      expect(moveForActivity(activity(kind, "failed")), kind).toBeNull();
    }
    for (const kind of ["state_lookup", "publish", "generic", "secret_intake", "measurement_plan", "draft_update", "signal_scan", "diagnostics", "consent_review", "data_request", "live_conversion", "not_a_family"]) {
      expect(moveForActivity(activity(kind, "started")), kind).toBeNull();
      expect(moveForActivity(activity(kind, "completed")), kind).toBeNull();
    }
    // every move points inside the dashboard
    for (const kind of ACTIVITY_KINDS) {
      for (const phase of ["started", "completed"] as const) {
        const move = moveForActivity(activity(kind, phase));
        if (move?.href) expect(move.href.startsWith("/app/")).toBe(true);
      }
    }
  });

  it("is active only for a turn started on the setup page: mounted setup workspace or a turn that began there", () => {
    expect(movesActive(EMPTY_CHAT)).toBe(false);
    // the first-run flag alone (setup page opened earlier, no verified publish yet) never moves the page of another module
    const firstRunOnly: ChatState = { ...EMPTY_CHAT, firstRun: true };
    expect(movesActive(firstRunOnly)).toBe(false);
    const elsewhere = startTurn(firstRunOnly, { turnId: "t0", text: "show delivery errors", now: 0 });
    expect(elsewhere.guidedTurnId).toBeNull();
    expect(movesActive(elsewhere)).toBe(false);
    expect(movesActive({ ...EMPTY_CHAT, guided: true })).toBe(true);
    // on the setup page the first run is guided like any other turn started there
    expect(startTurn({ ...firstRunOnly, guided: true }, { turnId: "t0", text: "start", now: 0 }).guidedTurnId).toBe("t0");
    // a turn started while guided keeps its moves after the workspace unmounted (a move navigated away)
    const started = startTurn({ ...EMPTY_CHAT, guided: true }, { turnId: "t1", text: "test it", now: 1 });
    expect(started.guidedTurnId).toBe("t1");
    expect(movesActive({ ...started, guided: false })).toBe(true);
    // the next turn from another page is not guided
    const done = applyUiEvent({ ...started, guided: false }, { type: "done", turnId: "t1" }, 2);
    expect(done.guidedTurnId).toBeNull();
    expect(movesActive(startTurn(done, { turnId: "t2", text: "again", now: 3 }))).toBe(false);
    // a turn from any other module never starts guided
    expect(startTurn(EMPTY_CHAT, { turnId: "t3", text: "hi", now: 4 }).guidedTurnId).toBeNull();
  });

  it("docks back after the verified publish: the reducer clears the first-run flag", () => {
    const first = { ...EMPTY_CHAT, firstRun: true };
    const blocked = applyUiEvent(first, { type: "activity.blocked", turnId: "t", runId: "p1", activity: "publish", sentence: "generic.blocked", params: { reason: "VERIFICATION_FAILED" } }, 1);
    expect(blocked.firstRun).toBe(true);
    const published = applyUiEvent(first, { type: "activity.completed", turnId: "t", runId: "p1", activity: "publish", sentence: "publish.completed", params: {} }, 2);
    expect(published.firstRun).toBe(false);
    const other = applyUiEvent(first, { type: "activity.completed", turnId: "t", runId: "s1", activity: "site_check", sentence: "site_check.completed", params: {} }, 3);
    expect(other.firstRun).toBe(true);
  });

  it("executes every activity transition at most once, in event order", () => {
    const seen = new Set<string>();
    const list = [activity("site_check", "started", "r1"), activity("test_event", "started", "r2")];
    expect(pendingMoves(list, seen).map((m) => m.id)).toEqual(["setup_site", "event_explorer"]);
    // a re-render with the same activities repeats nothing
    expect(pendingMoves(list, seen)).toEqual([]);
    // the latest phase of a run is a new transition; a completed lookup adds no move but is still marked as seen
    const next = [activity("site_check", "completed", "r1"), activity("test_event", "completed", "r2"), activity("state_lookup", "completed", "r3")];
    expect(pendingMoves(next, seen).map((m) => m.id)).toEqual(["setup_site"]);
    expect(seen.has("r3:completed")).toBe(true);
  });
});
