"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AppError, newUlid, randomToken, sha256Hex } from "@track-site/core";
import { TEST_LAB_JOURNEYS, environments, getSite, pgErrorCode, recordAudit, sourceKeys, testLabRuns, type TestLabJourney } from "@track-site/db";
import { setActiveSiteAction } from "@/components/app/shell/actions";
import { env } from "@/env";
import { logger } from "@/server/db";
import { requireOrgContext, withOrg } from "@/server/session";
import { TEST_CONSENT_CHOICES, buildJourneyEvents, type TestConsentChoice } from "./events-lineage";

/**
 * Server actions of the Events module. The Live Test Lab run is the only mutation: it sends a guided
 * journey of controlled test events through the real collector (`HOST_INGEST/v1/s`) with an
 * ephemeral source key of the site's test-mode environment. The key lives for two minutes, never
 * leaves this process and is revoked right after the request; the run, the key and the outcome are
 * audited. Nothing reaches a production destination: the event's environment is in test mode, which
 * the delivery stage honours per event.
 */
export interface TestLabActionState {
  ok: boolean;
  runId: string | null;
  error: "invalid" | "forbidden" | "not_found" | "no_test_environment" | "unavailable" | "collector" | "unreachable" | "generic" | null;
  collectorStatus: number | null;
  collectorReason: string | null;
}

const runInput = z.object({
  siteId: z.string().uuid(),
  journey: z.enum(TEST_LAB_JOURNEYS),
  consent: z.enum(TEST_CONSENT_CHOICES as [TestConsentChoice, ...TestConsentChoice[]]),
  /** the UI shows an explicit confirmation step before this is true */
  confirmed: z.literal(true),
});

class TablesMissing extends Error {}

const KEY_TTL_MS = 2 * 60_000;
const COLLECTOR_TIMEOUT_MS = 10_000;

