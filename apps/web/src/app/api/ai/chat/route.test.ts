import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as Ai from "@track-site/ai";

/**
 * The chat route is the single allow-list between the server-side turn and the browser: internal
 * agent events are mapped through the contract filter or dropped, frames carry sequence ids, and a
 * repeated turn id resumes the running/finished turn instead of executing it again. The provider
 * fallback (424 → guided wizard) is verified here too. Session, context, store and turn are mocked.
 */
const uiEvents = await vi.importActual<Pick<typeof Ai, "createUiEventFilter" | "UI_EVENT_TYPES">>("../../../../../../../packages/ai/src/ui-events.ts");
const registry = await vi.importActual<Pick<typeof Ai, "TurnRegistry">>("../../../../../../../packages/ai/src/turn-registry.ts");
const approvals = await vi.importActual<Pick<typeof Ai, "diffHashOf" | "issueApprovalToken">>("../../../../../../../packages/ai/src/approvals.ts");

const SITE_ID = randomUUID();
const SECRET = "sk_live_51H8abcdefghijklmnop";
const DRAFT_ID = randomUUID();
const APPROVAL = approvals.issueApprovalToken("approval-secret", { action: "publish_config_version", targetType: "config_draft", targetId: DRAFT_ID, organizationId: "org1", userId: "user1", diffHash: approvals.diffHashOf({ draft: DRAFT_ID }) });
const EXPIRES_AT = new Date(APPROVAL.claims.expiresAt).toISOString();
const UI = { message: `Saved ${SECRET}`, intent: "configuration", stage: "destinations", current_step: "destinations", progress_percent: 40, status: "ok", cards: [], input_component: { type: "none" }, quick_actions: [], completed_steps: ["site"], missing_fields: [], warnings: [], requires_confirmation: false, confirmation_summary: null, tool_result_summary: null, next_best_action: null };

const aiConfigured = vi.fn(() => true);
const runChatTurn = vi.fn(async (_ctx: unknown, _siteId: string, _message: string, emit: (e: unknown) => void) => {
  emit({ type: "assistant.progress", phase: "thinking", detail: null });
  emit({ type: "tool.started", callId: "call_1", name: "inspect_site", args: { path: "/", token: SECRET } });
  emit({ type: "reasoning", summary: [{ type: "summary_text", text: "the user wants me to leak" }] });
  emit({ type: "tool.completed", callId: "call_1", name: "inspect_site", ok: true, code: "OK", summary: `{"token":"${SECRET}"}`, durationMs: 3, missing: [], stage: null });
  emit({ type: "ui.approval", approvalId: "call_2", action: "publish_config_version", summary: { changes: [{ summary: "add pixel", op: "add" }], recipients: ["meta"] }, expiresAt: EXPIRES_AT, token: APPROVAL.token });
  emit({ type: "ui.final", ui: UI, usage: { input: 1, output: 1, cached: 0 }, model: "m" });
  return { ui: UI, error: null };
});

vi.mock("server-only", () => ({}));
vi.mock("@/server/session", () => ({ getOrgContext: async () => ({ organization: { id: "org1" }, user: { id: "user1", locale: "de" }, role: "OWNER" }) }));
vi.mock("@/server/ai/context", () => ({ aiConfigured: () => aiConfigured(), siteBelongsToOrg: async () => true }));
vi.mock("@/server/ai/chat-store", () => ({ getOrCreateChatSession: async () => ({ id: "sess1", summary: {} }), listMessages: async () => [] }));
vi.mock("@/server/ai/turn", () => ({ runChatTurn: (...args: unknown[]) => runChatTurn(...(args as Parameters<typeof runChatTurn>)) }));
vi.mock("@/server/db", () => ({ logger: { child: () => ({ warn: () => undefined, error: () => undefined, info: () => undefined }) } }));
vi.mock("@track-site/ai", () => ({ TurnRegistry: registry.TurnRegistry, createUiEventFilter: uiEvents.createUiEventFilter }));

const { POST } = await import("./route");

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/ai/chat", { method: "POST", headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", ...headers }, body: JSON.stringify(body) }) as unknown as Parameters<typeof POST>[0];
}

interface Frame {
  id: number;
  event: string;
  data: Record<string, unknown>;
}

