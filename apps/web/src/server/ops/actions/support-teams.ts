"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supportTeamMembers, supportTeams, user, type SupportTeamRole } from "@track-site/db";
import { PlatformAccessError, auditPlatform, requirePlatform, withPlatform, type PlatformContext } from "@/server/ops/platform";
import { TEAM_DESCRIPTION_MAX, TEAM_NAME_MAX, TEAM_ROLES, TEAM_SLUG_MAX, auditFieldsOf, getTeamBySlug, getTeamRow, resolveTeamSlug, teamAuditDiff } from "@/server/support/teams";

/**
 * Support desk → team management (docs/18 §"Agent-created tickets and teams", task N; `/ops/support/settings/teams`).
 * Admin-only like every desk setting (`requirePlatform("PLATFORM_ADMIN", "platform.sla.manage")`), zod-validated,
 * runs as `tracksite_ops` and writes one `auditPlatform` entry per change (target `support_team`, no
 * organisation; diffs carry ids and field values only). Rules: the default team can be neither archived nor
 * un-defaulted (only replaced), a slug is unique and immutable after creation, a member must hold a platform
 * role, and archiving needs the dialog's confirmation.
 */

export type SupportTeamError = "forbidden" | "invalid" | "not_found" | "slug_taken" | "invalid_state" | "invalid_member" | "confirmation_required" | "unchanged" | "generic";
export type SupportTeamNotice = "created" | "updated" | "archived" | "restored" | "defaultSet" | "memberAdded" | "memberUpdated" | "memberRemoved";

export interface SupportTeamActionState {
  ok: boolean;
  error: SupportTeamError | null;
  notice: SupportTeamNotice | null;
  fieldErrors?: Record<string, string>;
  /** id of the affected team */
  id?: string;
}

const PATH = "/ops/support/settings/teams";
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const OPERATOR_ROLES = ["PLATFORM_SUPPORT", "PLATFORM_ADMIN"];

const fail = (error: SupportTeamError, fieldErrors?: Record<string, string>): SupportTeamActionState => ({ ok: false, error, notice: null, ...(fieldErrors ? { fieldErrors } : {}) });
const done = (notice: SupportTeamNotice, id: string): SupportTeamActionState => ({ ok: true, error: null, notice, id });

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

function revalidate(teamId?: string): void {
  revalidatePath(PATH);
  if (teamId) revalidatePath(`${PATH}/${teamId}`);
  // the queue's team chips and filter, the new-ticket picker and the operators' badges read the teams
  revalidatePath("/ops/support");
  revalidatePath("/ops/support/new");
  revalidatePath("/ops/users");
}

const formSchema = z.object({
  teamId: uuid.optional(),
  name: z.string().trim().min(1).max(TEAM_NAME_MAX),
  slug: z.string().trim().toLowerCase().max(TEAM_SLUG_MAX),
  description: z
    .string()
    .transform((s) => s.replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").trim())
    .pipe(z.string().max(TEAM_DESCRIPTION_MAX)),
});

/**
 * Creates a team (no `teamId`; the slug is taken from the form or derived from the name) or renames one
 * (`name`, `description` — the slug never changes, it is the filter key of saved links).
 */
export async function saveTeamAction(_prev: SupportTeamActionState, formData: FormData): Promise<SupportTeamActionState> {
  const ctx = await admin();
  if (!ctx) return fail("forbidden");
  const parsed = formSchema.safeParse({ teamId: str(formData, "teamId") || undefined, name: str(formData, "name"), slug: str(formData, "slug"), description: str(formData, "description") });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "form");
      fieldErrors[field] = issue.code === "too_big" ? "too_long" : issue.code === "too_small" ? "required" : "invalid";
    }
    return fail("invalid", fieldErrors);
  }
  const { teamId, name, description } = parsed.data;
  const result = await withPlatform(ctx, async (tx): Promise<SupportTeamActionState> => {
    if (!teamId) {
      const slug = resolveTeamSlug(name, parsed.data.slug);
      if (!slug) return fail("invalid", { slug: "slug" });
      if (await getTeamBySlug(tx, slug)) return fail("slug_taken", { slug: "slug_taken" });
      const [row] = await tx.insert(supportTeams).values({ slug, name, description, isDefault: false }).returning();
      const after = auditFieldsOf(row!);
      await auditPlatform(ctx, { action: "platform.support_team.create", targetType: "support_team", targetId: row!.id, diff: teamAuditDiff(null, after) }, tx);
      return done("created", row!.id);
    }
    const row = await getTeamRow(tx, teamId);
    if (!row) return fail("not_found");
    const before = auditFieldsOf(row);
    const after = { ...before, name, description };
    const diff = teamAuditDiff(before, after);
    if (!Object.keys(diff).length) return fail("unchanged");
    await tx.update(supportTeams).set({ name, description }).where(eq(supportTeams.id, row.id));
    await auditPlatform(ctx, { action: "platform.support_team.update", targetType: "support_team", targetId: row.id, diff }, tx);
    return done("updated", row.id);
  });
  if (result.ok) revalidate(result.id);
  return result;
}

/**
 * Archives a team (after the dialog's `confirmed: true`) or restores it (`archived: false`, no confirmation).
 * The default team cannot be archived (`invalid_state`); an archived team keeps its tickets and members.
 */
