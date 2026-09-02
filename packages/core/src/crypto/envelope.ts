import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import type * as KmsSdk from "@aws-sdk/client-kms";

/**
 * Envelope encryption for connector credentials and other secrets.
 *  - every secret gets its own random data encryption key (DEK)
 *  - the DEK is wrapped by a key provider (local master key via HKDF, or AWS KMS)
 *  - payload format: `v1.<keyId>.<wrappedDek>.<iv>.<tag>.<ciphertext>` (base64url parts)
 * Rotation re-wraps DEKs without re-encrypting the data.
 */
export interface KeyProvider {
  readonly keyId: string;
  wrap(dek: Buffer): Promise<Buffer>;
  unwrap(wrapped: Buffer): Promise<Buffer>;
}

export class LocalKeyProvider implements KeyProvider {
  readonly keyId: string;
  private readonly kek: Buffer;
  constructor(masterKeyBase64: string, keyId = "local-v1") {
    const master = Buffer.from(masterKeyBase64, "base64");
    if (master.length < 32) throw new Error("MASTER_KEY must be at least 32 bytes (base64)");
    this.keyId = keyId;
    this.kek = Buffer.from(hkdfSync("sha256", master, "track-site-envelope", `kek:${keyId}`, 32));
  }
  async wrap(dek: Buffer): Promise<Buffer> {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.kek, iv);
    const ct = Buffer.concat([cipher.update(dek), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ct]);
  }
  async unwrap(wrapped: Buffer): Promise<Buffer> {
    const iv = wrapped.subarray(0, 12);
    const tag = wrapped.subarray(12, 28);
    const ct = wrapped.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", this.kek, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  }
}

type KmsModule = typeof KmsSdk;

/** AWS KMS provider. The SDK is loaded lazily so it is only required when KMS_DRIVER=aws. */
export class AwsKmsKeyProvider implements KeyProvider {
  readonly keyId: string;
  private loaded: { mod: KmsModule; client: InstanceType<KmsModule["KMSClient"]> } | null = null;
  constructor(
    private readonly kmsKeyId: string,
    private readonly region: string,
    keyId = "aws-kms-v1",
  ) {
    this.keyId = keyId;
  }
  private async kms() {
    if (!this.loaded) {
      const mod = await import("@aws-sdk/client-kms");
      this.loaded = { mod, client: new mod.KMSClient({ region: this.region }) };
    }
    return this.loaded;
  }
  async wrap(dek: Buffer): Promise<Buffer> {
    const { client, mod } = await this.kms();
    const res = await client.send(new mod.EncryptCommand({ KeyId: this.kmsKeyId, Plaintext: dek }));
    if (!res.CiphertextBlob) throw new Error("KMS encrypt returned no ciphertext");
    return Buffer.from(res.CiphertextBlob);
  }
  async unwrap(wrapped: Buffer): Promise<Buffer> {
    const { client, mod } = await this.kms();
    const res = await client.send(new mod.DecryptCommand({ KeyId: this.kmsKeyId, CiphertextBlob: wrapped }));
    if (!res.Plaintext) throw new Error("KMS decrypt returned no plaintext");
    return Buffer.from(res.Plaintext);
  }
}

export interface EncryptedSecret {
  version: 1;
  keyId: string;
  wrappedDek: string;
  iv: string;
  tag: string;
  ciphertext: string;
}

export function serializeEncrypted(s: EncryptedSecret): string {
  return ["v1", s.keyId, s.wrappedDek, s.iv, s.tag, s.ciphertext].join(".");
}

export function parseEncrypted(payload: string): EncryptedSecret | null {
  const parts = payload.split(".");
  if (parts.length !== 6 || parts[0] !== "v1") return null;
  const [, keyId, wrappedDek, iv, tag, ciphertext] = parts as [string, string, string, string, string, string];
  return { version: 1, keyId, wrappedDek, iv, tag, ciphertext };
}

export class SecretVault {
  private readonly providers = new Map<string, KeyProvider>();
  constructor(
    private readonly primary: KeyProvider,
    legacy: KeyProvider[] = [],
  ) {
    this.providers.set(primary.keyId, primary);
    for (const p of legacy) this.providers.set(p.keyId, p);
  }

  async encrypt(plaintext: string, aad = ""): Promise<string> {
    const dek = randomBytes(32);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", dek, iv);
    if (aad) cipher.setAAD(Buffer.from(aad, "utf8"));
    const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const wrapped = await this.primary.wrap(dek);
    dek.fill(0);
    return serializeEncrypted({
      version: 1,
      keyId: this.primary.keyId,
      wrappedDek: wrapped.toString("base64url"),
      iv: iv.toString("base64url"),
      tag: cipher.getAuthTag().toString("base64url"),
      ciphertext: ct.toString("base64url"),
    });
  }

  async decrypt(payload: string, aad = ""): Promise<string> {
    const parsed = parseEncrypted(payload);
    if (!parsed) throw new Error("malformed encrypted secret");
    const provider = this.providers.get(parsed.keyId);
    if (!provider) throw new Error(`no key provider for key id ${parsed.keyId}`);
    const dek = await provider.unwrap(Buffer.from(parsed.wrappedDek, "base64url"));
    try {
      const decipher = createDecipheriv("aes-256-gcm", dek, Buffer.from(parsed.iv, "base64url"));
      if (aad) decipher.setAAD(Buffer.from(aad, "utf8"));
      decipher.setAuthTag(Buffer.from(parsed.tag, "base64url"));
      return Buffer.concat([
        decipher.update(Buffer.from(parsed.ciphertext, "base64url")),
        decipher.final(),
      ]).toString("utf8");
    } finally {
      dek.fill(0);
    }
  }

  /** Re-wrap the DEK with the primary provider (key rotation without touching ciphertext). */
  async rewrap(payload: string): Promise<string> {
    const parsed = parseEncrypted(payload);
    if (!parsed) throw new Error("malformed encrypted secret");
    if (parsed.keyId === this.primary.keyId) return payload;
    const provider = this.providers.get(parsed.keyId);
    if (!provider) throw new Error(`no key provider for key id ${parsed.keyId}`);
    const dek = await provider.unwrap(Buffer.from(parsed.wrappedDek, "base64url"));
    const wrapped = await this.primary.wrap(dek);
    dek.fill(0);
    return serializeEncrypted({ ...parsed, keyId: this.primary.keyId, wrappedDek: wrapped.toString("base64url") });
  }

  keyIdOf(payload: string): string | null {
    return parseEncrypted(payload)?.keyId ?? null;
  }
}

/** Masked display, e.g. `••••4f2a`. Never returns more than the last four characters. */
export function maskSecret(plaintext: string | null | undefined, visible = 4): string | null {
  if (!plaintext) return null;
  const tail = plaintext.length > visible ? plaintext.slice(-visible) : "";
  return `••••${tail}`;
}
