import type { UiEvent } from "@track-site/ai";

/**
 * Client-side guard for the Track AI stream. The server already emits only the allow-listed
 * contract (`packages/ai/src/ui-events.ts`); the browser re-checks the shape of every frame so a
 * proxy, a cached response or a future server change can never inject an unknown event into the
 * chat state. Anything that does not match is ignored. The list below is asserted to equal the
 * server's `UI_EVENT_TYPES` in `ui-events.test.ts`.
 */
export const UI_EVENT_TYPES = ["activity.started", "activity.completed", "activity.blocked", "activity.failed", "assistant.message", "ui.card", "approval.required", "job.progress", "ui.final", "error", "done"] as const;
export type UiEventType = (typeof UI_EVENT_TYPES)[number];

const isString = (v: unknown): v is string => typeof v === "string";
const isObject = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const strings = (v: unknown, max: number): string[] => (Array.isArray(v) ? v.filter(isString).slice(0, max) : []);

export function parseUiEvent(raw: unknown): UiEvent | null {
  if (!isObject(raw) || !isString(raw.type) || !isString(raw.turnId)) return null;
  const turnId = raw.turnId;
  switch (raw.type) {
    case "activity.started":
    case "activity.completed":
    case "activity.blocked":
    case "activity.failed": {
      if (!isString(raw.runId) || !isString(raw.activity) || !isString(raw.sentence) || !isObject(raw.params)) return null;
      const params: { missing?: string[]; reason?: string } = {};
      if (Array.isArray(raw.params.missing)) params.missing = strings(raw.params.missing, 8);
      if (isString(raw.params.reason)) params.reason = raw.params.reason;
      return { type: raw.type, turnId, runId: raw.runId, activity: raw.activity, sentence: raw.sentence, params } as UiEvent;
    }
    case "assistant.message":
      return isString(raw.text) ? { type: "assistant.message", turnId, text: raw.text } : null;
    case "ui.card":
      return isObject(raw.card) && isString(raw.card.type) ? ({ type: "ui.card", turnId, card: raw.card } as UiEvent) : null;
    case "approval.required": {
      if (!isString(raw.approvalId) || !isString(raw.action) || !isString(raw.expiresAt) || !isObject(raw.summary)) return null;
      const changes = Array.isArray(raw.summary.changes) ? raw.summary.changes.filter(isObject).map((c) => ({ summary: isString(c.summary) ? c.summary : "", op: c.op === "add" || c.op === "remove" ? c.op : ("change" as const) })) : [];
      const recipients = Array.isArray(raw.summary.recipients) ? raw.summary.recipients.filter(isObject).map((r) => ({ name: isString(r.name) ? r.name : "", type: isString(r.type) ? r.type : "", purpose: isString(r.purpose) ? r.purpose : "", events: strings(r.events, 100) })) : [];
      return { type: "approval.required", turnId, approvalId: raw.approvalId, action: raw.action, summary: { changes, recipients }, expiresAt: raw.expiresAt, sentence: "confirmation.required" } as UiEvent;
    }
    case "job.progress":
      return isString(raw.jobId) && isString(raw.stage) ? ({ type: "job.progress", turnId, jobId: raw.jobId, stage: raw.stage, percent: typeof raw.percent === "number" ? raw.percent : null } as UiEvent) : null;
    case "ui.final":
      return isObject(raw.ui) && isString(raw.ui.message) && Array.isArray(raw.ui.cards) && Array.isArray(raw.ui.quick_actions) ? ({ type: "ui.final", turnId, ui: raw.ui } as UiEvent) : null;
    case "error":
      return isString(raw.code) && isString(raw.message) ? ({ type: "error", turnId, code: raw.code, message: raw.message, retryable: raw.retryable === true } as UiEvent) : null;
    case "done":
      return { type: "done", turnId };
    default:
      return null;
  }
}
