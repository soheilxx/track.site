"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DEFAULT_OVERAGE_POLICY, OVERAGE_POLICIES, isPlanId, overagePackFor, type OveragePolicy } from "@track-site/catalog";
import { AppError } from "@track-site/core";
import { orgSettings, recordAudit, usagePeriods } from "@track-site/db";
import { planLimits } from "@/server/entitlements";
import { logger } from "@/server/db";
import { requireOrgContext, withOrg, type OrgContext } from "@/server/session";
import { COST_LIMIT_BOUNDS, evaluateHardLimit, isLessRestrictive, periodBounds } from "@/server/usage";

export interface UsageActionResult {
  ok: boolean;
  error: "invalid" | "forbidden" | "generic" | null;
  policy: OveragePolicy | null;
  costLimitCents: number | null;
  /** whether the current period is flagged as hard-limited after the change (same rule as the usage check); null without a period row */
  hardLimit: boolean | null;
}

const schema = z
  .object({
    policy: z.enum(OVERAGE_POLICIES),
    costLimitCents: z.number().int().min(COST_LIMIT_BOUNDS.minCents).max(COST_LIMIT_BOUNDS.maxCents).nullable(),
    /** the UI's confirmation step; the action refuses anything else */
    confirmed: z.literal(true),
  })
  .refine((v) => v.policy !== "cost_limit" || v.costLimitCents != null, { path: ["costLimitCents"] });

const fail = (error: UsageActionResult["error"]): UsageActionResult => ({ ok: false, error, policy: null, costLimitCents: null, hardLimit: null });

/**
 * Sets the organization's overage policy (allow / monthly cost limit / pause at the limit after the grace
 * window). Overage is never activated without this explicit choice; the change is confirmed in the UI,
 * validated here, audited, and the current period's hard-limit flag is re-evaluated at once with the same
 * rule the worker's usage check applies, so the page never shows a stale pause after a policy change.
 */
export async function updateOveragePolicyAction(input: { policy: string; costLimitCents: number | null; confirmed: boolean }): Promise<UsageActionResult> {
  let ctx: OrgContext;
  try {
    ctx = await requireOrgContext("billing.manage");
  } catch (e) {
    if (e instanceof AppError && e.code === "FORBIDDEN") return fail("forbidden");
    throw e;
  }
  const parsed = schema.safeParse({ policy: input.policy, costLimitCents: input.policy === "cost_limit" ? input.costLimitCents : null, confirmed: input.confirmed });
  if (!parsed.success) return fail("invalid");
  const next = { policy: parsed.data.policy, costLimitCents: parsed.data.costLimitCents };
  const plan = await planLimits(ctx);
  const pack = isPlanId(plan.planId) ? overagePackFor(plan.planId) : null;
  const period = periodBounds(new Date());
  try {
    const hardLimit = await withOrg(ctx, async (tx) => {
      const [before] = await tx.select({ policy: orgSettings.usageOveragePolicy, costLimitCents: orgSettings.usageCostLimitCents }).from(orgSettings).where(eq(orgSettings.organizationId, ctx.organization.id)).limit(1);
      const previous = { policy: before?.policy ?? DEFAULT_OVERAGE_POLICY, costLimitCents: before?.costLimitCents ?? null };
      await tx
        .insert(orgSettings)
        .values({ organizationId: ctx.organization.id, usageOveragePolicy: next.policy, usageCostLimitCents: next.costLimitCents })
        .onConflictDoUpdate({ target: orgSettings.organizationId, set: { usageOveragePolicy: next.policy, usageCostLimitCents: next.costLimitCents } });
      // re-evaluate the current period with the new policy (the worker applies the identical rule on its next run)
      const [row] = await tx
        .select({ id: usagePeriods.id, billable: usagePeriods.billableEvents, limitEvents: usagePeriods.limitEvents, hardLimitHitAt: usagePeriods.hardLimitHitAt })
        .from(usagePeriods)
        .where(and(eq(usagePeriods.organizationId, ctx.organization.id), eq(usagePeriods.periodKey, period.key)))
        .limit(1);
      let flagged: boolean | null = null;
      if (row) {
        const limit = row.limitEvents ?? plan.limits.eventsPerMonth ?? null;
        flagged = evaluateHardLimit({ policy: next.policy, billable: row.billable, limit, pack, costLimitCents: next.costLimitCents });
        await tx
          .update(usagePeriods)
          .set({ hardLimitHitAt: flagged ? (row.hardLimitHitAt ?? new Date()) : null })
          .where(eq(usagePeriods.id, row.id));
      }
      await recordAudit(tx, {
        organizationId: ctx.organization.id,
        actor: ctx.tenant.actor,
        action: "billing.overage_policy",
        targetType: "organization",
        targetId: ctx.organization.id,
        diff: { from: previous, to: next },
        metadata: { period: period.key, plan: plan.planId, hardLimit: flagged, lessRestrictive: isLessRestrictive(previous, next), confirmed: true },
        requestId: ctx.tenant.requestId,
      });
      return flagged;
    });
    revalidatePath("/app/billing/usage");
    revalidatePath("/app/billing");
    revalidatePath("/app");
    return { ok: true, error: null, policy: next.policy, costLimitCents: next.costLimitCents, hardLimit };
  } catch (e) {
    logger.warn({ err: e instanceof Error ? e.message : String(e), organization: ctx.organization.id }, "billing.overage_policy_failed");
    return fail("generic");
  }
}