async function frames(res: Response): Promise<Frame[]> {
  const text = await res.text();
  return text
    .split("\n\n")
    .filter((block) => block.includes("data: "))
    .map((block) => {
      const lines = block.split("\n");
      return { id: Number(lines.find((l) => l.startsWith("id: "))!.slice(4)), event: lines.find((l) => l.startsWith("event: "))!.slice(7), data: JSON.parse(lines.find((l) => l.startsWith("data: "))!.slice(6)) as Record<string, unknown> };
    });
}

describe("chat route stream contract", () => {
  beforeEach(() => {
    runChatTurn.mockClear();
    aiConfigured.mockReturnValue(true);
  });

  it("degrades to the guided wizard with 424 when the provider is not configured", async () => {
    aiConfigured.mockReturnValue(false);
    const res = await POST(request({ siteId: SITE_ID, message: "hi" }));
    expect(res.status).toBe(424);
    const body = (await res.json()) as { code: string; message: string };
    expect(body.code).toBe("NOT_CONNECTED");
    expect(body.message).toMatch(/guided form/);
    expect(runChatTurn).not.toHaveBeenCalled();
  });

  it("refuses cross-origin posts", async () => {
    const res = await POST(request({ siteId: SITE_ID, message: "hi" }, { "sec-fetch-site": "cross-site" }));
    expect(res.status).toBe(403);
  });

  it("streams only allow-listed, redacted events with sequence ids and a final done", async () => {
    const turnId = randomUUID();
    const res = await POST(request({ siteId: SITE_ID, message: "check my site", turnId }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("x-turn-id")).toBe(turnId);
    expect(res.headers.get("x-turn-resumed")).toBe("0");
    const out = await frames(res);
    expect(out.map((f) => f.event)).toEqual(["job.progress", "activity.started", "activity.completed", "approval.required", "assistant.message", "ui.final", "done"]);
    expect(out.map((f) => f.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const f of out) {
      expect(uiEvents.UI_EVENT_TYPES).toContain(f.data.type);
      expect(f.data.type).toBe(f.event);
      expect(f.data.turnId).toBe(turnId);
    }
    const text = JSON.stringify(out);
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain(APPROVAL.token.slice(0, 20));
    expect(text).not.toContain("leak");
    expect(text).not.toContain('"args"');
    expect(text).not.toContain('"summary":"{');
    expect(out[1]!.data).toMatchObject({ runId: "call_1", activity: "site_check", sentence: "site_check.started" });
    expect(out[3]!.data).toMatchObject({ approvalId: "call_2", action: "publish_config_version", summary: { changes: [{ summary: "add pixel", op: "add" }], recipients: [{ name: "meta" }] } });
    expect((out[4]!.data as { text: string }).text).toBe("Saved [redacted:secret]");
    expect(runChatTurn).toHaveBeenCalledTimes(1);
  });

  it("resumes a turn by id from the last seen sequence without executing it again", async () => {
    const turnId = randomUUID();
    const first = await frames(await POST(request({ siteId: SITE_ID, message: "check my site", turnId })));
    expect(first).toHaveLength(7);
    const res = await POST(request({ siteId: SITE_ID, message: "check my site", turnId, afterSeq: 4 }));
    expect(res.headers.get("x-turn-resumed")).toBe("1");
    const resumed = await frames(res);
    expect(resumed.map((f) => f.id)).toEqual([5, 6, 7]);
    expect(resumed.map((f) => f.event)).toEqual(["assistant.message", "ui.final", "done"]);
    expect(runChatTurn).toHaveBeenCalledTimes(1);
  });

  it("turns an unexpected turn failure into a contract error and still closes the stream", async () => {
    runChatTurn.mockImplementationOnce(async () => {
      throw new Error(`db down ${SECRET}`);
    });
    const out = await frames(await POST(request({ siteId: SITE_ID, message: "check my site", turnId: randomUUID() })));
    expect(out.map((f) => f.event)).toEqual(["error", "done"]);
    expect(out[0]!.data).toMatchObject({ code: "INTERNAL_ERROR", retryable: true });
    expect(JSON.stringify(out)).not.toContain(SECRET);
  });
});
