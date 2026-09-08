"use server";

import { and, count, eq, inArray, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PLAN_IDS } from "@track-site/catalog";
import { supportSlaPolicies, supportTickets, user } from "@track-site/db";
import { SLA_CLOCKS, SLA_PATHS, SLA_WEEKDAYS } from "@/components/ops/support/sla/constants";
import { PlatformAccessError, auditPlatform, requirePlatform, withPlatform, type PlatformContext } from "@/server/ops/platform";
import { parseSlaPolicyInput, type SlaPolicyRawInput, type SlaPolicyValues } from "@/server/support/sla";

/**
 * SLA policy actions (docs/18 §"SLA engine"): every action requires PLATFORM_ADMIN with
 * `platform.sla.manage` (two-factor step-up through `requirePlatform`), validates the input with zod
 * and the engine's `parseSlaPolicyInput`, runs as `tracksite_ops`, writes its `auditPlatform` entry in
 * the same transaction (target type `support_sla_policy`, diff = changed settings only — ids and
 * values, never ticket contents) and revalidates the editor. Deleting and changing the default are
 * confirmed in the UI and re-checked here (`confirmed: true`).
 */
export type SupportSlaError = "forbidden" | "invalid" | "not_found" | "unchanged" | "in_use" | "is_default" | "default_required" | "plan_taken" | "generic";
export type SupportSlaNotice = "created" | "updated" | "deleted" | "defaultSet";

export interface SupportSlaActionState {
  ok: boolean;
  error: SupportSlaError | null;
  notice: SupportSlaNotice | null;
  fieldErrors?: Record<string, string>;
  /** id of the affected policy */
  id?: string;
  /** tickets referencing the policy (for `in_use`) */
  count?: number;
}

const fail = (error: SupportSlaError, extra: Partial<SupportSlaActionState> = {}): SupportSlaActionState => ({ ok: false, error, notice: null, ...extra });
const done = (notice: SupportSlaNotice, id: string): SupportSlaActionState => ({ ok: true, error: null, notice, id });

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
const list = (formData: FormData, name: string): string[] => formData.getAll(name).filter((v): v is string => typeof v === "string");

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const PRIORITIES = ["urgent", "high", "normal", "low"] as const;

function revalidateSla(id?: string | null): void {
  revalidatePath(SLA_PATHS.settings);
  revalidatePath(SLA_PATHS.list);
  revalidatePath(SLA_PATHS.create);
  if (id) revalidatePath(SLA_PATHS.edit(id));
}

/** The editor's field names → the engine's raw input (strings as submitted). */
function readPolicyForm(formData: FormData): SlaPolicyRawInput {
  const targets: SlaPolicyRawInput["targets"] = {};
  for (const priority of PRIORITIES) {
    targets[priority] = {};
    for (const clock of SLA_CLOCKS) targets[priority]![clock] = { value: str(formData, `target_${priority}_${clock}`), unit: str(formData, `unit_${priority}_${clock}`) };
  }
  const days: SlaPolicyRawInput["days"] = {};
  for (const day of SLA_WEEKDAYS) days[day] = { enabled: str(formData, `day_${day}`) === "on", start: str(formData, `start_${day}`), end: str(formData, `end_${day}`) };
  return {
    name: str(formData, "name"),
    description: str(formData, "description"),
    planIds: list(formData, "planIds"),
    isDefault: str(formData, "isDefault") === "on",
    targets,
    timezone: str(formData, "timezone"),
    days,
    warningPercent: str(formData, "warningPercent"),
    escalateToAdmins: str(formData, "escalateToAdmins") === "on",
    notifyUserIds: list(formData, "notifyUserIds"),
    autoCloseDays: str(formData, "autoCloseDays"),
  };
}

type PolicyRow = typeof supportSlaPolicies.$inferSelect;

const stable = (value: unknown): string => JSON.stringify(value, (_k, v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : v));

