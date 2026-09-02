import { randomInt } from "node:crypto";
import blocklist from "./blocklist.v1.json" with { type: "json" };

/**
 * Public, immutable 6-character tracking IDs (`^[A-Z0-9]{6}$`). Cryptographically random,
 * checked against a versioned blocklist, never sequential and never derived from tenant data.
 * The ID is public and is NOT an authentication credential.
 */
export const TRACKING_ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
export const TRACKING_ID_LENGTH = 6;
export const TRACKING_ID_REGEX = /^[A-Z0-9]{6}$/;
export const TRACKING_ID_BLOCKLIST_VERSION = blocklist.version;

const reserved = new Set(blocklist.reservedExact.map((v) => v.toUpperCase()));
const blockedSubstrings = blocklist.blockedSubstrings.map((v) => v.toUpperCase());

/** Normalize user input (case-insensitive, whitespace tolerant). Returns null when invalid. */
export function normalizeTrackingId(input: string | null | undefined): string | null {
  if (typeof input !== "string") return null;
  const v = input.trim().toUpperCase();
  return TRACKING_ID_REGEX.test(v) ? v : null;
}

export function isValidTrackingId(input: unknown): input is string {
  return typeof input === "string" && TRACKING_ID_REGEX.test(input);
}

export function isBlockedTrackingId(id: string): boolean {
  const v = id.toUpperCase();
  if (reserved.has(v)) return true;
  // Two-character substrings (e.g. "SS", "88") are only blocked when they appear twice or at both ends;
  // longer substrings are blocked anywhere.
  return blockedSubstrings.some((s) => {
    if (s.length >= 3) return v.includes(s);
    const first = v.indexOf(s);
    if (first === -1) return false;
    return v.indexOf(s, first + s.length) !== -1 || (v.startsWith(s) && v.endsWith(s));
  });
}

export function generateTrackingId(random: (max: number) => number = (max) => randomInt(max)): string {
  for (let attempt = 0; attempt < 100; attempt++) {
    let id = "";
    for (let i = 0; i < TRACKING_ID_LENGTH; i++) id += TRACKING_ID_ALPHABET[random(TRACKING_ID_ALPHABET.length)];
    if (!isBlockedTrackingId(id)) return id;
  }
  throw new Error("tracking id generation exhausted blocklist retries");
}

export class TrackingIdExhaustedError extends Error {
  constructor(attempts: number) {
    super(`could not allocate a unique tracking id after ${attempts} attempts`);
    this.name = "TrackingIdExhaustedError";
  }
}

/**
 * Atomic create-with-retry: the caller's `insert` must throw an error recognised by `isUniqueViolation`
 * when the ID already exists (unique index). Collisions draw a fresh ID.
 */
export async function createWithUniqueTrackingId<T>(
  insert: (trackingId: string) => Promise<T>,
  isUniqueViolation: (error: unknown) => boolean,
  options: { maxAttempts?: number; generate?: () => string } = {},
): Promise<T> {
  const max = options.maxAttempts ?? 8;
  const gen = options.generate ?? generateTrackingId;
  for (let attempt = 1; attempt <= max; attempt++) {
    const id = gen();
    try {
      return await insert(id);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      if (attempt === max) throw new TrackingIdExhaustedError(max);
    }
  }
  throw new TrackingIdExhaustedError(max);
}
