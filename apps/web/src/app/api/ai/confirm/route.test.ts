import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as Ai from "@track-site/ai";

/**
 * The approval route executes a confirmation-gated action with the server-side token, verifies the
 * backend state afterwards (a publish must be the active version) and reports the verified outcome
 * as contract events. Session, context, store, registry and database are mocked.
 */
const dlp = await vi.importActual<Pick<typeof Ai, "redactToolOutput">>("../../../../../../../packages/ai/src/dlp.ts");
const uiEvents = await vi.importActual<Pick<typeof Ai, "confirmActivityEvents" | "factsOf">>("../../../../../../../packages/ai/src/ui-events.ts");

const SITE_ID = randomUUID();
const DRAFT_ID = randomUUID();
const TOKEN = "eyJhY3Rpb24iOiJwdWJsaXNoX2NvbmZpZ192ZXJzaW9uIiwidGFyZ2V0VHlwZSI6ImNvbmZpZ19kcmFmdCJ9.QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo";

const runTool = vi.fn(async (_args: Record<string, unknown>, _ctx: unknown): Promise<{ ok: boolean; code: string; message: string; data: unknown }> => ({ ok: true, code: "OK", message: "", data: { version: 7, published_at: "2026-09-04T10:00:00.000Z", summary: { note: `token ${TOKEN}` } } }));
const activeVersion = vi.fn(async () => ({ version: 7 }));
const takePendingApproval = vi.fn(async () => ({ id: "call_2", action: "publish_config_version", targetType: "config_draft", targetId: DRAFT_ID, summary: {}, expiresAt: "2026-09-04T10:10:00.000Z", token: TOKEN }));
const recordToolRun = vi.fn(async () => undefined);
const appendMessage = vi.fn(async () => "m1");

vi.mock("server-only", () => ({}));
vi.mock("@/server/session", () => ({ getOrgContext: async () => ({ organization: { id: "org1" }, user: { id: "user1", locale: "de" }, role: "OWNER" }) }));
vi.mock("@/server/ai/context", () => ({ buildAgentContext: async () => ({ environmentId: "env1" }), siteBelongsToOrg: async () => true }));
vi.mock("@/server/db", () => ({ db: () => ({}) }));
vi.mock("@track-site/db", () => ({ withTenant: async (_db: unknown, _org: string, fn: (tx: unknown) => Promise<unknown>) => fn({}), activeVersion: () => activeVersion() }));
vi.mock("@/server/ai/chat-store", () => ({
  getOrCreateChatSession: async () => ({ id: "sess1", summary: {} }),
  takePendingApproval: () => takePendingApproval(),
  recordToolRun: (...args: unknown[]) => recordToolRun(...(args as [])),
  appendMessage: (...args: unknown[]) => appendMessage(...(args as [])),
}));
vi.mock("@track-site/ai", () => ({
  buildToolRegistry: () => ({ get: (name: string) => (name === "publish_config_version" ? { name, run: runTool } : undefined) }),
  redactToolOutput: dlp.redactToolOutput,
  confirmActivityEvents: uiEvents.confirmActivityEvents,
  factsOf: uiEvents.factsOf,
}));

const { POST } = await import("./route");

