import { and, desc, eq } from "drizzle-orm";
import { maskSecret, newUlid, randomToken, type Actor, type SecretVault } from "@track-site/core";
import type { DbOrTx } from "../client.ts";
import { credentials, integrations, type connectorTypeEnum, type credentialKindEnum } from "../schema/config.ts";
import { outbox } from "../schema/delivery.ts";
import { recordAudit } from "./audit.ts";

export type IntegrationRow = typeof integrations.$inferSelect;
export type CredentialRow = typeof credentials.$inferSelect;
export type ConnectorTypeValue = (typeof connectorTypeEnum.enumValues)[number];
export type CredentialKindValue = (typeof credentialKindEnum.enumValues)[number];

export async function listIntegrations(tx: DbOrTx, siteId: string): Promise<IntegrationRow[]> {
  return tx.select().from(integrations).where(eq(integrations.siteId, siteId)).orderBy(integrations.createdAt);
}

export async function getIntegration(tx: DbOrTx, siteId: string, integrationId: string): Promise<IntegrationRow | null> {
  const rows = await tx.select().from(integrations).where(and(eq(integrations.siteId, siteId), eq(integrations.id, integrationId))).limit(1);
  return rows[0] ?? null;
}

export async function createIntegrationDraft(
  tx: DbOrTx,
  input: { organizationId: string; siteId: string; connectorType: ConnectorTypeValue; name: string; publicConfig?: Record<string, unknown>; requiredPurpose?: string | null; actor: Actor },
): Promise<IntegrationRow> {
  const [row] = await tx
    .insert(integrations)
    .values({ organizationId: input.organizationId, siteId: input.siteId, connectorType: input.connectorType, name: input.name, status: "draft", publicConfig: input.publicConfig ?? {}, requiredPurpose: input.requiredPurpose ?? null })
    .returning();
  await recordAudit(tx, { organizationId: input.organizationId, actor: input.actor, action: "integration.create_draft", targetType: "integration", targetId: row!.id, diff: { connectorType: input.connectorType, name: input.name } });
  return row!;
}

/** Public identifiers only (pixel id, measurement id, url); secrets never go through here. */
export async function savePublicConfig(tx: DbOrTx, input: { siteId: string; integrationId: string; publicConfig: Record<string, unknown>; actor: Actor }): Promise<IntegrationRow> {
  for (const [k, v] of Object.entries(input.publicConfig)) {
    if (/token|secret|password|key$/i.test(k) && typeof v === "string" && v.length > 12) throw new Error(`refusing to store a secret-like value in public config (${k})`);
  }
  const [row] = await tx
    .update(integrations)
    .set({ publicConfig: input.publicConfig })
    .where(and(eq(integrations.siteId, input.siteId), eq(integrations.id, input.integrationId)))
    .returning();
  if (!row) throw new Error("integration not found");
  await recordAudit(tx, { organizationId: row.organizationId, actor: input.actor, action: "integration.public_config", targetType: "integration", targetId: row.id, diff: { keys: Object.keys(input.publicConfig) } });
  await tx.insert(outbox).values({ id: newUlid(), organizationId: row.organizationId, topic: "integration.changed", payload: { site_id: row.siteId, integration_id: row.id } });
  return row;
}

/**
 * Stores a secret through the vault. Returns only the reference the model/UI may see.
 * Previous active credentials of the same kind are marked rotated (kept 24 h for in-flight retries).
 */
