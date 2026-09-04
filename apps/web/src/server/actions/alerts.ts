"use server";

import { randomUUID } from "node:crypto";
import { ALL_LOCALES } from "@/i18n/routing";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AppError, can, type Permission } from "@track-site/core";
import {
  ALERT_CHANNEL_KINDS,
  ALERT_COOLDOWN_MAX_MINUTES,
  ALERT_COOLDOWN_MIN_MINUTES,
  ALERT_RULE_KINDS,
  alertChannels,
  alertEvents,
  alertRules,
  recordAudit,
  resolveAlertEvent,
  sites,
  type AlertChannelKind,
  type AlertRuleKind,
} from "@track-site/db";
import { parseThresholdInput, thresholdFromForm } from "@/components/app/alerts/threshold";
import {
  channelTargetHint,
  getOrgChannel,
  sendTestNotification,
  setEnvironmentKillSwitch,
  validateChannelTarget,
  type ChannelTargetError,
  type KillSwitchError,
  type TestNotificationResult,
} from "@/server/alerts";
import { vault } from "@/server/db";
import {
  getOrgIntegration,
  pauseDestination,
  recordDestinationDiagnosis,
  runDestinationDiagnosis,
} from "@/server/destination-health";
import { requireOrgContext, withOrg, type OrgContext } from "@/server/session";
import { loadApprovalPolicy, loadTeamEntitlements, requiresFourEyes } from "@/server/team";

/**
 * Alerts & Incident Mode actions. Tenant and actor come from the session only; every id from the
 * client is resolved inside the RLS transaction; every input is validated with zod; every mutation
 * writes an audit entry and revalidates the page. Risky actions (delete, pause, kill switch) are
 * confirmed in the UI and additionally require the `confirmed: true` literal here. Secrets are
 * encrypted before they are stored and never returned.
 */
const PATH = "/app/settings/alerts";
const uuid = z.string().regex(/^[0-9a-f-]{36}$/i);

export type AlertActionError =
  | "forbidden"
  | "invalid"
  | "not_found"
  | "vault_missing"
  | "signing"
  | "unchanged"
  | "lint"
  | "approval_required"
  | "in_use"
  | ChannelTargetError
  | KillSwitchError
  | "generic";

export interface AlertFormState {
  ok: boolean;
  error: AlertActionError | null;
  fieldErrors?: Record<string, string>;
  /** id of the created or updated row */
  id?: string;
}

export interface AlertActionResult {
  ok: boolean;
  error: AlertActionError | null;
}

const initialOk: AlertFormState = { ok: true, error: null };

async function contextOr(permission: Permission): Promise<OrgContext | null> {
  try {
    return await requireOrgContext(permission);
  } catch (e) {
    if (e instanceof AppError && e.code === "FORBIDDEN") return null;
    throw e;
  }
}

const str = (formData: FormData, name: string): string => {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
};

// ---------------------------------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------------------------------

const channelSchema = z.object({
  channelId: uuid.nullable(),
  kind: z.enum(ALERT_CHANNEL_KINDS),
  name: z.string().trim().min(1).max(80),
  target: z.string().trim().max(2048),
  secret: z.string().max(256),
  locale: z.enum(ALL_LOCALES),
});

