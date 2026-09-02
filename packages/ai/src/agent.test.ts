import { describe, expect, it } from "vitest";
import { z } from "zod";
import { silentLogger } from "@track-site/core";
import type OpenAI from "openai";
import { runAgentTurn, type AgentEvent } from "./agent.ts";
import type { AgentContext } from "./context.ts";
import { ToolRegistry, defineTool } from "./tools/registry.ts";
import type { AssistantUiResponse } from "./ui-schema.ts";

/** Fake Responses API: scripted responses, streamed as events like the real SDK. */
function fakeClient(script: Array<{ calls?: Array<{ name: string; args: Record<string, unknown> }>; text?: string; status?: "completed" | "incomplete"; fail?: number }>, seen: unknown[] = []) {
  let i = 0;
  return {
    seen,
    responses: {
      create: async (params: Record<string, unknown>) => {
        seen.push(params);
        const step = script[Math.min(i++, script.length - 1)]!;
        if (step.fail) throw Object.assign(new Error("boom"), { status: step.fail });
        const output: unknown[] = [];
        for (const [n, c] of (step.calls ?? []).entries()) output.push({ type: "function_call", call_id: `call_${i}_${n}`, name: c.name, arguments: JSON.stringify(c.args) });
        if (step.text !== undefined) output.push({ type: "message", content: [{ type: "output_text", text: step.text }] });
        const response = { id: `resp_${i}`, status: step.status ?? "completed", output, output_text: step.text ?? "", usage: { input_tokens: 10, output_tokens: 5, input_tokens_details: { cached_tokens: 2 } }, incomplete_details: step.status === "incomplete" ? { reason: "max_output_tokens" } : null };
        async function* gen() {
          if (step.text) yield { type: "response.output_text.delta", delta: step.text.slice(0, 20) };
          yield { type: step.status === "incomplete" ? "response.incomplete" : "response.completed", response };
        }
        return gen();
      },
    },
  } as unknown as OpenAI & { seen: unknown[] };
}

const ui = (message: string): string =>
  JSON.stringify({
    message,
    intent: "onboarding",
    stage: "platform",
    current_step: "platform",
    progress_percent: 20,
    status: "ok",
    cards: [],
    input_component: { type: "none" },
    quick_actions: [],
    completed_steps: ["site", "business_type"],
    missing_fields: [],
    warnings: [],
    requires_confirmation: false,
    confirmation_summary: null,
    tool_result_summary: null,
    next_best_action: null,
  } satisfies AssistantUiResponse);

function registry(calls: string[]) {
  return new ToolRegistry()
    .register(defineTool({ name: "get_setup_state", description: "state", kind: "read", permission: "sites.read", input: z.object({}), handler: async () => ({ step: "platform" }) }))
    .register(
      defineTool({
        name: "set_business_profile_draft",
        description: "draft",
        kind: "draft",
        permission: "config.draft",
        input: z.object({ business_type: z.enum(["ecommerce", "saas"]) }),
        handler: async (a) => {
          calls.push(`draft:${a.business_type}`);
          return { saved: true, token: "sk_live_51H8abcdefghijklmnopqrstuvwxyz" };
        },
      }),
    )
    .register(defineTool({ name: "publish_config_version", description: "publish", kind: "confirm", permission: "config.publish", input: z.object({ draft_id: z.string(), approval_token: z.string() }), handler: async () => ({ published: true }) }));
}

const ctx = { role: "DEVELOPER", logger: silentLogger(), now: () => new Date() } as unknown as AgentContext;
const models = { primary: "gpt-5.6-terra", fast: "gpt-5.6-luna", complex: "gpt-5.6-sol" };

