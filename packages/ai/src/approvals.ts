import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { sha256Hex } from "@track-site/core";

/**
 * Approval tokens bind exactly one action, target, tenant, actor and diff hash for a short time.
 * The chat text "yes" never authorizes anything; only a UI confirmation carrying this token does.
 * Tokens are single-use: the hash is stored in `approvals` and consumed on execution.
 */
export interface ApprovalClaims {
  action: string;
  targetType: string;
  targetId: string;
  organizationId: string;
  userId: string;
  diffHash: string;
  expiresAt: number;
  nonce: string;
}

export const APPROVAL_TTL_MS = 10 * 60_000;

function payloadOf(c: ApprovalClaims): string {
  return [c.action, c.targetType, c.targetId, c.organizationId, c.userId, c.diffHash, c.expiresAt, c.nonce].join("|");
}

export function issueApprovalToken(secret: string, input: Omit<ApprovalClaims, "expiresAt" | "nonce">, now = Date.now()): { token: string; claims: ApprovalClaims; tokenHash: string } {
  const claims: ApprovalClaims = { ...input, expiresAt: now + APPROVAL_TTL_MS, nonce: randomBytes(12).toString("base64url") };
  const sig = createHmac("sha256", secret).update(payloadOf(claims)).digest("base64url");
  const token = `${Buffer.from(JSON.stringify(claims)).toString("base64url")}.${sig}`;
  return { token, claims, tokenHash: sha256Hex(token) };
}

export type ApprovalVerdict = { ok: true; claims: ApprovalClaims; tokenHash: string } | { ok: false; reason: "malformed" | "signature" | "expired" | "mismatch" };

export function verifyApprovalToken(secret: string, token: string, expected: Omit<ApprovalClaims, "expiresAt" | "nonce">, now = Date.now()): ApprovalVerdict {
  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) return { ok: false, reason: "malformed" };
  let claims: ApprovalClaims;
  try {
    claims = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as ApprovalClaims;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  const expectedSig = createHmac("sha256", secret).update(payloadOf(claims)).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "signature" };
  if (claims.expiresAt < now) return { ok: false, reason: "expired" };
  for (const key of ["action", "targetType", "targetId", "organizationId", "userId", "diffHash"] as const) {
    if (claims[key] !== expected[key]) return { ok: false, reason: "mismatch" };
  }
  return { ok: true, claims, tokenHash: sha256Hex(token) };
}

export function diffHashOf(value: unknown): string {
  return sha256Hex(JSON.stringify(value));
}
