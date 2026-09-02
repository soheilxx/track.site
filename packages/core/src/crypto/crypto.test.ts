import { describe, expect, it } from "vitest";
import { canonicalJson } from "./canonical-json.ts";
import { LocalKeyProvider, SecretVault, maskSecret } from "./envelope.ts";
import { hashNormalizedEmail, normalizePhoneDigits } from "./hash.ts";
import { NonceCache, buildSignatureHeader, verifySignedRequest } from "./hmac.ts";
import { generateSigningKeyPair, rawPublicKeyFromSpki, signBundle, verifyBundle } from "./signing.ts";

const master = Buffer.alloc(32, 7).toString("base64");

describe("envelope encryption", () => {
  it("round-trips, binds AAD and rotates keys", async () => {
    const v1 = new LocalKeyProvider(master, "k1");
    const vault = new SecretVault(v1);
    const enc = await vault.encrypt("EAABsuperSecretToken", "org:1");
    expect(enc.startsWith("v1.k1.")).toBe(true);
    expect(enc).not.toContain("EAAB");
    expect(await vault.decrypt(enc, "org:1")).toBe("EAABsuperSecretToken");
    await expect(vault.decrypt(enc, "org:2")).rejects.toThrow();

    const v2 = new LocalKeyProvider(Buffer.alloc(32, 9).toString("base64"), "k2");
    const rotated = new SecretVault(v2, [v1]);
    const rewrapped = await rotated.rewrap(enc);
    expect(rewrapped.startsWith("v1.k2.")).toBe(true);
    expect(await rotated.decrypt(rewrapped, "org:1")).toBe("EAABsuperSecretToken");
    expect(rewrapped.split(".")[5]).toBe(enc.split(".")[5]);
  });

  it("masks secrets", () => {
    expect(maskSecret("abcdef1234")).toBe("••••1234");
    expect(maskSecret("ab")).toBe("••••");
    expect(maskSecret(null)).toBeNull();
  });
});

describe("hmac signed requests", () => {
  it("signs and verifies with replay window", async () => {
    const body = JSON.stringify({ a: 1 });
    const now = 1_700_000_000;
    const header = await buildSignatureHeader(body, "secret", now, "n1");
    expect(await verifySignedRequest(body, header, ["secret"], { now })).toMatchObject({ ok: true, nonce: "n1" });
    expect(await verifySignedRequest(body + " ", header, ["secret"], { now })).toMatchObject({
      ok: false,
      reason: "invalid",
    });
    expect(await verifySignedRequest(body, header, ["other"], { now })).toMatchObject({ ok: false, reason: "invalid" });
    expect(await verifySignedRequest(body, header, ["secret"], { now: now + 301 })).toMatchObject({
      ok: false,
      reason: "expired",
    });
    expect(await verifySignedRequest(body, null, ["secret"], { now })).toMatchObject({ ok: false, reason: "missing" });
    expect(await verifySignedRequest(body, "garbage", ["secret"], { now })).toMatchObject({
      ok: false,
      reason: "malformed",
    });
    expect(await verifySignedRequest(body, header, ["new", "secret"], { now })).toMatchObject({ ok: true });
  });

  it("rejects replayed nonces", () => {
    const cache = new NonceCache(1000);
    expect(cache.register("a", 0)).toBe(true);
    expect(cache.register("a", 10)).toBe(false);
    expect(cache.register("a", 2000)).toBe(true);
  });
});

describe("ed25519 bundle signing", () => {
  it("verifies valid bundles and rejects tampering or unknown keys", () => {
    const kp = generateSigningKeyPair("cfg-v1");
    const bundle = signBundle({ version: 3, b: 1, a: [2, 1] }, kp.keyId, kp.privateKeyBase64);
    expect(verifyBundle(bundle, { "cfg-v1": kp.publicKeyBase64 })).toBe(true);
    expect(
      verifyBundle({ ...bundle, payload: { ...bundle.payload, version: 4 } }, { "cfg-v1": kp.publicKeyBase64 }),
    ).toBe(false);
    expect(verifyBundle(bundle, { "cfg-v2": kp.publicKeyBase64 })).toBe(false);
    expect(Buffer.from(rawPublicKeyFromSpki(kp.publicKeyBase64), "base64")).toHaveLength(32);
  });

  it("canonical json sorts keys and drops undefined", () => {
    expect(canonicalJson({ b: 1, a: { d: undefined, c: [3, { z: 1, y: 2 }] } })).toBe(
      '{"a":{"c":[3,{"y":2,"z":1}]},"b":1}',
    );
  });
});

describe("hash helpers", () => {
  it("normalizes email and phone before hashing", () => {
    expect(hashNormalizedEmail(" Foo@Example.COM ")).toBe(hashNormalizedEmail("foo@example.com"));
    expect(normalizePhoneDigits("+49 (151) 123-4567")).toBe("491511234567");
  });
});
