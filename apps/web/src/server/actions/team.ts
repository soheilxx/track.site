"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ORG_ROLES, assignableRoles, type OrgRole } from "@track-site/core";
import { recordAudit } from "@track-site/db";
import { auth } from "@/server/auth";
import { requireOrgContext, withOrg } from "@/server/session";
import type { ActionState } from "./organization";

type OrgApi = {
  createInvitation: (args: { body: { email: string; role: string; organizationId: string; resend?: boolean }; headers: Headers }) => Promise<unknown>;
  cancelInvitation: (args: { body: { invitationId: string }; headers: Headers }) => Promise<unknown>;
  updateMemberRole: (args: { body: { memberId: string; role: string; organizationId: string }; headers: Headers }) => Promise<unknown>;
  removeMember: (args: { body: { memberIdOrEmail: string; organizationId: string }; headers: Headers }) => Promise<unknown>;
};

const api = () => auth().api as unknown as OrgApi;
const roleSchema = z.enum(ORG_ROLES as unknown as [OrgRole, ...OrgRole[]]);

export async function inviteMemberAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireOrgContext("members.invite");
  const parsed = z.object({ email: z.string().trim().email().max(254), role: roleSchema }).safeParse({ email: formData.get("email"), role: formData.get("role") });
  if (!parsed.success) return { ok: false, error: null, fieldErrors: { email: "email" } };
  if (!assignableRoles(ctx.role).includes(parsed.data.role)) return { ok: false, error: "forbidden" };
  try {
    await api().createInvitation({ body: { email: parsed.data.email.toLowerCase(), role: parsed.data.role, organizationId: ctx.organization.id, resend: true }, headers: await headers() });
  } catch {
    return { ok: false, error: "generic" };
  }
  await withOrg(ctx, (tx) => recordAudit(tx, { organizationId: ctx.organization.id, actor: ctx.tenant.actor, action: "member.invite", targetType: "organization", targetId: ctx.organization.id, diff: { role: parsed.data.role }, requestId: ctx.tenant.requestId }));
  revalidatePath("/app/team");
  return { ok: true, error: null };
}

export async function cancelInvitationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireOrgContext("members.invite");
  const id = String(formData.get("invitationId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "generic" };
  try {
    await api().cancelInvitation({ body: { invitationId: id }, headers: await headers() });
  } catch {
    return { ok: false, error: "generic" };
  }
  revalidatePath("/app/team");
  return { ok: true, error: null };
}

export async function updateMemberRoleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireOrgContext("members.update");
  const parsed = z.object({ memberId: z.string().uuid(), role: roleSchema }).safeParse({ memberId: formData.get("memberId"), role: formData.get("role") });
  if (!parsed.success) return { ok: false, error: "generic" };
  if (!assignableRoles(ctx.role).includes(parsed.data.role)) return { ok: false, error: "forbidden" };
  try {
    await api().updateMemberRole({ body: { memberId: parsed.data.memberId, role: parsed.data.role, organizationId: ctx.organization.id }, headers: await headers() });
  } catch {
    return { ok: false, error: "generic" };
  }
  await withOrg(ctx, (tx) => recordAudit(tx, { organizationId: ctx.organization.id, actor: ctx.tenant.actor, action: "member.role", targetType: "member", targetId: parsed.data.memberId, diff: { role: parsed.data.role }, requestId: ctx.tenant.requestId }));
  revalidatePath("/app/team");
  return { ok: true, error: null };
}

export async function removeMemberAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireOrgContext("members.remove");
  const memberId = String(formData.get("memberId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(memberId)) return { ok: false, error: "generic" };
  try {
    await api().removeMember({ body: { memberIdOrEmail: memberId, organizationId: ctx.organization.id }, headers: await headers() });
  } catch {
    return { ok: false, error: "generic" };
  }
  await withOrg(ctx, (tx) => recordAudit(tx, { organizationId: ctx.organization.id, actor: ctx.tenant.actor, action: "member.remove", targetType: "member", targetId: memberId, requestId: ctx.tenant.requestId }));
  revalidatePath("/app/team");
  return { ok: true, error: null };
}
