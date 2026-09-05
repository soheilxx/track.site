import type OpenAI from "openai";
import type { AssistantUiResponse } from "../ui-schema.ts";

/**
 * Deterministic stand-in for the OpenAI Responses API used by the agent tests and evals: a script
 * of steps, each yielding function calls and/or a final text, streamed as events like the real SDK.
 * `seen` records every request so tests can assert what the model was shown (and that nothing was
 * shown at all when the gate refused the turn).
 */
export interface ScriptStep {
  calls?: Array<{ name: string; args: Record<string, unknown> }>;
  text?: string;
  status?: "completed" | "incomplete";
  fail?: number;
}

export type FakeClient = OpenAI & { seen: Array<Record<string, unknown>> };

export function fakeClient(script: ScriptStep[], seen: Array<Record<string, unknown>> = []): FakeClient {
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
  } as unknown as FakeClient;
}

/** A minimal valid structured answer. */
export function uiAnswer(message: string, overrides: Partial<AssistantUiResponse> = {}): string {
  const ui: AssistantUiResponse = {
    message,
    intent: "configuration",
    stage: "destinations",
    current_step: "destinations",
    progress_percent: 40,
    status: "ok",
    cards: [],
    input_component: { type: "none" },
    quick_actions: [],
    completed_steps: ["site", "business_type", "platform", "installation"],
    missing_fields: [],
    warnings: [],
    requires_confirmation: false,
    confirmation_summary: null,
    tool_result_summary: null,
    next_best_action: null,
    ...overrides,
  };
  return JSON.stringify(ui);
}

/** Function-call outputs the fake model was shown in a given request, parsed. */
export function toolOutputsShown(request: Record<string, unknown>): Array<{ raw: string; parsed: Record<string, unknown> | null }> {
  const input = (request.input as Array<{ type?: string; output?: string }>) ?? [];
  return input
    .filter((i) => i.type === "function_call_output")
    .map((i) => {
      const raw = i.output ?? "";
      const json = raw.replace(/^<untrusted[^>]*>\n?/, "").replace(/\n?<\/untrusted>$/, "").replace(/\n\[truncated\]$/, "");
      try {
        return { raw, parsed: JSON.parse(json) as Record<string, unknown> };
      } catch {
        return { raw, parsed: null };
      }
    });
}
