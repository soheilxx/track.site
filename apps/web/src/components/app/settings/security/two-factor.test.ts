import { describe, expect, it } from "vitest";
import { authErrorKey, backupCodesFilename, formatBackupCodesText, groupSecret, normalizeBackupCodes, parseTotpUri } from "./two-factor";

const URI = "otpauth://totp/Track%3Aowner%40acme.test?secret=KRQWG23FONUWIZLDN5XGK43BNVYGYZLTMVRXEZLUMFWHK5DIMV3GKY3P&issuer=Track&digits=6&period=30";

describe("two-factor helpers", () => {
  it("reads issuer, account and the base32 secret from the otpauth URI", () => {
    expect(parseTotpUri(URI)).toEqual({
      secret: "KRQWG23FONUWIZLDN5XGK43BNVYGYZLTMVRXEZLUMFWHK5DIMV3GKY3P",
      issuer: "Track",
      account: "owner@acme.test",
      digits: 6,
      period: 30,
    });
    // issuer only in the label, defaults for digits and period, padded lower-case secret
    expect(parseTotpUri("otpauth://totp/Acme:me%40example.com?secret=jbswy3dpehpk3pxp====")).toEqual({
      secret: "JBSWY3DPEHPK3PXP",
      issuer: "Acme",
      account: "me@example.com",
      digits: 6,
      period: 30,
    });
  });

  it("rejects anything that is not a TOTP URI with a base32 secret", () => {
    expect(parseTotpUri("")).toBeNull();
    expect(parseTotpUri("https://example.com/?secret=JBSWY3DP")).toBeNull();
    expect(parseTotpUri("otpauth://hotp/x?secret=JBSWY3DP")).toBeNull();
    expect(parseTotpUri("otpauth://totp/x?secret=not-base32!")).toBeNull();
    expect(parseTotpUri("otpauth://totp/x")).toBeNull();
  });

  it("groups the manual key in blocks of four", () => {
    expect(groupSecret("JBSWY3DPEHPK3PXP")).toBe("JBSW Y3DP EHPK 3PXP");
    expect(groupSecret("JBSWY3DPEHPK3PXPAB")).toBe("JBSW Y3DP EHPK 3PXP AB");
    expect(groupSecret("JBSW Y3DP", 0)).toBe("JBSWY3DP");
  });

  it("keeps only non-empty strings of the backup code payload", () => {
    expect(normalizeBackupCodes(["abcde-12345", " fghij-67890 ", "", 42, null])).toEqual(["abcde-12345", "fghij-67890"]);
    expect(normalizeBackupCodes(null)).toEqual([]);
    expect(normalizeBackupCodes("abcde-12345")).toEqual([]);
  });

  it("writes the plain-text export with header, numbered codes and note", () => {
    const text = formatBackupCodesText(["abcde-12345", "fghij-67890"], {
      account: "owner@acme.test",
      generatedAt: new Date("2026-09-08T10:20:30Z"),
      labels: { title: "Track — backup codes", account: "Account", generated: "Generated", note: "Each code works once." },
    });
    expect(text).toBe(["Track — backup codes", "Account: owner@acme.test", "Generated: 2026-09-08T10:20:30.000Z", "", "1. abcde-12345", "2. fghij-67890", "", "Each code works once.", ""].join("\n"));
    expect(formatBackupCodesText(Array.from({ length: 10 }, (_, i) => `code-${i}`), { account: "a", generatedAt: new Date(0), labels: { title: "t", account: "a", generated: "g", note: "n" } })).toContain(" 1. code-0\n");
  });

  it("maps better-auth errors to message keys", () => {
    expect(authErrorKey(null)).toBe("generic");
    expect(authErrorKey({ status: 429, code: "INVALID_PASSWORD" })).toBe("rateLimited");
    expect(authErrorKey({ code: "INVALID_PASSWORD", status: 400 })).toBe("password");
    expect(authErrorKey({ code: "INVALID_CODE", status: 401 })).toBe("code");
    expect(authErrorKey({ code: "TWO_FACTOR_NOT_ENABLED", status: 400 })).toBe("notEnabled");
    // better-auth's account lockout and attempt budget read as "too many attempts"; a lost session as "session"
    expect(authErrorKey({ code: "ACCOUNT_TEMPORARILY_LOCKED", status: 429 })).toBe("rateLimited");
    expect(authErrorKey({ code: "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE", status: 400 })).toBe("rateLimited");
    expect(authErrorKey({ code: "UNAUTHORIZED", status: 401 })).toBe("session");
    expect(authErrorKey({ code: "SOMETHING_ELSE", status: 500 })).toBe("generic");
  });

  it("names the download by the UTC date", () => {
    expect(backupCodesFilename(new Date("2026-09-08T23:59:59Z"))).toBe("track-backup-codes-2026-09-08.txt");
    expect(backupCodesFilename(new Date("2026-09-08T00:00:00Z"), "codes")).toBe("codes-2026-09-08.txt");
  });
});
