import type OpenAI from "openai";
import { redactDeep } from "@track-site/core";
import type { AgentContext } from "./context.ts";
import { redactToolOutput } from "./dlp.ts";
import type { ModelRouting } from "./openai.ts";
import { CONFIRM_TOOLS, READ_ONLY_TOOLS } from "./state-machine.ts";
import type { ToolRegistry } from "./tools/registry.ts";
import { assistantUiJsonSchema, assistantUiResponseSchema, type AssistantUiResponse } from "./ui-schema.ts";

/**
 * One assistant turn on the OpenAI Responses API: streaming, strict function calling with
 * server-side execution, structured final answer, bounded tool/time/token budget, no implicit
 * retries of mutating tools, and a fallback model for read-only turns.
 */
export type AgentEvent =
  | { type: "assistant.progress"; phase: "thinking" | "streaming" | "tools"; detail: string | null }
  | { type: "tool.started"; callId: string; name: string; args: Record<string, unknown> }
  | { type: "tool.completed"; callId: string; name: string; ok: boolean; code: string; summary: string; durationMs: number }
  | { type: "ui.final"; ui: AssistantUiResponse; usage: TokenUsage; model: string }
  | { type: "error"; code: string; message: string; retryable: boolean };

export interface TokenUsage {
  input: number;
  output: number;
  cached: number;
}

export interface HistoryItem {
  role: "user" | "assistant";
  content: string;
}

export interface TurnInput {
  ctx: AgentContext;
  client: OpenAI;
  models: ModelRouting;
  registry: ToolRegistry;
  toolNames: string[];
  instructions: string;
  contextBlock: string;
  history: HistoryItem[];
  userMessage: string;
  emit: (event: AgentEvent) => void;
  maxToolCalls?: number;
  timeoutMs?: number;
  maxOutputTokens?: number;
  safetyIdentifier: string;
  promptCacheKey: string;
  /** hook for persisting tool runs (audit) */
  onToolRun?: (run: { callId: string; name: string; args: Record<string, unknown>; result: { ok: boolean; code: string; data: unknown }; durationMs: number }) => Promise<void>;
}

export interface TurnResult {
  ui: AssistantUiResponse | null;
  usage: TokenUsage;
  model: string;
  toolCalls: number;
  error: { code: string; message: string } | null;
}

type InputItem =
  | { role: "user" | "assistant"; content: string }
  | { type: "function_call"; call_id: string; name: string; arguments: string }
  | { type: "function_call_output"; call_id: string; output: string };

interface OutputFunctionCall {
  type: "function_call";
  call_id: string;
  name: string;
  arguments: string;
}

function summarize(data: unknown): string {
  const text = typeof data === "string" ? data : JSON.stringify(data ?? null);
  return text.length > 240 ? `${text.slice(0, 240)}…` : text;
}