export async function archiveTeamAction(input: { teamId: string; archived: boolean; confirmed?: boolean }): Promise<SupportTeamActionState> {
  const ctx = await admin();
  if (!ctx) return fail("forbidden");
  const parsed = z.object({ teamId: uuid, archived: z.boolean(), confirmed: z.boolean().optional() }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  if (parsed.data.archived && parsed.data.confirmed !== true) return fail("confirmation_required");
  const result = await withPlatform(ctx, async (tx): Promise<SupportTeamActionState> => {
    const row = await getTeamRow(tx, parsed.data.teamId);
    if (!row) return fail("not_found");
    if (parsed.data.archived && row.isDefault) return fail("invalid_state");
    if (parsed.data.archived === (row.archivedAt != null)) return fail("unchanged");
    const now = new Date();
    await tx
      .update(supportTeams)
      .set({ archivedAt: parsed.data.archived ? now : null })
      .where(eq(supportTeams.id, row.id));
    const before = auditFieldsOf(row);
    await auditPlatform(
      ctx,
      {
        action: parsed.data.archived ? "platform.support_team.archive" : "platform.support_team.restore",
        targetType: "support_team",
        targetId: row.id,
        diff: teamAuditDiff(before, { ...before, archivedAt: parsed.data.archived ? now.toISOString() : null }),
      },
      tx,
    );
    return done(parsed.data.archived ? "archived" : "restored", row.id);
  });
  if (result.ok) revalidate(result.id);
  return result;
}

/** Makes a team the default (the previous default loses the flag in the same transaction); an archived team is refused. */
export async function setDefaultTeamAction(input: { teamId: string }): Promise<SupportTeamActionState> {
  const ctx = await admin();
  if (!ctx) return fail("forbidden");
  const parsed = z.object({ teamId: uuid }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  const result = await withPlatform(ctx, async (tx): Promise<SupportTeamActionState> => {
    const row = await getTeamRow(tx, parsed.data.teamId);
    if (!row) return fail("not_found");
    if (row.isDefault) return fail("unchanged");
    if (row.archivedAt) return fail("invalid_state");
    const [previous] = await tx.select({ id: supportTeams.id, slug: supportTeams.slug }).from(supportTeams).where(eq(supportTeams.isDefault, true)).limit(1);
    // the partial unique index allows one default: clear the old flag before setting the new one
    if (previous) await tx.update(supportTeams).set({ isDefault: false }).where(eq(supportTeams.id, previous.id));
    await tx.update(supportTeams).set({ isDefault: true }).where(eq(supportTeams.id, row.id));
    await auditPlatform(ctx, { action: "platform.support_team.set_default", targetType: "support_team", targetId: row.id, diff: { isDefault: { before: false, after: true }, previousDefaultTeamId: previous?.id ?? null, previousDefaultSlug: previous?.slug ?? null } }, tx);
    return done("defaultSet", row.id);
  });
  if (result.ok) revalidate(result.id);
  return result;
}

/** Adds an operator to a team, or changes their role (`member` | `lead`); the account must hold a platform role. */
export async function addTeamMemberAction(input: { teamId: string; userId: string; role?: SupportTeamRole }): Promise<SupportTeamActionState> {
  const ctx = await admin();
  if (!ctx) return fail("forbidden");
  const parsed = z.object({ teamId: uuid, userId: uuid, role: z.enum(TEAM_ROLES).default("member") }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  const { teamId, userId, role } = parsed.data;
  const result = await withPlatform(ctx, async (tx): Promise<SupportTeamActionState> => {
    const row = await getTeamRow(tx, teamId);
    if (!row) return fail("not_found");
    const [account] = await tx.select({ id: user.id, platformRole: user.platformRole }).from(user).where(eq(user.id, userId)).limit(1);
    if (!account || !OPERATOR_ROLES.includes(account.platformRole)) return fail("invalid_member");
    const [existing] = await tx.select({ role: supportTeamMembers.role }).from(supportTeamMembers).where(and(eq(supportTeamMembers.teamId, teamId), eq(supportTeamMembers.userId, userId))).limit(1);
    if (existing && existing.role === role) return fail("unchanged");
    if (existing) {
      await tx.update(supportTeamMembers).set({ role }).where(and(eq(supportTeamMembers.teamId, teamId), eq(supportTeamMembers.userId, userId)));
      await auditPlatform(ctx, { action: "platform.support_team.member_update", targetType: "support_team", targetId: teamId, diff: { userId, role: { before: existing.role, after: role } } }, tx);
      return done("memberUpdated", teamId);
    }
    await tx.insert(supportTeamMembers).values({ teamId, userId, role });
    await auditPlatform(ctx, { action: "platform.support_team.member_add", targetType: "support_team", targetId: teamId, diff: { userId, role } }, tx);
    return done("memberAdded", teamId);
  });
  if (result.ok) revalidate(result.id);
  return result;
}

/** Removes an operator from a team; their tickets keep the team. */
export async function removeTeamMemberAction(input: { teamId: string; userId: string }): Promise<SupportTeamActionState> {
  const ctx = await admin();
  if (!ctx) return fail("forbidden");
  const parsed = z.object({ teamId: uuid, userId: uuid }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  const { teamId, userId } = parsed.data;
  const result = await withPlatform(ctx, async (tx): Promise<SupportTeamActionState> => {
    const row = await getTeamRow(tx, teamId);
    if (!row) return fail("not_found");
    const removed = await tx
      .delete(supportTeamMembers)
      .where(and(eq(supportTeamMembers.teamId, teamId), eq(supportTeamMembers.userId, userId)))
      .returning({ role: supportTeamMembers.role });
    if (!removed.length) return fail("unchanged");
    await auditPlatform(ctx, { action: "platform.support_team.member_remove", targetType: "support_team", targetId: teamId, diff: { userId, role: removed[0]!.role } }, tx);
    return done("memberRemoved", teamId);
  });
  if (result.ok) revalidate(result.id);
  return result;
}
