import { and, eq } from "drizzle-orm";
import { randomToken, type Actor, type SecretVault } from "@track-site/core";
import type { DbOrTx } from "../client.ts";
import { shopConnections, type ShopConnectionSettings, type shopPlatformEnum } from "../schema/commerce.ts";
import { credentials } from "../schema/config.ts";
import { recordAudit } from "./audit.ts";

export type ShopConnectionRow = typeof shopConnections.$inferSelect;
export type ShopPlatformValue = (typeof shopPlatformEnum.enumValues)[number];

export async function listShopConnections(tx: DbOrTx, siteId: string): Promise<ShopConnectionRow[]> {
  return tx.select().from(shopConnections).where(eq(shopConnections.siteId, siteId)).orderBy(shopConnections.createdAt);
}

export async function getShopConnection(tx: DbOrTx, organizationId: string, id: string): Promise<ShopConnectionRow | null> {
  const [row] = await tx.select().from(shopConnections).where(and(eq(shopConnections.id, id), eq(shopConnections.organizationId, organizationId))).limit(1);
  return row ?? null;
}

/** One connection per site and platform; the path token makes the webhook URL unguessable and is never rotated implicitly. */
export async function upsertShopConnection(
  tx: DbOrTx,
  input: { organizationId: string; siteId: string; platform: ShopPlatformValue; shopDomain: string; settings: ShopConnectionSettings; actor: Actor; userId: string | null },
): Promise<ShopConnectionRow> {
  const [existing] = await tx.select().from(shopConnections).where(and(eq(shopConnections.siteId, input.siteId), eq(shopConnections.platform, input.platform))).limit(1);
  if (existing) {
    const [row] = await tx
      .update(shopConnections)
      .set({ shopDomain: input.shopDomain, settings: { ...existing.settings, ...input.settings }, updatedAt: new Date() })
      .where(eq(shopConnections.id, existing.id))
      .returning();
    await recordAudit(tx, { organizationId: input.organizationId, actor: input.actor, action: "shop.update", targetType: "shop_connection", targetId: existing.id, diff: { platform: input.platform, shopDomain: input.shopDomain } });
    return row!;
  }
  const [row] = await tx
    .insert(shopConnections)
    .values({ organizationId: input.organizationId, siteId: input.siteId, platform: input.platform, shopDomain: input.shopDomain, pathToken: randomToken("shp", 24), settings: input.settings, createdBy: input.userId })
    .returning();
  await recordAudit(tx, { organizationId: input.organizationId, actor: input.actor, action: "shop.create", targetType: "shop_connection", targetId: row!.id, diff: { platform: input.platform, shopDomain: input.shopDomain } });
  return row!;
}

/** Stores the webhook signing secret envelope-encrypted; the previous secret is marked rotated. Returns only the last4. */
export async function setShopSecret(
  tx: DbOrTx,
  vault: SecretVault,
  input: { organizationId: string; connectionId: string; plaintext: string; actor: Actor; userId: string | null },
): Promise<{ credentialId: string; last4: string }> {
  if (!input.plaintext || input.plaintext.length < 8) throw new Error("secret too short");
  const conn = await getShopConnection(tx, input.organizationId, input.connectionId);
  if (!conn) throw new Error("shop connection not found");
  if (conn.credentialId) await tx.update(credentials).set({ status: "rotated", rotatedAt: new Date() }).where(eq(credentials.id, conn.credentialId));
  const ciphertext = await vault.encrypt(input.plaintext, `shop:${conn.id}`);
  const last4 = input.plaintext.slice(-4);
  const [row] = await tx
    .insert(credentials)
    .values({ organizationId: input.organizationId, integrationId: null, kind: "webhook_secret", label: `${conn.platform} webhook secret`, ciphertext, keyId: vault.keyIdOf(ciphertext) ?? "unknown", last4, scope: [`shop:${conn.id}`], status: "active", createdBy: input.userId })
    .returning({ id: credentials.id });
  await tx.update(shopConnections).set({ credentialId: row!.id, status: conn.status === "paused" ? "paused" : "pending", lastError: null, updatedAt: new Date() }).where(eq(shopConnections.id, conn.id));
  await recordAudit(tx, { organizationId: input.organizationId, actor: input.actor, action: "shop.secret", targetType: "shop_connection", targetId: conn.id, diff: { last4 } });
  return { credentialId: row!.id, last4 };
}

export async function setShopConnectionStatus(tx: DbOrTx, input: { organizationId: string; connectionId: string; status: "pending" | "connected" | "paused"; actor: Actor }): Promise<void> {
  await tx.update(shopConnections).set({ status: input.status, updatedAt: new Date() }).where(and(eq(shopConnections.id, input.connectionId), eq(shopConnections.organizationId, input.organizationId)));
  await recordAudit(tx, { organizationId: input.organizationId, actor: input.actor, action: input.status === "paused" ? "shop.pause" : "shop.resume", targetType: "shop_connection", targetId: input.connectionId });
}

export async function deleteShopConnection(tx: DbOrTx, input: { organizationId: string; connectionId: string; actor: Actor }): Promise<void> {
  const conn = await getShopConnection(tx, input.organizationId, input.connectionId);
  if (!conn) return;
  if (conn.credentialId) await tx.update(credentials).set({ status: "revoked", revokedAt: new Date() }).where(eq(credentials.id, conn.credentialId));
  await tx.delete(shopConnections).where(eq(shopConnections.id, conn.id));
  await recordAudit(tx, { organizationId: input.organizationId, actor: input.actor, action: "shop.delete", targetType: "shop_connection", targetId: conn.id, diff: { platform: conn.platform } });
}
