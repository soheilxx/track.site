const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Crockford base32 ULID from the Web Crypto RNG (26 chars, time-sortable). */
export function ulid(now = Date.now()): string {
  let t = now;
  let time = "";
  for (let i = 9; i >= 0; i--) {
    time = B32[t % 32] + time;
    t = Math.floor(t / 32);
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let rand = "";
  for (let i = 0; i < 16; i++) rand += B32[bytes[i]! % 32];
  return time + rand;
}

export const CLICK_IDS = ["gclid", "gbraid", "wbraid", "fbclid", "ttclid", "rdt_cid", "li_fat_id", "msclkid"];
const UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id"];
const BLOCKED = /^(email|e-mail|mail|phone|tel|mobile|name|first_?name|last_?name|address|street|zip|postal|iban|ssn|dob|birth)|(token|secret|password|passwd|pwd|auth|session|sid|api_?key|access_?key|signature|otp|code)$|^(token|secret|password|passwd|pwd|auth|session|sid|api_?key|access_?key|signature|otp)/i;
const EMAIL = /[^\s@/]+@[^\s@/]+\.[a-z]{2,}/i;

export interface ScrubResult {
  url: string;
  clickIds: Record<string, string>;
}

/** Client-side scrubbing mirroring the server rules: drop PII-ish params, extract click ids. */
export function scrubUrl(raw: string, allow: string[] = [], block: string[] = []): ScrubResult {
  const clickIds: Record<string, string> = {};
  try {
    const u = new URL(raw);
    u.username = "";
    u.password = "";
    u.hash = "";
    const keys = Array.from(new Set(Array.from(u.searchParams.keys())));
    for (const k of keys) {
      const lower = k.toLowerCase();
      const v = u.searchParams.get(k) || "";
      if (CLICK_IDS.indexOf(lower) !== -1) {
        if (v && v.length <= 256) clickIds[lower] = v;
        u.searchParams.delete(k);
        continue;
      }
      if (UTM.indexOf(lower) !== -1 || allow.indexOf(lower) !== -1) continue;
      if (block.indexOf(lower) !== -1 || BLOCKED.test(lower) || EMAIL.test(v)) u.searchParams.delete(k);
    }
    u.pathname = u.pathname
      .split("/")
      .map((s) => (EMAIL.test(decode(s)) ? "_redacted_" : s))
      .join("/");
    return { url: u.toString().slice(0, 2048), clickIds };
  } catch {
    return { url: "", clickIds };
  }
}

function decode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export function hostMatches(host: string, pattern: string): boolean {
  const h = host.toLowerCase();
  const p = pattern.toLowerCase();
  if (p.indexOf("*.") === 0) {
    const base = p.slice(2);
    return h === base || h.slice(-base.length - 1) === "." + base;
  }
  return h === p;
}

/** Deterministic JSON (sorted keys) matching the server canonicalisation used for signatures. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sort(value));
}
function sort(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sort);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (x !== undefined) out[k] = sort(x);
    }
    return out;
  }
  return v;
}

export function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function safeParse<T>(text: string | null): T | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function pathMatches(pattern: string | null, path: string): boolean {
  if (!pattern) return true;
  if (pattern.indexOf("*") === -1) return path === pattern;
  const re = new RegExp("^" + pattern.split("*").map(escapeRe).join(".*") + "$");
  return re.test(path);
}
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Vendor dedup id: purchases/refunds use `<name>:<order id>` so every path (pixel, server, shop webhook) shares one id. */
export function vendorMirrorId(name: string, orderId: unknown, fallback: string): string {
  if ((name === "purchase" || name === "refund") && typeof orderId === "string" && orderId) return `${name}:${orderId}`.slice(0, 128);
  if ((name === "purchase" || name === "refund") && typeof orderId === "number") return `${name}:${orderId}`;
  return fallback;
}
