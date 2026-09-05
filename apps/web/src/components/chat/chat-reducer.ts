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
}

export const EMPTY_CHAT: ChatState = { messages: [], status: "idle", turnId: null, lastSeq: 0, activities: [], stage: null, pending: null, approval: null, credential: null, error: null, notice: null, outcome: null, draft: "", composerFocused: false, loaded: "idle", scrollTop: null };

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
    messages: [...state.messages, { id: `local-${input.turnId}`, role: "user", content: input.text, ui: null, createdAt: new Date(input.now).toISOString() }],
  };
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
      return { ...state, activities: upsertActivity(state.activities, { runId: event.runId, activity: event.activity, sentence: event.sentence, phase: "completed", params: event.params, at: now }) };
    case "activity.blocked":
    case "activity.failed":
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
      return { ...state, status: "idle", stage: null, pending: null, turnId: null, notice: null };
    default:
      return state;
  }
}

/** Confirmation-route outcomes arrive as a small batch of contract events (the run id is the confirm run). */
export function applyUiEvents(state: ChatState, events: UiEvent[], now: number): ChatState {
  return events.reduce((s, e) => (e.type === "done" ? s : applyUiEvent(s, e, now)), state);
}