/** Creates or updates a channel. URLs and secrets are encrypted; on edit a blank target/secret keeps the stored one. */
export async function saveChannelAction(
  _prev: AlertFormState,
  formData: FormData,
): Promise<AlertFormState> {
  const ctx = await contextOr("org.update");
  if (!ctx) return { ok: false, error: "forbidden" };
  const parsed = channelSchema.safeParse({
    channelId: str(formData, "channelId") || null,
    kind: str(formData, "kind"),
    name: str(formData, "name"),
    target: str(formData, "target"),
    secret: str(formData, "secret"),
    locale: str(formData, "locale") || ctx.user.locale,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues)
      fieldErrors[String(issue.path[0] ?? "form")] = "invalid";
    return { ok: false, error: "invalid", fieldErrors };
  }
  const input = parsed.data;
  const existing = input.channelId ? await getOrgChannel(ctx, input.channelId) : null;
  if (input.channelId && !existing) return { ok: false, error: "not_found" };
  const kind: AlertChannelKind = existing ? existing.kind : input.kind;
  const targetGiven = input.target.length > 0;
  if (!existing && !targetGiven)
    return { ok: false, error: "invalid", fieldErrors: { target: "required" } };
  if (targetGiven) {
    const targetError = validateChannelTarget(kind, input.target);
    if (targetError) return { ok: false, error: targetError, fieldErrors: { target: targetError } };
  }
  const id = existing?.id ?? randomUUID();
  const aad = `alert_channel:${id}`;
  let target: string | null = existing?.target ?? null;
  let targetCiphertext: string | null = existing?.targetCiphertext ?? null;
  let secretCiphertext: string | null = existing?.secretCiphertext ?? null;
  let keyId: string | null = existing?.keyId ?? null;
  let targetHint: string | null = existing?.targetHint ?? null;
  if (kind === "email") {
    if (targetGiven) target = input.target.toLowerCase();
  } else {
    const v = vault();
    if ((targetGiven || input.secret) && !v) return { ok: false, error: "vault_missing" };
    if (targetGiven && v) {
      targetCiphertext = await v.encrypt(input.target, aad);
      targetHint = channelTargetHint(input.target);
      keyId = v.keyIdOf(targetCiphertext);
    }
    if (kind === "webhook" && input.secret && v) {
      if (input.secret.length < 8)
        return { ok: false, error: "invalid", fieldErrors: { secret: "short" } };
      secretCiphertext = await v.encrypt(input.secret, aad);
      keyId = v.keyIdOf(secretCiphertext);
    }
  }
  await withOrg(ctx, async (tx) => {
    if (existing) {
      await tx
        .update(alertChannels)
        .set({
          name: input.name,
          target,
          targetCiphertext,
          secretCiphertext,
          keyId,
          targetHint,
          locale: input.locale,
        })
        .where(eq(alertChannels.id, existing.id));
    } else {
      await tx
        .insert(alertChannels)
        .values({
          id,
          organizationId: ctx.organization.id,
          kind,
          name: input.name,
          target,
          targetCiphertext,
          secretCiphertext,
          keyId,
          targetHint,
          locale: input.locale,
          enabled: true,
          createdBy: ctx.user.id,
        });
    }
    await recordAudit(tx, {
      organizationId: ctx.organization.id,
      actor: ctx.tenant.actor,
      action: existing ? "alert_channel.update" : "alert_channel.create",
      targetType: "alert_channel",
      targetId: id,
      diff: {
        kind,
        name: input.name,
        locale: input.locale,
        targetChanged: targetGiven,
        targetHint: kind === "email" ? target : targetHint,
        secretChanged: kind === "webhook" && input.secret.length > 0,
        keyId,
      },
      requestId: ctx.tenant.requestId,
    });
  });
  revalidatePath(PATH);
  return { ...initialOk, id };
}