export async function runAgentTurn(input: TurnInput): Promise<TurnResult> {
  const { ctx, client, registry, emit } = input;
  const maxToolCalls = input.maxToolCalls ?? 8;
  const deadline = Date.now() + (input.timeoutMs ?? 45_000);
  const usage: TokenUsage = { input: 0, output: 0, cached: 0 };
  const exposesWrites = input.toolNames.some((n) => !READ_ONLY_TOOLS.includes(n));
  const tools = registry.openaiTools(input.toolNames);
  const items: InputItem[] = [...input.history.slice(-12).map((h) => ({ role: h.role, content: h.content })), { role: "user", content: `${input.contextBlock}\n\n${input.userMessage}` }];
  let model = input.models.primary;
  let toolCalls = 0;
  let wroteSomething = false;
  let incompleteRetried = false;

  for (let iteration = 0; iteration < maxToolCalls + 2; iteration++) {
    if (Date.now() > deadline) {
      emit({ type: "error", code: "TIMEOUT", message: "The assistant took too long. The setup state was saved; please try again.", retryable: true });
      return { ui: null, usage, model, toolCalls, error: { code: "TIMEOUT", message: "turn timeout" } };
    }
    emit({ type: "assistant.progress", phase: "thinking", detail: null });
    let response: OpenAI.Responses.Response;
    try {
      response = await streamResponse(client, {
        model,
        instructions: input.instructions,
        input: items as never,
        tools: tools as never,
        tool_choice: "auto",
        parallel_tool_calls: !exposesWrites,
        text: { format: { type: "json_schema", name: "assistant_ui", schema: assistantUiJsonSchema(), strict: true } },
        store: false,
        max_output_tokens: input.maxOutputTokens ?? 2_000,
        safety_identifier: input.safetyIdentifier,
        prompt_cache_key: input.promptCacheKey,
        metadata: { app: "track-site", instructions_version: "2026-09-02" },
      }, emit, Math.max(5_000, deadline - Date.now()));
    } catch (e) {
      const status = (e as { status?: number }).status;
      const retryable = status === 429 || (status !== undefined && status >= 500) || status === undefined;
      // fallback model only for turns that have not mutated anything and only once
      if (retryable && !wroteSomething && model !== input.models.fast) {
        ctx.logger.warn({ status, from: model, to: input.models.fast }, "falling back to the fast model");
        model = input.models.fast;
        continue;
      }
      const message = status === 429 ? "The AI provider is rate limiting requests. Please try again in a moment." : "The AI provider is unavailable. Your setup state is saved; you can continue with the form-based wizard.";
      emit({ type: "error", code: retryable ? "PROVIDER_UNAVAILABLE" : "PROVIDER_ERROR", message, retryable });
      return { ui: null, usage, model, toolCalls, error: { code: retryable ? "PROVIDER_UNAVAILABLE" : "PROVIDER_ERROR", message } };
    }
    if (response.usage) {
      usage.input += response.usage.input_tokens ?? 0;
      usage.output += response.usage.output_tokens ?? 0;
      usage.cached += response.usage.input_tokens_details?.cached_tokens ?? 0;
    }
    const calls = (response.output ?? []).filter((o): o is OutputFunctionCall => (o as { type?: string }).type === "function_call");
    if (calls.length > 0) {
      for (const call of calls) {
        if (toolCalls >= maxToolCalls) {
          items.push({ type: "function_call", call_id: call.call_id, name: call.name, arguments: call.arguments });
          items.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify({ ok: false, code: "RATE_LIMITED", message: "tool budget for this turn exhausted", data: null, retryable: false, version: 1 }) });
          continue;
        }
        toolCalls++;
        const tool = registry.get(call.name);
        let args: Record<string, unknown>;
        try {
          args = JSON.parse(call.arguments || "{}") as Record<string, unknown>;
        } catch {
          args = {};
        }
        const started = Date.now();
        emit({ type: "tool.started", callId: call.call_id, name: call.name, args: redactDeep(args) });
        let result: { ok: boolean; code: string; message: string; data: unknown; retryable: boolean; version: number };
        if (!tool || !input.toolNames.includes(call.name)) {
          result = { ok: false, code: "FORBIDDEN", message: "tool not available in this step", data: null, retryable: false, version: 1 };
        } else if (CONFIRM_TOOLS.includes(call.name) && !("approval_token" in args && typeof args.approval_token === "string" && args.approval_token.length > 0)) {
          result = { ok: false, code: "CONFIRMATION_REQUIRED", message: "this action needs an explicit user confirmation through the approval component", data: null, retryable: false, version: 1 };
        } else {
          const r = await tool.run(args, ctx);
          result = { ok: r.ok, code: r.code, message: r.message, data: r.ok ? redactToolOutput(r.data) : null, retryable: r.retryable, version: r.version };
          if (r.ok && tool.kind !== "read") wroteSomething = true;
        }
        const durationMs = Date.now() - started;
        emit({ type: "tool.completed", callId: call.call_id, name: call.name, ok: result.ok, code: result.code, summary: summarize(result.data ?? result.message), durationMs });
        await input.onToolRun?.({ callId: call.call_id, name: call.name, args: redactDeep(args), result: { ok: result.ok, code: result.code, data: result.data }, durationMs });
        items.push({ type: "function_call", call_id: call.call_id, name: call.name, arguments: call.arguments });
        items.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(result).slice(0, 20_000) });
      }
      continue;
    }
    if (response.status === "incomplete") {
      if (!incompleteRetried) {
        incompleteRetried = true;
        items.push({ role: "user", content: "Your previous answer was cut off. Answer again, much shorter, using the required JSON schema." });
        continue;
      }
      emit({ type: "error", code: "PROVIDER_ERROR", message: "The assistant could not complete its answer.", retryable: true });
      return { ui: null, usage, model, toolCalls, error: { code: "PROVIDER_ERROR", message: `incomplete: ${response.incomplete_details?.reason ?? "unknown"}` } };
    }
    const refusal = (response.output ?? []).flatMap((o) => ((o as { content?: Array<{ type: string; refusal?: string }> }).content ?? [])).find((c) => c.type === "refusal");
    if (refusal) {
      emit({ type: "error", code: "POLICY_BLOCKED", message: "The assistant declined this request.", retryable: false });
      return { ui: null, usage, model, toolCalls, error: { code: "POLICY_BLOCKED", message: "refusal" } };
    }
    const text = outputTextOf(response);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    const ui = assistantUiResponseSchema.safeParse(clampUiAnswer(parsed));
    if (!ui.success) {
      const issues = ui.error.issues.slice(0, 8).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
      ctx.logger.warn({ model, outputLength: text.length, status: response.status, issues }, "assistant answer failed the UI schema");
      if (!incompleteRetried) {
        incompleteRetried = true;
        items.push({ role: "user", content: `Your previous answer did not match the required JSON schema (${issues.join("; ")}). Answer again strictly following the schema.` });
        continue;
      }
      // outside production the schema issues are shown so that setup problems are diagnosable without log access
      const detail = process.env.APP_ENV === "production" ? "" : ` (${issues.join("; ").slice(0, 240)})`;
      emit({ type: "error", code: "PROVIDER_ERROR", message: `The assistant returned an invalid answer.${detail}`, retryable: true });
      return { ui: null, usage, model, toolCalls, error: { code: "PROVIDER_ERROR", message: `schema validation failed: ${issues.join("; ")}`.slice(0, 300) } };
    }
    emit({ type: "ui.final", ui: ui.data, usage, model });
    return { ui: ui.data, usage, model, toolCalls, error: null };
  }
  emit({ type: "error", code: "RATE_LIMITED", message: "Too many tool calls in one turn.", retryable: false });
  return { ui: null, usage, model, toolCalls, error: { code: "RATE_LIMITED", message: "tool budget exhausted" } };
}

