import "server-only";
import { eq, and } from "drizzle-orm";
import { hmacSha256Hex, newUlid } from "@track-site/core";
import { createOpenAI, verifyModelAvailability, type AgentContext, type ModelAvailability, type ModelRouting } from "@track-site/ai";
import { defaultEnvironment, getSite, withTenant } from "@track-site/db";
import { sites } from "@track-site/db/schema";
import { env } from "@/env";
import { db, logger, queue, signingKeys, vault } from "@/server/db";
import type { OrgContext } from "@/server/session";

/** Builds the tool context from the authenticated organization context; nothing comes from the client. */
export async function buildAgentContext(ctx: OrgContext, siteId: string, chatSessionId: string): Promise<AgentContext | null> {
  const e = env();
  const site = await withTenant(db(), ctx.organization.id, async (tx) => {
    const s = await getSite(tx, ctx.organization.id, siteId);
    if (!s) return null;
    const envRow = await defaultEnvironment(tx, s.id);
    return envRow ? { site: s, environmentId: envRow.id } : null;
  });
  if (!site) return null;
  return {
    organizationId: ctx.organization.id,
    siteId: site.site.id,
    environmentId: site.environmentId,
    userId: ctx.user.id,
    role: ctx.role,
    locale: ctx.user.locale,
    chatSessionId,
    requestId: newUlid(),
    db: db(),
    vault: vault(),
    queue: queue(),
    signingKeys: signingKeys(),
    approvalSecret: e.APPROVAL_TOKEN_SECRET ?? e.AUTH_SECRET ?? "dev-approval-secret",
    hosts: { cdn: e.HOST_CDN, ingest: e.HOST_INGEST, app: e.HOST_APP },
    fetch,
    logger: logger.child({ module: "ai" }),
    now: () => new Date(),
    allowPrivateNetwork: e.VENDOR_ALLOW_PRIVATE,
  };
}

export function modelRouting(): ModelRouting {
  const e = env();
  return { primary: e.AI_MODEL_PRIMARY ?? "gpt-5.6-terra", fast: e.AI_MODEL_FAST ?? "gpt-5.6-luna", complex: e.AI_MODEL_COMPLEX ?? "gpt-5.6-sol" };
}

export function aiConfigured(): boolean {
  const e = env();
  return e.AI_ENABLED && Boolean(e.OPENAI_API_KEY);
}

export function openai() {
  const e = env();
  if (!e.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");
  return createOpenAI(e.OPENAI_API_KEY, { timeoutMs: e.AI_TURN_TIMEOUT_MS });
}

/** Tenant-scoped pseudonymous identifier for OpenAI `safety_identifier`. */
export function safetyIdentifier(organizationId: string): string {
  const e = env();
  return hmacSha256Hex(e.AUTH_SECRET ?? "track-site", organizationId).slice(0, 32);
}

let availabilityCache: { value: ModelAvailability; at: number } | null = null;

/** Cached model availability check (List models: read). Never changes the configured routing. */
export async function modelAvailability(force = false): Promise<ModelAvailability | { ok: false; error: string; checkedAt: string; available: string[]; missing: string[]; suggestions: string[] }> {
  if (!aiConfigured()) return { ok: false, error: "OPENAI_API_KEY not configured", checkedAt: new Date().toISOString(), available: [], missing: Object.values(modelRouting()), suggestions: [] };
  if (!force && availabilityCache && Date.now() - availabilityCache.at < 10 * 60_000) return availabilityCache.value;
  const value = await verifyModelAvailability(openai(), modelRouting());
  availabilityCache = { value, at: Date.now() };
  if (!value.ok) logger.error({ missing: value.missing, suggestions: value.suggestions }, "ai.model_unavailable");
  return value;
}

export async function siteBelongsToOrg(organizationId: string, siteId: string): Promise<boolean> {
  const rows = await withTenant(db(), organizationId, (tx) => tx.select({ id: sites.id }).from(sites).where(and(eq(sites.id, siteId), eq(sites.organizationId, organizationId))).limit(1));
  return rows.length > 0;
}
