import { beforeEach, describe, expect, it, vi } from "vitest";

// the routine's runtime dependencies are server-only; the pre-check, the support link and the mail are pure or stubbed
vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({ env: () => ({ HOST_MARKETING: "https://www.track.site/" }) }));
vi.mock("@/server/db", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
const mail = vi.hoisted(() => ({ ok: true, sent: [] as Array<{ to: string; subject: string; text: string }> }));
vi.mock("@/server/mail", () => ({
  sendMail: vi.fn(async (m: { to: string; subject: string; text: string }) => {
    mail.sent.push(m);
    return mail.ok ? { ok: true, transport: "file", id: "outbox" } : { ok: false, transport: "smtp", error: "connection refused" };
  }),
}));

import { logger } from "@/server/db";
import { TWO_FACTOR_RESET_ACTIONS, sendTwoFactorResetMail, twoFactorResetPrecheck, twoFactorResetSupportLink } from "./two-factor-reset";

const A = "0f6bd2b8-1d5c-4c1e-9a3f-2b7c1c0d5e11";
const B = "0f6bd2b8-1d5c-4c1e-9a3f-2b7c1c0d5e22";

describe("two-factor reset: pre-check", () => {
  it("refuses the actor's own account and invalid ids before anything is read", () => {
    expect(twoFactorResetPrecheck(A, A)).toBe("self");
    expect(twoFactorResetPrecheck(A, "not-a-uuid")).toBe("not_found");
    expect(twoFactorResetPrecheck(A, "")).toBe("not_found");
    expect(twoFactorResetPrecheck(A, B)).toBeNull();
  });
  it("names the audit actions of both consoles", () => {
    expect(TWO_FACTOR_RESET_ACTIONS).toEqual({ platform: "platform.two_factor.reset", member: "member.two_factor.reset" });
  });
});

describe("two-factor reset: notification", () => {
  beforeEach(() => {
    mail.ok = true;
    mail.sent.length = 0;
    vi.mocked(logger.warn).mockClear();
  });
  it("links the contact page in the recipient's language, English for unknown locales", () => {
    expect(twoFactorResetSupportLink("de")).toBe("https://www.track.site/de/contact");
    expect(twoFactorResetSupportLink("xx")).toBe("https://www.track.site/en/contact");
    expect(twoFactorResetSupportLink(null)).toBe("https://www.track.site/en/contact");
  });
  it("sends the localized template with the resetting role and the support link", async () => {
    expect(await sendTwoFactorResetMail({ email: "ada@example.com", locale: "de" }, "owner")).toBe(true);
    expect(mail.sent).toHaveLength(1);
    const sent = mail.sent[0]!;
    expect(sent.to).toBe("ada@example.com");
    expect(sent.subject).toBe("Deine Zwei-Faktor-Authentifizierung für Track wurde zurückgesetzt");
    expect(sent.text).toContain("einem Owner deiner Organisation");
    expect(sent.text).toContain("https://www.track.site/de/contact");
    expect(sent.text).not.toMatch(/\{(actorRole|product|supportLink)\}/);
    await sendTwoFactorResetMail({ email: "bob@example.com", locale: "en" }, "platformAdmin");
    expect(mail.sent[1]!.text).toContain("a Track platform administrator");
    await sendTwoFactorResetMail({ email: "cy@example.com", locale: "fr" }, "admin");
    expect(mail.sent[2]!.text).toContain("un administrateur de votre organisation");
  });
  it("reports a failed transport without the address and never throws", async () => {
    mail.ok = false;
    expect(await sendTwoFactorResetMail({ email: "ada@example.com", locale: "en" }, "admin")).toBe(false);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls[0])).not.toContain("ada@example.com");
  });
});
