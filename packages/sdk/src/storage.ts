import { ulid } from "./util.ts";

/**
 * Consent-gated identifiers. Before a purpose is granted nothing is written to cookies or
 * storage; withdrawal removes the purpose-specific identifiers immediately.
 */
const ID_COOKIE = "_ts_id";
const SESSION_KEY = "_ts_sid";
const ID_MAX_AGE = 60 * 60 * 24 * 395; // 13 months

export class IdentityStore {
  private memoryAnon: string | null = null;
  private memorySession: { id: string; last: number } | null = null;
  constructor(
    private readonly cookieDomain: string | null,
    private readonly sessionTimeoutMs: number,
  ) {}

  /** Anonymous id, persisted only when `allowed` (analytics or marketing consent). */
  anonymousId(allowed: boolean): string | null {
    if (!allowed) return null;
    const existing = readCookie(ID_COOKIE) || safeGet(localStorage, ID_COOKIE);
    if (existing && /^[0-9A-Z]{26}$/.test(existing)) {
      this.memoryAnon = existing;
      this.persistAnon(existing);
      return existing;
    }
    const id = this.memoryAnon || ulid();
    this.memoryAnon = id;
    this.persistAnon(id);
    return id;
  }

  private persistAnon(id: string): void {
    writeCookie(ID_COOKIE, id, ID_MAX_AGE, this.cookieDomain);
    safeSet(localStorage, ID_COOKIE, id);
  }

  sessionId(allowed: boolean): string | null {
    if (!allowed) return null;
    const now = Date.now();
    const raw = safeGet(sessionStorage, SESSION_KEY);
    let cur = this.memorySession;
    if (raw) {
      const [id, last] = raw.split(":");
      if (id && last) cur = { id, last: Number(last) };
    }
    if (!cur || now - cur.last > this.sessionTimeoutMs) cur = { id: ulid(now), last: now };
    cur.last = now;
    this.memorySession = cur;
    safeSet(sessionStorage, SESSION_KEY, `${cur.id}:${cur.last}`);
    return cur.id;
  }

  /** Withdrawal / reset: remove every identifier we own. */
  clear(): void {
    this.memoryAnon = null;
    this.memorySession = null;
    writeCookie(ID_COOKIE, "", -1, this.cookieDomain);
    writeCookie(ID_COOKIE, "", -1, null);
    safeRemove(localStorage, ID_COOKIE);
    safeRemove(sessionStorage, SESSION_KEY);
  }
}

export function readCookie(name: string): string | null {
  try {
    const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]!) : null;
  } catch {
    return null;
  }
}

export function writeCookie(name: string, value: string, maxAge: number, domain: string | null): void {
  try {
    let c = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; SameSite=Lax`;
    if (domain) c += `; Domain=${domain}`;
    if (location.protocol === "https:") c += "; Secure";
    document.cookie = c;
  } catch {
    /* storage blocked: fine, memory only */
  }
}

function safeGet(store: Storage | undefined, key: string): string | null {
  try {
    return store ? store.getItem(key) : null;
  } catch {
    return null;
  }
}
function safeSet(store: Storage | undefined, key: string, value: string): void {
  try {
    store?.setItem(key, value);
  } catch {
    /* ignore */
  }
}
function safeRemove(store: Storage | undefined, key: string): void {
  try {
    store?.removeItem(key);
  } catch {
    /* ignore */
  }
}

export { safeGet, safeSet, safeRemove };
