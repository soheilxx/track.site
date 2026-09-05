import type { ChatState } from "./chat-reducer";
import type { ActivityView } from "./types";

/**
 * Workspace moves (supplement §9 "Inhaltlich sinnvolle Bewegung"): deterministic navigation and
 * focus actions the dashboard performs when a real activity event of the assistant arrives —
 * never a random repositioning. The table is the single source: a site scan shows the detected
 * structure in the setup workspace, integrations show the credential/mapping cards, testing opens
 * the Live Event Explorer, a change proposal focuses the config diff (the exact diff in the
 * approval card), and the verified publish docks the assistant back (`firstRun` is cleared by the
 * reducer, the setup stage fades into the panel).
 *
 * Moves are active only for a turn that started on the setup page: while the setup workspace is
 * mounted (`guided`) or for the rest of a turn that began there (`guidedTurnId`) — so a move that
 * navigates away (the event explorer) never strands the following moves, and a conversation from
 * any other module never hijacks the page the user is reading. The first-run flag alone never
 * activates them: it stays raised until the verified publish and only shapes the setup page's
 * presentation (supplement §9 "keine zufälligen Positionswechsel").
 */
export interface WorkspaceMove {
  /** stable id (also the test id of the executed move) */
  id: "setup_site" | "setup_destinations" | "event_explorer" | "config_diff" | "release_center";
  /** dashboard route to navigate to, `null` = stay on the current page */
  href: string | null;
  /** `data-focus-target` of the element to reveal and focus after navigation, `null` = none */
  focus: string | null;
}

const MOVES: Record<WorkspaceMove["id"], WorkspaceMove> = {
  setup_site: { id: "setup_site", href: "/app/ai-setup", focus: "setup-site" },
  setup_destinations: { id: "setup_destinations", href: "/app/ai-setup", focus: "setup-destinations" },
  event_explorer: { id: "event_explorer", href: "/app/events/explorer", focus: null },
  // the exact diff lives in the approval card of the panel; the card is focused there (no navigation)
  config_diff: { id: "config_diff", href: null, focus: "approval-card" },
  release_center: { id: "release_center", href: "/app/releases", focus: "release-diff" },
};

/** Activity family → move, keyed by phase (`started` reveals the target, `completed` keeps it in view). */
const ACTIVITY_MOVES: Partial<Record<string, { started?: WorkspaceMove["id"]; completed?: WorkspaceMove["id"] }>> = {
  site_check: { started: "setup_site", completed: "setup_site" },
  stack_detection: { started: "setup_site", completed: "setup_site" },
  snippet_verification: { started: "setup_site", completed: "setup_site" },
  domain_verification: { started: "setup_site", completed: "setup_site" },
  destination_setup: { started: "setup_destinations", completed: "setup_destinations" },
  credential_request: { completed: "setup_destinations" },
  connection_validation: { started: "setup_destinations" },
  test_event: { started: "event_explorer" },
  processing_check: { started: "event_explorer" },
  change_review: { started: "release_center" },
  change_proposal: { completed: "config_diff" },
  rollback: { completed: "release_center" },
};

export function moveForActivity(activity: Pick<ActivityView, "activity" | "phase">): WorkspaceMove | null {
  const entry = ACTIVITY_MOVES[activity.activity];
  if (!entry) return null;
  const id = activity.phase === "started" ? entry.started : activity.phase === "completed" ? entry.completed : undefined;
  return id ? MOVES[id] : null;
}

/** The pending approval card carries the exact diff: it is revealed and focused inside the panel. */
export const APPROVAL_MOVE: WorkspaceMove = MOVES.config_diff;

export function movesActive(chat: Pick<ChatState, "guided" | "turnId" | "guidedTurnId">): boolean {
  return chat.guided || (chat.turnId !== null && chat.guidedTurnId === chat.turnId);
}

/** Key of one activity transition; the executor runs every key at most once per turn. */
export const activityMoveKey = (a: Pick<ActivityView, "runId" | "phase">): string => `${a.runId}:${a.phase}`;

/**
 * Moves that the current activities imply and that have not been executed yet, in event order.
 * `seen` is mutated with the keys of the returned moves so a re-render never repeats a move.
 */
export function pendingMoves(activities: readonly ActivityView[], seen: Set<string>): WorkspaceMove[] {
  const out: WorkspaceMove[] = [];
  for (const a of activities) {
    const key = activityMoveKey(a);
    if (seen.has(key)) continue;
    seen.add(key);
    const move = moveForActivity(a);
    if (move) out.push(move);
  }
  return out;
}