export async function storeCredential(
  tx: DbOrTx,
  vault: SecretVault,
  input: { organizationId: string; integrationId: string; kind: CredentialKindValue; label: string; plaintext: string; scope?: string[]; expiresAt?: Date | null; actor: Actor; userId: string | null },
): Promise<{ id: string; kind: CredentialKindValue; last4: string | null; status: string; masked: string | null }> {
  if (!input.plaintext || input.plaintext.length < 8) throw new Error("credential too short");
  const ciphertext = await vault.encrypt(input.plaintext, `integration:${input.integrationId}`);
  await tx
    .update(credentials)
    .set({ status: "rotated", rotatedAt: new Date() })
    .where(and(eq(credentials.integrationId, input.integrationId), eq(credentials.kind, input.kind), eq(credentials.status, "active")));
  const last4 = input.plaintext.slice(-4);
  const [row] = await tx
    .insert(credentials)
    .values({
      organizationId: input.organizationId,
      integrationId: input.integrationId,
      kind: input.kind,
      label: input.label,
      ciphertext,
      keyId: vault.keyIdOf(ciphertext) ?? "unknown",
      last4,
      scope: input.scope ?? [],
      status: "active",
      expiresAt: input.expiresAt ?? null,
      createdBy: input.userId,
    })
    .returning();
  await recordAudit(tx, { organizationId: input.organizationId, actor: input.actor, action: "credential.store", targetType: "credential", targetId: row!.id, diff: { kind: input.kind, integrationId: input.integrationId, last4 } });
  await tx.insert(outbox).values({ id: newUlid(), organizationId: input.organizationId, topic: "credential.rotated", payload: { integration_id: input.integrationId } });
  return { id: row!.id, kind: row!.kind, last4: row!.last4, status: row!.status, masked: maskSecret(input.plaintext) };
}

/** Generates a fresh signing secret for webhook destinations (shown once to the user). */
export async function generateWebhookSecret(tx: DbOrTx, vault: SecretVault, input: { organizationId: string; integrationId: string; actor: Actor; userId: string | null }): Promise<{ secret: string; credentialId: string }> {
  const secret = randomToken("whs", 32);
  const stored = await storeCredential(tx, vault, { ...input, kind: "signing_secret", label: "Webhook signing secret", plaintext: secret });
  return { secret, credentialId: stored.id };
}

export async function listCredentialRefs(tx: DbOrTx, integrationId: string): Promise<Array<{ id: string; kind: string; label: string; last4: string | null; status: string; expiresAt: Date | null; createdAt: Date }>> {
  const rows = await tx.select().from(credentials).where(eq(credentials.integrationId, integrationId)).orderBy(desc(credentials.createdAt));
  return rows.map((r) => ({ id: r.id, kind: r.kind, label: r.label, last4: r.last4, status: r.status, expiresAt: r.expiresAt, createdAt: r.createdAt }));
}

export async function revokeCredential(tx: DbOrTx, input: { organizationId: string; credentialId: string; actor: Actor }): Promise<boolean> {
  const rows = await tx.update(credentials).set({ status: "revoked", revokedAt: new Date() }).where(and(eq(credentials.id, input.credentialId), eq(credentials.organizationId, input.organizationId))).returning({ id: credentials.id, integrationId: credentials.integrationId });
  if (!rows[0]) return false;
  await recordAudit(tx, { organizationId: input.organizationId, actor: input.actor, action: "credential.revoke", targetType: "credential", targetId: rows[0].id });
  if (rows[0].integrationId) await tx.insert(outbox).values({ id: newUlid(), organizationId: input.organizationId, topic: "credential.rotated", payload: { integration_id: rows[0].integrationId } });
  return true;
}

export async function setIntegrationStatus(
  tx: DbOrTx,
  input: { siteId: string; integrationId: string; status: "draft" | "not_connected" | "connected" | "paused" | "error"; health?: IntegrationRow["health"]; actor: Actor },
): Promise<IntegrationRow | null> {
  const [row] = await tx
    .update(integrations)
    .set({ status: input.status, pausedAt: input.status === "paused" ? new Date() : null, ...(input.health ? { health: input.health } : {}) })
    .where(and(eq(integrations.siteId, input.siteId), eq(integrations.id, input.integrationId)))
    .returning();
  if (!row) return null;
  await recordAudit(tx, { organizationId: row.organizationId, actor: input.actor, action: `integration.${input.status}`, targetType: "integration", targetId: row.id });
  await tx.insert(outbox).values({ id: newUlid(), organizationId: row.organizationId, topic: "integration.changed", payload: { site_id: row.siteId, integration_id: row.id } });
  return row;
}
