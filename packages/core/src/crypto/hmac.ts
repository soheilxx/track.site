/**
 * HMAC-SHA256 request signing on top of Web Crypto so the same code runs in Node, edge runtimes
 * and the browser SDK build. Signature scheme (server events, webhooks, shop integrations):
 *   signed_string = `${timestamp}.${nonce}.${sha256(body)}`
 *   header       = `t=<unix seconds>,n=<nonce>,v1=<hex hmac>`
 */
const encoder = new TextEncoder();

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(value: string): Uint8Array | null {
  try {
    const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

export function hexEncode(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export async function hmacSign(payload: string, secret: string): Promise<string> {
  const key = await importKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return hexEncode(new Uint8Array(sig));
}

export async function hmacVerify(payload: string, signatureHex: string, secret: string): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/i.test(signatureHex)) return false;
  const key = await importKey(secret);
  const pairs = signatureHex.match(/.{2}/g) ?? [];
  const bytes = new Uint8Array(pairs.map((h) => parseInt(h, 16)));
  return crypto.subtle.verify("HMAC", key, bytes, encoder.encode(payload));
}

export async function sha256HexWeb(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return hexEncode(new Uint8Array(digest));
}

export interface SignedRequestHeader {
  timestamp: number;
  nonce: string;
  signature: string;
}

export function parseSignatureHeader(header: string | null | undefined): SignedRequestHeader | null {
  if (!header) return null;
  const parts: Record<string, string> = {};
  for (const kv of header.split(",")) {
    const idx = kv.indexOf("=");
    if (idx === -1) continue;
    parts[kv.slice(0, idx).trim()] = kv.slice(idx + 1).trim();
  }
  const timestamp = Number(parts["t"]);
  const nonce = parts["n"];
  const signature = parts["v1"];
  if (!Number.isFinite(timestamp) || !nonce || !signature) return null;
  return { timestamp, nonce, signature };
}

export async function buildSignatureHeader(
  body: string,
  secret: string,
  timestamp: number,
  nonce: string,
): Promise<string> {
  const payload = `${timestamp}.${nonce}.${await sha256HexWeb(body)}`;
  return `t=${timestamp},n=${nonce},v1=${await hmacSign(payload, secret)}`;
}

export type SignatureVerdict =
  | { ok: true; nonce: string; timestamp: number }
  | { ok: false; reason: "missing" | "malformed" | "expired" | "invalid" };

/**
 * Verify a signed request. Replay protection requires the caller to reject nonces it has
 * already seen inside the window (see `NonceCache`).
 */
export async function verifySignedRequest(
  body: string,
  header: string | null | undefined,
  secrets: string[],
  options: { windowSeconds?: number; now?: number } = {},
): Promise<SignatureVerdict> {
  if (!header) return { ok: false, reason: "missing" };
  const parsed = parseSignatureHeader(header);
  if (!parsed) return { ok: false, reason: "malformed" };
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const window = options.windowSeconds ?? 300;
  if (Math.abs(now - parsed.timestamp) > window) return { ok: false, reason: "expired" };
  const payload = `${parsed.timestamp}.${parsed.nonce}.${await sha256HexWeb(body)}`;
  for (const secret of secrets) {
    if (secret && (await hmacVerify(payload, parsed.signature, secret))) {
      return { ok: true, nonce: parsed.nonce, timestamp: parsed.timestamp };
    }
  }
  return { ok: false, reason: "invalid" };
}

/** In-memory nonce cache (reference). Production uses the Postgres implementation in @track-site/db. */
export class NonceCache {
  private readonly seen = new Map<string, number>();
  constructor(private readonly ttlMs = 600_000) {}
  /** Returns false when the nonce was already used. */
  register(nonce: string, now = Date.now()): boolean {
    for (const [k, t] of this.seen) if (now - t > this.ttlMs) this.seen.delete(k);
    if (this.seen.has(nonce)) return false;
    this.seen.set(nonce, now);
    return true;
  }
}
