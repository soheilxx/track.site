"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supportSettings, withWorker } from "@track-site/db";
import { db } from "@/server/db";
import { PlatformAccessError, auditPlatform, requirePlatform, withPlatform, type PlatformContext } from "@/server/ops/platform";
import type { InboundEmail } from "@/server/support/inbound";
import { defaultInboundDeps, handleInboundEvent, inboundEmailFromLedgerPayload } from "@/server/support/inbound-handler";
import { fanOutAfterMutation } from "@/server/support/notifications";
import {
  FROM_NAME_MAX,
  SETTINGS_ROW_ID,
  SIGNATURE_MAX,
  businessHoursFormFrom,
  businessHoursFromForm,
  defaultSupportSettings,
  getSupportSettingsRow,
  isAutoAssignStrategy,
  isReprocessableInboundEvent,
  isValidHostname,
  loadInboundEventForReprocess,
  settingsDiff,
  settingsFromRow,
  type InboundEventForReprocess,
  type SupportDeskSettings,
} from "@/server/support/settings";

/**
 * Support desk → settings mutation (docs/18 §1 binding rules): admin-only
 * (`requirePlatform("PLATFORM_ADMIN", "platform.sla.manage")`), zod-validated, runs as `tracksite_ops` and
 * writes `platform.support_settings.update` (target `support_settings` / `1`) with the field changes in the
 * same transaction — the signature text is recorded as changed/length only, never verbatim.
 */

export type SupportSettingsError = "forbidden" | "invalid" | "unchanged" | "generic";

export interface SupportSettingsActionState {
  ok: boolean;
  error: SupportSettingsError | null;
  notice: "settingsSaved" | null;
  fieldErrors?: Record<string, string>;
}

const PATHS = ["/ops/support/settings", "/ops/support/settings/general"];

const fail = (error: SupportSettingsError, fieldErrors?: Record<string, string>): SupportSettingsActionState => ({ ok: false, error, notice: null, ...(fieldErrors ? { fieldErrors } : {}) });

async function admin(): Promise<PlatformContext | null> {
  try {
    return await requirePlatform("PLATFORM_ADMIN", "platform.sla.manage");
  } catch (e) {
    if (e instanceof PlatformAccessError) return null;
    throw e;
  }
}

const str = (formData: FormData, name: string): string => {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
};

const schema = z.object({
  fromName: z.string().trim().min(1).max(FROM_NAME_MAX),
  fromAddress: z.string().trim().toLowerCase().email().max(254),
  inboundDomain: z.string().trim().toLowerCase().min(1).max(253).refine(isValidHostname, "hostname"),
  signatureText: z
    .string()
    .transform((s) => s.replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").trim())
    .pipe(z.string().max(SIGNATURE_MAX)),
  autoAssignStrategy: z.string().refine(isAutoAssignStrategy, "strategy"),
});

/**
 * Saves the general desk settings: sender (`fromName`, `fromAddress`), reply domain (`inboundDomain`),
 * signature, `autoReplyEnabled`, `autoAssignStrategy`, business hours (`timezone`, `day_<key>_enabled|start|end`)
 * and `csatEnabled`. Values that an environment variable overrides are stored anyway (the page shows both).
 */
export async function updateSupportSettingsAction(_prev: SupportSettingsActionState, formData: FormData): Promise<SupportSettingsActionState> {
  const ctx = await admin();
  if (!ctx) return fail("forbidden");
  const fieldErrors: Record<string, string> = {};
  const parsed = schema.safeParse({
    fromName: str(formData, "fromName"),
    fromAddress: str(formData, "fromAddress"),
    inboundDomain: str(formData, "inboundDomain"),
    signatureText: str(formData, "signatureText"),
    autoAssignStrategy: str(formData, "autoAssignStrategy") || "none",
  });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "form");
      fieldErrors[field] =
        field === "fromAddress" ? "email" : field === "inboundDomain" ? "hostname" : issue.code === "too_big" ? "too_long" : issue.code === "too_small" ? "required" : "invalid";
    }
  }
  const hours = businessHoursFromForm(businessHoursFormFrom((name) => str(formData, name), (name) => str(formData, name) === "on"));
  Object.assign(fieldErrors, hours.errors);
  if (!parsed.success || Object.keys(fieldErrors).length) return fail("invalid", fieldErrors);
  const after: SupportDeskSettings = {
    inboundDomain: parsed.data.inboundDomain,
    fromName: parsed.data.fromName,
    fromAddress: parsed.data.fromAddress,
    signatureText: parsed.data.signatureText,
    autoReplyEnabled: str(formData, "autoReplyEnabled") === "on",
    autoAssignStrategy: parsed.data.autoAssignStrategy,
    businessHours: hours.value,
    csatEnabled: str(formData, "csatEnabled") === "on",
  };
  const result = await withPlatform(ctx, async (tx): Promise<SupportSettingsActionState> => {
    const row = await getSupportSettingsRow(tx);
    const before = row ? settingsFromRow(row) : defaultSupportSettings();
    const diff = settingsDiff(before, after);
    if (!Object.keys(diff).length) return fail("unchanged");
    await tx
      .insert(supportSettings)
      .values({ id: SETTINGS_ROW_ID, ...after })
      .onConflictDoUpdate({ target: supportSettings.id, set: { ...after, updatedAt: sql`now()` } });
    await auditPlatform(ctx, { action: "platform.support_settings.update", targetType: "support_settings", targetId: String(SETTINGS_ROW_ID), diff, metadata: { created: !row } }, tx);
    return { ok: true, error: null, notice: "settingsSaved" };
  });
  if (result.ok) for (const path of PATHS) revalidatePath(path);
  return result;
}