export async function setChannelEnabledAction(input: {
  channelId: string;
  enabled: boolean;
}): Promise<AlertActionResult> {
  const ctx = await contextOr("org.update");
  if (!ctx) return { ok: false, error: "forbidden" };
  const parsed = z.object({ channelId: uuid, enabled: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const channel = await getOrgChannel(ctx, parsed.data.channelId);
  if (!channel) return { ok: false, error: "not_found" };
  await withOrg(ctx, async (tx) => {
    await tx
      .update(alertChannels)
      .set({ enabled: parsed.data.enabled })
      .where(eq(alertChannels.id, channel.id));
    await recordAudit(tx, {
      organizationId: ctx.organization.id,
      actor: ctx.tenant.actor,
      action: parsed.data.enabled ? "alert_channel.enable" : "alert_channel.disable",
      targetType: "alert_channel",
      targetId: channel.id,
      diff: { kind: channel.kind, name: channel.name },
      requestId: ctx.tenant.requestId,
    });
  });
  revalidatePath(PATH);
  return { ok: true, error: null };
}

/** Deletes a channel (confirmed in the UI); rules that referenced it lose the reference. */
export async function deleteChannelAction(input: {
  channelId: string;
  confirmed: true;
}): Promise<AlertActionResult> {
  const ctx = await contextOr("org.update");
  if (!ctx) return { ok: false, error: "forbidden" };
  const parsed = z.object({ channelId: uuid, confirmed: z.literal(true) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const channel = await getOrgChannel(ctx, parsed.data.channelId);
  if (!channel) return { ok: false, error: "not_found" };
  await withOrg(ctx, async (tx) => {
    const rules = await tx
      .select({ id: alertRules.id, channelIds: alertRules.channelIds })
      .from(alertRules)
      .where(eq(alertRules.organizationId, ctx.organization.id));
    for (const r of rules) {
      if (!r.channelIds.includes(channel.id)) continue;
      await tx
        .update(alertRules)
        .set({ channelIds: r.channelIds.filter((c) => c !== channel.id) })
        .where(eq(alertRules.id, r.id));
    }
    await tx.delete(alertChannels).where(eq(alertChannels.id, channel.id));
    await recordAudit(tx, {
      organizationId: ctx.organization.id,
      actor: ctx.tenant.actor,
      action: "alert_channel.delete",
      targetType: "alert_channel",
      targetId: channel.id,
      diff: {
        kind: channel.kind,
        name: channel.name,
        detachedFromRules: rules.filter((r) => r.channelIds.includes(channel.id)).length,
      },
      requestId: ctx.tenant.requestId,
    });
  });
  revalidatePath(PATH);
  return { ok: true, error: null };
}

export interface TestChannelResult extends AlertActionResult {
  result: TestNotificationResult | null;
}

/** Sends a labelled test notification through the channel and records the outcome on it. */
export async function testChannelAction(input: { channelId: string }): Promise<TestChannelResult> {
  const ctx = await contextOr("org.update");
  if (!ctx) return { ok: false, error: "forbidden", result: null };
  const parsed = z.object({ channelId: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid", result: null };
  const channel = await getOrgChannel(ctx, parsed.data.channelId);
  if (!channel) return { ok: false, error: "not_found", result: null };
  const result = await sendTestNotification(ctx, channel);
  revalidatePath(PATH);
  return { ok: result.ok, error: null, result };
}

// ---------------------------------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------------------------------

const ruleSchema = z.object({
  ruleId: uuid.nullable(),
  kind: z.enum(ALERT_RULE_KINDS),
  name: z.string().trim().min(1).max(80),
  siteId: uuid.nullable(),
  channelIds: z.array(uuid).max(20),
  cooldownMinutes: z.coerce
    .number()
    .int()
    .min(ALERT_COOLDOWN_MIN_MINUTES)
    .max(ALERT_COOLDOWN_MAX_MINUTES),
  enabled: z.boolean(),
});

/** Creates or updates a rule; thresholds are parsed with the same bounds the worker enforces. */
export async function saveRuleAction(
  _prev: AlertFormState,
  formData: FormData,
): Promise<AlertFormState> {
  const ctx = await contextOr("org.update");
  if (!ctx) return { ok: false, error: "forbidden" };
  const parsed = ruleSchema.safeParse({
    ruleId: str(formData, "ruleId") || null,
    kind: str(formData, "kind"),
    name: str(formData, "name"),
    siteId: str(formData, "siteId") || null,
    channelIds: formData.getAll("channelIds").filter((v): v is string => typeof v === "string"),
    cooldownMinutes: str(formData, "cooldownMinutes") || "60",
    enabled: str(formData, "enabled") === "on",
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues)
      fieldErrors[String(issue.path[0] ?? "form")] = "invalid";
    return { ok: false, error: "invalid", fieldErrors };
  }
  const input = parsed.data;
  const result = await withOrg(ctx, async (tx): Promise<AlertFormState> => {
    const existing = input.ruleId
      ? (
          await tx
            .select()
            .from(alertRules)
            .where(
              and(
                eq(alertRules.organizationId, ctx.organization.id),
                eq(alertRules.id, input.ruleId),
              ),
            )
            .limit(1)
        )[0]
      : undefined;
    if (input.ruleId && !existing) return { ok: false, error: "not_found" };
    const kind: AlertRuleKind = existing ? existing.kind : input.kind;
    const threshold = parseThresholdInput(
      kind,
      thresholdFromForm(kind, (name) => formData.get(name)),
    );
    if (!threshold.ok) {
      const fieldErrors: Record<string, string> = {};
      for (const [key, err] of Object.entries(threshold.errors))
        fieldErrors[`threshold.${key}`] = err;
      return { ok: false, error: "invalid", fieldErrors };
    }
    if (input.siteId) {
      const [site] = await tx
        .select({ id: sites.id })
        .from(sites)
        .where(
          and(
            eq(sites.organizationId, ctx.organization.id),
            eq(sites.id, input.siteId),
            isNull(sites.deletedAt),
          ),
        )
        .limit(1);
      if (!site) return { ok: false, error: "invalid", fieldErrors: { siteId: "invalid" } };
    }
    const uniqueChannelIds = [...new Set(input.channelIds)];
    if (uniqueChannelIds.length) {
      const owned = await tx
        .select({ id: alertChannels.id })
        .from(alertChannels)
        .where(
          and(
            eq(alertChannels.organizationId, ctx.organization.id),
            inArray(alertChannels.id, uniqueChannelIds),
          ),
        );
      if (owned.length !== uniqueChannelIds.length)
        return { ok: false, error: "invalid", fieldErrors: { channelIds: "invalid" } };
    }
    const values = {
      kind,
      name: input.name,
      siteId: input.siteId,
      threshold: threshold.threshold,
      channelIds: uniqueChannelIds,
      enabled: input.enabled,
      cooldownMinutes: input.cooldownMinutes,
    };
    let id: string;
    if (existing) {
      id = existing.id;
      await tx.update(alertRules).set(values).where(eq(alertRules.id, existing.id));
    } else {
      const [row] = await tx
        .insert(alertRules)
        .values({ organizationId: ctx.organization.id, createdBy: ctx.user.id, ...values })
        .returning({ id: alertRules.id });
      id = row!.id;
    }
    await recordAudit(tx, {
      organizationId: ctx.organization.id,
      actor: ctx.tenant.actor,
      action: existing ? "alert_rule.update" : "alert_rule.create",
      targetType: "alert_rule",
      targetId: id,
      diff: {
        ...values,
        before: existing
          ? {
              threshold: existing.threshold,
              channelIds: existing.channelIds,
              enabled: existing.enabled,
              cooldownMinutes: existing.cooldownMinutes,
              siteId: existing.siteId,
            }
          : null,
      },
      requestId: ctx.tenant.requestId,
    });
    return { ...initialOk, id };
  });
  if (result.ok) revalidatePath(PATH);
  return result;
}

export async function setRuleEnabledAction(input: {
  ruleId: string;
  enabled: boolean;
}): Promise<AlertActionResult> {
  const ctx = await contextOr("org.update");
  if (!ctx) return { ok: false, error: "forbidden" };
  const parsed = z.object({ ruleId: uuid, enabled: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const result = await withOrg(ctx, async (tx): Promise<AlertActionResult> => {
    const [rule] = await tx
      .select()
      .from(alertRules)
      .where(
        and(
          eq(alertRules.organizationId, ctx.organization.id),
          eq(alertRules.id, parsed.data.ruleId),
        ),
      )
      .limit(1);
    if (!rule) return { ok: false, error: "not_found" };
    await tx
      .update(alertRules)
      .set({ enabled: parsed.data.enabled })
      .where(eq(alertRules.id, rule.id));
    await recordAudit(tx, {
      organizationId: ctx.organization.id,
      actor: ctx.tenant.actor,
      action: parsed.data.enabled ? "alert_rule.enable" : "alert_rule.disable",
      targetType: "alert_rule",
      targetId: rule.id,
      diff: { kind: rule.kind, name: rule.name },
      requestId: ctx.tenant.requestId,
    });
    return { ok: true, error: null };
  });
  if (result.ok) revalidatePath(PATH);
  return result;
}

/** Deletes a rule (confirmed in the UI); its history stays with `rule_id = null`. */
export async function deleteRuleAction(input: {
  ruleId: string;
  confirmed: true;
}): Promise<AlertActionResult> {
  const ctx = await contextOr("org.update");
  if (!ctx) return { ok: false, error: "forbidden" };
  const parsed = z.object({ ruleId: uuid, confirmed: z.literal(true) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const result = await withOrg(ctx, async (tx): Promise<AlertActionResult> => {
    const [rule] = await tx
      .select()
      .from(alertRules)
      .where(
        and(
          eq(alertRules.organizationId, ctx.organization.id),
          eq(alertRules.id, parsed.data.ruleId),
        ),
      )
      .limit(1);
    if (!rule) return { ok: false, error: "not_found" };
    await tx.delete(alertRules).where(eq(alertRules.id, rule.id));
    await recordAudit(tx, {
      organizationId: ctx.organization.id,
      actor: ctx.tenant.actor,
      action: "alert_rule.delete",
      targetType: "alert_rule",
      targetId: rule.id,
      diff: { kind: rule.kind, name: rule.name, siteId: rule.siteId, threshold: rule.threshold },
      requestId: ctx.tenant.requestId,
    });
    return { ok: true, error: null };
  });
  if (result.ok) revalidatePath(PATH);
  return result;
}

// ---------------------------------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------------------------------

/** Marks an open alert as resolved by the signed-in user (the worker re-opens it as a new event if the condition returns). */
export async function resolveAlertEventAction(input: {
  eventId: string;
}): Promise<AlertActionResult> {
  const ctx = await contextOr("org.update");
  if (!ctx) return { ok: false, error: "forbidden" };
  const parsed = z.object({ eventId: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const result = await withOrg(ctx, async (tx): Promise<AlertActionResult> => {
    // resolve only an event of this organization; nothing is audited for an unknown id
    const [event] = await tx
      .select({ id: alertEvents.id, kind: alertEvents.kind, resolvedAt: alertEvents.resolvedAt })
      .from(alertEvents)
      .where(
        and(
          eq(alertEvents.organizationId, ctx.organization.id),
          eq(alertEvents.id, parsed.data.eventId),
        ),
      )
      .limit(1);
    if (!event) return { ok: false, error: "not_found" };
    if (event.resolvedAt) return { ok: false, error: "unchanged" };
    await resolveAlertEvent(tx, event.id, ctx.user.id);
    await recordAudit(tx, {
      organizationId: ctx.organization.id,
      actor: ctx.tenant.actor,
      action: "alert_event.resolve",
      targetType: "alert_event",
      targetId: event.id,
      diff: { kind: event.kind },
      requestId: ctx.tenant.requestId,
    });
    return { ok: true, error: null };
  });
  if (result.ok) revalidatePath(PATH);
  return result;
}

// ---------------------------------------------------------------------------------------------------
// Incident Mode
// ---------------------------------------------------------------------------------------------------

async function fourEyesBlocks(
  ctx: OrgContext,
  changeType: "destination_pause" | "kill_switch",
): Promise<boolean> {
  const [policy, entitlements] = await Promise.all([
    loadApprovalPolicy(ctx),
    loadTeamEntitlements(ctx),
  ]);
  return entitlements.fourEyes && requiresFourEyes(policy.policy, changeType);
}

export interface IncidentActionResult extends AlertActionResult {
  status: string | null;
  detail: string | null;
}

/** Pauses one destination (reuses the Destination Health Center's pause); ingestion and every other destination keep running. */
export async function pauseDestinationIncidentAction(input: {
  integrationId: string;
  confirmed: true;
}): Promise<IncidentActionResult> {
  const ctx = await contextOr("integrations.manage");
  if (!ctx) return { ok: false, error: "forbidden", status: null, detail: null };
  const parsed = z.object({ integrationId: uuid, confirmed: z.literal(true) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid", status: null, detail: null };
  const integration = await getOrgIntegration(ctx, parsed.data.integrationId);
  if (!integration) return { ok: false, error: "not_found", status: null, detail: null };
  if (integration.status === "draft")
    return { ok: false, error: "invalid", status: integration.status, detail: null };
  if (integration.status === "paused")
    return { ok: false, error: "unchanged", status: "paused", detail: null };
  if (await fourEyesBlocks(ctx, "destination_pause"))
    return { ok: false, error: "approval_required", status: integration.status, detail: null };
  await pauseDestination(ctx, integration);
  await withOrg(ctx, (tx) =>
    recordAudit(tx, {
      organizationId: ctx.organization.id,
      actor: ctx.tenant.actor,
      action: "incident.destination_pause",
      targetType: "integration",
      targetId: integration.id,
      diff: {
        name: integration.name,
        connectorType: integration.connectorType,
        statusFrom: integration.status,
      },
      metadata: { source: "incident_mode" },
      requestId: ctx.tenant.requestId,
    }),
  );
  revalidatePath(PATH);
  revalidatePath("/app/destinations");
  return { ok: true, error: null, status: "paused", detail: null };
}

/** Resumes a paused destination after the connector's credential check (same path as the health center). */
export async function resumeDestinationIncidentAction(input: {
  integrationId: string;
  confirmed: true;
}): Promise<IncidentActionResult> {
  const ctx = await contextOr("integrations.manage");
  if (!ctx) return { ok: false, error: "forbidden", status: null, detail: null };
  const parsed = z.object({ integrationId: uuid, confirmed: z.literal(true) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid", status: null, detail: null };
  const integration = await getOrgIntegration(ctx, parsed.data.integrationId);
  if (!integration) return { ok: false, error: "not_found", status: null, detail: null };
  if (integration.status !== "paused")
    return { ok: false, error: "unchanged", status: integration.status, detail: null };
  const outcome = await runDestinationDiagnosis(ctx, integration);
  const status = await recordDestinationDiagnosis(ctx, integration, outcome, "resume");
  await withOrg(ctx, (tx) =>
    recordAudit(tx, {
      organizationId: ctx.organization.id,
      actor: ctx.tenant.actor,
      action: "incident.destination_resume",
      targetType: "integration",
      targetId: integration.id,
      diff: { name: integration.name, statusTo: status, error: outcome.error },
      metadata: { source: "incident_mode" },
      requestId: ctx.tenant.requestId,
    }),
  );
  revalidatePath(PATH);
  revalidatePath("/app/destinations");
  return {
    ok: status === "connected",
    error: status === "connected" ? null : "generic",
    status,
    detail: outcome.validation?.detail || outcome.health?.detail || outcome.error || null,
  };
}

export interface KillSwitchActionResult extends AlertActionResult {
  version: number | null;
}

/** Pauses or resumes the browser tracking of one environment by publishing a signed version with the kill switch toggled. */
export async function setEnvironmentKillSwitchAction(input: {
  environmentId: string;
  on: boolean;
  confirmed: true;
}): Promise<KillSwitchActionResult> {
  const ctx = await contextOr("kill_switch.manage");
  if (!ctx) return { ok: false, error: "forbidden", version: null };
  if (!can(ctx.role, "config.publish")) return { ok: false, error: "forbidden", version: null };
  const parsed = z
    .object({ environmentId: uuid, on: z.boolean(), confirmed: z.literal(true) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid", version: null };
  // both directions publish a production-relevant version; the Release Center treats any kill switch change as critical
  if (await fourEyesBlocks(ctx, "kill_switch"))
    return { ok: false, error: "approval_required", version: null };
  const result = await setEnvironmentKillSwitch(ctx, parsed.data.environmentId, parsed.data.on);
  if (!result.ok) return { ok: false, error: result.error, version: null };
  revalidatePath(PATH);
  revalidatePath("/app/releases");
  revalidatePath("/app");
  return { ok: true, error: null, version: result.version };
}
