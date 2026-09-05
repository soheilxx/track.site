import { z } from "zod";
import { redactDeep, redactPii, type PiiKind } from "@track-site/core";
import { redactToolOutput } from "./dlp.ts";
import { assistantUiResponseSchema, cardSchema, type AssistantUiResponse } from "./ui-schema.ts";

/**
 * Browser-facing event contract of the Track AI stream (owner supplement §9 "Keine sichtbaren
 * internen Gedankengänge"). The browser only ever receives the allow-listed shapes below; every
 * internal agent event (progress phases, raw tool arguments, tool summaries, reasoning-like items,
 * system messages, provider payloads) is mapped through `createUiEventFilter` or dropped with a
 * counter. Activity events are bound to a real tool run (`runId` = the provider call id, the wizard
 * or the confirmation run id) and carry a localized-sentence key plus safe parameters — never free
 * model text. Assistant text reaches the browser only as the validated, DLP-redacted final answer.
 */
export const UI_EVENT_CONTRACT_VERSION = "2026-09-04";

export const UI_EVENT_TYPES = ["activity.started", "activity.completed", "activity.blocked", "activity.failed", "assistant.message", "ui.card", "approval.required", "job.progress", "ui.final", "error", "done"] as const;
export type UiEventType = (typeof UI_EVENT_TYPES)[number];

