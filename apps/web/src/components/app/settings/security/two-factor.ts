/**
 * Pure helpers of the two-factor enrolment UI: reading the otpauth URI better-auth returns (issuer,
 * account and the base32 secret for the manual key), grouping the key for reading it out, and the
 * plain-text export of the backup codes. Nothing here touches the network or stores anything.
 */
export interface TotpUriParts {
  secret: string;
  issuer: string | null;
  account: string | null;
  digits: number;
  period: number;
}

/** Parses `otpauth://totp/<issuer>:<account>?secret=…&issuer=…&digits=…&period=…`; null for anything else. */
export function parseTotpUri(uri: string): TotpUriParts | null {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return null;
  }
  if (url.protocol !== "otpauth:" || url.host.toLowerCase() !== "totp") return null;
  const secret = url.searchParams.get("secret")?.trim().toUpperCase().replace(/=+$/, "") ?? "";
  if (!/^[A-Z2-7]+$/.test(secret)) return null;
  const label = decodeLabel(url.pathname.replace(/^\/+/, ""));
  const colon = label.indexOf(":");
  const labelIssuer = colon >= 0 ? label.slice(0, colon).trim() : "";
  const account = (colon >= 0 ? label.slice(colon + 1) : label).trim() || null;
  const issuer = url.searchParams.get("issuer")?.trim() || labelIssuer || null;
  const digits = Number.parseInt(url.searchParams.get("digits") ?? "6", 10);
  const period = Number.parseInt(url.searchParams.get("period") ?? "30", 10);
  return {
    secret,
    issuer,
    account,
    digits: Number.isFinite(digits) && digits > 0 ? digits : 6,
    period: Number.isFinite(period) && period > 0 ? period : 30,
  };
}

/** Percent-decoded label of the URI path; a malformed escape leaves the raw text. */
function decodeLabel(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** `ABCDEFGHIJKL` → `ABCD EFGH IJKL` so the manual key can be read out and typed in groups. */
export function groupSecret(secret: string, groupSize = 4): string {
  const clean = secret.replace(/\s+/g, "");
  if (groupSize < 1) return clean;
  const groups: string[] = [];
  for (let i = 0; i < clean.length; i += groupSize) groups.push(clean.slice(i, i + groupSize));
  return groups.join(" ");
}

/** Keeps the strings of an unknown payload (the plugin returns `string[]`; anything else is dropped). */
export function normalizeBackupCodes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((code): code is string => typeof code === "string" && code.trim().length > 0).map((code) => code.trim());
}

export interface BackupCodesTextLabels {
  /** first line, e.g. "Track — two-factor backup codes" */
  title: string;
  /** e.g. "Account" */
  account: string;
  /** e.g. "Generated" */
  generated: string;
  /** closing note, e.g. "Each code works once. Keep this file somewhere safe." */
  note: string;
}

/** Plain-text export of the backup codes (one per line, numbered) with a short header and note. */
export function formatBackupCodesText(codes: readonly string[], meta: { account: string; generatedAt: Date; labels: BackupCodesTextLabels }): string {
  const width = String(codes.length).length;
  const lines = [
    meta.labels.title,
    `${meta.labels.account}: ${meta.account}`,
    `${meta.labels.generated}: ${meta.generatedAt.toISOString()}`,
    "",
    ...codes.map((code, i) => `${String(i + 1).padStart(width, " ")}. ${code}`),
    "",
    meta.labels.note,
    "",
  ];
  return lines.join("\n");
}

/** `track-backup-codes-2026-09-08.txt` (UTC date; safe on every file system). */
export function backupCodesFilename(generatedAt: Date, prefix = "track-backup-codes"): string {
  return `${prefix}-${generatedAt.toISOString().slice(0, 10)}.txt`;
}

/**
 * Message keys (`security.errors.*`) the two-factor server actions answer with: `password` (wrong
 * password), `noPassword` (no credential account, so no password to confirm — passkey- or OAuth-only
 * accounts), `code` (wrong or expired code), `rateLimited` (better-auth's lockout or the action's own
 * budget), `notEnabled`, `state` (the page shows a state the account no longer has), `session`
 * (signed out meanwhile) and `generic`.
 */
export type TwoFactorErrorKey = "password" | "noPassword" | "code" | "rateLimited" | "notEnabled" | "state" | "session" | "generic";

/**
 * Message key of a better-auth error (`{ status, code }` of the client, `{ statusCode, body.code }` of
 * a server-side `APIError`); unknown errors read as the generic message. Shared by the login-side
 * client and the server actions in `@/server/actions/security`.
 */
export function authErrorKey(error: { code?: string | undefined; status?: number | undefined } | null | undefined): TwoFactorErrorKey {
  if (!error) return "generic";
  if (error.status === 429) return "rateLimited";
  switch (error.code) {
    case "INVALID_PASSWORD":
    case "INVALID_EMAIL_OR_PASSWORD":
      return "password";
    case "INVALID_CODE":
    case "INVALID_TWO_FACTOR_COOKIE":
      return "code";
    case "TWO_FACTOR_NOT_ENABLED":
    case "TOTP_NOT_ENABLED":
    case "BACKUP_CODES_NOT_ENABLED":
      return "notEnabled";
    case "ACCOUNT_TEMPORARILY_LOCKED":
    case "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE":
      return "rateLimited";
    case "UNAUTHORIZED":
    case "SESSION_NOT_FRESH":
      return "session";
    default:
      return "generic";
  }
}
