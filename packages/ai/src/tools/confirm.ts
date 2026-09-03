import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { AppError } from "@track-site/core";
import { approvals, integrations, listCredentialRefs, publishDraft, revokeCredential, rollbackToVersion, setIntegrationStatus, withTenant, configVersions, getOrCreateDraft, updateDraft, recordAudit } from "@track-site/db";
import { diffHashOf, verifyApprovalToken } from "../approvals.ts";
import type { AgentContext } from "../context.ts";
import { loadSetupState, saveSetupState } from "../setup-store.ts";
import { applyStepUpdate } from "../state-machine.ts";
import { defineTool } from "./registry.ts";
import { credentialRequirementsFor, getConnector } from "@track-site/connectors";

/**
 * Confirmation-gated tools. Every one requires a valid, unconsumed approval token issued for
 * exactly this action/target/tenant/actor/diff by the UI confirmation. The chat text never counts.
 * The token is injected by the server-side approval route (/api/ai/confirm) when the user clicks
 * the approval card; the model never receives a usable token and a fabricated one fails verification.
 */
const approvalTokenSchema = z.string().min(10).describe("supplied only by the UI approval route after the user clicks confirm; never type, copy or invent one — any value you supply is rejected");

const CONFIRM_NOTE = "Do not call this tool yourself: the approval token exists only on the server and is injected by the UI approval route when the user clicks the approval card; anything you supply is rejected. After preparing the change, answer with status=needs_input and requires_confirmation=true and wait for the user.";

function actorOf(ctx: AgentContext) {
  return { kind: "agent" as const, onBehalfOfUserId: ctx.userId, role: ctx.role as "OWNER", chatSessionId: ctx.chatSessionId };
}

async function consumeApproval(ctx: AgentContext, token: string, expected: { action: string; targetType: string; targetId: string; diffHash: string }): Promise<string> {
  const verdict = verifyApprovalToken(ctx.approvalSecret, token, { ...expected, organizationId: ctx.organizationId, userId: ctx.userId }, ctx.now().getTime());
  if (!verdict.ok) throw new AppError("APPROVAL_INVALID", `approval ${verdict.reason}`);
  return withTenant(ctx.db, ctx.organizationId, async (tx) => {
    const rows = await tx.update(approvals).set({ status: "consumed", consumedAt: new Date() }).where(and(eq(approvals.tokenHash, verdict.tokenHash), eq(approvals.status, "pending"))).returning({ id: approvals.id });
    if (!rows[0]) throw new AppError("APPROVAL_INVALID", "approval already used or unknown");
    return rows[0].id;
  });
}

export const publishConfigVersion = defineTool({
  name: "publish_config_version",
  description: `Publishes the reviewed draft as a signed, immutable configuration version. The approval card is produced by prepare_publish. ${CONFIRM_NOTE}`,
  kind: "confirm",
  permission: "config.publish",
  input: z.object({ draft_id: z.string().uuid(), approval_token: approvalTokenSchema }),
  handler: async (args, ctx) => {
    if (!ctx.signingKeys) throw new AppError("NOT_CONNECTED", "config signing key not configured");
    const draft = await withTenant(ctx.db, ctx.organizationId, (tx) => getOrCreateDraft(tx, { organizationId: ctx.organizationId, siteId: ctx.siteId, environmentId: ctx.environmentId, createdBy: ctx.userId }));
    if (draft.id !== args.draft_id) throw new AppError("INVALID_STATE", "draft changed since the preview");
    const approvalId = await consumeApproval(ctx, args.approval_token, { action: "publish_config_version", targetType: "config_draft", targetId: draft.id, diffHash: diffHashOf({ draft: draft.id, bundle: draft.bundle }) });
    const version = await withTenant(ctx.db, ctx.organizationId, (tx) => publishDraft(tx, { draftId: draft.id, actor: actorOf(ctx), userId: ctx.userId, approvalId, keys: ctx.signingKeys!, requestId: ctx.requestId }));
    let state = await loadSetupState(ctx.db, ctx.organizationId, ctx.siteId, ctx.locale);
    state.context.lastPublishedVersion = version.version;
    state.context.draftId = null;
    state = applyStepUpdate(state, "publish", { fields: { published_version: version.version }, evidence: { source: "tool", detail: `published v${version.version}` } });
    await saveSetupState(ctx.db, ctx.organizationId, ctx.siteId, state);
    return { version: version.version, published_at: version.createdAt.toISOString(), active_within_seconds: 60, summary: version.summary };
  },
});

export const rollbackConfigVersion = defineTool({
  name: "rollback_config_version",
  description: `Activates a previously published version again (one-click rollback). ${CONFIRM_NOTE}`,
  kind: "confirm",
  permission: "config.rollback",
  input: z.object({ target_version: z.number().int().nonnegative(), approval_token: approvalTokenSchema }),
  handler: async (args, ctx) => {
    const target = await withTenant(ctx.db, ctx.organizationId, async (tx) => (await tx.select().from(configVersions).where(and(eq(configVersions.environmentId, ctx.environmentId), eq(configVersions.version, args.target_version))).limit(1))[0] ?? null);
    if (!target) throw new AppError("NOT_FOUND", "version not found");
    const approvalId = await consumeApproval(ctx, args.approval_token, { action: "rollback_config_version", targetType: "config_version", targetId: target.id, diffHash: diffHashOf({ version: target.version }) });
    const v = await withTenant(ctx.db, ctx.organizationId, (tx) => rollbackToVersion(tx, { environmentId: ctx.environmentId, targetVersionId: target.id, actor: actorOf(ctx), userId: ctx.userId, approvalId, requestId: ctx.requestId }));
    return { active_version: v.version };
  },
});

