import type { UiCard, UiEvent } from "@track-site/ai";
import type { ActivityView, ChatError, ChatMessage, ChatStatus, CredentialRequestView, PendingApprovalView } from "./types";

/**
 * Pure, deterministic chat state transitions for the allow-listed Track AI events. The store calls
 * `applyUiEvent` for every accepted frame; tests drive it directly with an injected clock. Nothing
 * in here interprets model internals — only the contract events (`packages/ai/src/ui-events.ts`).
 */
export interface ChatState {
  messages: ChatMessage[];
  status: ChatStatus;
  /** idempotency key of the running turn (null when idle) */
  turnId: string | null;
  /** last SSE sequence number applied (for resume) */
  lastSeq: number;
  /** activities of the current/last turn, latest phase per run id */
  activities: ActivityView[];
  /** current real job stage (turn pipeline or event lineage) */
  stage: string | null;
  /** released assistant text (and cards) before the validated final answer arrived */
  pending: { turnId: string; text: string; cards: UiCard[] } | null;
  approval: PendingApprovalView | null;
  credential: CredentialRequestView | null;
  error: ChatError | null;
  notice: "reconnecting" | "resumed" | null;
  /** last verified outcome of a turn or confirmation (drives the success/blocked motion states) */
  outcome: { kind: "success" | "blocked"; at: number } | null;
  draft: string;
  composerFocused: boolean;
  loaded: "idle" | "loading" | "ready" | "failed";
  /** Last known scroll offset of the message list (restored when the list mounts again). */
  scrollTop: number | null;
  /**
   * First-run setup (supplement §9): the site has no published configuration yet, so Track AI
   * starts large and central on the setup page (`SetupStage`) and docks back into its fixed panel
   * position after the verified `publish` activity. Set by the setup page from the server-side
   * fact; cleared by the reducer. It only shapes the presentation — the workspace moves are bound
   * to `guided` / `guidedTurnId` (a turn started on the setup page), never to this flag alone.
   */
  firstRun: boolean;
  /** the setup workspace (`/app/ai-setup`) is mounted: the workspace moves are active for turns started here */
  guided: boolean;
  /** the running turn started on the setup page — its moves stay active after a move navigated away */
  guidedTurnId: string | null;
}

export const EMPTY_CHAT: ChatState = { messages: [], status: "idle", turnId: null, lastSeq: 0, activities: [], stage: null, pending: null, approval: null, credential: null, error: null, notice: null, outcome: null, draft: "", composerFocused: false, loaded: "idle", scrollTop: null, firstRun: false, guided: false, guidedTurnId: null };

const MAX_ACTIVITIES = 12;

/** A user message was sent: the previous turn's transient state is cleared, the new turn starts. */
export function startTurn(state: ChatState, input: { turnId: string; text: string; now: number }): ChatState {
  return {
    ...state,
    status: "sending",
    turnId: input.turnId,
    lastSeq: 0,
    activities: [],
    stage: null,
    pending: null,
    approval: null,
    error: null,
    notice: null,
    outcome: null,
    draft: "",
    guidedTurnId: state.guided ? input.turnId : null,
    messages: [...state.messages, { id: `local-${input.turnId}`, role: "user", content: input.text, ui: null, createdAt: new Date(input.now).toISOString() }],
  };
}

/**
 * A localized system note of the panel: the outcome of a card the user operated (credential stored,
 * confirmation executed or cancelled). It is a `system` entry of the local transcript — never a user
 * message, never sent to the server (the routes keep their own audit entries).
 */
export function addNote(state: ChatState, input: { text: string; note: NonNullable<ChatMessage["note"]>; now: number }): ChatState {
  return { ...state, messages: [...state.messages, { id: `note-${input.now}-${state.messages.length}`, role: "system", content: input.text, ui: null, createdAt: new Date(input.now).toISOString(), note: input.note }] };
}

function upsertActivity(list: ActivityView[], next: ActivityView): ActivityView[] {
  const idx = list.findIndex((a) => a.runId === next.runId);
  const out = idx >= 0 ? list.map((a, i) => (i === idx ? next : a)) : [...list, next];
  return out.length > MAX_ACTIVITIES ? out.slice(out.length - MAX_ACTIVITIES) : out;
}

function credentialFromCard(card: Extract<UiCard, { type: "credential_request" }>): CredentialRequestView {
  return { component: card.oauth_provider ? "oauth" : "secure_credential", integration_id: card.integration_id, connector_type: card.connector_type, credential_kind: card.credential_kind, label: card.label, help: card.help, oauth_provider: card.oauth_provider };
}

export function applyUiEvent(state: ChatState, event: UiEvent, now: number): ChatState {
  switch (event.type) {
    case "activity.started":
      return { ...state, status: "working", activities: upsertActivity(state.activities, { runId: event.runId, activity: event.activity, sentence: event.sentence, phase: "started", params: event.params, at: now }) };
    case "activity.completed":
      // a verified publish ends the first-run setup: the assistant docks back into its fixed panel position
      return { ...state, firstRun: event.activity === "publish" ? false : state.firstRun, activities: upsertActivity(state.activities, { runId: event.runId, activity: event.activity, sentence: event.sentence, phase: "completed", params: event.params, at: now }) };
    case "activity.blocked":
    case "activity.failed":
      // every blocked/failed run is recorded as the last outcome; the motion derivations (`assistant-ui-state.ts`,
      // the Living AI Core) exclude a block that only asks for the user's confirmation — that is the approval flow
      return { ...state, outcome: { kind: "blocked", at: now }, activities: upsertActivity(state.activities, { runId: event.runId, activity: event.activity, sentence: event.sentence, phase: event.type === "activity.blocked" ? "blocked" : "failed", params: event.params, at: now }) };
    case "job.progress":
      return { ...state, status: state.status === "streaming" ? "streaming" : "working", stage: event.stage };
    case "assistant.message":
      return { ...state, status: "streaming", pending: { turnId: event.turnId, text: event.text, cards: [] } };
    case "ui.card": {
      const next: ChatState = state.pending && state.pending.turnId === event.turnId ? { ...state, pending: { ...state.pending, cards: [...state.pending.cards, event.card] } } : state;
      return event.card.type === "credential_request" ? { ...next, credential: credentialFromCard(event.card) } : next;
    }
    case "approval.required":
      return { ...state, approval: { approvalId: event.approvalId, action: event.action, summary: event.summary, expiresAt: event.expiresAt } };
    case "ui.final":
      return {
        ...state,
        pending: null,
        stage: null,
        outcome: { kind: event.ui.status === "error" ? "blocked" : "success", at: now },
        messages: [...state.messages, { id: `a-${event.turnId}`, role: "assistant", content: event.ui.message, ui: event.ui, createdAt: new Date(now).toISOString() }],
      };
    case "error":
      return { ...state, error: { code: event.code, message: event.message, retryable: event.retryable }, outcome: { kind: "blocked", at: now } };
    case "done":
      return { ...state, status: "idle", stage: null, pending: null, turnId: null, notice: null, guidedTurnId: null };
    default:
      return state;
  }
}

/** Confirmation-route outcomes arrive as a small batch of contract events (the run id is the confirm run). */
export function applyUiEvents(state: ChatState, events: UiEvent[], now: number): ChatState {
  return events.reduce((s, e) => (e.type === "done" ? s : applyUiEvent(s, e, now)), state);
}