export async function runTestLabAction(input: unknown): Promise<TestLabActionState> {
  const fail = (error: TestLabActionState["error"], extra: Partial<TestLabActionState> = {}): TestLabActionState => ({ ok: false, runId: null, error, collectorStatus: null, collectorReason: null, ...extra });
  let ctx;
  try {
    ctx = await requireOrgContext("sites.update");
  } catch (e) {
    if (e instanceof AppError && e.code === "FORBIDDEN") return fail("forbidden");
    throw e;
  }
  const parsed = runInput.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const { siteId, journey, consent } = parsed.data;
  const runId = newUlid();
  const secret = randomToken("tsk_test", 32);
  const now = new Date();

  let prepared: { keyId: string; environmentId: string; body: string; steps: number } | "not_found" | "no_test_environment";
  try {
    prepared = await withOrg(ctx, async (tx) => {
      const site = await getSite(tx, ctx.organization.id, siteId);
      if (!site) return "not_found" as const;
      const envRows = await tx.select({ id: environments.id, kind: environments.kind, testMode: environments.testMode }).from(environments).where(eq(environments.siteId, site.id));
      const testEnv = envRows.find((e) => e.testMode && e.kind === "staging") ?? envRows.find((e) => e.testMode) ?? null;
      if (!testEnv) return "no_test_environment" as const;
      const built = buildJourneyEvents(journey as TestLabJourney, consent, { runId, host: site.primaryDomain ?? "test.invalid", currency: site.currency ?? "EUR", now, ids: () => newUlid() });
      const [key] = await tx
        .insert(sourceKeys)
        .values({
          organizationId: ctx.organization.id,
          siteId: site.id,
          environmentId: testEnv.id,
          name: `Live Test Lab ${runId.slice(-6)} (ephemeral)`,
          keyPrefix: secret.slice(0, 12),
          keyHash: sha256Hex(secret),
          last4: secret.slice(-4),
          createdBy: ctx.user.id,
          validUntil: new Date(now.getTime() + KEY_TTL_MS),
        })
        .returning({ id: sourceKeys.id });
      try {
        await tx.insert(testLabRuns).values({ id: runId, organizationId: ctx.organization.id, siteId: site.id, environmentId: testEnv.id, journey: journey as TestLabJourney, consent: { granted: built.events[0]?.consent?.granted ?? [], source: built.events[0]?.consent?.source ?? "default", region: built.events[0]?.consent?.region ?? null }, status: "pending", sourceKeyId: key!.id, steps: built.steps, createdBy: ctx.user.id });
      } catch (e) {
        if (pgErrorCode(e) === "42P01") throw new TablesMissing(); // rolls the key insert back
        throw e;
      }
      await recordAudit(tx, {
        organizationId: ctx.organization.id,
        actor: ctx.tenant.actor,
        action: "test_lab.run",
        targetType: "test_lab_run",
        targetId: runId,
        diff: { siteId: site.id, environmentId: testEnv.id, journey, consent, events: built.steps.map((s) => s.name), sourceKeyId: key!.id },
        requestId: ctx.tenant.requestId,
      });
      return { keyId: key!.id, environmentId: testEnv.id, body: JSON.stringify({ events: built.events }), steps: built.steps.length };
    });
  } catch (e) {
    if (e instanceof TablesMissing) return fail("unavailable");
    logger.warn({ err: e instanceof Error ? e.message : String(e) }, "test lab prepare failed");
    return fail("generic");
  }
  if (typeof prepared === "string") return fail(prepared);

  // the collector call: outside the transaction, bounded, the secret only in this request header
  const base = (env().HOST_INGEST ?? "").replace(/\/$/, "");
  let status: number | null = null;
  let reason: string | null = null;
  let batchId: string | null = null;
  let outcome: "sent" | "rejected" | "failed" = "failed";
  if (!base) {
    reason = "ingest_host_not_configured";
  } else {
    try {
      const res = await fetch(`${base}/v1/s`, {
        method: "POST",
        headers: { authorization: `Bearer ${secret}`, "content-type": "application/json", "user-agent": "track-live-test-lab/1" },
        body: prepared.body,
        signal: AbortSignal.timeout(COLLECTOR_TIMEOUT_MS),
        cache: "no-store",
      });
      status = res.status;
      const json = (await res.json().catch(() => null)) as { ok?: boolean; id?: string; reason?: string; issues?: string[] } | null;
      if (res.status === 202 && json?.ok && typeof json.id === "string") {
        batchId = json.id;
        outcome = "sent";
      } else {
        outcome = "rejected";
        reason = [json?.reason ?? `http_${res.status}`, ...(json?.issues ?? []).slice(0, 3)].join("; ").slice(0, 300);
      }
    } catch (e) {
      outcome = "failed";
      reason = e instanceof Error && e.name === "TimeoutError" ? "timeout" : "unreachable";
      logger.warn({ err: e instanceof Error ? e.message : String(e) }, "test lab collector call failed");
    }
  }

  await withOrg(ctx, async (tx) => {
    await tx.update(sourceKeys).set({ status: "revoked", revokedAt: new Date() }).where(and(eq(sourceKeys.id, prepared.keyId), eq(sourceKeys.organizationId, ctx.organization.id)));
    await tx.update(testLabRuns).set({ status: outcome, collectorStatus: status, collectorReason: reason, batchId, sentAt: outcome === "sent" ? new Date() : null, error: outcome === "sent" ? null : reason }).where(and(eq(testLabRuns.id, runId), eq(testLabRuns.organizationId, ctx.organization.id)));
    await recordAudit(tx, { organizationId: ctx.organization.id, actor: ctx.tenant.actor, action: `test_lab.${outcome}`, targetType: "test_lab_run", targetId: runId, diff: { collectorStatus: status, reason, batchId, sourceKeyId: prepared.keyId, keyRevoked: true }, requestId: ctx.tenant.requestId });
  }).catch((e) => logger.error({ err: e instanceof Error ? e.message : String(e), runId }, "test lab finalize failed"));

  revalidatePath("/app/events/test-lab");
  if (outcome === "sent") return { ok: true, runId, error: null, collectorStatus: status, collectorReason: null };
  return fail(outcome === "rejected" ? "collector" : reason === "ingest_host_not_configured" ? "unavailable" : "unreachable", { runId, collectorStatus: status, collectorReason: reason });
}

/** Legacy `?site=` links (old debugger): make that site the active workspace, then open the explorer. */
export async function switchToSiteAndOpenExplorerAction(formData: FormData): Promise<void> {
  const parsed = z.object({ siteId: z.string().uuid(), query: z.string().max(500).optional() }).safeParse({ siteId: formData.get("siteId"), query: formData.get("query") ?? undefined });
  if (!parsed.success) redirect("/app/events/explorer");
  const result = await setActiveSiteAction({ siteId: parsed.data.siteId });
  const query = parsed.data.query && /^[a-zA-Z0-9_=&%.-]*$/.test(parsed.data.query) ? parsed.data.query : "";
  redirect(result.ok && query ? `/app/events/explorer?${query}` : "/app/events/explorer");
}
