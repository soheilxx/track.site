import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { buildToolRegistry, confirmActivityEvents, factsOf, redactToolOutput } from "@track-site/ai";
import { activeVersion, withTenant } from "@track-site/db";
import { db } from "@/server/db";
import { getOrgContext } from "@/server/session";
import { appendMessage, getOrCreateChatSession, recordToolRun, takePendingApproval } from "@/server/ai/chat-store";
import { buildAgentContext, siteBelongsToOrg } from "@/server/ai/context";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ siteId: z.string().uuid(), approvalId: z.string().min(3).max(120) });

/**
 * Executes a confirmation-gated action after the user clicked the approval card. The approval id
 * references the server-side, single-use, action-bound token; a chat "yes" never reaches this route.
 * After execution the backend state is verified (a publish must be the active version) and the
 * verified outcome is returned as contract events, so the UI never shows a success the server did
 * not confirm and can offer rollback / the next step.
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
  const runId = `confirm_${parsed.data.approvalId}`;
  const result = await tool.run(args, agentCtx);
  const data = result.ok ? redactToolOutput(result.data) : null;
  await recordToolRun(ctx.organization.id, session.id, { callId: runId, name: pending.action, args: { ...args, approval_token: "[approval]" }, result: { ok: result.ok, code: result.code, data }, durationMs: Date.now() - started });

  // verify the backend state instead of trusting the handler's return value
  let verified: boolean | null = null;
  if (result.ok && pending.action === "publish_config_version") {
    const published = (data as { version?: unknown } | null)?.version;
    const active = await withTenant(db(), ctx.organization.id, (tx) => activeVersion(tx, agentCtx.environmentId)).catch(() => null);
    verified = typeof published === "number" && active !== null && active.version === published;
  }
  await appendMessage(ctx.organization.id, session.id, { role: "system", content: result.ok ? `${pending.action} confirmed and executed${verified === null ? "" : verified ? "; backend state verified" : "; backend state NOT verified"}` : `${pending.action} failed: ${result.code}` });
  const events = confirmActivityEvents({ turnId: `confirm:${parsed.data.approvalId}`, runId, action: pending.action, ok: result.ok, code: result.code, verified, missing: result.ok ? [] : factsOf(result.data).missing });
  const next = pending.action === "publish_config_version" ? { rollback: "/app/releases", diagnostics: "/app/events" } : { releases: "/app/releases" };
  return NextResponse.json({ ...result, data, verified, events, next }, { status: result.ok ? 200 : 409 });
}
