import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { SUPPORT_ATTACHMENT_MAX_BYTES, SUPPORT_ATTACHMENT_MAX_PER_MESSAGE, supportAttachments } from "@track-site/db";
import { PlatformAccessError, auditPlatform, requirePlatform, withPlatform } from "@/server/ops/platform";
import { ATTACHMENT_ALLOWED_TYPES, noopAttachmentScanner, sanitizeFileName, screenAttachments } from "@/server/support/inbound";
import { assertMessageAttachable, isUuid, type AttachableRefusal } from "@/server/support/ticket";

export const dynamic = "force-dynamic";

const MAGIC: Array<{ type: string; test: (b: Buffer) => boolean }> = [
  { type: "image/png", test: (b) => b.length > 8 && b.readUInt32BE(0) === 0x89504e47 },
  { type: "image/jpeg", test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: "image/gif", test: (b) => b.length > 6 && b.subarray(0, 4).toString("latin1") === "GIF8" },
  { type: "image/webp", test: (b) => b.length > 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
  { type: "application/pdf", test: (b) => b.length > 5 && b.subarray(0, 5).toString("latin1") === "%PDF-" },
];

/** Binary types must start with their signature; text-like types are accepted as declared. */
function signatureMatches(contentType: string, bytes: Buffer): boolean {
  const rule = MAGIC.find((m) => m.type === contentType);
  return rule ? rule.test(bytes) : true;
}

const fail = (status: number, code: string, detail?: string) => NextResponse.json({ ok: false, code, ...(detail ? { detail } : {}) }, { status });

/**
 * Attachment upload of the composer (docs/18 §"Attachments"): the second phase after
 * `composeTicketMessageAction` stored the message. Multipart body with `message` (the message id) and
 * `file`. Guards: `platform.tickets.write`, the message is the caller's own and still attachable (queued
 * reply, or a note within its window), at most 5 files per message, ≤ 5 MB, allow-listed content type
 * with a signature check for the binary types, sanitised file name, the scanner hook (a no-op until a
 * scanner exists — the console labels files "not scanned"). Stored in the database with the ticket's
 * organisation; audited with ids, type and size — never the bytes.
 */
export async function POST(request: NextRequest): Promise<Response> {
  let ctx;
  try {
    ctx = await requirePlatform("PLATFORM_SUPPORT", "platform.tickets.write");
  } catch (e) {
    if (e instanceof PlatformAccessError) return NextResponse.json({ ok: false, code: "FORBIDDEN", reason: e.reason }, { status: 403 });
    throw e;
  }
  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > SUPPORT_ATTACHMENT_MAX_BYTES + 64 * 1024) return fail(413, "too_large");
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, "invalid");
  }
  const messageId = form.get("message");
  const file = form.get("file");
  if (typeof messageId !== "string" || !isUuid(messageId) || !(file instanceof File)) return fail(400, "invalid");
  if (file.size > SUPPORT_ATTACHMENT_MAX_BYTES) return fail(413, "too_large");
  const contentType = (file.type || "application/octet-stream").split(";")[0]!.trim().toLowerCase();
  const fileName = sanitizeFileName(file.name);
  const screening = screenAttachments([{ fileName, contentType, sizeBytes: file.size }]);
  if (screening.rejected.length) return fail(415, screening.rejected[0]!.reason);
  if (!ATTACHMENT_ALLOWED_TYPES.has(contentType)) return fail(415, "type_not_allowed");
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.byteLength > SUPPORT_ATTACHMENT_MAX_BYTES) return fail(413, "too_large");
  if (!signatureMatches(contentType, bytes)) return fail(415, "type_mismatch");
  const scan = await noopAttachmentScanner.scan(bytes, { fileName, contentType, sizeBytes: bytes.byteLength });
  if (!scan.clean) return fail(422, "scan_failed", scan.detail ?? undefined);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const now = new Date();

  type Stored = { error: AttachableRefusal } | { id: string; ticketId: string; count: number };
  const result = await withPlatform(ctx, async (tx): Promise<Stored> => {
    const check = await assertMessageAttachable(tx, messageId, ctx.user.id, now, SUPPORT_ATTACHMENT_MAX_PER_MESSAGE);
    if (!check.ok) return { error: check.reason };
    const { message } = check;
    const [row] = await tx
      .insert(supportAttachments)
      .values({ messageId: message.id, ticketId: message.ticketId, organizationId: message.organizationId, fileName, contentType, sizeBytes: bytes.byteLength, sha256, content: bytes, createdAt: now })
      .returning({ id: supportAttachments.id });
    await auditPlatform(
      ctx,
      {
        action: "platform.support_ticket.attachment_upload",
        organizationId: message.organizationId,
        targetType: "support_attachment",
        targetId: row!.id,
        diff: { messageId: message.id, ticketId: message.ticketId, contentType, sizeBytes: bytes.byteLength, sha256 },
        metadata: { module: "support", direction: message.direction, scanner: noopAttachmentScanner.name, scan: scan.detail },
      },
      tx,
    );
    return { id: row!.id, ticketId: message.ticketId, count: check.count + 1 };
  });
  if ("error" in result) {
    const status = result.error === "not_found" ? 404 : result.error === "too_many" ? 409 : 403;
    return fail(status, result.error);
  }
  revalidatePath(`/ops/support/${result.ticketId}`);
  return NextResponse.json({ ok: true, attachment: { id: result.id, fileName, contentType, sizeBytes: bytes.byteLength, sha256, scanned: false }, count: result.count }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