/** Coarse activity families; each maps to localized sentences `assistant.activity.<kind>.<phase>` in the web app. */
export const ACTIVITY_KINDS = [
  "generic",
  "state_lookup",
  "site_check",
  "stack_detection",
  "snippet_verification",
  "domain_verification",
  "measurement_plan",
  "draft_update",
  "destination_setup",
  "credential_request",
  "connection_validation",
  "test_event",
  "processing_check",
  "signal_scan",
  "diagnostics",
  "consent_review",
  "change_review",
  "change_proposal",
  "publish",
  "rollback",
  "destination_pause",
  "credential_change",
  "data_request",
  "live_conversion",
  "secret_intake",
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

const PHASED_KINDS = ACTIVITY_KINDS.filter((k) => k !== "secret_intake");

/**
 * Localized-sentence keys. `<kind>.started` / `<kind>.completed` exist for every tool-backed kind;
 * blocked and failed outcomes use the generic sentences with safe parameters ("what is still
 * missing", a reason code). `confirmation.required` accompanies `approval.required`.
 */
export const SENTENCE_KEYS = [...PHASED_KINDS.flatMap((k) => [`${k}.started`, `${k}.completed`] as const), "generic.blocked", "generic.blocked_missing", "generic.failed", "confirmation.required", "secret_intake.blocked"] as const;
export type SentenceKey = (typeof SENTENCE_KEYS)[number];

/** Reason codes that may accompany a blocked/failed activity (localized as `assistant.reason.<code>`). */
export const ACTIVITY_REASONS = ["VALIDATION_ERROR", "NOT_FOUND", "UNAUTHORIZED", "FORBIDDEN", "CONFLICT", "RATE_LIMITED", "ENTITLEMENT_EXCEEDED", "POLICY_BLOCKED", "CONFIRMATION_REQUIRED", "APPROVAL_INVALID", "INVALID_STATE", "NOT_CONNECTED", "PROVIDER_ERROR", "PROVIDER_UNAVAILABLE", "TIMEOUT", "INTERNAL_ERROR", "VERIFICATION_FAILED", "UNKNOWN"] as const;
export type ActivityReason = (typeof ACTIVITY_REASONS)[number];

/** Outcomes that mean "not possible right now" (blocked) versus "something broke" (failed). */
const BLOCKED_REASONS: ReadonlySet<string> = new Set(["VALIDATION_ERROR", "NOT_FOUND", "UNAUTHORIZED", "FORBIDDEN", "CONFLICT", "RATE_LIMITED", "ENTITLEMENT_EXCEEDED", "POLICY_BLOCKED", "CONFIRMATION_REQUIRED", "APPROVAL_INVALID", "INVALID_STATE", "NOT_CONNECTED", "VERIFICATION_FAILED"]);

/**
 * Real stage names only. Turn stages describe the server-side pipeline of one assistant turn;
 * lineage stages are the event pipeline states reported by the tools. Percentages are null unless
 * they were measured — the contract never carries invented progress.
 */
export const JOB_STAGES = ["scope_check", "model_request", "tool_execution", "answer_streaming", "answer_validation", "queued", "captured", "accepted", "normalized", "policy_blocked", "deduplicated", "routed", "delivered", "rejected"] as const;
export type JobStage = (typeof JOB_STAGES)[number];

export const UI_ERROR_CODES = ["TIMEOUT", "PROVIDER_UNAVAILABLE", "PROVIDER_ERROR", "POLICY_BLOCKED", "RATE_LIMITED", "INTERNAL_ERROR", "NOT_CONNECTED", "FORBIDDEN", "VALIDATION_ERROR", "NOT_FOUND", "UNAUTHORIZED", "CONFLICT", "STREAM_LOST"] as const;
export type UiErrorCode = (typeof UI_ERROR_CODES)[number];

/** Confirmation-gated actions an approval can bind to (the approval id references a server-side token; the token itself never appears). */
export const APPROVAL_ACTIONS = ["publish_config_version", "rollback_config_version", "activate_or_pause_destination", "rotate_credential", "disconnect_integration", "send_live_conversion", "delete_or_export_data"] as const;
export type ApprovalAction = (typeof APPROVAL_ACTIONS)[number];

const id = z.string().min(1).max(120);
const isoDate = z.string().refine((v) => !Number.isNaN(Date.parse(v)), "expected an ISO timestamp");

export const activityParamsSchema = z.object({
  /** short server-side identifiers of what is still missing (fields, credentials, public ids); never free text */
  missing: z.array(z.string().min(1).max(80)).max(8).optional(),
  reason: z.enum(ACTIVITY_REASONS).optional(),
});
export type ActivityParams = z.infer<typeof activityParamsSchema>;

const activityBase = { turnId: id, runId: id, activity: z.enum(ACTIVITY_KINDS), sentence: z.enum(SENTENCE_KEYS), params: activityParamsSchema };

export const approvalSummarySchema = z.object({
  changes: z.array(z.object({ summary: z.string().max(400), op: z.enum(["add", "remove", "change"]) })).max(50),
  recipients: z.array(z.object({ name: z.string().max(120), type: z.string().max(60), purpose: z.string().max(60), events: z.array(z.string().max(80)).max(100) })).max(50),
});

export const uiEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("activity.started"), ...activityBase }),
  z.object({ type: z.literal("activity.completed"), ...activityBase }),
  z.object({ type: z.literal("activity.blocked"), ...activityBase }),
  z.object({ type: z.literal("activity.failed"), ...activityBase }),
  z.object({ type: z.literal("assistant.message"), turnId: id, text: z.string().max(8_000) }),
  z.object({ type: z.literal("ui.card"), turnId: id, card: cardSchema }),
  z.object({ type: z.literal("approval.required"), turnId: id, approvalId: id, action: z.enum(APPROVAL_ACTIONS), summary: approvalSummarySchema, expiresAt: isoDate, sentence: z.literal("confirmation.required") }),
  z.object({ type: z.literal("job.progress"), turnId: id, jobId: id, stage: z.enum(JOB_STAGES), percent: z.number().min(0).max(100).nullable() }),
  z.object({ type: z.literal("ui.final"), turnId: id, ui: assistantUiResponseSchema }),
  z.object({ type: z.literal("error"), turnId: id, code: z.enum(UI_ERROR_CODES), message: z.string().max(500), retryable: z.boolean() }),
  z.object({ type: z.literal("done"), turnId: id }),
]);
export type UiEvent = z.infer<typeof uiEventSchema>;
export type ActivityEvent = Extract<UiEvent, { type: `activity.${string}` }>;

