import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { MemoryRateLimiter, sha256Hex } from "@track-site/core";
import { knowledgeFeedback } from "@track-site/db";
import { env } from "@/env";
import { isLocale } from "@/i18n/routing";
import { getArticleByGroup } from "@/lib/knowledge";
import { db, logger } from "@/server/db";

export const dynamic = "force-dynamic";

/**
 * "Was this article helpful?" votes from Tracking Knowledge articles (supplement §6). Stores exactly
 * { translationGroupId, locale, helpful, createdAt } in `knowledge_feedback` — no PII, no session,
 * no tenant. Abuse guard: a coarse in-memory limit per client address and hour; the address is
 * hashed with the auth secret for the bucket key and never stored. The response never carries
 * totals, so nothing invented can be displayed.
 */
const VOTES_PER_HOUR = 30;
const limiter = new MemoryRateLimiter();

const schema = z.object({
  translationGroupId: z.string().regex(/^[a-z0-9-]{3,120}$/),
  locale: z.string().refine(isLocale),
  helpful: z.boolean(),
});

function json(body: Record<string, unknown>, status: number, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store", ...headers } });
}

export async function POST(req: NextRequest) {
  // the form lives on the article page: cross-site posts are refused before anything is parsed
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "same-site" && site !== "none") return json({ ok: false, code: "FORBIDDEN" }, 403);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ ok: false, code: "INVALID" }, 400);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  const decision = await limiter.hit(`knowledge-feedback:${sha256Hex(`${env().AUTH_SECRET ?? "salt"}:${ip}`)}`, VOTES_PER_HOUR, 60 * 60_000);
  if (!decision.allowed) return json({ ok: false, code: "RATE_LIMITED" }, 429, { "retry-after": String(Math.max(1, Math.ceil((decision.resetAt - Date.now()) / 1000))) });

  const { translationGroupId, locale, helpful } = parsed.data;
  const article = await getArticleByGroup(locale, translationGroupId);
  if (!article || article.status !== "published") return json({ ok: false, code: "NOT_FOUND" }, 404);

  try {
    await db().insert(knowledgeFeedback).values({ translationGroupId, locale, helpful });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "knowledge.feedback_persist_failed");
    return json({ ok: false, code: "UNAVAILABLE" }, 503);
  }
  return json({ ok: true }, 200);
}
