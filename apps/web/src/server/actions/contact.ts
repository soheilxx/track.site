"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import { MemoryRateLimiter, sha256Hex } from "@track-site/core";
import { uaFamily } from "@track-site/events";
import { contactRequests } from "@track-site/db";
import { env } from "@/env";
import { db, logger } from "@/server/db";
import { sendMail } from "@/server/mail";
import { getSession } from "@/server/session";

export interface ContactState {
  ok: boolean;
  error: "invalid" | "rate_limited" | "generic" | null;
}

const limiter = new MemoryRateLimiter();
const schema = z.object({
  kind: z.enum(["contact", "demo", "support"]),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  company: z.string().trim().max(120).optional(),
  message: z.string().trim().min(10).max(4000),
  topic: z.string().trim().max(60).optional(),
  locale: z.enum(["en", "de"]).default("en"),
  website: z.string().max(0).optional(), // honeypot
});

/** Persists contact / demo / support requests and forwards them to the configured inbox (best effort, recorded). */
export async function submitContactAction(_prev: ContactState, formData: FormData): Promise<ContactState> {
  const parsed = schema.safeParse({ kind: formData.get("kind"), name: formData.get("name"), email: formData.get("email"), company: formData.get("company") || undefined, message: formData.get("message"), topic: formData.get("topic") || undefined, locale: formData.get("locale") || "en", website: formData.get("website") || undefined });
  if (!parsed.success) return { ok: false, error: "invalid" };
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  const ipHash = sha256Hex(`${env().AUTH_SECRET ?? "salt"}:${ip}`);
  const limit = await limiter.hit(`contact:${ipHash}`, 5, 60 * 60_000, 1);
  if (!limit.allowed) return { ok: false, error: "rate_limited" };
  const session = await getSession().catch(() => null);
  const message = parsed.data.topic ? `[${parsed.data.topic}] ${parsed.data.message}` : parsed.data.message;
  let id: string;
  try {
    const [row] = await db()
      .insert(contactRequests)
      .values({ kind: parsed.data.kind, name: parsed.data.name, email: parsed.data.email, company: parsed.data.company ?? null, message, locale: parsed.data.locale, organizationId: session?.activeOrganizationId ?? null, userId: session?.user.id ?? null, ipHash, uaFamily: uaFamily(h.get("user-agent")) })
      .returning({ id: contactRequests.id });
    id = row!.id;
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "contact.persist_failed");
    return { ok: false, error: "generic" };
  }
  const inbox = env().CONTACT_INBOX_EMAIL;
  if (inbox) {
    const result = await sendMail({ to: inbox, subject: `[Track ${parsed.data.kind}] ${parsed.data.name}${parsed.data.company ? ` (${parsed.data.company})` : ""}`, text: `${message}\n\nFrom: ${parsed.data.name} <${parsed.data.email}>\nLocale: ${parsed.data.locale}\nRequest: ${id}`, replyTo: parsed.data.email }).catch((err: unknown) => ({ ok: false, error: err instanceof Error ? err.message : String(err) }) as { ok: false; error: string });
    await db()
      .update(contactRequests)
      .set(result.ok ? { deliveredAt: new Date() } : { deliveryError: String(("error" in result && result.error) || "send failed").slice(0, 300) })
      .where(eq(contactRequests.id, id));
  }
  return { ok: true, error: null };
}
