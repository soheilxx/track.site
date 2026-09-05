import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { MemoryRateLimiter } from "@track-site/core";
import { TurnRegistry, createUiEventFilter, type UiEvent } from "@track-site/ai";
import { getOrgContext } from "@/server/session";
import { getOrCreateChatSession, listMessages } from "@/server/ai/chat-store";
import { aiConfigured, siteBelongsToOrg } from "@/server/ai/context";
import { logger } from "@/server/db";
import { runChatTurn } from "@/server/ai/turn";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const limiter = new MemoryRateLimiter();
/**
 * Turns keyed by tenant, user, site and the client's turn id (idempotency key). A request that
 * repeats a known turn id attaches to the running/finished turn from `afterSeq` instead of
 * running the model and the tools again (supplement §9 "reconnectbarer Stream ohne doppelte
 * Toolausführung"). The registry is per process; a resume that lands on another instance starts
 * from an unknown key and ends immediately, so the client falls back to sending the message again.
 */
const turns = new TurnRegistry<UiEvent>();
const bodySchema = z.object({ siteId: z.string().uuid(), message: z.string().min(1).max(4_000), turnId: z.string().uuid().optional(), afterSeq: z.number().int().min(0).max(1_000_000).optional() });

function sameOrigin(req: NextRequest): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  return !origin || !host || origin.endsWith(host);
}

/** GET: chat history for a site. */
export async function GET(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 });
  const siteId = req.nextUrl.searchParams.get("siteId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(siteId) || !(await siteBelongsToOrg(ctx.organization.id, siteId))) return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
  const session = await getOrCreateChatSession(ctx.organization.id, siteId, ctx.user.id, ctx.user.locale);
  const messages = await listMessages(ctx.organization.id, session.id);
  return NextResponse.json({ ok: true, sessionId: session.id, aiEnabled: aiConfigured(), messages }, { headers: { "cache-control": "no-store" } });
}

/**
 * POST: one assistant turn streamed as SSE. Only the allow-listed browser contract leaves this
 * route (`createUiEventFilter`): activity.*, assistant.message, ui.card, approval.required,
 * job.progress, ui.final, error, done. Internal agent events (progress phases, raw tool arguments,
 * summaries, provider items) are mapped or dropped server-side; the drop counter is logged by kind.
 * Frames carry `id: <seq>` so a client can resume the same turn with `turnId` + `afterSeq`.
 */
export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 });
  if (!sameOrigin(req)) return NextResponse.json({ ok: false, code: "FORBIDDEN" }, { status: 403 });
  // provider not configured: the rule-based wizard (/api/ai/wizard) stays available
  if (!aiConfigured()) return NextResponse.json({ ok: false, code: "NOT_CONNECTED", message: "AI assistant is not configured; use the guided form." }, { status: 424 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, code: "VALIDATION_ERROR" }, { status: 400 });
  if (!(await siteBelongsToOrg(ctx.organization.id, parsed.data.siteId))) return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });

  const { siteId, message } = parsed.data;
  const turnId = parsed.data.turnId ?? randomUUID();
  const afterSeq = parsed.data.afterSeq ?? 0;
  const key = `${ctx.organization.id}:${ctx.user.id}:${siteId}:${turnId}`;
  if (!turns.get(key)) {
    // only new turns count against the budget; resuming a turn is free
    const limit = await limiter.hit(`ai:${ctx.organization.id}`, 60, 60 * 60_000);
    if (!limit.allowed) return NextResponse.json({ ok: false, code: "RATE_LIMITED" }, { status: 429, headers: { "retry-after": "60" } });
  }
  const log = logger.child({ module: "ai", turnId });
  const { created } = turns.start(key, async (emit) => {
    const filter = createUiEventFilter({ turnId });
    const forward = (internal: unknown) => {
      for (const event of filter.map(internal)) emit(event);
    };
    try {
      await runChatTurn(ctx, siteId, message, forward);
    } catch (e) {
      forward({ type: "error", code: "INTERNAL_ERROR", message: "The assistant failed unexpectedly.", retryable: true });
      log.error({ err: e instanceof Error ? e.message : String(e) }, "ai.chat.turn_failed");
    } finally {
      forward({ type: "done" });
      if (filter.droppedTotal > 0) log.warn({ dropped: filter.dropped }, "ai.ui_events.dropped");
    }
  });

  const encoder = new TextEncoder();
  let keepAlive: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: (() => void) | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        if (keepAlive) clearInterval(keepAlive);
        try {
          controller.close();
        } catch {
          /* already closed by the consumer */
        }
      };
      keepAlive = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(": keep-alive\n\n"));
      }, 10_000);
      unsubscribe = turns.subscribe(key, afterSeq, {
        onEvent: ({ seq, event }) => {
          if (!closed) controller.enqueue(encoder.encode(`id: ${seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`));
        },
        onEnd: close,
      });
    },
    cancel() {
      unsubscribe?.();
      if (keepAlive) clearInterval(keepAlive);
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", connection: "keep-alive", "x-accel-buffering": "no", "x-turn-id": turnId, "x-turn-resumed": created ? "0" : "1" } });
}
