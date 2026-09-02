import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { CONFIRM_TOOLS, buildToolRegistry } from "@track-site/ai";
import { getOrgContext } from "@/server/session";
import { getOrCreateChatSession, recordToolRun, storePendingApproval } from "@/server/ai/chat-store";
import { buildAgentContext, siteBelongsToOrg } from "@/server/ai/context";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ siteId: z.string().uuid(), tool: z.string().regex(/^[a-z_]{3,64}$/), args: z.record(z.string(), z.unknown()).default({}) });

/**
 * Rule-based wizard / expert fallback: runs the same typed tools directly (no model involved).
 * Confirmation-gated tools are never callable here; they go through /api/ai/confirm.
 */
export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, code: "VALIDATION_ERROR" }, { status: 400 });
  if (CONFIRM_TOOLS.includes(parsed.data.tool)) return NextResponse.json({ ok: false, code: "CONFIRMATION_REQUIRED" }, { status: 428 });
  if (!(await siteBelongsToOrg(ctx.organization.id, parsed.data.siteId))) return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
  const tool = buildToolRegistry().get(parsed.data.tool);
  if (!tool) return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
  const session = await getOrCreateChatSession(ctx.organization.id, parsed.data.siteId, ctx.user.id, ctx.user.locale);
  const agentCtx = await buildAgentContext(ctx, parsed.data.siteId, session.id);
  if (!agentCtx) return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
  const started = Date.now();
  const result = await tool.run(parsed.data.args, agentCtx);
  await recordToolRun(ctx.organization.id, session.id, { callId: `wizard_${started}`, name: tool.name, args: parsed.data.args, result: { ok: result.ok, code: result.code, data: result.ok ? result.data : null }, durationMs: Date.now() - started });
  // prepare_publish: keep the approval token server-side and hand the client an opaque approval id
  if (result.ok && tool.name === "prepare_publish") {
    const data = result.data as { approval?: { token: string; expires_at: string } | null; draft_id: string; changes?: unknown; recipients?: unknown };
    if (data.approval) {
      const approvalId = `wizard_${started}`;
      await storePendingApproval(ctx.organization.id, session.id, { id: approvalId, action: "publish_config_version", targetType: "config_draft", targetId: data.draft_id, summary: { changes: data.changes, recipients: data.recipients }, expiresAt: data.approval.expires_at, token: data.approval.token });
      return NextResponse.json({ ...result, data: { ...data, approval: { id: approvalId, expires_at: data.approval.expires_at } } });
    }
  }
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