/** Tool name → activity family (+ per-phase sentence overrides). Unknown tools use the generic family. */
const TOOL_ACTIVITY: Record<string, { kind: ActivityKind; started?: SentenceKey; completed?: SentenceKey }> = {
  get_workspace_state: { kind: "state_lookup" },
  get_setup_state: { kind: "state_lookup" },
  list_integrations: { kind: "state_lookup" },
  inspect_event_schema: { kind: "state_lookup" },
  inspect_site: { kind: "site_check" },
  detect_site_stack: { kind: "stack_detection" },
  verify_snippet_installation: { kind: "snippet_verification" },
  verify_domain: { kind: "domain_verification" },
  propose_event_plan: { kind: "measurement_plan" },
  create_trigger_draft: { kind: "measurement_plan" },
  upsert_event_mapping_draft: { kind: "measurement_plan" },
  set_business_profile_draft: { kind: "draft_update" },
  set_setup_step: { kind: "draft_update" },
  skip_setup_step: { kind: "draft_update" },
  create_integration_draft: { kind: "destination_setup" },
  save_public_pixel_id_draft: { kind: "destination_setup" },
  set_destination_settings_draft: { kind: "destination_setup" },
  request_secure_credential_input: { kind: "credential_request" },
  validate_integration_credentials: { kind: "connection_validation" },
  get_destination_status: { kind: "connection_validation" },
  run_test_event: { kind: "test_event" },
  // one run, two truthful sentences: sending the event, then the processing/forwarding verdict
  send_destination_test_event: { kind: "processing_check", started: "test_event.started", completed: "processing_check.completed" },
  analyze_recent_event_health: { kind: "signal_scan" },
  show_delivery_errors: { kind: "signal_scan" },
  run_diagnostics: { kind: "diagnostics" },
  explain_consent_state: { kind: "consent_review" },
  set_consent_policy_draft: { kind: "consent_review" },
  validate_draft: { kind: "change_review" },
  compare_config_versions: { kind: "change_review" },
  prepare_publish: { kind: "change_proposal" },
  publish_config_version: { kind: "publish" },
  rollback_config_version: { kind: "rollback" },
  activate_or_pause_destination: { kind: "destination_pause" },
  rotate_credential: { kind: "credential_change" },
  disconnect_integration: { kind: "credential_change" },
  delete_or_export_data: { kind: "data_request" },
  send_live_conversion: { kind: "live_conversion" },
};

export function activityForTool(name: string): { kind: ActivityKind; started: SentenceKey; completed: SentenceKey } {
  const entry = TOOL_ACTIVITY[name] ?? { kind: "generic" as const };
  return { kind: entry.kind, started: entry.started ?? (`${entry.kind}.started` as SentenceKey), completed: entry.completed ?? (`${entry.kind}.completed` as SentenceKey) };
}

const MISSING_KEY_RE = /^(missing|missing_[a-z_]+|blockers)$/;
const UI_CONTENT_KINDS: PiiKind[] = ["secret", "jwt", "email", "phone", "iban"];

/**
 * Safe facts extracted from a tool result for the activity sentence: the identifiers of what is
 * still missing (server-authored keys, clipped and redacted) and the pipeline stage if the tool
 * reports one. Nothing else of the tool output reaches the browser through the activity stream.
 */
export function factsOf(data: unknown): { missing: string[]; stage: JobStage | null } {
  const missing: string[] = [];
  let stage: JobStage | null = null;
  const walk = (value: unknown, depth: number) => {
    if (!value || typeof value !== "object" || depth > 3) return;
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (MISSING_KEY_RE.test(key) && Array.isArray(v)) for (const item of v) if (typeof item === "string" && item.trim()) missing.push(redactPii(item.trim().slice(0, 80)).text);
      if (key === "processing_state" && typeof v === "string" && (JOB_STAGES as readonly string[]).includes(v)) stage = v as JobStage;
      if (typeof v === "object") walk(v, depth + 1);
    }
  };
  walk(data, 0);
  return { missing: Array.from(new Set(missing)).slice(0, 8), stage };
}

function reasonOf(code: unknown): ActivityReason {
  return typeof code === "string" && (ACTIVITY_REASONS as readonly string[]).includes(code) ? (code as ActivityReason) : "UNKNOWN";
}

function errorCodeOf(code: unknown): UiErrorCode {
  return typeof code === "string" && (UI_ERROR_CODES as readonly string[]).includes(code) ? (code as UiErrorCode) : "INTERNAL_ERROR";
}

