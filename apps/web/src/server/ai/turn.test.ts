import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as Ai from "@track-site/ai";
import type * as Db from "@track-site/db";
import type { TurnInput } from "@track-site/ai";

/**
 * The chat turn wires the agent's raw tool output into two consumers with different needs: the audit
 * row (redacted) and the pending approval for the UI (real token). Everything around it is mocked.
 * The `@track-site/ai` barrel pulls in the whole tool registry, DB and OpenAI clients, so the real
 * redaction and approval helpers are loaded from their modules directly.
 */
const dlp = await vi.importActual<Pick<typeof Ai, "APPROVAL_TOKEN_PLACEHOLDER" | "interceptUserMessage" | "redactToolOutput">>("../../../../../packages/ai/src/dlp.ts");
const approvals = await vi.importActual<Pick<typeof Ai, "diffHashOf" | "issueApprovalToken">>("../../../../../packages/ai/src/approvals.ts");

const DRAFT_ID = randomUUID();
const APPROVAL = approvals.issueApprovalToken("approval-secret", { action: "publish_config_version", targetType: "config_draft", targetId: DRAFT_ID, organizationId: "org1", userId: "user1", diffHash: approvals.diffHashOf({ draft: DRAFT_ID }) });
const EXPIRES_AT = new Date(APPROVAL.claims.expiresAt).toISOString();

const recordToolRun = vi.fn(async () => undefined);
const storePendingApproval = vi.fn(async () => undefined);
const appendMessage = vi.fn(async () => "msg1");

vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({ env: () => ({ AI_MAX_TOOL_CALLS_PER_TURN: 8, AI_TURN_TIMEOUT_MS: 10_000 }) }));
vi.mock("@/server/db", () => ({ db: () => ({}), pool: () => ({}), vault: () => null }));
vi.mock("@track-site/analytics", () => ({ PgEventStore: class { async lastEventAt() { return null; } } }));
vi.mock("./context", () => ({ buildAgentContext: async () => ({ environmentId: "env1" }), modelRouting: () => ({ primary: "p", fast: "f", complex: "c" }), openai: () => ({}), safetyIdentifier: () => "sid" }));
vi.mock("./chat-store", () => ({
  getOrCreateChatSession: async () => ({ id: "sess1", summary: {} }),
  listMessages: async () => [],
  appendMessage: (...args: unknown[]) => appendMessage(...(args as [])),
  recordToolRun: (...args: unknown[]) => recordToolRun(...(args as [])),
  storePendingApproval: (...args: unknown[]) => storePendingApproval(...(args as [])),
}));
vi.mock("@track-site/db", async (importOriginal) => {
  const actual = await importOriginal<typeof Db>();
  const chain = { from: () => chain, where: () => chain, limit: () => chain, then: (resolve: (rows: unknown[]) => void) => resolve([]) };
  return { ...actual, withTenant: async (_db: unknown, _org: string, fn: (tx: unknown) => Promise<unknown>) => fn({ select: () => chain }), getSite: async () => ({ name: "Shop", trackingId: "A7K2Q9", primaryDomain: "shop.test" }), activeVersion: async () => null };
});
vi.mock("@track-site/ai", () => ({
  DEVELOPER_INSTRUCTIONS: "instructions",
  TOOL_SET_VERSION: "test",
  interceptUserMessage: dlp.interceptUserMessage,
  redactToolOutput: dlp.redactToolOutput,
  loadSetupState: async () => ({}),
  contextBlock: () => "<context/>",
  buildToolRegistry: () => ({}),
  allowedToolNames: () => ["prepare_publish"],
  runAgentTurn: async (input: TurnInput) => {
    await input.onToolRun?.({ callId: "call_1", name: "prepare_publish", args: {}, result: { ok: true, code: "OK", data: { draft_id: DRAFT_ID, changes: [{ summary: "add pixel", op: "add" }], recipients: ["meta"], approval: { token: APPROVAL.token, expires_at: EXPIRES_AT } } }, durationMs: 3 });
    await input.onToolRun?.({ callId: "call_2", name: "set_business_profile_draft", args: { business_type: "saas" }, result: { ok: true, code: "OK", data: { saved: true, token: "sk_live_51H8abcdefghijklmnop", integration_id: DRAFT_ID } }, durationMs: 2 });
    return { ui: null, usage: { input: 1, output: 1, cached: 0 }, model: "p", toolCalls: 2, error: { code: "PROVIDER_ERROR", message: "scripted" } };
  },
}));

const { runChatTurn } = await import("./turn");

const ctx = { organization: { id: "org1" }, user: { id: "user1", locale: "de" }, role: "OWNER" } as unknown as Parameters<typeof runChatTurn>[0];

describe("runChatTurn tool run persistence", () => {
  beforeEach(() => {
    recordToolRun.mockClear();
    storePendingApproval.mockClear();
    appendMessage.mockClear();
  });

  it("stores the real approval token for the UI but only a redacted copy in the audit row", async () => {
    const events: Array<{ type: string }> = [];
    const r = await runChatTurn(ctx, "site1", "publish it", (e) => events.push(e));
    expect(r.error).toBe("scripted");

    expect(storePendingApproval).toHaveBeenCalledTimes(1);
    const pending = storePendingApproval.mock.calls[0] as unknown as [string, string, { id: string; targetId: string; token: string; expiresAt: string; summary: Record<string, unknown> }];
    expect(pending[0]).toBe("org1");
    expect(pending[1]).toBe("sess1");
    expect(pending[2]).toMatchObject({ id: "call_1", action: "publish_config_version", targetType: "config_draft", targetId: DRAFT_ID, token: APPROVAL.token, expiresAt: EXPIRES_AT, summary: { recipients: ["meta"] } });

    expect(recordToolRun).toHaveBeenCalledTimes(2);
    const audited = recordToolRun.mock.calls.map((c) => (c as unknown as [string, string, { name: string; result: { data: unknown } }])[2]);
    const prepared = audited[0]!.result.data as { draft_id: string; approval: { token: string; expires_at: string } };
    expect(audited[0]!.name).toBe("prepare_publish");
    expect(prepared.draft_id).toBe(DRAFT_ID);
    expect(prepared.approval).toEqual({ token: dlp.APPROVAL_TOKEN_PLACEHOLDER, expires_at: EXPIRES_AT });
    expect(audited[1]!.result.data).toEqual({ saved: true, token: "[redacted:secret]", integration_id: DRAFT_ID });
    expect(JSON.stringify(audited)).not.toContain(APPROVAL.token.slice(0, 20));

    const approvalEvent = events.find((e) => e.type === "ui.approval") as { approvalId: string; expiresAt: string } | undefined;
    expect(approvalEvent).toMatchObject({ approvalId: "call_1", action: "publish_config_version", expiresAt: EXPIRES_AT });
    expect(JSON.stringify(events)).not.toContain(APPROVAL.token.slice(0, 20));
  });
});
