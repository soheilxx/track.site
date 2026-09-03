"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PgEventStore } from "@track-site/analytics";
import { normalizeEmail, sha256Hex } from "@track-site/core";
import { RETENTION_DEFAULT_DAYS, conversionRecords, dataSubjectRequests, deletionJobs, listSites, recordAudit, retentionPolicies } from "@track-site/db";
import { pool } from "@/server/db";
import { requireOrgContext, withOrg } from "@/server/session";
import type { ActionState } from "./organization";

const KINDS = ["export", "delete", "restrict", "rectify", "object", "portability"] as const;

export async function createDsarAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireOrgContext("privacy.dsar");
  const parsed = z.object({ kind: z.enum(KINDS), email: z.string().trim().email().max(254), note: z.string().trim().max(500).optional() }).safeParse({ kind: formData.get("kind"), email: formData.get("email"), note: formData.get("note") || undefined });
  if (!parsed.success) return { ok: false, error: null, fieldErrors: { email: "email" } };
  const emailHash = sha256Hex(normalizeEmail(parsed.data.email));
  await withOrg(ctx, async (tx) => {
    const [row] = await tx.insert(dataSubjectRequests).values({ organizationId: ctx.organization.id, siteId: null, kind: parsed.data.kind, subject: { emailHash }, requestedBy: ctx.user.id, note: parsed.data.note ?? null, dueAt: new Date(Date.now() + 30 * 86_400_000) }).returning({ id: dataSubjectRequests.id });
    await recordAudit(tx, { organizationId: ctx.organization.id, actor: ctx.tenant.actor, action: "dsar.create", targetType: "dsar", targetId: row!.id, diff: { kind: parsed.data.kind }, requestId: ctx.tenant.requestId });
  });
  revalidatePath("/app/consent");
  return { ok: true, error: null };
}

/** Executes a request: delete removes the subject's events/conversions on every site; export builds the JSON report. */
export async function processDsarAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireOrgContext("privacy.dsar");
  const parsed = z.object({ requestId: z.string().uuid(), decision: z.enum(["process", "reject"]) }).safeParse({ requestId: formData.get("requestId"), decision: formData.get("decision") });
  if (!parsed.success) return { ok: false, error: "generic" };
  const request = await withOrg(ctx, async (tx) => (await tx.select().from(dataSubjectRequests).where(and(eq(dataSubjectRequests.id, parsed.data.requestId), eq(dataSubjectRequests.organizationId, ctx.organization.id))).limit(1))[0] ?? null);
  if (!request) return { ok: false, error: "generic" };
  if (parsed.data.decision === "reject") {
    await withOrg(ctx, async (tx) => {
      await tx.update(dataSubjectRequests).set({ status: "rejected", completedAt: new Date() }).where(eq(dataSubjectRequests.id, request.id));
      await recordAudit(tx, { organizationId: ctx.organization.id, actor: ctx.tenant.actor, action: "dsar.reject", targetType: "dsar", targetId: request.id, requestId: ctx.tenant.requestId });
    });
    revalidatePath("/app/consent");
    return { ok: true, error: null };
  }
  const sites = await withOrg(ctx, (tx) => listSites(tx, ctx.organization.id));
  const subject = request.subject;
  const store = new PgEventStore(pool());
  const report: Record<string, unknown> = { kind: request.kind, processedAt: new Date().toISOString(), sites: [] as unknown[] };
  await withOrg(ctx, (tx) => tx.update(dataSubjectRequests).set({ status: "in_progress" }).where(eq(dataSubjectRequests.id, request.id)));
  for (const site of sites) {
    if (request.kind === "delete") {
      const deletedEvents = await store.deleteSubject(site.id, { anonymousId: subject.anonymousId, userId: subject.userId, emailHash: subject.emailHash });
      const deletedConversions = await withOrg(ctx, async (tx) => {
        if (!subject.userId && !subject.anonymousId) return 0;
        const res = await tx.delete(conversionRecords).where(and(eq(conversionRecords.siteId, site.id), sql`${conversionRecords.eventId} IN (SELECT event_id FROM events WHERE site_id = ${site.id} AND (anonymous_id = ${subject.anonymousId ?? null} OR user_id = ${subject.userId ?? null}))`)).returning({ id: conversionRecords.id });
        return res.length;
      });
      await withOrg(ctx, (tx) => tx.insert(deletionJobs).values({ organizationId: ctx.organization.id, dsarId: request.id, store: "event_store", status: "done", details: { site: site.id, deletedEvents, deletedConversions }, startedAt: new Date(), finishedAt: new Date() }));
      (report.sites as unknown[]).push({ siteId: site.id, deletedEvents, deletedConversions });
    } else if (request.kind === "export" || request.kind === "portability") {
      const rows = await withOrg(ctx, async (tx) => {
        const res = await tx.execute(sql`SELECT event_id, name, server_ts, url, consent, commerce, click_ids, source, processing_state FROM events WHERE site_id = ${site.id} AND (anonymous_id = ${subject.anonymousId ?? null} OR user_id = ${subject.userId ?? null} OR user_data->>'em' = ${subject.emailHash ?? null}) ORDER BY server_ts DESC LIMIT 5000`);
        return (res as unknown as { rows: Record<string, unknown>[] }).rows;
      });
      (report.sites as unknown[]).push({ siteId: site.id, siteName: site.name, events: rows });
    } else {
      (report.sites as unknown[]).push({ siteId: site.id, action: `${request.kind} recorded; enforced through consent policy and retention` });
    }
  }
  await withOrg(ctx, async (tx) => {
    await tx.update(dataSubjectRequests).set({ status: "completed", completedAt: new Date(), report }).where(eq(dataSubjectRequests.id, request.id));
    await recordAudit(tx, { organizationId: ctx.organization.id, actor: ctx.tenant.actor, action: `dsar.${request.kind}`, targetType: "dsar", targetId: request.id, diff: { sites: sites.length }, requestId: ctx.tenant.requestId });
  });
  revalidatePath("/app/consent");
  return { ok: true, error: null };
}

export async function saveRetentionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireOrgContext("privacy.retention");
  const kinds = Object.keys(RETENTION_DEFAULT_DAYS);
  const values: Array<{ dataKind: string; days: number }> = [];
  for (const kind of kinds) {
    const raw = formData.get(`days_${kind}`);
    if (raw === null || raw === "") continue;
    const days = Number(raw);
    if (!Number.isInteger(days) || days < 1 || days > 3650) return { ok: false, error: "generic" };
    values.push({ dataKind: kind, days });
  }
  await withOrg(ctx, async (tx) => {
    for (const v of values) {
      await tx
        .insert(retentionPolicies)
        .values({ organizationId: ctx.organization.id, siteId: null, dataKind: v.dataKind as (typeof retentionPolicies.$inferInsert)["dataKind"], days: v.days, updatedBy: ctx.user.id })
        .onConflictDoUpdate({ target: [retentionPolicies.organizationId, retentionPolicies.siteId, retentionPolicies.dataKind], set: { days: v.days, updatedBy: ctx.user.id } });
    }
    await recordAudit(tx, { organizationId: ctx.organization.id, actor: ctx.tenant.actor, action: "retention.update", targetType: "organization", targetId: ctx.organization.id, diff: Object.fromEntries(values.map((v) => [v.dataKind, v.days])), requestId: ctx.tenant.requestId });
  });
  revalidatePath("/app/consent");
  return { ok: true, error: null };
}
