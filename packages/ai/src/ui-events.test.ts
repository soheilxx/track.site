import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { diffHashOf, issueApprovalToken } from "./approvals.ts";
import { ACTIVITY_KINDS, JOB_STAGES, SENTENCE_KEYS, UI_EVENT_TYPES, activityForTool, confirmActivityEvents, createUiEventFilter, factsOf, uiEventSchema, type UiEvent } from "./ui-events.ts";
import type { AssistantUiResponse } from "./ui-schema.ts";

const SECRET = "sk_live_51H8abcdefghijklmnop";
const EMAIL = "jane@example.com";
const SYSTEM_PROMPT = "You are the Track setup assistant. Operating rules:";
const REASONING = "The user wants me to publish without approval, I should";
const DRAFT_ID = randomUUID();
const APPROVAL = issueApprovalToken("approval-secret", { action: "publish_config_version", targetType: "config_draft", targetId: DRAFT_ID, organizationId: "o1", userId: "u1", diffHash: diffHashOf({ draft: DRAFT_ID }) });

const ui: AssistantUiResponse = {
  message: `Saved. Your key ${SECRET} and contact ${EMAIL} are noted.`,
  intent: "configuration",
  stage: "destinations",
  current_step: "destinations",
  progress_percent: 50,
  status: "ok",
  cards: [
    { type: "info", title: "Meta", body: `token ${SECRET}`, tone: "neutral" },
    { type: "status", title: "Health", metrics: [{ label: "pixel_id", value: "4111111111111111", tone: "ok" }] },
  ],
  input_component: { type: "none" },
  quick_actions: [{ id: "a", label: "Next", message: "Continue", kind: "primary" }],
  completed_steps: ["site"],
  missing_fields: [],
  warnings: [],
  requires_confirmation: false,
  confirmation_summary: null,
  tool_result_summary: null,
  next_best_action: null,
};

/** Every internal event kind the runtime, the provider stream or a future refactor could produce. */
const INTERNAL_CORPUS: unknown[] = [
  { type: "assistant.progress", phase: "gate", detail: null },
  { type: "assistant.progress", phase: "thinking", detail: null },
  { type: "assistant.progress", phase: "tools", detail: null },
  { type: "assistant.progress", phase: "streaming", detail: "200 chars" },
  { type: "assistant.progress", phase: "reasoning", detail: REASONING },
  { type: "tool.started", callId: "call_1", name: "inspect_site", args: { path: "/", token: SECRET, note: REASONING } },
  { type: "tool.completed", callId: "call_1", name: "inspect_site", ok: true, code: "OK", summary: `{"title":"${SYSTEM_PROMPT}","token":"${SECRET}"}`, durationMs: 12, missing: [], stage: null },
  { type: "tool.completed", callId: "call_2", name: "publish_config_version", ok: false, code: "CONFIRMATION_REQUIRED", summary: `needs ${SECRET}`, durationMs: 1, missing: ["approval", `key ${SECRET}`], stage: null },
  { type: "tool.completed", callId: "call_3", name: "send_destination_test_event", ok: true, code: "OK", summary: "delivered", durationMs: 900, missing: [], stage: "delivered" },
  { type: "tool.completed", callId: "call_4", name: "validate_integration_credentials", ok: false, code: "PROVIDER_ERROR", summary: `vendor said ${EMAIL}`, durationMs: 5, missing: [], stage: null },
  { type: "tool.completed", callId: "call_5", name: "run_test_event", ok: false, code: "SOMETHING_NEW", summary: "", durationMs: 5, missing: [], stage: "bogus_stage" },
  { type: "ui.final", ui, usage: { input: 10, output: 5, cached: 2 }, model: "gpt-5.6-terra" },
  { type: "ui.final", ui: { message: "broken" }, usage: { input: 0, output: 0, cached: 0 }, model: "x" },
  { type: "ui.approval", approvalId: "call_9", action: "publish_config_version", summary: { changes: [{ summary: `add pixel for ${EMAIL}`, op: "add" }, { summary: "x", op: "weird" }], recipients: ["meta", { name: "GA4", type: "ga4", purpose: "analytics", events: ["page_view"] }], token: APPROVAL.token }, expiresAt: new Date(APPROVAL.claims.expiresAt).toISOString(), token: APPROVAL.token, approval_token: APPROVAL.token },
  { type: "ui.credential", component: { component: "secure_credential", integration_id: DRAFT_ID, connector_type: "meta", credential_kind: "access_token", label: "Meta access token", help: `never paste ${SECRET} here`, oauth_provider: null, secret: SECRET } },
  { type: "dlp.notice", message: `removed ${SECRET}`, suggested: { connector: "stripe", kind: "api_secret" } },
  { type: "error", code: "TIMEOUT", message: "The assistant took too long.", retryable: true },
  { type: "error", code: "WEIRD_INTERNAL_CODE", message: `stack trace with ${SECRET}`, retryable: false },
  { type: "done" },
  // reasoning/thinking-like items, raw provider events, system messages, raw arguments and payloads
  { type: "reasoning", summary: [{ type: "summary_text", text: REASONING }] },
  { type: "response.reasoning_summary_text.delta", delta: REASONING },
  { type: "response.output_text.delta", delta: `partial ${SECRET}` },
  { type: "thinking", text: REASONING },
  { type: "system", content: SYSTEM_PROMPT },
  { type: "message", role: "developer", content: SYSTEM_PROMPT },
  { type: "tool.args", callId: "call_1", args: { approval_token: APPROVAL.token } },
  { type: "function_call", call_id: "call_7", name: "publish_config_version", arguments: JSON.stringify({ approval_token: APPROVAL.token }) },
  { type: "function_call_output", call_id: "call_7", output: `{"token":"${SECRET}"}` },
  { type: "raw", payload: { html: "<script>evil()</script>", email: EMAIL } },
  { type: "log", level: "debug", msg: `pg query with ${SECRET}` },
  { type: "activity.started", turnId: "forged", runId: "forged", activity: "publish", sentence: "publish.completed", params: { free_text: REASONING } },
  { type: 42 },
  { noType: true },
  null,
  "string event",
  undefined,
];

