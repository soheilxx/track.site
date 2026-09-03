import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as Ai from "@track-site/ai";

/**
 * The wizard route runs typed tools without the model. Its audit row goes through the same
 * redaction as the chat turn, while the pending approval keeps the real token server-side and
 * the client only ever receives an opaque approval id. Session, context and store are mocked.
 */
const dlp = await vi.importActual<Pick<typeof Ai, "APPROVAL_TOKEN_PLACEHOLDER" | "redactToolOutput">>("../../../../../../../packages/ai/src/dlp.ts");
const approvals = await vi.importActual<Pick<typeof Ai, "diffHashOf" | "issueApprovalToken">>("../../../../../../../packages/ai/src/approvals.ts");

const SITE_ID = randomUUID();
const DRAFT_ID = randomUUID();
const APPROVAL = approvals.issueApprovalToken("approval-secret", { action: "publish_config_version", targetType: "config_draft", targetId: DRAFT_ID, organizationId: "org1", userId: "user1", diffHash: approvals.diffHashOf({ draft: DRAFT_ID }) });
const EXPIRES_AT = new Date(APPROVAL.claims.expiresAt).toISOString();

const recordToolRun = vi.fn(async () => undefined);
const storePendingApproval = vi.fn(async () => undefined);
const runTool = vi.fn(async (_args: Record<string, unknown>, _ctx: unknown): Promise<{ ok: boolean; code: string; data: unknown }> => ({ ok: true, code: "OK", data: null }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/session", () => ({ getOrgContext: async () => ({ organization: { id: "org1" }, user: { id: "user1", locale: "de" }, role: "OWNER" }) }));
vi.mock("@/server/ai/context", () => ({ buildAgentContext: async () => ({ environmentId: "env1" }), siteBelongsToOrg: async () => true }));
vi.mock("@/server/ai/chat-store", () => ({
  getOrCreateChatSession: async () => ({ id: "sess1", summary: {} }),
  recordToolRun: (...args: unknown[]) => recordToolRun(...(args as [])),
  storePendingApproval: (...args: unknown[]) => storePendingApproval(...(args as [])),
}));
vi.mock("@track-site/ai", () => ({
  CONFIRM_TOOLS: ["publish_config_version"],
  redactToolOutput: dlp.redactToolOutput,
  buildToolRegistry: () => ({ get: (name: string) => (name === "prepare_publish" || name === "set_business_profile_draft" ? { name, run: runTool } : undefined) }),
}));

const { POST } = await import("./route");

function request(body: unknown) {
  return new Request("http://localhost/api/ai/wizard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) as unknown as Parameters<typeof POST>[0];
}

describe("wizard route tool run persistence", () => {
  beforeEach(() => {
    recordToolRun.mockClear();
    storePendingApproval.mockClear();
    runTool.mockClear();
  });

  it("keeps the approval token out of the audit row and the response, but hands it to the pending approval", async () => {
    runTool.mockResolvedValueOnce({ ok: true, code: "OK", data: { draft_id: DRAFT_ID, changes: [{ summary: "add pixel", op: "add" }], recipients: ["meta"], approval: { token: APPROVAL.token, expires_at: EXPIRES_AT } } });
    const res = await POST(request({ siteId: SITE_ID, tool: "prepare_publish", args: {} }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; data: { draft_id: string; approval: { id: string; expires_at: string; token?: string } } };
    expect(body.ok).toBe(true);
    expect(body.data.draft_id).toBe(DRAFT_ID);
    expect(body.data.approval.expires_at).toBe(EXPIRES_AT);
    expect(body.data.approval.token).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain(APPROVAL.token.slice(0, 20));

    expect(storePendingApproval).toHaveBeenCalledTimes(1);
    const pending = storePendingApproval.mock.calls[0] as unknown as [string, string, { id: string; action: string; targetId: string; token: string; expiresAt: string }];
    expect(pending[0]).toBe("org1");
    expect(pending[1]).toBe("sess1");
    expect(pending[2]).toMatchObject({ id: body.data.approval.id, action: "publish_config_version", targetType: "config_draft", targetId: DRAFT_ID, token: APPROVAL.token, expiresAt: EXPIRES_AT });

    expect(recordToolRun).toHaveBeenCalledTimes(1);
    const audited = (recordToolRun.mock.calls[0] as unknown as [string, string, { name: string; result: { data: { draft_id: string; approval: { token: string; expires_at: string } } } }])[2];
    expect(audited.name).toBe("prepare_publish");
    expect(audited.result.data.draft_id).toBe(DRAFT_ID);
    expect(audited.result.data.approval).toEqual({ token: dlp.APPROVAL_TOKEN_PLACEHOLDER, expires_at: EXPIRES_AT });
    expect(JSON.stringify(audited)).not.toContain(APPROVAL.token.slice(0, 20));
  });

  it("redacts secrets in the audit row while identifiers stay intact", async () => {
    runTool.mockResolvedValueOnce({ ok: true, code: "OK", data: { saved: true, token: "sk_live_51H8abcdefghijklmnop", integration_id: DRAFT_ID } });
    const res = await POST(request({ siteId: SITE_ID, tool: "set_business_profile_draft", args: { business_type: "saas" } }));
    expect(res.status).toBe(200);
    expect(storePendingApproval).not.toHaveBeenCalled();
    expect(recordToolRun).toHaveBeenCalledTimes(1);
    const audited = (recordToolRun.mock.calls[0] as unknown as [string, string, { result: { data: unknown } }])[2];
    expect(audited.result.data).toEqual({ saved: true, token: "[redacted:secret]", integration_id: DRAFT_ID });
  });

  it("refuses confirmation-gated tools and records nothing", async () => {
    const res = await POST(request({ siteId: SITE_ID, tool: "publish_config_version", args: { draft_id: DRAFT_ID } }));
    expect(res.status).toBe(428);
    expect((await res.json()).code).toBe("CONFIRMATION_REQUIRED");
    expect(runTool).not.toHaveBeenCalled();
    expect(recordToolRun).not.toHaveBeenCalled();
  });
});
