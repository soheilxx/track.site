import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AppError, silentLogger } from "@track-site/core";
import type OpenAI from "openai";
import { runAgentTurn, type AgentEvent } from "./agent.ts";
import { diffHashOf, issueApprovalToken, verifyApprovalToken } from "./approvals.ts";
import type { AgentContext } from "./context.ts";
import { APPROVAL_TOKEN_PLACEHOLDER } from "./dlp.ts";
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
          return { saved: true, token: "sk_live_51H8abcdefghijklmnop" };
        },
      }),
    )
    .register(defineTool({ name: "publish_config_version", description: "publish", kind: "confirm", permission: "config.publish", input: z.object({ draft_id: z.string(), approval_token: z.string() }), handler: async () => ({ published: true }) }))
    .register(
      defineTool({
        name: "prepare_publish",
        description: "prepare",
        kind: "draft",
        permission: "config.publish",
        input: z.object({}),
        handler: async () => ({ draft_id: DRAFT_ID, lint_ok: true, changes: [{ summary: "add pixel", op: "add" }], approval: { token: APPROVAL.token, expires_at: new Date(APPROVAL.claims.expiresAt).toISOString() } }),
      }),
    );
}

const DRAFT_ID = randomUUID();
const APPROVAL = issueApprovalToken("approval-secret", { action: "publish_config_version", targetType: "config_draft", targetId: DRAFT_ID, organizationId: "o1", userId: "u1", diffHash: diffHashOf({ draft: DRAFT_ID }) });

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

  it("hands the raw handler output to onToolRun but never the approval token to the model", async () => {
    const client = fakeClient([{ calls: [{ name: "prepare_publish", args: {} }, { name: "set_business_profile_draft", args: { business_type: "saas" } }] }, { text: ui("ready") }]);
    const runs: Array<{ name: string; result: { ok: boolean; code: string; data: unknown } }> = [];
    const events: AgentEvent[] = [];
    const r = await runAgentTurn({ ctx, client, models, registry: registry([]), toolNames: ["prepare_publish", "set_business_profile_draft"], instructions: "x", contextBlock: "", history: [], userMessage: "publish", emit: (e) => events.push(e), safetyIdentifier: "t", promptCacheKey: "k", onToolRun: async (run) => void runs.push({ name: run.name, result: run.result }) });
    expect(r.ui?.message).toBe("ready");
    expect(runs.map((x) => x.name)).toEqual(["prepare_publish", "set_business_profile_draft"]);
    // the app receives the unredacted output so it can store the token for the UI approval
    const prepared = runs[0]!.result.data as { draft_id: string; approval: { token: string; expires_at: string } };
    expect(prepared.draft_id).toBe(DRAFT_ID);
    expect(prepared.approval.token).toBe(APPROVAL.token);
    expect(verifyApprovalToken("approval-secret", prepared.approval.token, { action: "publish_config_version", targetType: "config_draft", targetId: DRAFT_ID, organizationId: "o1", userId: "u1", diffHash: diffHashOf({ draft: DRAFT_ID }) }, APPROVAL.claims.expiresAt - 1).ok).toBe(true);
    expect((runs[1]!.result.data as { token: string }).token).toBe("sk_live_51H8abcdefghijklmnop");
    // the model only sees the redacted copy: ids intact, token withheld
    const second = client.seen[1] as { input: Array<{ type?: string; output?: string }> };
    const outputs = second.input.filter((i) => i.type === "function_call_output").map((i) => JSON.parse(i.output!) as { data: Record<string, unknown> });
    const modelView = outputs[0]!.data as { draft_id: string; approval: { token: string; expires_at: string } };
    expect(modelView.draft_id).toBe(DRAFT_ID);
    expect(modelView.approval.token).toBe(APPROVAL_TOKEN_PLACEHOLDER);
    expect(modelView.approval.expires_at).toBe(new Date(APPROVAL.claims.expiresAt).toISOString());
    expect(JSON.stringify(second.input)).not.toContain(APPROVAL.token.slice(0, 20));
    expect(JSON.stringify(second.input)).not.toContain("sk_live");
    // events reach the client and must not carry the token either
    expect(JSON.stringify(events)).not.toContain(APPROVAL.token.slice(0, 20));
  });

  it("redacts result messages before they reach the model or the client", async () => {
    const reg = registry([]).register(
      defineTool({
        name: "validate_integration_credentials",
        description: "validate",
        kind: "draft",
        permission: "config.draft",
        input: z.object({}),
        handler: async () => {
          throw new AppError("PROVIDER_ERROR", `vendor rejected key sk_live_51H8abcdefghijklmnop for jane@example.com (approval ${APPROVAL.token})`);
        },
      }),
    );
    const client = fakeClient([{ calls: [{ name: "validate_integration_credentials", args: {} }] }, { text: ui("ok") }]);
    const events: AgentEvent[] = [];
    const r = await runAgentTurn({ ctx, client, models, registry: reg, toolNames: ["validate_integration_credentials"], instructions: "x", contextBlock: "", history: [], userMessage: "check", emit: (e) => events.push(e), safetyIdentifier: "t", promptCacheKey: "k" });
    expect(r.ui?.message).toBe("ok");
    const second = client.seen[1] as { input: Array<{ type?: string; output?: string }> };
    const out = JSON.parse(second.input.find((i) => i.type === "function_call_output")!.output!) as { code: string; message: string; data: unknown };
    expect(out.code).toBe("PROVIDER_ERROR");
    expect(out.data).toBeNull();
    expect(out.message.startsWith("vendor rejected key [redacted:secret] for [redacted:email] (approval [redacted:")).toBe(true);
    for (const text of [JSON.stringify(second.input), JSON.stringify(events)]) {
      expect(text).not.toContain("sk_live");
      expect(text).not.toContain("jane@example.com");
      expect(text).not.toContain(APPROVAL.token.slice(0, 20));
      expect(text).not.toContain(APPROVAL.token.split(".")[1]!.slice(0, 16));
    }
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
