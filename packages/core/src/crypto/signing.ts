import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify, type KeyObject } from "node:crypto";
import { canonicalJson } from "./canonical-json.ts";
import { sha256Hex } from "./hash.ts";

/**
 * Ed25519 signatures for immutable config bundles. Keys are base64 DER (PKCS8 private, SPKI public)
 * so they can live in env/KMS and the public key can be embedded into the SDK build.
 */
export interface SigningKeyPair {
  keyId: string;
  privateKeyBase64: string;
  publicKeyBase64: string;
}

export function generateSigningKeyPair(keyId: string): SigningKeyPair {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    keyId,
    privateKeyBase64: privateKey.export({ type: "pkcs8", format: "der" }).toString("base64"),
    publicKeyBase64: publicKey.export({ type: "spki", format: "der" }).toString("base64"),
  };
}

function privateKeyFromBase64(b64: string): KeyObject {
  return createPrivateKey({ key: Buffer.from(b64, "base64"), format: "der", type: "pkcs8" });
}
function publicKeyFromBase64(b64: string): KeyObject {
  return createPublicKey({ key: Buffer.from(b64, "base64"), format: "der", type: "spki" });
}

export interface SignedBundle<T> {
  payload: T;
  /** sha256 of the canonical JSON payload */
  digest: string;
  keyId: string;
  algorithm: "ed25519";
  signature: string;
}

export function signBundle<T>(payload: T, keyId: string, privateKeyBase64: string): SignedBundle<T> {
  const canonical = canonicalJson(payload);
  const digest = sha256Hex(canonical);
  const signature = sign(null, Buffer.from(canonical, "utf8"), privateKeyFromBase64(privateKeyBase64)).toString(
    "base64",
  );
  return { payload, digest, keyId, algorithm: "ed25519", signature };
}

export function verifyBundle<T>(bundle: SignedBundle<T>, publicKeys: Record<string, string>): boolean {
  const pub = publicKeys[bundle.keyId];
  if (!pub || bundle.algorithm !== "ed25519") return false;
  const canonical = canonicalJson(bundle.payload);
  if (sha256Hex(canonical) !== bundle.digest) return false;
  try {
    return verify(
      null,
      Buffer.from(canonical, "utf8"),
      publicKeyFromBase64(pub),
      Buffer.from(bundle.signature, "base64"),
    );
  } catch {
    return false;
  }
}

/** Raw 32-byte Ed25519 public key (for Web Crypto import in the browser SDK). */
export function rawPublicKeyFromSpki(publicKeyBase64: string): string {
  const der = Buffer.from(publicKeyBase64, "base64");
  return der.subarray(der.length - 32).toString("base64");
}
