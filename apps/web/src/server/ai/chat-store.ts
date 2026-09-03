import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { sha256Hex } from "@track-site/core";
import type { AssistantUiResponse } from "@track-site/ai";
import { agentToolRuns, chatMessages, chatSessions, withTenant } from "@track-site/db";
import { db, vault } from "@/server/db";

/**
 * App-owned, encrypted, short-lived chat history (OpenAI `store: false`). Only redacted text is
 * stored; pending approval tokens live in the session summary, encrypted, never in the transcript.
 */
export interface StoredMessage {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  ui: AssistantUiResponse | null;
  createdAt: string;
}

export interface PendingApproval {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  summary: Record<string, unknown>;
  expiresAt: string;
}

const aad = (sessionId: string) => `chat:${sessionId}`;

export async function getOrCreateChatSession(organizationId: string, siteId: string, userId: string, locale: string): Promise<{ id: string; summary: Record<string, unknown> }> {
  return withTenant(db(), organizationId, async (tx) => {
    const existing = await tx.select({ id: chatSessions.id, summary: chatSessions.summary }).from(chatSessions).where(and(eq(chatSessions.siteId, siteId), eq(chatSessions.userId, userId), eq(chatSessions.status, "active"))).orderBy(desc(chatSessions.updatedAt)).limit(1);
    if (existing[0]) return existing[0];
    const [row] = await tx.insert(chatSessions).values({ organizationId, siteId, userId, locale, summary: {} }).returning({ id: chatSessions.id, summary: chatSessions.summary });
    return row!;
  });
}

async function encrypt(sessionId: string, text: string): Promise<string> {
  const v = vault();
  return v ? v.encrypt(text, aad(sessionId)) : `plain:${text}`;
}

async function decrypt(sessionId: string, payload: string): Promise<string> {
  if (payload.startsWith("plain:")) return payload.slice(6);
  const v = vault();
  if (!v) return "[encrypted]";
  try {
    return await v.decrypt(payload, aad(sessionId));
  } catch {
    return "[unreadable]";
  }
}

export async function appendMessage(organizationId: string, sessionId: string, message: { role: StoredMessage["role"]; content: string; ui?: AssistantUiResponse | null; redactionCount?: number; tokenUsage?: { input: number; output: number; cached: number } | null; responseId?: string | null }): Promise<string> {
  const contentEncrypted = await encrypt(sessionId, message.content);
  return withTenant(db(), organizationId, async (tx) => {
    const [row] = await tx
      .insert(chatMessages)
      .values({ organizationId, chatSessionId: sessionId, role: message.role, contentEncrypted, contentDigest: sha256Hex(message.content), ui: message.ui ?? null, redactionCount: message.redactionCount ?? 0, tokenUsage: message.tokenUsage ?? null, responseId: message.responseId ?? null })
      .returning({ id: chatMessages.id });
    await tx.update(chatSessions).set({ lastMessageAt: new Date() }).where(eq(chatSessions.id, sessionId));
    return row!.id;
  });
}

export async function listMessages(organizationId: string, sessionId: string, limit = 60): Promise<StoredMessage[]> {
  const rows = await withTenant(db(), organizationId, (tx) => tx.select().from(chatMessages).where(eq(chatMessages.chatSessionId, sessionId)).orderBy(asc(chatMessages.createdAt)).limit(limit));
  const out: StoredMessage[] = [];
  for (const r of rows) out.push({ id: r.id, role: r.role, content: await decrypt(sessionId, r.contentEncrypted), ui: (r.ui as AssistantUiResponse | null) ?? null, createdAt: r.createdAt.toISOString() });
  return out;
}

export async function recordToolRun(organizationId: string, sessionId: string, run: { callId: string; name: string; args: Record<string, unknown>; result: { ok: boolean; code: string; data: unknown }; durationMs: number }): Promise<void> {
  await withTenant(db(), organizationId, (tx) =>
    tx
      .insert(agentToolRuns)
      .values({ organizationId, chatSessionId: sessionId, toolName: run.name, callId: run.callId, argsDigest: sha256Hex(JSON.stringify(run.args)), argsRedacted: run.args, resultCode: run.result.code, resultRedacted: run.result.data && typeof run.result.data === "object" ? (run.result.data as Record<string, unknown>) : { value: run.result.data ?? null }, status: run.result.ok ? "ok" : run.result.code === "CONFIRMATION_REQUIRED" ? "needs_confirmation" : run.result.code === "FORBIDDEN" ? "denied" : "error", durationMs: run.durationMs, idempotencyKey: `${sessionId}:${run.callId}` })
      .onConflictDoNothing(),
  );
}

export async function updateSummary(organizationId: string, sessionId: string, patch: (summary: Record<string, unknown>) => Record<string, unknown>): Promise<void> {
  await withTenant(db(), organizationId, async (tx) => {
    const rows = await tx.select({ summary: chatSessions.summary }).from(chatSessions).where(eq(chatSessions.id, sessionId)).limit(1);
    const next = patch({ ...(rows[0]?.summary ?? {}) });
    await tx.update(chatSessions).set({ summary: next }).where(eq(chatSessions.id, sessionId));
  });
}

export async function storePendingApproval(organizationId: string, sessionId: string, approval: PendingApproval & { token: string }): Promise<void> {
  const encrypted = await encrypt(sessionId, approval.token);
  await updateSummary(organizationId, sessionId, (s) => {
    const pending = ((s.pending_approvals as Record<string, unknown>) ?? {}) as Record<string, unknown>;
    pending[approval.id] = { action: approval.action, targetType: approval.targetType, targetId: approval.targetId, summary: approval.summary, expiresAt: approval.expiresAt, token: encrypted };
    return { ...s, pending_approvals: pending };
  });
}

export async function takePendingApproval(organizationId: string, sessionId: string, approvalId: string): Promise<(PendingApproval & { token: string }) | null> {
  const rows = await withTenant(db(), organizationId, (tx) => tx.select({ summary: chatSessions.summary }).from(chatSessions).where(eq(chatSessions.id, sessionId)).limit(1));
  const pending = ((rows[0]?.summary?.pending_approvals as Record<string, Record<string, unknown>>) ?? {})[approvalId];
  if (!pending) return null;
  const found: PendingApproval & { token: string } = { id: approvalId, action: String(pending.action), targetType: String(pending.targetType), targetId: String(pending.targetId), summary: (pending.summary as Record<string, unknown>) ?? {}, expiresAt: String(pending.expiresAt), token: await decrypt(sessionId, String(pending.token)) };
  await updateSummary(organizationId, sessionId, (s) => {
    const p = { ...((s.pending_approvals as Record<string, unknown>) ?? {}) };
    delete p[approvalId];
    return { ...s, pending_approvals: p };
  });
  return found;
}
