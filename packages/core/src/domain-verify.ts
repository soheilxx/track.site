import { resolveTxt } from "node:dns/promises";

/**
 * Domain ownership checks (DNS TXT, well-known file, meta tag). Pure network helpers; persistence
 * and audit happen in the caller. Every request is short-lived and identifies itself.
 */
export const VERIFY_FILE_PATH = "/.well-known/track-site-verify.txt";
export const VERIFY_META_NAME = "track-site-verification";

export interface DomainCheckResult {
  ok: boolean;
  detail: string;
}

export async function checkDnsTxt(hostname: string, token: string, resolver: (host: string) => Promise<string[][]> = resolveTxt): Promise<DomainCheckResult> {
  const candidates = Array.from(new Set([hostname, `_track-site.${hostname}`, hostname.replace(/^www\./, "")]));
  for (const host of candidates) {
    try {
      const records = await resolver(host);
      if (records.map((r) => r.join("")).some((v) => v.trim() === token)) return { ok: true, detail: `TXT record found on ${host}` };
    } catch {
      /* try next candidate */
    }
  }
  return { ok: false, detail: "no matching TXT record" };
}

export async function fetchTextLimited(url: string, fetchImpl: typeof fetch = fetch, timeoutMs = 5_000, maxBytes = 200_000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { redirect: "follow", signal: controller.signal, headers: { "user-agent": "track.site-verify/1 (+https://track.site)", accept: "text/html,text/plain;q=0.9,*/*;q=0.5" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    return text.slice(0, maxBytes);
  } finally {
    clearTimeout(timer);
  }
}

export async function checkVerificationFile(hostname: string, token: string, fetchImpl: typeof fetch = fetch): Promise<DomainCheckResult> {
  try {
    const body = await fetchTextLimited(`https://${hostname}${VERIFY_FILE_PATH}`, fetchImpl);
    return body.trim() === token ? { ok: true, detail: "verification file found" } : { ok: false, detail: "verification file missing or different content" };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message.slice(0, 120) : "fetch failed" };
  }
}

export function findMetaVerification(html: string): string | null {
  const re = new RegExp(`<meta\\s+[^>]*name=["']${VERIFY_META_NAME}["'][^>]*content=["']([^"']+)["'][^>]*>`, "i");
  const alt = new RegExp(`<meta\\s+[^>]*content=["']([^"']+)["'][^>]*name=["']${VERIFY_META_NAME}["'][^>]*>`, "i");
  const m = html.match(re) ?? html.match(alt);
  return m?.[1] ?? null;
}

export async function checkMetaTag(hostname: string, token: string, fetchImpl: typeof fetch = fetch): Promise<DomainCheckResult> {
  try {
    const html = await fetchTextLimited(`https://${hostname}/`, fetchImpl);
    const value = findMetaVerification(html);
    const normalized = value ? (value.startsWith("track-site-verify=") ? value : `track-site-verify=${value}`) : null;
    return normalized === token ? { ok: true, detail: "meta tag found" } : { ok: false, detail: "meta tag missing" };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message.slice(0, 120) : "fetch failed" };
  }
}

/** Looks for an installed tracker snippet on a page. */
export function findTrackerSnippet(html: string, trackingId: string): { found: boolean; siteIdMatches: boolean; async: boolean } {
  const re = /<script([^>]*)src=["']([^"']*tracker\.js[^"']*)["']([^>]*)>/i;
  const m = html.match(re);
  if (!m) return { found: false, siteIdMatches: false, async: false };
  const attrs = `${m[1]} ${m[3]}`;
  const idMatch = attrs.match(/data-site-id=["']([A-Za-z0-9]{6})["']/i);
  return { found: true, siteIdMatches: (idMatch?.[1] ?? "").toUpperCase() === trackingId.toUpperCase(), async: /\basync\b/i.test(attrs) };
}
