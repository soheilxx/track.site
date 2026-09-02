import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Builds dist/tracker.js (IIFE, minified). The config signing public key(s) and default hosts are
 * embedded at build time from the environment; the key id -> raw 32-byte key map is what the SDK
 * uses for Ed25519 verification.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as { version: string };

function rawKeyFromSpki(spkiB64: string): string {
  const der = Buffer.from(spkiB64, "base64");
  return der.subarray(der.length - 32).toString("base64");
}

const keys: Record<string, string> = {};
const keyId = process.env.CONFIG_SIGNING_KEY_ID ?? "cfg-v1";
const pub = process.env.CONFIG_SIGNING_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_CONFIG_SIGNING_PUBLIC_KEY;
if (pub) keys[keyId] = rawKeyFromSpki(pub);
const nextPub = process.env.CONFIG_SIGNING_PUBLIC_KEY_NEXT;
if (nextPub) keys[process.env.CONFIG_SIGNING_KEY_ID_NEXT ?? `${keyId}-next`] = rawKeyFromSpki(nextPub);
if (Object.keys(keys).length === 0) console.error("warning: no CONFIG_SIGNING_PUBLIC_KEY set; the built tracker will reject every config (fail closed)");

mkdirSync(path.join(root, "dist"), { recursive: true });
await build({
  entryPoints: [path.join(root, "src", "index.ts")],
  outfile: path.join(root, "dist", "tracker.js"),
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2020", "chrome90", "safari15", "firefox90", "edge90"],
  sourcemap: true,
  legalComments: "none",
  define: {
    __TRACKSITE_VERSION__: JSON.stringify(pkg.version),
    __TRACKSITE_PUBLIC_KEYS__: JSON.stringify(JSON.stringify(keys)),
    __TRACKSITE_INGEST__: JSON.stringify(process.env.NEXT_PUBLIC_HOST_INGEST ?? process.env.HOST_INGEST ?? "https://ingest.track.site"),
    __TRACKSITE_CDN__: JSON.stringify(process.env.NEXT_PUBLIC_HOST_CDN ?? process.env.HOST_CDN ?? "https://cdn.track.site"),
  },
});
const size = readFileSync(path.join(root, "dist", "tracker.js")).length;
writeFileSync(path.join(root, "dist", "build-info.json"), JSON.stringify({ version: pkg.version, bytes: size, keyIds: Object.keys(keys), builtAt: new Date().toISOString() }, null, 2));
console.error(`tracker.js built: ${size} bytes (raw), keys: ${Object.keys(keys).join(",") || "none"}`);
