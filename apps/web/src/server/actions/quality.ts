"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dataQualityIssues, recordAudit } from "@track-site/db";
import { requireOrgContext, withOrg } from "@/server/session";
import type { ActionState } from "./organization";

export async function setIssueStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireOrgContext("events.read");
  const parsed = z.object({ issueId: z.string().uuid(), status: z.enum(["resolved", "ignored", "open"]) }).safeParse({ issueId: formData.get("issueId"), status: formData.get("status") });
  if (!parsed.success) return { ok: false, error: "generic" };
  await withOrg(ctx, async (tx) => {
    await tx.update(dataQualityIssues).set({ status: parsed.data.status, resolvedAt: parsed.data.status === "open" ? null : new Date() }).where(and(eq(dataQualityIssues.id, parsed.data.issueId), eq(dataQualityIssues.organizationId, ctx.organization.id)));
    await recordAudit(tx, { organizationId: ctx.organization.id, actor: ctx.tenant.actor, action: `quality_issue.${parsed.data.status}`, targetType: "data_quality_issue", targetId: parsed.data.issueId, requestId: ctx.tenant.requestId });
  });
  revalidatePath("/app/data-quality");
  return { ok: true, error: null };
}
