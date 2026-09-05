import "server-only";
import { eq, and } from "drizzle-orm";
import { PgEventStore } from "@track-site/analytics";
import { DEVELOPER_INSTRUCTIONS, TOOL_SET_VERSION, allowedToolNames, buildToolRegistry, contextBlock, interceptUserMessage, loadSetupState, redactToolOutput, runAgentTurn, type AgentEvent, type AssistantUiResponse } from "@track-site/ai";
import { activeVersion, configDrafts, getSite, integrations, withTenant } from "@track-site/db";
import { env } from "@/env";
import { db, pool } from "@/server/db";
import type { OrgContext } from "@/server/session";
import { appendMessage, getOrCreateChatSession, listMessages, recordToolRun, storePendingApproval } from "./chat-store";
import { buildAgentContext, modelRouting, openai, safetyIdentifier } from "./context";

export type TurnEvent = AgentEvent | { type: "ui.approval"; approvalId: string; action: string; summary: Record<string, unknown>; expiresAt: string } | { type: "ui.credential"; component: Record<string, unknown> } | { type: "dlp.notice"; message: string; suggested: { connector: string | null; kind: string } | null };

/**
 * One chat turn: DLP -> context block from the authoritative state -> agent loop with the
 * step/role tool subset -> persistence of redacted messages, tool runs and pending approvals.
 */
export async function runChatTurn(ctx: OrgContext, siteId: string, userMessage: string, emit: (e: TurnEvent) => void, options: { turnId?: string } = {}): Promise<{ ui: AssistantUiResponse | null; error: string | null }> {
  const session = await getOrCreateChatSession(ctx.organization.id, siteId, ctx.user.id, ctx.user.locale);
  const agentCtx = await buildAgentContext(ctx, siteId, session.id);
  if (!agentCtx) return { ui: null, error: "site not found" };
  const dlp = interceptUserMessage(userMessage.slice(0, 4_000));
  if (dlp.blockedSecret) emit({ type: "dlp.notice", message: "A credential-like value was removed from your message. Secrets are only accepted through the secure credential card.", suggested: dlp.suggestedCredential });
  await appendMessage(ctx.organization.id, session.id, { role: "user", content: dlp.safeText, redactionCount: dlp.findings.length });
  const history = (await listMessages(ctx.organization.id, session.id, 40)).filter((m) => m.role === "user" || m.role === "assistant").slice(0, -1);

  const state = await loadSetupState(db(), ctx.organization.id, siteId, ctx.user.locale);
  const [site, ints, draft, active] = await withTenant(db(), ctx.organization.id, async (tx) => Promise.all([getSite(tx, ctx.organization.id, siteId), tx.select({ id: integrations.id, type: integrations.connectorType, name: integrations.name, status: integrations.status }).from(integrations).where(eq(integrations.siteId, siteId)), tx.select({ lint: configDrafts.lint }).from(configDrafts).where(and(eq(configDrafts.environmentId, agentCtx.environmentId), eq(configDrafts.status, "open"))).limit(1), activeVersion(tx, agentCtx.environmentId)]));
  const store = new PgEventStore(pool());
  const [browserAt, serverAt] = await Promise.all([store.lastEventAt(siteId, "browser"), store.lastEventAt(siteId, "server")]);
  const lint = draft[0]?.lint as { errors: unknown[]; warnings: unknown[] } | null | undefined;
  const block = contextBlock({
    state,
    locale: ctx.user.locale,
    siteName: site?.name ?? "site",
    trackingId: site?.trackingId ?? "",
    domain: site?.primaryDomain ?? null,
    role: ctx.role,
    integrations: ints.map((i) => ({ id: i.id, type: i.type, name: i.name, status: i.status })),
    draftLint: lint ? { errors: lint.errors.length, warnings: lint.warnings.length } : null,
    lastEvents: { browserAt: browserAt?.toISOString() ?? null, serverAt: serverAt?.toISOString() ?? null },
  });
  void active;
  const registry = buildToolRegistry();
  const toolNames = allowedToolNames(state, ctx.role);
  const e = env();
  const result = await runAgentTurn({
    ctx: agentCtx,
    turnId: options.turnId,
    // paused/deleted sites are read-only for the assistant (filterToolsForTurn); the status comes from the server row, never the client
    siteStatus: site?.status ?? null,
    client: openai(),
    models: modelRouting(),
    registry,
    toolNames,
    instructions: DEVELOPER_INSTRUCTIONS,
    contextBlock: block,
    history: history.map((h) => ({ role: h.role as "user" | "assistant", content: h.content })),
    userMessage: dlp.safeText,
    maxToolCalls: e.AI_MAX_TOOL_CALLS_PER_TURN,
    timeoutMs: e.AI_TURN_TIMEOUT_MS,
    safetyIdentifier: safetyIdentifier(ctx.organization.id),
    promptCacheKey: `${ctx.organization.id}:${TOOL_SET_VERSION}`,
    emit,
    onToolRun: async (run) => {
      // the run carries the unredacted handler output (needed for the approval token below); the audit row only ever stores the redacted copy
      await recordToolRun(ctx.organization.id, session.id, { ...run, result: { ...run.result, data: redactToolOutput(run.result.data) } });
      const data = run.result.data as { approval?: { token: string; expires_at: string }; draft_id?: string; changes?: unknown; recipients?: unknown; ui?: Record<string, unknown> } | null;
      if (run.name === "prepare_publish" && run.result.ok && data?.approval && data.draft_id) {
        const approvalId = run.callId;
        await storePendingApproval(ctx.organization.id, session.id, { id: approvalId, action: "publish_config_version", targetType: "config_draft", targetId: data.draft_id, summary: { changes: data.changes, recipients: data.recipients }, expiresAt: data.approval.expires_at, token: data.approval.token });
        emit({ type: "ui.approval", approvalId, action: "publish_config_version", summary: { changes: data.changes, recipients: data.recipients }, expiresAt: data.approval.expires_at });
      }
      if (run.name === "request_secure_credential_input" && run.result.ok && data?.ui) emit({ type: "ui.credential", component: data.ui });
    },
  });
  if (result.ui) await appendMessage(ctx.organization.id, session.id, { role: "assistant", content: result.ui.message, ui: result.ui, tokenUsage: result.usage });
  else await appendMessage(ctx.organization.id, session.id, { role: "system", content: `assistant error: ${result.error?.code ?? "unknown"}${result.error?.message ? ` — ${result.error.message.slice(0, 300)}` : ""}` });
  return { ui: result.ui, error: result.error?.message ?? null };
}