/** Changed settings as `{ field: { before, after } }` (ids and values only). */
function policyDiff(before: PolicyRow, after: SlaPolicyValues): Record<string, { before: unknown; after: unknown }> {
  const diff: Record<string, { before: unknown; after: unknown }> = {};
  const fields: Array<[string, unknown, unknown]> = [
    ["name", before.name, after.name],
    ["description", before.description, after.description],
    ["planIds", before.planIds, after.planIds],
    ["isDefault", before.isDefault, after.isDefault],
    ["priorities", before.priorities, after.priorities],
    ["businessHours", before.businessHours, after.businessHours],
    ["escalation", before.escalation, after.escalation],
  ];
  for (const [field, b, a] of fields) if (stable(b) !== stable(a)) diff[field] = { before: b, after: a };
  return diff;
}

/**
 * Creates or updates a policy (hidden `id` field = update). Plan ids must be catalogue plans and free
 * (one policy per plan), named recipients must be platform operators, the default policy can only be
 * replaced by making another one the default (never switched off), and making a policy the default
 * clears the flag on the previous one in the same transaction (partial unique index).
 */
export async function saveSlaPolicyAction(_prev: SupportSlaActionState, formData: FormData): Promise<SupportSlaActionState> {
  const ctx = await admin();
  if (!ctx) return fail("forbidden");
  const idParsed = z.union([uuid, z.literal("")]).safeParse(str(formData, "id"));
  if (!idParsed.success) return fail("invalid");
  const id = idParsed.data || null;
  const parsed = parseSlaPolicyInput(readPolicyForm(formData));
  if (!parsed.ok) return fail("invalid", { fieldErrors: parsed.fieldErrors });
  const value = parsed.value;
  if (value.planIds?.some((p) => !(PLAN_IDS as readonly string[]).includes(p))) return fail("invalid", { fieldErrors: { planIds: "invalid" } });
  const recipientIds = value.escalation.notify_user_ids ?? [];

  const result = await withPlatform(ctx, async (tx): Promise<SupportSlaActionState> => {
    if (recipientIds.length) {
      const operators = await tx
        .select({ id: user.id })
        .from(user)
        .where(and(inArray(user.id, recipientIds), ne(user.platformRole, "NONE")));
      if (operators.length !== recipientIds.length) return fail("invalid", { fieldErrors: { notifyUserIds: "not_found" } });
    }
    const others = await tx
      .select({ id: supportSlaPolicies.id, name: supportSlaPolicies.name, planIds: supportSlaPolicies.planIds, isDefault: supportSlaPolicies.isDefault })
      .from(supportSlaPolicies)
      .where(id ? ne(supportSlaPolicies.id, id) : sql`true`);
    if (value.planIds) {
      const taken = others.find((o) => o.planIds?.some((p) => value.planIds!.includes(p)));
      if (taken) return fail("plan_taken", { fieldErrors: { planIds: "plan_taken" } });
    }
    // the row is checked before the previous default loses its flag: a returned failure commits the
    // transaction, so an unknown id or a switched-off default must never leave the desk without a default
    const existing = id ? (await tx.select().from(supportSlaPolicies).where(eq(supportSlaPolicies.id, id)).limit(1).for("update"))[0] : undefined;
    if (id && !existing) return fail("not_found");
    if (existing?.isDefault && !value.isDefault) return fail("default_required", { fieldErrors: { isDefault: "default_required" } });
    let previousDefaultId: string | null = null;
    if (value.isDefault) {
      previousDefaultId = others.find((o) => o.isDefault)?.id ?? null;
      if (previousDefaultId) await tx.update(supportSlaPolicies).set({ isDefault: false, updatedAt: sql`now()` }).where(eq(supportSlaPolicies.id, previousDefaultId));
    }
    if (!id || !existing) {
      const [row] = await tx
        .insert(supportSlaPolicies)
        .values({ name: value.name, description: value.description, planIds: value.planIds, isDefault: value.isDefault, priorities: value.priorities, businessHours: value.businessHours, escalation: value.escalation })
        .returning({ id: supportSlaPolicies.id });
      if (!row) return fail("generic");
      await auditPlatform(ctx, { action: "platform.support.sla_policy.create", targetType: "support_sla_policy", targetId: row.id, diff: { after: value }, metadata: previousDefaultId ? { previousDefaultId } : undefined }, tx);
      return done("created", row.id);
    }
    const diff = policyDiff(existing, value);
    if (!Object.keys(diff).length) return fail("unchanged", { id });
    await tx
      .update(supportSlaPolicies)
      .set({ name: value.name, description: value.description, planIds: value.planIds, isDefault: value.isDefault, priorities: value.priorities, businessHours: value.businessHours, escalation: value.escalation, updatedAt: sql`now()` })
      .where(eq(supportSlaPolicies.id, id));
    await auditPlatform(ctx, { action: "platform.support.sla_policy.update", targetType: "support_sla_policy", targetId: id, diff, metadata: previousDefaultId ? { previousDefaultId } : undefined }, tx);
    return done("updated", id);
  });
  if (result.ok) revalidateSla(result.id);
  return result;
}