function str(v: unknown, max = 120): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

/** Recipients arrive either as plain names or as impact objects; the contract only knows the object form. */
function normaliseRecipients(value: unknown): Array<{ name: string; type: string; purpose: string; events: string[] }> {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).flatMap((r) => {
    if (typeof r === "string") return [{ name: r.slice(0, 120), type: "", purpose: "", events: [] }];
    if (r && typeof r === "object") {
      const o = r as Record<string, unknown>;
      return [{ name: str(o.name), type: str(o.type, 60), purpose: str(o.purpose, 60), events: Array.isArray(o.events) ? o.events.filter((e): e is string => typeof e === "string").slice(0, 100).map((e) => e.slice(0, 80)) : [] }];
    }
    return [];
  });
}

function normaliseChanges(value: unknown): Array<{ summary: string; op: "add" | "remove" | "change" }> {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).flatMap((c) => {
    if (!c || typeof c !== "object") return [];
    const o = c as Record<string, unknown>;
    const op = o.op === "add" || o.op === "remove" || o.op === "change" ? o.op : "change";
    return [{ summary: str(o.summary, 400), op }];
  });
}

export interface UiEventFilter {
  /** Maps one internal event to zero or more allow-listed, validated, redacted UI events. */
  map: (internal: unknown) => UiEvent[];
  /** Dropped internal events by kind (kind only, never content) for the server log. */
  readonly dropped: Readonly<Record<string, number>>;
  readonly droppedTotal: number;
}

export interface UiEventFilterOptions {
  turnId: string;
  /** Called for every dropped internal event with its kind (never its content). */
  onDropped?: (kind: string) => void;
}

/**
 * The single allow-list between the server-side agent runtime and the browser. Everything that is
 * not explicitly mapped here — including reasoning/thinking-like items, system messages, raw tool
 * arguments and untyped payloads — is dropped and counted; every emitted event is re-validated
 * against the contract after DLP redaction, so a schema drift can never leak content.
 */