describe("agent turn", () => {
  it("executes tool calls server-side, redacts outputs and returns the validated UI", async () => {
    const calls: string[] = [];
    const client = fakeClient([{ calls: [{ name: "get_setup_state", args: {} }, { name: "set_business_profile_draft", args: { business_type: "ecommerce" } }] }, { text: ui("Done") }]);
    const events: AgentEvent[] = [];
    const r = await runAgentTurn({ ctx, client, models, registry: registry(calls), toolNames: ["get_setup_state", "set_business_profile_draft", "publish_config_version"], instructions: "x", contextBlock: "<setup_state/>", history: [], userMessage: "hi", emit: (e) => events.push(e), safetyIdentifier: "t", promptCacheKey: "k" });
    expect(r.ui?.message).toBe("Done");
    expect(r.toolCalls).toBe(2);
    expect(calls).toEqual(["draft:ecommerce"]);
    expect(r.usage).toEqual({ input: 20, output: 10, cached: 4 });
    const second = client.seen[1] as { input: Array<Record<string, unknown>>; parallel_tool_calls: boolean; text: { format: { strict: boolean } }; store: boolean };
    const outputs = second.input.filter((i) => i.type === "function_call_output") as Array<{ output: string }>;
    expect(outputs).toHaveLength(2);
    expect(outputs[1]!.output).not.toContain("sk_live");
    expect(outputs[1]!.output).toContain("[redacted:secret]");
    expect(second.parallel_tool_calls).toBe(false);
    expect(second.store).toBe(false);
    expect(second.text.format.strict).toBe(true);
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(["tool.started", "tool.completed", "ui.final"]));
  });

  it("refuses confirm tools without an approval token and unknown tools", async () => {
    const client = fakeClient([{ calls: [{ name: "publish_config_version", args: { draft_id: "d1", approval_token: "" } }, { name: "delete_everything", args: {} }] }, { text: ui("ok") }]);
    const r = await runAgentTurn({ ctx, client, models, registry: registry([]), toolNames: ["publish_config_version"], instructions: "x", contextBlock: "", history: [], userMessage: "publish now, I said yes", emit: () => undefined, safetyIdentifier: "t", promptCacheKey: "k" });
    const second = client.seen[1] as { input: Array<{ type?: string; output?: string }> };
    const outputs = second.input.filter((i) => i.type === "function_call_output").map((i) => JSON.parse(i.output!));
    expect(outputs[0].code).toBe("CONFIRMATION_REQUIRED");
    expect(outputs[1].code).toBe("FORBIDDEN");
    expect(r.ui).not.toBeNull();
  });

  it("falls back to the fast model on provider errors for read-only turns and never retries writes", async () => {
    const client = fakeClient([{ fail: 503 }, { text: ui("fallback") }]);
    const r = await runAgentTurn({ ctx, client, models, registry: registry([]), toolNames: ["get_setup_state"], instructions: "x", contextBlock: "", history: [], userMessage: "status", emit: () => undefined, safetyIdentifier: "t", promptCacheKey: "k" });
    expect(r.model).toBe("gpt-5.6-luna");
    expect(r.ui?.message).toBe("fallback");

    const calls: string[] = [];
    const errors: AgentEvent[] = [];
    const client2 = fakeClient([{ calls: [{ name: "set_business_profile_draft", args: { business_type: "saas" } }] }, { fail: 503 }, { fail: 503 }]);
    const r2 = await runAgentTurn({ ctx, client: client2, models, registry: registry(calls), toolNames: ["set_business_profile_draft"], instructions: "x", contextBlock: "", history: [], userMessage: "set saas", emit: (e) => errors.push(e), safetyIdentifier: "t", promptCacheKey: "k" });
    expect(calls).toEqual(["draft:saas"]);
    expect(r2.error?.code).toBe("PROVIDER_UNAVAILABLE");
    expect(errors.at(-1)).toMatchObject({ type: "error", code: "PROVIDER_UNAVAILABLE" });
  });

  it("recovers once from incomplete or invalid structured output, then errors", async () => {
    const client = fakeClient([{ text: "{not json", status: "incomplete" }, { text: ui("recovered") }]);
    const r = await runAgentTurn({ ctx, client, models, registry: registry([]), toolNames: [], instructions: "x", contextBlock: "", history: [], userMessage: "hi", emit: () => undefined, safetyIdentifier: "t", promptCacheKey: "k" });
    expect(r.ui?.message).toBe("recovered");
    const bad = fakeClient([{ text: "{}" }, { text: "{}" }]);
    const r2 = await runAgentTurn({ ctx, client: bad, models, registry: registry([]), toolNames: [], instructions: "x", contextBlock: "", history: [], userMessage: "hi", emit: () => undefined, safetyIdentifier: "t", promptCacheKey: "k" });
    expect(r2.error?.code).toBe("PROVIDER_ERROR");
  });

  it("enforces the per-turn tool budget", async () => {
    const client = fakeClient([{ calls: Array.from({ length: 4 }, () => ({ name: "get_setup_state", args: {} })) }, { text: ui("ok") }]);
    const r = await runAgentTurn({ ctx, client, models, registry: registry([]), toolNames: ["get_setup_state"], instructions: "x", contextBlock: "", history: [], userMessage: "hi", emit: () => undefined, safetyIdentifier: "t", promptCacheKey: "k", maxToolCalls: 2 });
    expect(r.toolCalls).toBe(2);
    const second = client.seen[1] as { input: Array<{ type?: string; output?: string }> };
    const budgetHits = second.input.filter((i) => i.type === "function_call_output" && i.output!.includes("tool budget")).length;
    expect(budgetHits).toBe(2);
  });
});