export const activateOrPauseDestination = defineTool({
  name: "activate_or_pause_destination",
  description: `Activates (connected) or pauses a destination. Pausing stops all deliveries immediately. ${CONFIRM_NOTE}`,
  kind: "confirm",
  permission: "integrations.manage",
  input: z.object({ integration_id: z.string().uuid(), action: z.enum(["activate", "pause"]), approval_token: approvalTokenSchema }),
  handler: async (args, ctx) => {
    const approvalId = await consumeApproval(ctx, args.approval_token, { action: "activate_or_pause_destination", targetType: "integration", targetId: args.integration_id, diffHash: diffHashOf({ action: args.action }) });
    const row = await withTenant(ctx.db, ctx.organizationId, async (tx) => {
      if (args.action === "activate") {
        const refs = await listCredentialRefs(tx, args.integration_id);
        const integ = (await tx.select().from(integrations).where(eq(integrations.id, args.integration_id)).limit(1))[0];
        if (!integ) throw new AppError("NOT_FOUND", "integration not found");
        const required = credentialRequirementsFor(getConnector(integ.connectorType), integ.publicConfig as Record<string, unknown>).filter((c) => !c.optional);
        if (required.some((c) => !refs.some((r) => r.kind === c.kind && r.status === "active"))) throw new AppError("NOT_CONNECTED", `store the credentials first (${required.map((c) => c.kind).join(", ")})`);
      }
      const updated = await setIntegrationStatus(tx, { siteId: ctx.siteId, integrationId: args.integration_id, status: args.action === "activate" ? "connected" : "paused", actor: actorOf(ctx) });
      if (!updated) throw new AppError("NOT_FOUND", "integration not found");
      const draft = await getOrCreateDraft(tx, { organizationId: ctx.organizationId, siteId: ctx.siteId, environmentId: ctx.environmentId, createdBy: ctx.userId });
      await updateDraft(tx, draft.id, (b) => {
        const d = b.destinations.find((x) => x.id === args.integration_id);
        if (d) d.enabled = args.action === "activate";
      });
      return updated;
    });
    void approvalId;
    return { integration_id: row.id, status: row.status, note: args.action === "activate" ? "Publish the draft so the SDK and worker pick up the change." : "Deliveries stop immediately; queued events for this destination are skipped." };
  },
});

export const rotateCredential = defineTool({
  name: "rotate_credential",
  description: `Revokes the active credential of a destination so a new one can be stored through the secure card. ${CONFIRM_NOTE}`,
  kind: "confirm",
  permission: "credentials.rotate",
  input: z.object({ credential_id: z.string().uuid(), approval_token: approvalTokenSchema }),
  handler: async (args, ctx) => {
    await consumeApproval(ctx, args.approval_token, { action: "rotate_credential", targetType: "credential", targetId: args.credential_id, diffHash: diffHashOf({ rotate: true }) });
    const ok = await withTenant(ctx.db, ctx.organizationId, (tx) => revokeCredential(tx, { organizationId: ctx.organizationId, credentialId: args.credential_id, actor: actorOf(ctx) }));
    if (!ok) throw new AppError("NOT_FOUND", "credential not found");
    return { revoked: true, next: "Use request_secure_credential_input to store the replacement." };
  },
});

export const disconnectIntegration = defineTool({
  name: "disconnect_integration",
  description: `Disconnects a destination: revokes its credentials, pauses delivery and removes it from the draft. ${CONFIRM_NOTE}`,
  kind: "confirm",
  permission: "integrations.manage",
  input: z.object({ integration_id: z.string().uuid(), approval_token: approvalTokenSchema }),
  handler: async (args, ctx) => {
    await consumeApproval(ctx, args.approval_token, { action: "disconnect_integration", targetType: "integration", targetId: args.integration_id, diffHash: diffHashOf({ disconnect: true }) });
    await withTenant(ctx.db, ctx.organizationId, async (tx) => {
      const refs = await listCredentialRefs(tx, args.integration_id);
      for (const r of refs) if (r.status === "active") await revokeCredential(tx, { organizationId: ctx.organizationId, credentialId: r.id, actor: actorOf(ctx) });
      await setIntegrationStatus(tx, { siteId: ctx.siteId, integrationId: args.integration_id, status: "not_connected", actor: actorOf(ctx) });
      const draft = await getOrCreateDraft(tx, { organizationId: ctx.organizationId, siteId: ctx.siteId, environmentId: ctx.environmentId, createdBy: ctx.userId });
      await updateDraft(tx, draft.id, (b) => {
        b.destinations = b.destinations.filter((d) => d.id !== args.integration_id);
      });
      await recordAudit(tx, { organizationId: ctx.organizationId, actor: actorOf(ctx), action: "integration.disconnect", targetType: "integration", targetId: args.integration_id, requestId: ctx.requestId });
    });
    return { integration_id: args.integration_id, status: "not_connected" };
  },
});

export const CONFIRM_TOOL_LIST = [publishConfigVersion, rollbackConfigVersion, activateOrPauseDestination, rotateCredential, disconnectIntegration];
