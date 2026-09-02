import { and, eq } from "drizzle-orm";
import { siteSetupStates, sites, withTenant, type Db } from "@track-site/db";
import { initialSetupState, setupStateSchema, type SetupState } from "./state-machine.ts";

/** Persistence for the canonical setup state (one row per site, RLS-scoped). */
export async function loadSetupState(db: Db, organizationId: string, siteId: string, locale: string): Promise<SetupState> {
  return withTenant(db, organizationId, async (tx) => {
    const rows = await tx.select().from(siteSetupStates).where(and(eq(siteSetupStates.siteId, siteId), eq(siteSetupStates.organizationId, organizationId))).limit(1);
    const row = rows[0];
    if (row) {
      const parsed = setupStateSchema.safeParse({ version: row.version, currentStep: row.currentStep, steps: row.steps, context: row.context });
      if (parsed.success) return parsed.data;
    }
    const site = await tx.select({ domain: sites.primaryDomain }).from(sites).where(eq(sites.id, siteId)).limit(1);
    const state = initialSetupState({ domain: site[0]?.domain ?? null, locale });
    await tx
      .insert(siteSetupStates)
      .values({ organizationId, siteId, version: state.version, currentStep: state.currentStep, steps: state.steps, context: state.context })
      .onConflictDoUpdate({ target: siteSetupStates.siteId, set: { steps: state.steps, context: state.context, currentStep: state.currentStep } });
    return state;
  });
}

export async function saveSetupState(db: Db, organizationId: string, siteId: string, state: SetupState): Promise<void> {
  await withTenant(db, organizationId, async (tx) => {
    await tx
      .insert(siteSetupStates)
      .values({ organizationId, siteId, version: state.version, currentStep: state.currentStep, steps: state.steps, context: state.context, completedAt: state.currentStep === "health" ? new Date() : null })
      .onConflictDoUpdate({ target: siteSetupStates.siteId, set: { version: state.version, currentStep: state.currentStep, steps: state.steps, context: state.context, completedAt: state.currentStep === "health" ? new Date() : null } });
  });
}
