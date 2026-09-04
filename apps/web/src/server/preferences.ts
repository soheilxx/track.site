import "server-only";
import { cache } from "react";
import { and, eq } from "drizzle-orm";
import { AI_MOTION_VALUES, pgErrorCode, workspacePreferences, type AiMotion } from "@track-site/db";
import { db, logger } from "./db";
import type { OrgContext } from "./session";
import { withTenant } from "@track-site/db";

/**
 * Per-user dashboard preferences that are not workspace selection (owner supplement §9 "Kontrolle,
 * Barrierefreiheit"): the Track AI motion setting `system / full / reduced / off`, stored in
 * `workspace_preferences.ai_motion` per organization and user (migration 0006). `readAiMotion` is the
 * getter phase 6 (Living AI Core) consumes; the dashboard layout already exposes the value as
 * `data-ai-motion` on the root element so the assistant panel can read it without a request.
 */
export const AI_MOTION_OPTIONS = AI_MOTION_VALUES;
export type { AiMotion };

export function isAiMotion(value: unknown): value is AiMotion {
  return typeof value === "string" && (AI_MOTION_VALUES as readonly string[]).includes(value);
}

const loadAiMotion = cache(async (organizationId: string, userId: string): Promise<AiMotion> => {
  try {
    return await withTenant(db(), organizationId, async (tx) => {
      const rows = await tx
        .select({ aiMotion: workspacePreferences.aiMotion })
        .from(workspacePreferences)
        .where(
          and(
            eq(workspacePreferences.organizationId, organizationId),
            eq(workspacePreferences.userId, userId),
          ),
        )
        .limit(1);
      const value = rows[0]?.aiMotion;
      return isAiMotion(value) ? value : "system";
    });
  } catch (e) {
    // 42P01 = migration 0006 not applied: the OS preference decides (never a crash for a preference)
    if (pgErrorCode(e) !== "42P01") throw e;
    logger.warn("workspace_preferences missing: apply migration 0006_workspace_preferences");
    return "system";
  }
});

/** The signed-in user's AI motion preference inside the active organization (deduplicated per request). */
export async function readAiMotion(ctx: OrgContext): Promise<AiMotion> {
  return loadAiMotion(ctx.organization.id, ctx.user.id);
}

/** Persists the preference (one row per organization and user, created lazily). */
export async function writeAiMotion(ctx: OrgContext, value: AiMotion): Promise<void> {
  await withTenant(db(), ctx.organization.id, async (tx) => {
    await tx
      .insert(workspacePreferences)
      .values({ organizationId: ctx.organization.id, userId: ctx.user.id, aiMotion: value })
      .onConflictDoUpdate({
        target: [workspacePreferences.organizationId, workspacePreferences.userId],
        set: { aiMotion: value, updatedAt: new Date() },
      });
  });
}
