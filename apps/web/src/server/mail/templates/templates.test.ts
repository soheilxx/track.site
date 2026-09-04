import { describe, expect, it } from "vitest";
import { ACTIVE_LOCALES, ALL_LOCALES } from "@/i18n/routing";
import { copyParity } from "@/lib/marketing-copy/parity";
import { MAIL_COPY, getMailCopy, renderMail } from "./index";

const PLACEHOLDERS: Record<keyof typeof MAIL_COPY.en, string[]> = { resetPassword: ["url"], verifyEmail: ["url"], invitation: ["inviter", "organization", "url"] };

describe("mail templates", () => {
  it("exist for every active locale with the English shape and placeholders", () => {
    for (const locale of ALL_LOCALES) expect(locale in MAIL_COPY).toBe(true);
    for (const locale of ACTIVE_LOCALES) expect(MAIL_COPY[locale], `MAIL_COPY.${locale}`).not.toBeNull();
    for (const entry of copyParity(MAIL_COPY)) {
      if (!entry.present) continue;
      expect(entry.missing, `MAIL_COPY.${entry.locale}`).toEqual([]);
      expect(entry.extra, `MAIL_COPY.${entry.locale}`).toEqual([]);
      const copy = MAIL_COPY[entry.locale]!;
      for (const [key, names] of Object.entries(PLACEHOLDERS) as Array<[keyof typeof PLACEHOLDERS, string[]]>) {
        const joined = `${copy[key].subject}\n${copy[key].text}`;
        for (const name of names) expect(joined, `${entry.locale}.${key} needs {${name}}`).toContain(`{${name}}`);
        expect(joined).toContain("Track");
      }
    }
  });

  it("resolves active locales strictly, translated inactive locales directly and everything else in English", () => {
    for (const locale of ACTIVE_LOCALES) expect(getMailCopy(locale), `MAIL_COPY.${locale}`).toBe(MAIL_COPY[locale]);
    for (const locale of ALL_LOCALES) {
      if (ACTIVE_LOCALES.includes(locale)) continue;
      // inactive programme locale: its own templates once the entry is wired, English while it is still null
      expect(getMailCopy(locale), `MAIL_COPY.${locale}`).toBe(MAIL_COPY[locale] ?? MAIL_COPY.en);
    }
    expect(getMailCopy("xx")).toBe(MAIL_COPY.en);
    expect(getMailCopy("")).toBe(MAIL_COPY.en);
    expect(getMailCopy(undefined)).toBe(MAIL_COPY.en);
    expect(getMailCopy(null)).toBe(MAIL_COPY.en);
  });

  it("fills placeholders in one pass without re-interpreting values", () => {
    const rendered = renderMail(getMailCopy("en").invitation, { inviter: "Ada {url}", organization: "Acme", url: "https://track.site/accept-invitation/1" });
    expect(rendered.subject).toBe("Ada {url} invited you to Acme on Track");
    expect(rendered.text).toBe("Accept the invitation: https://track.site/accept-invitation/1");
    expect(renderMail({ subject: "{missing}", text: "" }, {}).subject).toBe("{missing}");
  });
});
