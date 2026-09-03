"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { buildToolRegistry } from "@track-site/ai";
import { getIntegration, recordAudit, setIntegrationStatus, withTenant } from "@track-site/db";
import { CONNECTOR_TYPES } from "@track-site/policy";
import { db } from "@/server/db";
import { buildAgentContext } from "@/server/ai/context";
import { getOrCreateChatSession } from "@/server/ai/chat-store";
import { requireOrgContext } from "@/server/session";
import type { ActionState } from "./organization";

const createSchema = z.object({ siteId: z.string().uuid(), connectorType: z.enum(CONNECTOR_TYPES), name: z.string().trim().max(80).optional(), preset: z.string().regex(/^[a-z0-9_]{2,30}$/).optional() });

/** Creates a destination draft through the same typed tool the assistant uses, then opens the wizard. */
export async function createDestinationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireOrgContext("integrations.manage");
  const parsed = createSchema.safeParse({ siteId: formData.get("siteId"), connectorType: formData.get("connectorType"), name: formData.get("name") || undefined, preset: formData.get("preset") || undefined });
  if (!parsed.success) return { ok: false, error: "generic" };
  const session = await getOrCreateChatSession(ctx.organization.id, parsed.data.siteId, ctx.user.id, ctx.user.locale);
  const agentCtx = await buildAgentContext(ctx, parsed.data.siteId, session.id);
  if (!agentCtx) return { ok: false, error: "generic" };
  const registry = buildToolRegistry();
  const create = registry.get("create_integration_draft");
  if (!create) return { ok: false, error: "generic" };
  const result = await create.run({ connector_type: parsed.data.connectorType, name: parsed.data.name ?? null, mode: null }, agentCtx);
  if (!result.ok) return { ok: false, error: "generic" };
  const integrationId = (result.data as { integration_id: string }).integration_id;
  if (parsed.data.connectorType === "affiliate" && parsed.data.preset) {
    const save = registry.get("save_public_pixel_id_draft");
    if (save) await save.run({ integration_id: integrationId, key: "preset", value: parsed.data.preset }, agentCtx);
  }
  redirect(`/app/sites/${parsed.data.siteId}/destinations/${integrationId}`);
}

const toggleSchema = z.object({ siteId: z.string().uuid(), integrationId: z.string().uuid(), action: z.enum(["pause", "resume"]) });

/** Pause / resume is an explicit user click in the dashboard (not model-initiated), audited and propagated to the worker. */
export async function toggleDestinationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireOrgContext("integrations.manage");
  const parsed = toggleSchema.safeParse({ siteId: formData.get("siteId"), integrationId: formData.get("integrationId"), action: formData.get("action") });
  if (!parsed.success) return { ok: false, error: "generic" };
  const integration = await withTenant(db(), ctx.organization.id, (tx) => getIntegration(tx, parsed.data.siteId, parsed.data.integrationId));
  if (!integration) return { ok: false, error: "generic" };
  await withTenant(db(), ctx.organization.id, async (tx) => {
    await setIntegrationStatus(tx, { siteId: integration.siteId, integrationId: integration.id, status: parsed.data.action === "pause" ? "paused" : integration.health.status === "healthy" ? "connected" : "not_connected", actor: ctx.tenant.actor });
    await recordAudit(tx, { organizationId: ctx.organization.id, actor: ctx.tenant.actor, action: `integration.${parsed.data.action}`, targetType: "integration", targetId: integration.id, requestId: ctx.tenant.requestId });
  });
  return { ok: true, error: null };
}
