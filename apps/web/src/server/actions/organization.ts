"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { orgSettings } from "@track-site/db";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { getSession } from "@/server/session";

export interface ActionState {
  ok: boolean;
  error: string | null;
  fieldErrors?: Record<string, string>;
}

const schema = z.object({ name: z.string().trim().min(2).max(80) });

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${base || "org"}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Creates the organization through better-auth (creator becomes OWNER) and activates it for the session. */
export async function createOrganizationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getSession();
  if (!session) redirect("/login");
  const parsed = schema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { ok: false, error: null, fieldErrors: { name: "orgName" } };
  const domain = String(formData.get("domain") ?? "");
  const h = await headers();
  const api = auth().api as unknown as {
    createOrganization: (args: { body: { name: string; slug: string }; headers: Headers }) => Promise<{ id: string } | null>;
    setActiveOrganization: (args: { body: { organizationId: string }; headers: Headers }) => Promise<unknown>;
  };
  let org: { id: string } | null;
  try {
    org = await api.createOrganization({ body: { name: parsed.data.name, slug: slugify(parsed.data.name) }, headers: h });
  } catch {
    return { ok: false, error: "generic" };
  }
  if (!org) return { ok: false, error: "generic" };
  await db().insert(orgSettings).values({ organizationId: org.id, locale: session.user.locale }).onConflictDoNothing();
  try {
    await api.setActiveOrganization({ body: { organizationId: org.id }, headers: h });
  } catch {
    /* falls back to first membership */
  }
  redirect(`/app/onboarding${domain ? `?domain=${encodeURIComponent(domain)}` : ""}`);
}