// ---------------------------------------------------------------------------------------------------
// Inbound ledger: reprocess a failed delivery (docs/18 §"Hardening")
// ---------------------------------------------------------------------------------------------------

export type ReprocessInboundError = "forbidden" | "invalid" | "not_found" | "not_reprocessable" | "no_payload" | "confirmation_required" | "generic";

export type ReprocessInboundOutcome =
  | { status: "processed"; ticketId: string; ticketNumber: number; route: string; created: boolean }
  | { status: "ignored"; reason: string }
  | { status: "duplicate" }
  | { status: "in_progress" }
  | { status: "failed"; error: string };

export type ReprocessInboundResult = { ok: true; error: null; outcome: ReprocessInboundOutcome } | { ok: false; error: ReprocessInboundError };

const reprocessSchema = z.object({ eventId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i), confirmed: z.boolean().optional() });

/**
 * Runs a `failed` (or interrupted) inbound delivery through the real handler again from the parsed event
 * the ledger kept (`payload`, migration 0018 — ids, addresses, subject, headers, attachment names; bodies
 * and bytes come from the receiving API like on a first delivery). Admin-only, confirmed in a dialog.
 * Retry-safe: the ledger treats the run as the retry of that delivery (`beginEvent` → `retry`), the handler
 * answers a mail an earlier attempt already stored with its ticket (`route: "stored"`), never a second
 * ticket or message. The outcome — ids and counts only — is audited as `platform.support_inbound.reprocess`
 * on the ledger row; a processed mail also fans the assignee's notification out at once.
 */
export async function reprocessInboundEventAction(input: { eventId: string; confirmed?: boolean }): Promise<ReprocessInboundResult> {
  const ctx = await admin();
  if (!ctx) return { ok: false, error: "forbidden" };
  const parsed = reprocessSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (parsed.data.confirmed !== true) return { ok: false, error: "confirmation_required" };
  const now = new Date();
  const loaded = await withPlatform(ctx, async (tx): Promise<{ error: ReprocessInboundError } | { row: InboundEventForReprocess; email: InboundEmail }> => {
    const row = await loadInboundEventForReprocess(tx, parsed.data.eventId);
    if (!row) return { error: "not_found" };
    if (!isReprocessableInboundEvent({ status: row.status, receivedAt: row.receivedAt, hasPayload: row.payload !== null }, now)) return { error: row.payload === null ? "no_payload" : "not_reprocessable" };
    const email = inboundEmailFromLedgerPayload(row.payload, row.providerEventId);
    if (!email) return { error: "no_payload" };
    return { row, email };
  });
  if ("error" in loaded) return { ok: false, error: loaded.error };
  const { row, email } = loaded;

  const outcome = await handleInboundEvent(email, defaultInboundDeps(), { provider: row.provider });
  const summary: ReprocessInboundOutcome =
    outcome.status === "processed"
      ? { status: "processed", ticketId: outcome.ticketId, ticketNumber: outcome.ticketNumber, route: outcome.route, created: outcome.created }
      : outcome.status === "ignored"
        ? { status: "ignored", reason: outcome.reason }
        : outcome.status === "failed"
          ? { status: "failed", error: outcome.error.slice(0, 240) }
          : { status: outcome.status };
  await withPlatform(ctx, (tx) =>
    auditPlatform(
      ctx,
      {
        action: "platform.support_inbound.reprocess",
        organizationId: outcome.status === "processed" ? outcome.organizationId : null,
        targetType: "support_inbound_event",
        targetId: row.id,
        // ids, the ledger state and the outcome only — never the mail
        diff: { providerEventId: row.providerEventId, provider: row.provider, statusBefore: row.status, ticketBefore: row.ticketId, outcome: summary },
        metadata: { module: "support", confirmed: true },
      },
      tx,
    ),
  );
  if (outcome.status === "processed") await fanOutAfterMutation((fn) => withWorker(db(), fn));
  revalidatePath(PATHS[0]!);
  return { ok: true, error: null, outcome: summary };
}