function request(body: unknown) {
  return new Request("http://localhost/api/ai/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) as unknown as Parameters<typeof POST>[0];
}

interface Body {
  ok: boolean;
  code: string;
  data: Record<string, unknown> | null;
  verified: boolean | null;
  events: Array<{ type: string; runId?: string; sentence?: string; params?: Record<string, unknown> }>;
  next: Record<string, string>;
}

describe("confirm route: execution, backend verification and contract events", () => {
  beforeEach(() => {
    runTool.mockClear();
    activeVersion.mockClear();
    recordToolRun.mockClear();
    appendMessage.mockClear();
    takePendingApproval.mockClear();
  });

  it("executes with the server-side token, verifies the active version and returns verified activity events", async () => {
    const res = await POST(request({ siteId: SITE_ID, approvalId: "call_2" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Body;
    expect(body.ok).toBe(true);
    expect(body.verified).toBe(true);
    expect(body.next).toEqual({ rollback: "/app/releases", diagnostics: "/app/events" });
    expect(body.events.map((e) => [e.type, e.sentence])).toEqual([
      ["activity.started", "publish.started"],
      ["activity.completed", "publish.completed"],
    ]);
    expect(body.events[0]!.runId).toBe("confirm_call_2");
    // the token was injected server-side and never appears in the response or the audit row
    expect(runTool).toHaveBeenCalledWith({ draft_id: DRAFT_ID, approval_token: TOKEN }, { environmentId: "env1" });
    expect(JSON.stringify(body)).not.toContain(TOKEN.slice(0, 20));
    expect(body.data).toMatchObject({ version: 7 });
    const audited = (recordToolRun.mock.calls[0] as unknown as [string, string, { args: Record<string, unknown>; result: { data: unknown } }])[2];
    expect(audited.args.approval_token).toBe("[approval]");
    expect(JSON.stringify(audited)).not.toContain(TOKEN.slice(0, 20));
    expect((appendMessage.mock.calls[0] as unknown as [string, string, { role: string; content: string }])[2]).toMatchObject({ role: "system", content: "publish_config_version confirmed and executed; backend state verified" });
  });

  it("reports a publish the backend does not show as active yet as blocked, not as success", async () => {
    activeVersion.mockResolvedValueOnce({ version: 6 });
    const body = (await (await POST(request({ siteId: SITE_ID, approvalId: "call_2" }))).json()) as Body;
    expect(body.ok).toBe(true);
    expect(body.verified).toBe(false);
    expect(body.events[1]).toMatchObject({ type: "activity.blocked", sentence: "generic.blocked", params: { reason: "VERIFICATION_FAILED" } });
    expect((appendMessage.mock.calls[0] as unknown as [string, string, { role: string; content: string }])[2]).toMatchObject({ content: "publish_config_version confirmed and executed; backend state NOT verified" });
  });

  it("returns 409 with a blocked activity when the token was already used", async () => {
    runTool.mockResolvedValueOnce({ ok: false, code: "APPROVAL_INVALID", message: "approval already used or unknown", data: null });
    const res = await POST(request({ siteId: SITE_ID, approvalId: "call_2" }));
    expect(res.status).toBe(409);
    const body = (await res.json()) as Body;
    expect(body.ok).toBe(false);
    expect(body.verified).toBeNull();
    expect(activeVersion).not.toHaveBeenCalled();
    expect(body.events[1]).toMatchObject({ type: "activity.blocked", params: { reason: "APPROVAL_INVALID" } });
  });

  it("rejects an unknown or consumed approval id without running anything", async () => {
    takePendingApproval.mockResolvedValueOnce(null as never);
    const res = await POST(request({ siteId: SITE_ID, approvalId: "nope" }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("APPROVAL_INVALID");
    expect(runTool).not.toHaveBeenCalled();
  });

  it("refuses cross-origin requests before touching the approval", async () => {
    const req = new Request("http://localhost/api/ai/confirm", { method: "POST", headers: { "content-type": "application/json", "sec-fetch-site": "cross-site" }, body: JSON.stringify({ siteId: SITE_ID, approvalId: "call_2" }) }) as unknown as Parameters<typeof POST>[0];
    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(takePendingApproval).not.toHaveBeenCalled();
    expect(runTool).not.toHaveBeenCalled();
  });

  it("redacts the handler's failure message before it leaves the server", async () => {
    runTool.mockResolvedValueOnce({ ok: false, code: "PROVIDER_ERROR", message: `vendor said: invalid token ${TOKEN}`, data: null });
    const res = await POST(request({ siteId: SITE_ID, approvalId: "call_2" }));
    expect(res.status).toBe(409);
    const body = (await res.json()) as Body & { message: string };
    expect(body.message).toContain("vendor said");
    expect(JSON.stringify(body)).not.toContain(TOKEN.slice(0, 20));
  });
});
