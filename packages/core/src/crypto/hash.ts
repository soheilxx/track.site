import { createHash, createHmac } from "node:crypto";

export const sha256Hex = (input: string | Buffer): string => createHash("sha256").update(input).digest("hex");
export const sha256Base64Url = (input: string | Buffer): string =>
  createHash("sha256").update(input).digest("base64url");
export const hmacSha256Hex = (secret: string | Buffer, input: string | Buffer): string =>
  createHmac("sha256", secret).update(input).digest("hex");

/** Lower-case, trimmed email (vendor-neutral normalization; vendor specifics live in connectors). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Digits only with leading country code, e.g. `+49 151 1234567` -> `491511234567`. */
export function normalizePhoneDigits(phone: string): string {
  return phone.replace(/[^0-9]/g, "");
}

export function hashNormalizedEmail(email: string): string {
  return sha256Hex(normalizeEmail(email));
}
export function hashNormalizedPhone(phone: string): string {
  return sha256Hex(normalizePhoneDigits(phone));
}

/** Rotating pseudonymous hash for rate limiting (never stored as identity). */
export function rotatingHash(value: string, salt: string, date: Date = new Date()): string {
  const day = date.toISOString().slice(0, 10);
  return hmacSha256Hex(`${salt}:${day}`, value).slice(0, 32);
}
