import { NextResponse } from "next/server";
import { can } from "@track-site/core";
import { requireApiOrgContext } from "@/server/session";
import { attachmentDisposition, loadCustomerAttachment } from "@/server/support/portal";

export const dynamic = "force-dynamic";

/**
 * Attachment download of the customer portal (docs/18 §"Attachments"): the organisation context is resolved
 * again (401 signed out, 403 suspended or without `support.read`), the bytes come through the tenant
 * transaction (RLS: own ticket, never an internal note's file) and are served as a download with
 * `X-Content-Type-Options: nosniff` so nothing a customer uploaded is ever rendered inline.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  const ctx = await requireApiOrgContext();
  if (ctx instanceof Response) return ctx;
  if (!can(ctx.role, "support.read")) return NextResponse.json({ ok: false, code: "FORBIDDEN" }, { status: 403 });
  const { id, attachmentId } = await params;
  const file = await loadCustomerAttachment(ctx, id, attachmentId);
  if (!file) return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404, headers: { "cache-control": "no-store" } });
  return new Response(new Uint8Array(file.content), {
    status: 200,
    headers: {
      "content-type": file.contentType,
      "content-length": String(file.content.byteLength),
      "content-disposition": attachmentDisposition(file.fileName),
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
    },
  });
}
