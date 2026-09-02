import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { MemoryRateLimiter } from "@track-site/core";
import { getOrgContext } from "@/server/session";
import { getOrCreateChatSession, listMessages } from "@/server/ai/chat-store";
import { aiConfigured, siteBelongsToOrg } from "@/server/ai/context";
import { runChatTurn } from "@/server/ai/turn";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const limiter = new MemoryRateLimiter();
const bodySchema = z.object({ siteId: z.string().uuid(), message: z.string().min(1).max(4_000) });

function sameOrigin(req: NextRequest): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  return !origin || !host || origin.endsWith(host);
}

/** GET: chat history for a site. POST: one assistant turn streamed as SSE (assistant.progress, tool.*, ui.*, error). */
export async function GET(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 });
  const siteId = req.nextUrl.searchParams.get("siteId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(siteId) || !(await siteBelongsToOrg(ctx.organization.id, siteId))) return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
  const session = await getOrCreateChatSession(ctx.organization.id, siteId, ctx.user.id, ctx.user.locale);
  const messages = await listMessages(ctx.organization.id, session.id);
  return NextResponse.json({ ok: true, sessionId: session.id, aiEnabled: aiConfigured(), messages }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 });
  if (!sameOrigin(req)) return NextResponse.json({ ok: false, code: "FORBIDDEN" }, { status: 403 });
  if (!aiConfigured()) return NextResponse.json({ ok: false, code: "NOT_CONNECTED", message: "AI assistant is not configured; use the guided form." }, { status: 424 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, code: "VALIDATION_ERROR" }, { status: 400 });
  if (!(await siteBelongsToOrg(ctx.organization.id, parsed.data.siteId))) return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
  const limit = await limiter.hit(`ai:${ctx.organization.id}`, 60, 60 * 60_000);
  if (!limit.allowed) return NextResponse.json({ ok: false, code: "RATE_LIMITED" }, { status: 429, headers: { "retry-after": "60" } });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      const keepAlive = setInterval(() => controller.enqueue(encoder.encode(": keep-alive\n\n")), 10_000);
      try {
        await runChatTurn(ctx, parsed.data.siteId, parsed.data.message, (e) => send(e.type, e));
      } catch (e) {
        send("error", { type: "error", code: "INTERNAL_ERROR", message: "The assistant failed unexpectedly.", retryable: true });
        console.error("chat turn failed", e instanceof Error ? e.message : e);
      } finally {
        clearInterval(keepAlive);
        send("done", { type: "done" });
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", connection: "keep-alive", "x-accel-buffering": "no" } });
}
