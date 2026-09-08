import { beforeEach, describe, expect, it, vi } from "vitest";
import { account, user } from "@track-site/db";
import type { OrgContext } from "@/server/session";

/**
 * The two-factor server actions with better-auth, the session layer and the database stubbed: an
 * audit row exists only for a change better-auth actually made (the stored flag is re-read after the
 * call), a repeated claim is refused before better-auth is called (`state`), a wrong code or password
 * leaves no row, accounts without a credential account get `noPassword`, the per-account budget
 * answers `rateLimited`, and the row carries the tenant actor for members and the platform actor for
 * an operator without organisation. Passwords and codes never appear in a row.
 */
interface ApiError {
  statusCode: number;
  body: { code: string; message: string };
}
const apiError = (statusCode: number, code: string): ApiError => ({ statusCode, body: { code, message: code } });

const state = {
  session: null as { user: { id: string; email: string; name: string; emailVerified: boolean; platformRole: string; locale: string; twoFactorEnabled: boolean }; activeOrganizationId: string | null } | null,
  ctx: null as OrgContext | null,
  enabled: false,
  hasPassword: true,
};

const api = {
  enableTwoFactor: vi.fn(),
  verifyTOTP: vi.fn(),
  disableTwoFactor: vi.fn(),
  generateBackupCodes: vi.fn(),
};
const recordAudit = vi.fn();
const revalidatePath = vi.fn();
const TX = { tag: "tx" };

vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: "ts.session_token=stub" }) }));
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));
vi.mock("@/server/auth", () => ({ auth: () => ({ api }) }));
vi.mock("@/server/session", () => ({
  getSession: async () => state.session,
  getOrgContext: async () => state.ctx,
  withOrg: async (_ctx: unknown, fn: (tx: unknown) => Promise<unknown>) => fn(TX),
}));
vi.mock("@/server/db", () => {
  const rowsFor = (table: unknown) => {
    if (table === user) return [{ enabled: state.enabled }];
    if (table === account) return state.hasPassword ? [{ id: "acc1" }] : [];
    throw new Error("unexpected table");
  };
  const db = () => ({ select: () => ({ from: (table: unknown) => ({ where: () => ({ limit: async () => rowsFor(table) }) }) }) });
  return { db, logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } };
});
vi.mock("@track-site/db", async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), recordAudit: (...args: unknown[]) => recordAudit(...args) }));

const { confirmTwoFactorEnrolment, disableTwoFactor, regenerateBackupCodes, startTwoFactorEnrolment } = await import("./security");

let seq = 0;
/** a fresh account per test so the module-level rate budget never carries over */
function signIn(options: { platformRole?: string; member?: boolean } = {}) {
  const id = `user-${++seq}`;
  const platformRole = options.platformRole ?? "NONE";
  state.session = { user: { id, email: `${id}@acme.test`, name: "Test", emailVerified: true, platformRole, locale: "en", twoFactorEnabled: false }, activeOrganizationId: options.member === false ? null : "org1" };
  state.ctx =
    options.member === false
      ? null
      : ({
          user: state.session.user,
          organization: { id: "org1", name: "Acme", slug: "acme", suspendedAt: null },
          role: "ANALYST",
          tenant: { organizationId: "org1", actor: { kind: "user", userId: id, role: "ANALYST", platformRole }, requestId: "req1" },
        } as unknown as OrgContext);
  return id;
}

const URI = "otpauth://totp/Track%3Auser%40acme.test?secret=KRQWG23FONUWIZLDN5XGK43BNVYGYZLTMVRXEZLUMFWHK5DIMV3GKY3P&issuer=Track&digits=6&period=30";
const CODES = ["abcde-12345", "fghij-67890"];

beforeEach(() => {
  vi.clearAllMocks();
  state.enabled = false;
  state.hasPassword = true;
  api.enableTwoFactor.mockResolvedValue({ method: "totp", totpURI: URI, backupCodes: CODES });
  api.verifyTOTP.mockImplementation(async () => {
    state.enabled = true; // what better-auth does for an unverified secret: the account switches to two-factor
    return { token: "t", user: {} };
  });
  api.disableTwoFactor.mockImplementation(async () => {
    state.enabled = false;
    return { status: true };
  });
  api.generateBackupCodes.mockResolvedValue({ status: true, backupCodes: CODES });
});

