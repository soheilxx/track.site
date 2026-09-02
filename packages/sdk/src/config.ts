import type { BundleView } from "./types.ts";
import { b64ToBytes, canonicalJson, hex, safeParse } from "./util.ts";

/**
 * Signed configuration loading: manifest (short TTL) -> immutable bundle -> Ed25519 verification
 * with the public key embedded at build time. Invalid or unsigned bundles are rejected: tracking
 * stays off, the host page is never affected.
 */
interface Manifest {
  tracking_id: string;
  version: number;
  bundle_url: string;
  digest: string;
  key_id: string;
  kill_switch: boolean;
}

interface SignedResponse {
  signed: { payload: unknown; digest: string; keyId: string; algorithm: string; signature: string };
  browser: BundleView;
}

export interface LoadedConfig {
  bundle: BundleView;
  version: number;
  killSwitch: boolean;
}

const CACHE_KEY = "_ts_cfg";

export async function verifySigned(signed: SignedResponse["signed"], publicKeys: Record<string, string>): Promise<boolean> {
  const raw = publicKeys[signed.keyId];
  if (!raw || signed.algorithm !== "ed25519" || !crypto.subtle) return false;
  const canonical = canonicalJson(signed.payload);
  const data = new TextEncoder().encode(canonical);
  const digest = hex(await crypto.subtle.digest("SHA-256", data));
  if (digest !== signed.digest) return false;
  try {
    const key = await crypto.subtle.importKey("raw", b64ToBytes(raw) as BufferSource, { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify({ name: "Ed25519" }, key, b64ToBytes(signed.signature) as BufferSource, data);
  } catch {
    return false;
  }
}

export async function loadConfig(
  cdnUrl: string,
  siteId: string,
  publicKeys: Record<string, string>,
  fetchImpl: typeof fetch = fetch,
): Promise<LoadedConfig | null> {
  const manifestRes = await fetchImpl(`${cdnUrl}/v1/c/${siteId}`, { credentials: "omit", mode: "cors" });
  if (!manifestRes.ok) return null;
  const manifest = (await manifestRes.json()) as Manifest;
  if (!manifest || typeof manifest.version !== "number") return null;
  const cached = safeParse<{ version: number; digest: string; bundle: BundleView }>(sessionGet(CACHE_KEY));
  if (cached && cached.version === manifest.version && cached.digest === manifest.digest) {
    return { bundle: cached.bundle, version: manifest.version, killSwitch: manifest.kill_switch };
  }
  const bundleRes = await fetchImpl(manifest.bundle_url, { credentials: "omit", mode: "cors" });
  if (!bundleRes.ok) return null;
  const body = (await bundleRes.json()) as SignedResponse;
  if (!body?.signed || body.signed.digest !== manifest.digest) return null;
  const ok = await verifySigned(body.signed, publicKeys);
  if (!ok) return null;
  const full = body.signed.payload as BundleView;
  // apply the browser view locally from the verified payload (server-only destinations dropped)
  const bundle: BundleView = {
    ...full,
    destinations: full.destinations.filter((d) => d.enabled && d.mode !== "server").map((d) => ({ ...d, mappings: d.mappings.filter((m) => m.enabled) })),
  };
  sessionSet(CACHE_KEY, JSON.stringify({ version: manifest.version, digest: manifest.digest, bundle }));
  return { bundle, version: manifest.version, killSwitch: manifest.kill_switch };
}

function sessionGet(k: string): string | null {
  try {
    return sessionStorage.getItem(k);
  } catch {
    return null;
  }
}
function sessionSet(k: string, v: string): void {
  try {
    sessionStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
}
