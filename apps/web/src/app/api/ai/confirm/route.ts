import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { buildToolRegistry, redactToolOutput } from "@track-site/ai";
import { getOrgContext } from "@/server/session";
import { appendMessage, getOrCreateChatSession, recordToolRun, takePendingApproval } from "@/server/ai/chat-store";
import { buildAgentContext, siteBelongsToOrg } from "@/server/ai/context";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ siteId: z.string().uuid(), approvalId: z.string().min(3).max(120) });

/**
 * Executes a confirmation-gated action after the user clicked the approval component.
 * The approval token never leaves the server; the model is not involved.
 */
export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, code: "VALIDATION_ERROR" }, { status: 400 });
  if (!(await siteBelongsToOrg(ctx.organization.id, parsed.data.siteId))) return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
  const session = await getOrCreateChatSession(ctx.organization.id, parsed.data.siteId, ctx.user.id, ctx.user.locale);
  const pending = await takePendingApproval(ctx.organization.id, session.id, parsed.data.approvalId);
  if (!pending) return NextResponse.json({ ok: false, code: "APPROVAL_INVALID", message: "This confirmation is no longer valid. Ask the assistant to prepare the change again." }, { status: 409 });
  const agentCtx = await buildAgentContext(ctx, parsed.data.siteId, session.id);
  if (!agentCtx) return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
  const tool = buildToolRegistry().get(pending.action);
  if (!tool) return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
  const args = pending.action === "publish_config_version" ? { draft_id: pending.targetId, approval_token: pending.token } : { approval_token: pending.token, ...(pending.summary.args as Record<string, unknown> | undefined) };
  const started = Date.now();
  const result = await tool.run(args, agentCtx);
  await recordToolRun(ctx.organization.id, session.id, { callId: `confirm_${parsed.data.approvalId}`, name: pending.action, args: { ...args, approval_token: "[approval]" }, result: { ok: result.ok, code: result.code, data: result.ok ? redactToolOutput(result.data) : null }, durationMs: Date.now() - started });
  await appendMessage(ctx.organization.id, session.id, { role: "system", content: result.ok ? `${pending.action} confirmed and executed` : `${pending.action} failed: ${result.code}` });
  return NextResponse.json(result, { status: result.ok ? 200 : 409 });
}