export function createUiEventFilter(options: UiEventFilterOptions): UiEventFilter {
  const turnId = options.turnId;
  const dropped: Record<string, number> = {};
  let droppedTotal = 0;
  const drop = (kind: string): UiEvent[] => {
    dropped[kind] = (dropped[kind] ?? 0) + 1;
    droppedTotal++;
    options.onDropped?.(kind);
    return [];
  };
  const finish = (candidates: unknown[]): UiEvent[] => {
    const out: UiEvent[] = [];
    for (const candidate of candidates) {
      // the model's answer was composed from key-aware redacted inputs, so a 15/16-digit number in it is a
      // public id, not a card: answer content is scanned for secrets and personal data only; everything
      // else (activities, approvals, errors) goes through the full key-aware tool-output redaction
      const type = (candidate as { type?: unknown } | null)?.type;
      const redacted = type === "ui.final" || type === "assistant.message" || type === "ui.card" ? redactDeep(candidate, UI_CONTENT_KINDS) : redactToolOutput(candidate);
      const parsed = uiEventSchema.safeParse(redacted);
      if (parsed.success) out.push(parsed.data);
      else drop(`invalid:${str((candidate as { type?: unknown } | null)?.type, 40) || "unknown"}`);
    }
    return out;
  };
  const map = (internal: unknown): UiEvent[] => {
    if (!internal || typeof internal !== "object") return drop("invalid");
    const e = internal as Record<string, unknown>;
    const type = typeof e.type === "string" ? e.type : "";
    switch (type) {
      case "assistant.progress": {
        const stage: JobStage | null = e.phase === "thinking" ? "model_request" : e.phase === "tools" ? "tool_execution" : e.phase === "streaming" ? "answer_streaming" : e.phase === "gate" ? "scope_check" : null;
        if (!stage) return drop("assistant.progress:unknown_phase");
        return finish([{ type: "job.progress", turnId, jobId: turnId, stage, percent: null }]);
      }
      case "tool.started": {
        const name = str(e.name);
        const runId = str(e.callId);
        if (!name || !runId) return drop("tool.started:unbound");
        const activity = activityForTool(name);
        return finish([{ type: "activity.started", turnId, runId, activity: activity.kind, sentence: activity.started, params: {} }]);
      }
      case "tool.completed": {
        const name = str(e.name);
        const runId = str(e.callId);
        if (!name || !runId) return drop("tool.completed:unbound");
        const activity = activityForTool(name);
        const missing = Array.isArray(e.missing) ? e.missing.filter((m): m is string => typeof m === "string") : [];
        const stage = typeof e.stage === "string" && (JOB_STAGES as readonly string[]).includes(e.stage) ? (e.stage as JobStage) : null;
        const progress = stage ? [{ type: "job.progress", turnId, jobId: runId, stage, percent: null }] : [];
        if (e.ok === true) return finish([...progress, { type: "activity.completed", turnId, runId, activity: activity.kind, sentence: activity.completed, params: {} }]);
        const reason = reasonOf(e.code);
        const blocked = BLOCKED_REASONS.has(reason);
        return finish([...progress, { type: blocked ? "activity.blocked" : "activity.failed", turnId, runId, activity: activity.kind, sentence: blocked ? (missing.length ? "generic.blocked_missing" : "generic.blocked") : "generic.failed", params: { reason, ...(missing.length ? { missing } : {}) } }]);
      }
      case "ui.final": {
        const ui = assistantUiResponseSchema.safeParse(e.ui);
        if (!ui.success) return drop("ui.final:invalid_ui");
        const final: AssistantUiResponse = ui.data;
        return finish([{ type: "assistant.message", turnId, text: final.message }, ...final.cards.map((card) => ({ type: "ui.card", turnId, card })), { type: "ui.final", turnId, ui: final }]);
      }
      case "ui.approval": {
        const summary = e.summary && typeof e.summary === "object" ? (e.summary as Record<string, unknown>) : {};
        return finish([{ type: "approval.required", turnId, approvalId: str(e.approvalId), action: str(e.action, 60), summary: { changes: normaliseChanges(summary.changes), recipients: normaliseRecipients(summary.recipients) }, expiresAt: str(e.expiresAt, 40), sentence: "confirmation.required" }]);
      }
      case "ui.credential": {
        const c = e.component && typeof e.component === "object" ? (e.component as Record<string, unknown>) : null;
        if (!c) return drop("ui.credential:invalid");
        const label = str(c.label) || "Credential";
        return finish([{ type: "ui.card", turnId, card: { type: "credential_request", title: label, integration_id: str(c.integration_id), connector_type: str(c.connector_type, 60), credential_kind: str(c.credential_kind, 60), label, help: str(c.help, 400), oauth_provider: typeof c.oauth_provider === "string" ? c.oauth_provider.slice(0, 60) : null } }]);
      }
      case "dlp.notice":
        return finish([{ type: "activity.blocked", turnId, runId: `dlp:${turnId}`, activity: "secret_intake", sentence: "secret_intake.blocked", params: { reason: "POLICY_BLOCKED" } }]);
      case "error":
        return finish([{ type: "error", turnId, code: errorCodeOf(e.code), message: str(e.message, 500), retryable: e.retryable === true }]);
      case "done":
        return finish([{ type: "done", turnId }]);
      default:
        return drop(type ? `unlisted:${type.slice(0, 40)}` : "untyped");
    }
  };
  return {
    map,
    get dropped() {
      return dropped;
    },
    get droppedTotal() {
      return droppedTotal;
    },
  };
}

/** Builds the activity pair for a confirmation-gated action executed by the approval route (runId = the confirm run id). */
export function confirmActivityEvents(input: { turnId: string; runId: string; action: string; ok: boolean; code: string; verified: boolean | null; missing?: string[] }): UiEvent[] {
  const filter = createUiEventFilter({ turnId: input.turnId });
  const started = filter.map({ type: "tool.started", callId: input.runId, name: input.action });
  const outcome = input.ok && input.verified === false ? { ok: false, code: "VERIFICATION_FAILED" } : { ok: input.ok, code: input.code };
  const completed = filter.map({ type: "tool.completed", callId: input.runId, name: input.action, ok: outcome.ok, code: outcome.code, missing: input.missing ?? [] });
  return [...started, ...completed];
}