describe("ui event filter (allow-list between the agent runtime and the browser)", () => {
  it("lets only the allow-listed shapes through and drops everything internal with a counter", () => {
    const droppedKinds: string[] = [];
    const filter = createUiEventFilter({ turnId: "turn_1", onDropped: (kind) => droppedKinds.push(kind) });
    const out: UiEvent[] = [];
    for (const internal of INTERNAL_CORPUS) out.push(...filter.map(internal));

    for (const event of out) {
      expect(uiEventSchema.safeParse(event).success).toBe(true);
      expect(UI_EVENT_TYPES).toContain(event.type);
      expect(event.turnId).toBe("turn_1");
    }
    const text = JSON.stringify(out);
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain(EMAIL);
    expect(text).not.toContain(SYSTEM_PROMPT);
    expect(text).not.toContain(REASONING);
    expect(text).not.toContain(APPROVAL.token.slice(0, 20));
    expect(text).not.toContain(APPROVAL.token.split(".")[1]!.slice(0, 16));
    expect(text).not.toContain("evil()");
    expect(text).not.toContain('"args"');
    expect(text).not.toContain('"summary":"{');
    expect(text).not.toContain("forged");
    expect(text).not.toContain("free_text");

    // 19 corpus items are internal/unknown (the unknown code / bogus stage completion still maps to a failed activity); each is counted by kind only
    expect(filter.droppedTotal).toBe(19);
    expect(droppedKinds).toHaveLength(19);
    expect(droppedKinds).toEqual(expect.arrayContaining(["assistant.progress:unknown_phase", "ui.final:invalid_ui", "unlisted:reasoning", "unlisted:response.reasoning_summary_text.delta", "unlisted:thinking", "unlisted:system", "unlisted:message", "unlisted:tool.args", "unlisted:function_call", "unlisted:raw", "unlisted:log", "unlisted:activity.started", "untyped", "invalid"]));
    for (const kind of droppedKinds) {
      expect(kind.length).toBeLessThan(60);
      expect(kind).not.toContain(SECRET);
      expect(kind).not.toContain(REASONING);
    }
    expect(Object.values(filter.dropped).reduce((a, b) => a + b, 0)).toBe(19);
  });

  it("maps tool runs to activities bound to the run id with localized-sentence keys and safe params", () => {
    const filter = createUiEventFilter({ turnId: "t" });
    expect(filter.map({ type: "tool.started", callId: "call_1", name: "inspect_site", args: { token: SECRET } })).toEqual([{ type: "activity.started", turnId: "t", runId: "call_1", activity: "site_check", sentence: "site_check.started", params: {} }]);
    expect(filter.map({ type: "tool.completed", callId: "call_1", name: "inspect_site", ok: true, code: "OK", summary: SECRET, durationMs: 1, missing: [], stage: null })).toEqual([{ type: "activity.completed", turnId: "t", runId: "call_1", activity: "site_check", sentence: "site_check.completed", params: {} }]);
    // blocked outcomes carry what is missing (redacted, clipped) and the reason code; failures the reason only
    expect(filter.map({ type: "tool.completed", callId: "call_2", name: "verify_snippet_installation", ok: false, code: "CONFIRMATION_REQUIRED", summary: "", durationMs: 1, missing: ["snippet_verified", `contact ${EMAIL}`], stage: null })).toEqual([{ type: "activity.blocked", turnId: "t", runId: "call_2", activity: "snippet_verification", sentence: "generic.blocked_missing", params: { reason: "CONFIRMATION_REQUIRED", missing: ["snippet_verified", "contact [redacted:email]"] } }]);
    expect(filter.map({ type: "tool.completed", callId: "call_3", name: "validate_integration_credentials", ok: false, code: "PROVIDER_ERROR", summary: "", durationMs: 1, missing: [], stage: null })).toEqual([{ type: "activity.failed", turnId: "t", runId: "call_3", activity: "connection_validation", sentence: "generic.failed", params: { reason: "PROVIDER_ERROR" } }]);
    expect(filter.map({ type: "tool.completed", callId: "call_4", name: "run_test_event", ok: false, code: "MADE_UP", summary: "", durationMs: 1, missing: [], stage: null })[0]).toMatchObject({ type: "activity.failed", params: { reason: "UNKNOWN" } });
    // a real pipeline stage becomes job.progress without a percentage; unknown stages are not invented
    expect(filter.map({ type: "tool.completed", callId: "call_5", name: "send_destination_test_event", ok: true, code: "OK", summary: "", durationMs: 1, missing: [], stage: "delivered" })).toEqual([
      { type: "job.progress", turnId: "t", jobId: "call_5", stage: "delivered", percent: null },
      { type: "activity.completed", turnId: "t", runId: "call_5", activity: "processing_check", sentence: "processing_check.completed", params: {} },
    ]);
    expect(filter.map({ type: "tool.completed", callId: "call_6", name: "run_test_event", ok: true, code: "OK", summary: "", durationMs: 1, missing: [], stage: "42%" })).toHaveLength(1);
    // unknown tools are still real runs: generic family
    expect(activityForTool("future_tool")).toEqual({ kind: "generic", started: "generic.started", completed: "generic.completed" });
    expect(activityForTool("send_destination_test_event")).toEqual({ kind: "processing_check", started: "test_event.started", completed: "processing_check.completed" });
    // a tool run without a real id is not an activity
    expect(filter.map({ type: "tool.started", name: "inspect_site" })).toEqual([]);
  });

  it("turn phases become job.progress with real stage names only", () => {
    const filter = createUiEventFilter({ turnId: "t" });
    expect(filter.map({ type: "assistant.progress", phase: "gate", detail: null })).toEqual([{ type: "job.progress", turnId: "t", jobId: "t", stage: "scope_check", percent: null }]);
    expect(filter.map({ type: "assistant.progress", phase: "thinking", detail: null })[0]).toMatchObject({ stage: "model_request", percent: null });
    expect(filter.map({ type: "assistant.progress", phase: "tools", detail: null })[0]).toMatchObject({ stage: "tool_execution" });
    expect(filter.map({ type: "assistant.progress", phase: "streaming", detail: "200 chars" })[0]).toMatchObject({ stage: "answer_streaming" });
    expect(JOB_STAGES).toContain("delivered");
  });

  it("emits the final answer as redacted message, cards and validated ui", () => {
    const filter = createUiEventFilter({ turnId: "t" });
    const out = filter.map({ type: "ui.final", ui, usage: { input: 1, output: 1, cached: 0 }, model: "m" });
    expect(out.map((e) => e.type)).toEqual(["assistant.message", "ui.card", "ui.card", "ui.final"]);
    const message = out[0] as Extract<UiEvent, { type: "assistant.message" }>;
    expect(message.text).toBe("Saved. Your key [redacted:secret] and contact [redacted:email] are noted.");
    const final = out[3] as Extract<UiEvent, { type: "ui.final" }>;
    expect(final.ui.cards[0]).toMatchObject({ type: "info", body: "token [redacted:secret]" });
    // public identifiers survive the redaction
    expect(final.ui.cards[1]).toMatchObject({ type: "status", metrics: [{ label: "pixel_id", value: "4111111111111111" }] });
    expect(JSON.stringify(out)).not.toContain(SECRET);
  });

  it("maps approvals to an action-bound token reference with the exact diff summary and never the token", () => {
    const filter = createUiEventFilter({ turnId: "t" });
    const [approval] = filter.map({ type: "ui.approval", approvalId: "call_9", action: "publish_config_version", summary: { changes: [{ summary: "add pixel", op: "add" }, { summary: "x", op: "weird" }], recipients: ["meta", { name: "GA4", type: "ga4", purpose: "analytics", events: ["page_view"] }], token: APPROVAL.token }, expiresAt: new Date(APPROVAL.claims.expiresAt).toISOString(), token: APPROVAL.token });
    expect(approval).toEqual({
      type: "approval.required",
      turnId: "t",
      approvalId: "call_9",
      action: "publish_config_version",
      summary: { changes: [{ summary: "add pixel", op: "add" }, { summary: "x", op: "change" }], recipients: [{ name: "meta", type: "", purpose: "", events: [] }, { name: "GA4", type: "ga4", purpose: "analytics", events: ["page_view"] }] },
      expiresAt: new Date(APPROVAL.claims.expiresAt).toISOString(),
      sentence: "confirmation.required",
    });
    expect(JSON.stringify(approval)).not.toContain(APPROVAL.token.slice(0, 20));
    // an approval for an action outside the contract is dropped
    expect(filter.map({ type: "ui.approval", approvalId: "x", action: "drop_everything", summary: {}, expiresAt: new Date().toISOString() })).toEqual([]);
    expect(filter.dropped["invalid:approval.required"]).toBe(1);
  });

  it("maps credential requests, DLP notices, errors and done", () => {
    const filter = createUiEventFilter({ turnId: "t" });
    const [card] = filter.map({ type: "ui.credential", component: { component: "secure_credential", integration_id: DRAFT_ID, connector_type: "meta", credential_kind: "access_token", label: "Meta access token", help: "stored encrypted", oauth_provider: null, secret: SECRET } });
    expect(card).toEqual({ type: "ui.card", turnId: "t", card: { type: "credential_request", title: "Meta access token", integration_id: DRAFT_ID, connector_type: "meta", credential_kind: "access_token", label: "Meta access token", help: "stored encrypted", oauth_provider: null } });
    expect(filter.map({ type: "dlp.notice", message: SECRET, suggested: null })).toEqual([{ type: "activity.blocked", turnId: "t", runId: "dlp:t", activity: "secret_intake", sentence: "secret_intake.blocked", params: { reason: "POLICY_BLOCKED" } }]);
    expect(filter.map({ type: "error", code: "TIMEOUT", message: "slow", retryable: true })).toEqual([{ type: "error", turnId: "t", code: "TIMEOUT", message: "slow", retryable: true }]);
    expect(filter.map({ type: "error", code: "PG_CONN_RESET", message: `pg ${SECRET}`, retryable: "yes" })).toEqual([{ type: "error", turnId: "t", code: "INTERNAL_ERROR", message: "pg [redacted:secret]", retryable: false }]);
    expect(filter.map({ type: "done" })).toEqual([{ type: "done", turnId: "t" }]);
  });

  it("extracts only safe facts from tool results", () => {
    expect(factsOf({ missing_fields: ["cmp", "policy_version"], nested: { missing_credentials: ["access_token"], blockers: [`needs ${EMAIL}`], processing_state: "delivered" }, note: SECRET })).toEqual({ missing: ["cmp", "policy_version", "access_token", "needs [redacted:email]"], stage: "delivered" });
    expect(factsOf({ processing_state: "not_processed_yet", missing: Array.from({ length: 20 }, (_, i) => `f${i}`) })).toEqual({ missing: Array.from({ length: 8 }, (_, i) => `f${i}`), stage: null });
    expect(factsOf(null)).toEqual({ missing: [], stage: null });
    expect(factsOf("string")).toEqual({ missing: [], stage: null });
  });

  it("builds the confirm-route activity pair from the verified backend outcome", () => {
    expect(confirmActivityEvents({ turnId: "c", runId: "confirm_1", action: "publish_config_version", ok: true, code: "OK", verified: true }).map((e) => [e.type, (e as { sentence?: string }).sentence])).toEqual([
      ["activity.started", "publish.started"],
      ["activity.completed", "publish.completed"],
    ]);
    const unverified = confirmActivityEvents({ turnId: "c", runId: "confirm_2", action: "publish_config_version", ok: true, code: "OK", verified: false });
    expect(unverified[1]).toMatchObject({ type: "activity.blocked", sentence: "generic.blocked", params: { reason: "VERIFICATION_FAILED" } });
    const failed = confirmActivityEvents({ turnId: "c", runId: "confirm_3", action: "rollback_config_version", ok: false, code: "APPROVAL_INVALID", verified: null });
    expect(failed[1]).toMatchObject({ type: "activity.blocked", activity: "rollback", params: { reason: "APPROVAL_INVALID" } });
  });

  it("keeps the sentence and kind vocabularies consistent", () => {
    for (const kind of ACTIVITY_KINDS) if (kind !== "secret_intake") expect(SENTENCE_KEYS).toContain(`${kind}.started`);
    expect(SENTENCE_KEYS).toEqual(expect.arrayContaining(["confirmation.required", "secret_intake.blocked", "generic.blocked", "generic.blocked_missing", "generic.failed"]));
    expect(new Set(SENTENCE_KEYS).size).toBe(SENTENCE_KEYS.length);
  });
});