describe("startTwoFactorEnrolment", () => {
  it("returns the URI and the codes once and writes no row (nothing changed for sign-ins yet)", async () => {
    signIn();
    const res = await startTwoFactorEnrolment({ password: "Demo-Password-123!" });
    expect(res).toEqual({ ok: true, error: null, auditFailed: false, totpUri: URI, backupCodes: CODES });
    expect(api.enableTwoFactor).toHaveBeenCalledWith({ body: { password: "Demo-Password-123!", method: "totp" }, headers: expect.any(Headers) });
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("refuses an account that already has two-factor before better-auth is called", async () => {
    signIn();
    state.enabled = true;
    const res = await startTwoFactorEnrolment({ password: "x" });
    expect(res.error).toBe("state");
    expect(api.enableTwoFactor).not.toHaveBeenCalled();
  });

  it("names the missing credential account instead of a wrong password", async () => {
    signIn();
    state.hasPassword = false;
    expect((await startTwoFactorEnrolment({ password: "x" })).error).toBe("noPassword");
    expect(api.enableTwoFactor).not.toHaveBeenCalled();
  });

  it("maps a wrong password and answers signed-out callers with session", async () => {
    signIn();
    api.enableTwoFactor.mockRejectedValueOnce(apiError(400, "INVALID_PASSWORD"));
    expect((await startTwoFactorEnrolment({ password: "wrong" })).error).toBe("password");
    expect((await startTwoFactorEnrolment({ password: "" })).error).toBe("password");
    state.session = null;
    expect((await startTwoFactorEnrolment({ password: "x" })).error).toBe("session");
  });
});

describe("confirmTwoFactorEnrolment", () => {
  it("writes the enabled row only after the stored flag confirms the switch, with the tenant actor", async () => {
    const id = signIn();
    const res = await confirmTwoFactorEnrolment({ code: "123 456" });
    expect(res).toEqual({ ok: true, error: null, auditFailed: false });
    expect(api.verifyTOTP).toHaveBeenCalledWith({ body: { code: "123456" }, headers: expect.any(Headers) });
    expect(recordAudit).toHaveBeenCalledTimes(1);
    const [tx, entry] = recordAudit.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(tx).toBe(TX);
    expect(entry).toMatchObject({ organizationId: "org1", action: "user.two_factor.enabled", targetType: "user", targetId: id, diff: { twoFactorEnabled: true }, requestId: "req1" });
    expect(entry.actor).toEqual({ kind: "user", userId: id, role: "ANALYST", platformRole: "NONE" });
    expect(JSON.stringify(entry)).not.toContain("123456");
    expect(revalidatePath).toHaveBeenCalledWith("/app/settings/security");
  });

  it("leaves no row for a wrong code, a malformed code or a switch that did not happen", async () => {
    signIn();
    api.verifyTOTP.mockRejectedValueOnce(apiError(401, "INVALID_CODE"));
    expect((await confirmTwoFactorEnrolment({ code: "000000" })).error).toBe("code");
    expect((await confirmTwoFactorEnrolment({ code: "12" })).error).toBe("code");
    // the code was right but better-auth did not flip the flag (a verified secret on a disabled account)
    api.verifyTOTP.mockImplementationOnce(async () => ({ token: "t", user: {} }));
    expect((await confirmTwoFactorEnrolment({ code: "123456" })).error).toBe("generic");
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("refuses a repeated claim: an enabled account cannot add a second enabled row", async () => {
    signIn();
    state.enabled = true;
    const res = await confirmTwoFactorEnrolment({ code: "123456" });
    expect(res.error).toBe("state");
    expect(api.verifyTOTP).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("reports a failed audit insert without hiding the change", async () => {
    signIn();
    recordAudit.mockRejectedValueOnce(new Error("insert failed"));
    expect(await confirmTwoFactorEnrolment({ code: "123456" })).toEqual({ ok: true, error: null, auditFailed: true });
  });

  it("writes the platform actor without organisation for an operator who is no member", async () => {
    const id = signIn({ platformRole: "PLATFORM_ADMIN", member: false });
    await confirmTwoFactorEnrolment({ code: "123456" });
    const [, entry] = recordAudit.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(entry).toMatchObject({ organizationId: null, action: "user.two_factor.enabled", targetId: id, requestId: null });
    expect(entry.actor).toEqual({ kind: "platform", userId: id, email: `${id}@acme.test`, platformRole: "PLATFORM_ADMIN" });
  });
});

describe("disableTwoFactor", () => {
  it("writes the disabled row after better-auth switched the account off", async () => {
    const id = signIn();
    state.enabled = true;
    const res = await disableTwoFactor({ password: "Demo-Password-123!" });
    expect(res).toEqual({ ok: true, error: null, auditFailed: false });
    expect(api.disableTwoFactor).toHaveBeenCalledWith({ body: { password: "Demo-Password-123!" }, headers: expect.any(Headers) });
    const [, entry] = recordAudit.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(entry).toMatchObject({ action: "user.two_factor.disabled", targetId: id, diff: { twoFactorEnabled: false } });
    expect(JSON.stringify(entry)).not.toContain("Demo-Password");
  });

  it("refuses a disabled account (no duplicate disabled rows) and a wrong password", async () => {
    signIn();
    expect((await disableTwoFactor({ password: "x" })).error).toBe("state");
    expect(api.disableTwoFactor).not.toHaveBeenCalled();
    state.enabled = true;
    api.disableTwoFactor.mockRejectedValueOnce(apiError(400, "INVALID_PASSWORD"));
    expect((await disableTwoFactor({ password: "wrong" })).error).toBe("password");
    expect(recordAudit).not.toHaveBeenCalled();
  });
});

describe("regenerateBackupCodes", () => {
  it("returns the new codes once and records the regeneration", async () => {
    const id = signIn();
    state.enabled = true;
    const res = await regenerateBackupCodes({ password: "Demo-Password-123!" });
    expect(res).toEqual({ ok: true, error: null, auditFailed: false, backupCodes: CODES });
    const [, entry] = recordAudit.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(entry).toMatchObject({ action: "user.two_factor.backup_codes_regenerated", targetId: id, diff: { twoFactorEnabled: true } });
    expect(JSON.stringify(entry)).not.toContain(CODES[0]);
  });

  it("needs two-factor and a password", async () => {
    signIn();
    expect((await regenerateBackupCodes({ password: "x" })).error).toBe("notEnabled");
    state.enabled = true;
    state.hasPassword = false;
    expect((await regenerateBackupCodes({ password: "x" })).error).toBe("noPassword");
    expect(api.generateBackupCodes).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });
});

describe("rate budget", () => {
  it("answers rateLimited after six calls of one account within a minute, better-auth untouched", async () => {
    signIn();
    for (let i = 0; i < 6; i++) expect((await startTwoFactorEnrolment({ password: "x" })).ok).toBe(true);
    expect((await startTwoFactorEnrolment({ password: "x" })).error).toBe("rateLimited");
    expect(api.enableTwoFactor).toHaveBeenCalledTimes(6);
    // another account has its own budget
    signIn();
    expect((await startTwoFactorEnrolment({ password: "x" })).ok).toBe(true);
  });
});
