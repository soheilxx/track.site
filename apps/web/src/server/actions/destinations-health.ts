"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AppError } from "@track-site/core";
import { getOrgIntegration, pauseDestination, recordDestinationDiagnosis, runDestinationDiagnosis, type DiagnosisOutcome, type HealthStatus, type IntegrationStatus } from "@/server/destination-health";
import { requireOrgContext, type OrgContext } from "@/server/session";

/**
 * Destination Health Center actions. Tenant and actor come from the session only; the integration id
 * from the client is resolved inside the RLS transaction. Every action validates its input, requires
 * `integrations.manage`, writes an audit entry and revalidates the page. Pause and resume are
 * confirmed in the UI and additionally require the `confirmed: true` literal here.
 */
export type DestinationActionKind = "diagnose" | "pause" | "resume";
export type DestinationActionError = "forbidden" | "not_found" | "invalid" | "connector_unavailable" | "vault_missing" | "timeout" | "failed" | "generic";

export interface DestinationActionResult {
  ok: boolean;
  action: DestinationActionKind;
  integrationId: string | null;
  error: DestinationActionError | null;
  /** status after the action (null when nothing changed) */
  status: IntegrationStatus | null;
  validation: { ok: boolean; status: string; detail: string } | null;
  health: { status: HealthStatus; detail: string } | null;
}

const uuid = z.string().regex(/^[0-9a-f-]{36}$/i);
const targetSchema = z.object({ integrationId: uuid });
const confirmedSchema = z.object({ integrationId: uuid, confirmed: z.literal(true) });

async function manageContext(): Promise<OrgContext | null> {
  try {
    return await requireOrgContext("integrations.manage");
  } catch (e) {
    if (e instanceof AppError && e.code === "FORBIDDEN") return null;
    throw e;
  }
}

function fail(action: DestinationActionKind, error: DestinationActionError, integrationId: string | null = null): DestinationActionResult {
  return { ok: false, action, integrationId, error, status: null, validation: null, health: null };
}

function fromOutcome(action: DestinationActionKind, integrationId: string, status: IntegrationStatus, outcome: DiagnosisOutcome): DestinationActionResult {
  return {
    ok: outcome.error === null,
    action,
    integrationId,
    error: outcome.error,
    status,
    validation: outcome.validation ? { ok: outcome.validation.ok, status: outcome.validation.status, detail: outcome.validation.detail } : null,
    health: outcome.health ? { status: outcome.health.status, detail: outcome.health.detail } : null,
  };
}

/** Runs the connector's validation + health check and records the verdict (status, health, audit). */
export async function diagnoseDestinationAction(input: { integrationId: string }): Promise<DestinationActionResult> {
  const ctx = await manageContext();
  if (!ctx) return fail("diagnose", "forbidden");
  const parsed = targetSchema.safeParse(input);
  if (!parsed.success) return fail("diagnose", "invalid");
  const integration = await getOrgIntegration(ctx, parsed.data.integrationId);
  if (!integration) return fail("diagnose", "not_found");
  if (integration.status === "draft") return fail("diagnose", "invalid", integration.id);
  const outcome = await runDestinationDiagnosis(ctx, integration);
  const status = await recordDestinationDiagnosis(ctx, integration, outcome, "diagnose");
  revalidatePath("/app/destinations");
  return fromOutcome("diagnose", integration.id, status, outcome);
}

/** Pauses one destination; ingestion and every other destination keep running. Confirmed in the UI. */
export async function pauseDestinationAction(input: { integrationId: string; confirmed: true }): Promise<DestinationActionResult> {
  const ctx = await manageContext();
  if (!ctx) return fail("pause", "forbidden");
  const parsed = confirmedSchema.safeParse(input);
  if (!parsed.success) return fail("pause", "invalid");
  const integration = await getOrgIntegration(ctx, parsed.data.integrationId);
  if (!integration) return fail("pause", "not_found");
  if (integration.status === "draft") return fail("pause", "invalid", integration.id);
  if (integration.status !== "paused") await pauseDestination(ctx, integration);
  revalidatePath("/app/destinations");
  return { ok: true, action: "pause", integrationId: integration.id, error: null, status: "paused", validation: null, health: null };
}

/** Resumes a paused destination after a fresh credential check; stays disconnected when the vendor rejects it. Confirmed in the UI. */
export async function resumeDestinationAction(input: { integrationId: string; confirmed: true }): Promise<DestinationActionResult> {
  const ctx = await manageContext();
  if (!ctx) return fail("resume", "forbidden");
  const parsed = confirmedSchema.safeParse(input);
  if (!parsed.success) return fail("resume", "invalid");
  const integration = await getOrgIntegration(ctx, parsed.data.integrationId);
  if (!integration) return fail("resume", "not_found");
  if (integration.status !== "paused") return fail("resume", "invalid", integration.id);
  const outcome = await runDestinationDiagnosis(ctx, integration);
  const status = await recordDestinationDiagnosis(ctx, integration, outcome, "resume");
  revalidatePath("/app/destinations");
  return fromOutcome("resume", integration.id, status, outcome);
}
