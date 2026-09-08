"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { SUPPORT_MACRO_SCOPES, supportMacros, type SupportMacroScope } from "@track-site/db";
import { PlatformAccessError, auditPlatform, requirePlatform, withPlatform, type PlatformContext } from "@/server/ops/platform";
import {
  MACRO_BODY_MAX,
  MACRO_CATEGORY_MAX,
  MACRO_NAME_MAX,
  agentOf,
  canCreateScope,
  canManageMacro,
  getMacroRow,
  macroActionsFromForm,
  macroAuditDiff,
  type MacroAuditFields,
} from "@/server/support/macros";

/**
 * Support desk → macro mutations (docs/18 §1 binding rules). Every action resolves the operator with
 * `requirePlatform("PLATFORM_SUPPORT", "platform.macros.manage")`, validates with zod, runs as
 * `tracksite_ops` and writes its `auditPlatform` entry (target `support_macro`, no organisation) in the same
 * transaction. Scope rule: global macros are created, edited and deleted by PLATFORM_ADMIN only; a personal
 * macro only by its owner — another operator's personal macro is answered `not_found` (it is invisible to
 * them). The audit diff lists field changes and the body length, never the body.
 */

export type SupportMacroError = "forbidden" | "invalid" | "not_found" | "scope_forbidden" | "confirmation_required" | "unchanged" | "generic";
export type SupportMacroNotice = "created" | "updated" | "deleted";

export interface SupportMacroActionState {
  ok: boolean;
  error: SupportMacroError | null;
  notice: SupportMacroNotice | null;
  fieldErrors?: Record<string, string>;
  /** id of the affected macro */
  id?: string;
}

const LIST_PATH = "/ops/support/macros";
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

const fail = (error: SupportMacroError, fieldErrors?: Record<string, string>): SupportMacroActionState => ({ ok: false, error, notice: null, ...(fieldErrors ? { fieldErrors } : {}) });
const done = (notice: SupportMacroNotice, id: string): SupportMacroActionState => ({ ok: true, error: null, notice, id });

async function operator(): Promise<PlatformContext | null> {
  try {
    return await requirePlatform("PLATFORM_SUPPORT", "platform.macros.manage");
  } catch (e) {
    if (e instanceof PlatformAccessError) return null;
    throw e;
  }
}

const str = (formData: FormData, name: string): string => {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
};

function revalidate(macroId?: string): void {
  revalidatePath(LIST_PATH);
  if (macroId) revalidatePath(`${LIST_PATH}/${macroId}`);
  // the ticket detail offers the macros in its reply editor
  revalidatePath("/ops/support", "layout");
}

const formSchema = z.object({
  macroId: uuid.optional(),
  name: z.string().trim().min(1).max(MACRO_NAME_MAX),
  category: z.string().trim().max(MACRO_CATEGORY_MAX),
  bodyText: z
    .string()
    .transform((s) => s.replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").trim())
    .pipe(z.string().min(1).max(MACRO_BODY_MAX)),
  scope: z.enum(SUPPORT_MACRO_SCOPES),
});

/**
 * Creates a macro (no `macroId`) or updates one. Fields: `name`, `category` (empty = none), `bodyText`
 * (placeholders stay as written), `scope`, and the actions `actionStatus`, `actionPriority`, `tagsAdd`,
 * `tagsRemove`, `assignToSelf`. Changing the scope moves the owner accordingly (personal → the acting
 * operator, global → none).
 */
export async function saveMacroAction(_prev: SupportMacroActionState, formData: FormData): Promise<SupportMacroActionState> {
  const ctx = await operator();
  if (!ctx) return fail("forbidden");
  const agent = agentOf(ctx);
  const parsed = formSchema.safeParse({
    macroId: str(formData, "macroId") || undefined,
    name: str(formData, "name"),
    category: str(formData, "category"),
    bodyText: str(formData, "bodyText"),
    scope: str(formData, "scope") || "personal",
  });
  const fieldErrors: Record<string, string> = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "form");
      fieldErrors[field] = issue.code === "too_big" ? "too_long" : issue.code === "too_small" ? "required" : "invalid";
    }
  }
  const { actions, errors: actionErrors } = macroActionsFromForm((name) => str(formData, name), (name) => str(formData, name) === "on");
  Object.assign(fieldErrors, actionErrors);
  if (!parsed.success || Object.keys(fieldErrors).length) return fail("invalid", fieldErrors);
  const { macroId, name, bodyText } = parsed.data;
  const scope: SupportMacroScope = parsed.data.scope;
  const category = parsed.data.category || null;
  if (!canCreateScope(agent, scope)) return fail("scope_forbidden", { scope: "scope" });
  const ownerUserId = scope === "personal" ? agent.id : null;
  const after: MacroAuditFields = { name, category, scope, ownerUserId, bodyText, actions };

  const result = await withPlatform(ctx, async (tx): Promise<SupportMacroActionState> => {
    if (!macroId) {
      const [row] = await tx.insert(supportMacros).values({ name, category, bodyText, actions, scope, ownerUserId }).returning({ id: supportMacros.id });
      const id = row?.id ?? "";
      await auditPlatform(ctx, { action: "platform.support_macro.create", targetType: "support_macro", targetId: id, diff: macroAuditDiff(null, after) }, tx);
      return done("created", id);
    }
    const row = await getMacroRow(tx, macroId);
    if (!row) return fail("not_found");
    if (!canManageMacro(agent, row)) return row.scope === "global" ? fail("scope_forbidden") : fail("not_found");
    const before: MacroAuditFields = { name: row.name, category: row.category ?? null, scope: row.scope, ownerUserId: row.ownerUserId ?? null, bodyText: row.bodyText, actions: row.actions ?? {} };
    const diff = macroAuditDiff(before, after);
    if (!Object.keys(diff).length) return fail("unchanged");
    await tx.update(supportMacros).set({ name, category, bodyText, actions, scope, ownerUserId }).where(eq(supportMacros.id, row.id));
    await auditPlatform(ctx, { action: "platform.support_macro.update", targetType: "support_macro", targetId: row.id, diff }, tx);
    return done("updated", row.id);
  });
  if (result.ok) revalidate(result.id);
  return result;
}

/** Deletes a macro after the confirmation dialog (`confirmed: true`); messages that used it keep a null `macro_id`. */
export async function deleteMacroAction(input: { macroId: string; confirmed: boolean }): Promise<SupportMacroActionState> {
  const ctx = await operator();
  if (!ctx) return fail("forbidden");
  const agent = agentOf(ctx);
  const parsed = z.object({ macroId: uuid, confirmed: z.boolean() }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  if (parsed.data.confirmed !== true) return fail("confirmation_required");
  const result = await withPlatform(ctx, async (tx): Promise<SupportMacroActionState> => {
    const row = await getMacroRow(tx, parsed.data.macroId);
    if (!row) return fail("not_found");
    if (!canManageMacro(agent, row)) return row.scope === "global" ? fail("scope_forbidden") : fail("not_found");
    await tx.delete(supportMacros).where(eq(supportMacros.id, row.id));
    await auditPlatform(
      ctx,
      {
        action: "platform.support_macro.delete",
        targetType: "support_macro",
        targetId: row.id,
        diff: { name: row.name, category: row.category ?? null, scope: row.scope, ownerUserId: row.ownerUserId ?? null, usageCount: row.usageCount, bodyLength: row.bodyText.length },
      },
      tx,
    );
    return done("deleted", row.id);
  });
  if (result.ok) revalidate(result.id);
  return result;
}
