import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Agent, fetch as undiciFetch, type RequestInit as UndiciRequestInit } from "undici";

/**
 * SSRF protection for customer-defined destinations (generic webhooks): only https, only public
 * addresses, no redirects, and the validated IP is pinned for the actual connection so DNS
 * rebinding between check and connect is not possible.
 */
export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
}

function v4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
}

const V4_BLOCKED: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
  ["255.255.255.255", 32],
];

export function isPublicIpv4(ip: string): boolean {
  const n = v4ToInt(ip);
  return !V4_BLOCKED.some(([base, bits]) => (n >>> (32 - bits)) === (v4ToInt(base) >>> (32 - bits)));
}

function expandV6(ip: string): number[] | null {
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) return null; // handled by caller
  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (missing < 0) return null;
  const parts = [...head, ...Array(missing).fill("0"), ...tail];
  return parts.map((p) => parseInt(p || "0", 16));
}

export function isPublicIpv6(ip: string): boolean {
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) return isPublicIpv4(mapped[1]!);
  const parts = expandV6(ip);
  if (!parts) return false;
  const first = parts[0]!;
  if (parts.every((p) => p === 0)) return false; // ::
  if (parts.slice(0, 7).every((p) => p === 0) && parts[7] === 1) return false; // ::1
  if ((first & 0xfe00) === 0xfc00) return false; // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return false; // fe80::/10 link local
  if ((first & 0xff00) === 0xff00) return false; // multicast
  if (first === 0x2001 && parts[1] === 0x0db8) return false; // documentation
  return true;
}

export function isPublicIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return isPublicIpv4(ip);
  if (kind === 6) return isPublicIpv6(ip);
  return false;
}

export interface ValidatedTarget {
  url: URL;
  hostname: string;
  address: string;
  family: 4 | 6;
}

export async function validateDestinationUrl(raw: string, options: { allowPrivateNetwork?: boolean; allowHttp?: boolean } = {}): Promise<ValidatedTarget> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SsrfError("invalid url");
  }
  if (url.protocol !== "https:" && !(options.allowHttp && url.protocol === "http:")) throw new SsrfError("only https destinations are allowed");
  if (url.username || url.password) throw new SsrfError("credentials in url are not allowed");
  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  if (![80, 443, 8443].includes(port) && !options.allowPrivateNetwork) throw new SsrfError("port not allowed");
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".internal") || hostname.endsWith(".local")) {
    if (!options.allowPrivateNetwork) throw new SsrfError("internal hostnames are not allowed");
  }
  let addresses: Array<{ address: string; family: number }>;
  if (isIP(hostname)) addresses = [{ address: hostname, family: isIP(hostname) }];
  else {
    try {
      addresses = await lookup(hostname, { all: true, verbatim: true });
    } catch {
      throw new SsrfError("hostname does not resolve");
    }
  }
  if (!addresses.length) throw new SsrfError("hostname does not resolve");
  for (const a of addresses) {
    if (!options.allowPrivateNetwork && !isPublicIp(a.address)) throw new SsrfError(`destination resolves to a non-public address`);
  }
  const chosen = addresses[0]!;
  return { url, hostname, address: chosen.address, family: chosen.family === 6 ? 6 : 4 };
}

/**
 * Fetch that connects to the validated address only (DNS pinning), never follows redirects and
 * enforces a timeout.
 */
export async function pinnedFetch(target: ValidatedTarget, init: { method: string; headers: Record<string, string>; body?: string; timeoutMs?: number }): Promise<Response> {
  const agent = new Agent({
    connect: {
      lookup: (_hostname, _opts, cb) => cb(null, target.address, target.family),
      timeout: init.timeoutMs ?? 10_000,
    },
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 10_000);
  try {
    const res = await undiciFetch(target.url.toString(), {
      method: init.method,
      headers: init.headers,
      body: init.body,
      dispatcher: agent,
      redirect: "manual",
      signal: controller.signal,
    } as UndiciRequestInit);
    return res as unknown as Response;
  } finally {
    clearTimeout(timer);
    await agent.close().catch(() => undefined);
  }
}