/** Streams a response, emitting progress, and resolves with the final Response object. */
async function streamResponse(client: OpenAI, params: OpenAI.Responses.ResponseCreateParamsNonStreaming, emit: (e: AgentEvent) => void, timeoutMs: number): Promise<OpenAI.Responses.Response> {
  const stream = await client.responses.create({ ...params, stream: true }, { timeout: timeoutMs });
  let final: OpenAI.Responses.Response | null = null;
  let chars = 0;
  let announcedTools = false;
  for await (const event of stream) {
    switch (event.type) {
      case "response.output_text.delta":
        chars += event.delta.length;
        if (chars % 200 < event.delta.length) emit({ type: "assistant.progress", phase: "streaming", detail: `${chars} chars` });
        break;
      case "response.output_item.added":
        if ((event.item as { type?: string }).type === "function_call" && !announcedTools) {
          announcedTools = true;
          emit({ type: "assistant.progress", phase: "tools", detail: null });
        }
        break;
      case "response.completed":
      case "response.incomplete":
        final = event.response;
        break;
      case "response.failed":
        throw Object.assign(new Error(event.response.error?.message ?? "response failed"), { status: 500 });
      case "error":
        throw Object.assign(new Error(event.message ?? "stream error"), { status: 500 });
      default:
        break;
    }
  }
  if (!final) throw Object.assign(new Error("stream ended without a final response"), { status: 500 });
  return final;
}

/** Limits the model cannot see in the strict JSON schema are applied leniently instead of rejecting the whole answer. */
function clampUiAnswer(parsed: unknown): unknown {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return parsed;
  const o = { ...(parsed as Record<string, unknown>) };
  if (Array.isArray(o.cards) && o.cards.length > 6) o.cards = o.cards.slice(0, 6);
  if (Array.isArray(o.quick_actions) && o.quick_actions.length > 4) o.quick_actions = o.quick_actions.slice(0, 4);
  if (typeof o.progress_percent === "number") o.progress_percent = Math.max(0, Math.min(100, Math.round(o.progress_percent)));
  return o;
}

/** Streamed responses do not always carry the SDK convenience getter, so the message text is assembled from the output items. */
function outputTextOf(response: OpenAI.Responses.Response): string {
  const direct = (response as { output_text?: unknown }).output_text;
  if (typeof direct === "string" && direct.length > 0) return direct;
  const parts: string[] = [];
  for (const item of response.output ?? []) {
    if ((item as { type?: string }).type !== "message") continue;
    for (const c of ((item as { content?: Array<{ type?: string; text?: string }> }).content ?? [])) {
      if (c.type === "output_text" && typeof c.text === "string") parts.push(c.text);
    }
  }
  return parts.join("");
}