/** Makes a policy the default (the previous default loses the flag in the same transaction); confirmed in the UI. */
export async function setDefaultSlaPolicyAction(input: { id: string; confirmed: true }): Promise<SupportSlaActionState> {
  const ctx = await admin();
  if (!ctx) return fail("forbidden");
  const parsed = z.object({ id: uuid, confirmed: z.literal(true) }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  const result = await withPlatform(ctx, async (tx): Promise<SupportSlaActionState> => {
    const [row] = await tx.select({ id: supportSlaPolicies.id, name: supportSlaPolicies.name, isDefault: supportSlaPolicies.isDefault }).from(supportSlaPolicies).where(eq(supportSlaPolicies.id, parsed.data.id)).limit(1).for("update");
    if (!row) return fail("not_found");
    if (row.isDefault) return fail("unchanged", { id: row.id });
    const [previous] = await tx.select({ id: supportSlaPolicies.id }).from(supportSlaPolicies).where(eq(supportSlaPolicies.isDefault, true)).limit(1);
    if (previous) await tx.update(supportSlaPolicies).set({ isDefault: false, updatedAt: sql`now()` }).where(eq(supportSlaPolicies.id, previous.id));
    await tx.update(supportSlaPolicies).set({ isDefault: true, updatedAt: sql`now()` }).where(eq(supportSlaPolicies.id, row.id));
    await auditPlatform(ctx, { action: "platform.support.sla_policy.set_default", targetType: "support_sla_policy", targetId: row.id, diff: { isDefault: { before: false, after: true }, previousDefaultId: previous?.id ?? null } }, tx);
    return done("defaultSet", row.id);
  });
  if (result.ok) revalidateSla(result.id);
  return result;
}

/** Deletes a policy that is neither the default nor referenced by a ticket; confirmed in the UI. */
export async function deleteSlaPolicyAction(input: { id: string; confirmed: true }): Promise<SupportSlaActionState> {
  const ctx = await admin();
  if (!ctx) return fail("forbidden");
  const parsed = z.object({ id: uuid, confirmed: z.literal(true) }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  const result = await withPlatform(ctx, async (tx): Promise<SupportSlaActionState> => {
    const [row] = await tx.select().from(supportSlaPolicies).where(eq(supportSlaPolicies.id, parsed.data.id)).limit(1).for("update");
    if (!row) return fail("not_found");
    if (row.isDefault) return fail("is_default", { id: row.id });
    const [usage] = await tx.select({ count: count() }).from(supportTickets).where(eq(supportTickets.slaPolicyId, row.id));
    const tickets = Number(usage?.count ?? 0);
    if (tickets > 0) return fail("in_use", { id: row.id, count: tickets });
    await tx.delete(supportSlaPolicies).where(eq(supportSlaPolicies.id, row.id));
    await auditPlatform(ctx, { action: "platform.support.sla_policy.delete", targetType: "support_sla_policy", targetId: row.id, diff: { before: { name: row.name, planIds: row.planIds, priorities: row.priorities, businessHours: row.businessHours, escalation: row.escalation } } }, tx);
    return done("deleted", row.id);
  });
  if (result.ok) revalidateSla(result.id);
  return result;
}
