import { signBundle, verifyBundle, type SignedBundle } from "@track-site/core";
import { configBundleSchema, type ConfigBundle } from "./bundle.ts";

export type SignedConfigBundle = SignedBundle<ConfigBundle>;

export function signConfigBundle(bundle: ConfigBundle, keyId: string, privateKeyBase64: string): SignedConfigBundle {
  const parsed = configBundleSchema.parse(bundle);
  return signBundle(parsed, keyId, privateKeyBase64);
}

export function verifyConfigBundle(signed: SignedConfigBundle, publicKeys: Record<string, string>): boolean {
  if (!configBundleSchema.safeParse(signed.payload).success) return false;
  return verifyBundle(signed, publicKeys);
}

/** Small manifest pointing at the active version (short TTL, fetched by the SDK). */
export interface ConfigManifest {
  tracking_id: string;
  environment: string;
  version: number;
  bundle_url: string;
  digest: string;
  key_id: string;
  kill_switch: boolean;
  published_at: string;
}

export function buildManifest(signed: SignedConfigBundle, bundleUrl: string, killSwitch: boolean, publishedAt: string): ConfigManifest {
  return {
    tracking_id: signed.payload.site.tracking_id,
    environment: signed.payload.site.environment,
    version: signed.payload.version,
    bundle_url: bundleUrl,
    digest: signed.digest,
    key_id: signed.keyId,
    kill_switch: killSwitch,
    published_at: publishedAt,
  };
}

/** The subset of the bundle the browser SDK needs (server-only details stay out of the CDN). */
export function browserView(bundle: ConfigBundle): ConfigBundle {
  return {
    ...bundle,
    destinations: bundle.destinations
      .filter((d) => d.enabled && d.mode !== "server")
      .map((d) => ({ ...d, mappings: d.mappings.filter((m) => m.enabled) })),
  };
}
