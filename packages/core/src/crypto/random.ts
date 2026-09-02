import { randomBytes, timingSafeEqual } from "node:crypto";

export function randomBase64Url(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Prefixed opaque token, e.g. `tsk_live_...` for source keys. The prefix makes secret scanning possible. */
export function randomToken(prefix: string, bytes = 32): string {
  return `${prefix}_${randomBase64Url(bytes)}`;
}

export function constantTimeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
