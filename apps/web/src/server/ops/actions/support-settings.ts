"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supportSettings } from "@track-site/db";
import { PlatformAccessError, auditPlatform, requirePlatform, withPlatform, type PlatformContext } from "@/server/ops/platform";
import {
  FROM_NAME_MAX,
  SETTINGS_ROW_ID,
  SIGNATURE_MAX,
  businessHoursFormFrom,
  businessHoursFromForm,
  defaultSupportSettings,
  getSupportSettingsRow,
  isAutoAssignStrategy,
  isValidHostname,
  settingsDiff,
  settingsFromRow,
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
