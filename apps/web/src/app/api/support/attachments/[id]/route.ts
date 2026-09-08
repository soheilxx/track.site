import { NextResponse, type NextRequest } from "next/server";
import { PlatformAccessError, auditPlatform, requirePlatform } from "@/server/ops/platform";
import { ATTACHMENT_ALLOWED_TYPES } from "@/server/support/inbound";
import { isUuid, loadAttachmentForDownload } from "@/server/support/ticket";

export const dynamic = "force-dynamic";

/** ASCII fallback for the `filename=` parameter; the full UTF-8 name travels in `filename*`. */
function asciiFileName(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_").trim();
  return ascii || "attachment";
}

/**
 * Attachment download of the support desk (docs/18 §"Attachments"). Re-checks `platform.tickets.read`,
 * loads the bytes through `tracksite_ops` and serves them as a download only: `Content-Disposition:
 * attachment`, `X-Content-Type-Options: nosniff`, a sandboxed CSP so nothing renders inline, no caching,
 * and a content type limited to the desk's allow-list (anything else is served as `application/octet-stream`).
 * Every download is audited with the attachment, message and ticket ids — never the content.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  if (!isUuid(id)) return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
  let ctx;
  try {
    ctx = await requirePlatform("PLATFORM_SUPPORT", "platform.tickets.read");
  } catch (e) {
    if (e instanceof PlatformAccessError) return NextResponse.json({ ok: false, code: "FORBIDDEN", reason: e.reason }, { status: 403 });
    throw e;
  }
  const found = await loadAttachmentForDownload(ctx, id);
  if (!found) return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
  await auditPlatform(ctx, {
    action: "platform.support_ticket.attachment_download",
    organizationId: found.organizationId,
    targetType: "support_attachment",
    targetId: found.id,
    metadata: { module: "support", ticketId: found.ticketId, ticketNumber: found.ticketNumber, messageId: found.messageId, direction: found.direction, contentType: found.contentType, sizeBytes: found.sizeBytes },
  });
  const type = ATTACHMENT_ALLOWED_TYPES.has(found.contentType) ? found.contentType : "application/octet-stream";
  return new NextResponse(new Uint8Array(found.content), {
    status: 200,
    headers: {
      "Content-Type": type,
      "Content-Length": String(found.content.byteLength),
      "Content-Disposition": `attachment; filename="${asciiFileName(found.fileName)}"; filename*=UTF-8''${encodeURIComponent(found.fileName)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}
