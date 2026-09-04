import { pick } from "@/lib/marketing-copy/pick";
import type { LocalizedCopy } from "@/lib/marketing-copy/types";
import { MAIL_COPY_EN } from "./en";
import { MAIL_COPY_DE } from "./de";
import { MAIL_COPY_FR } from "./fr";
import { MAIL_COPY_ES } from "./es";
import { MAIL_COPY_IT } from "./it";
import { MAIL_COPY_NL } from "./nl";

/**
 * Transactional e-mail templates, one file per language (`./<locale>.ts`, export `MAIL_COPY_<LOCALE>`).
 * Plain text only (the transport in ../../mail.ts sends `text`); `{placeholders}` are filled by
 * `renderMail` in one pass, so a value can never be re-interpreted as a placeholder. The brand is
 * "Track"; addresses and links stay technical (`track.site`).
 */
export interface MailTemplate {
  subject: string;
  text: string;
}

export interface MailCopy {
  /** Placeholders: `{url}`. */
  resetPassword: MailTemplate;
  /** Placeholders: `{url}`. */
  verifyEmail: MailTemplate;
  /** Placeholders: `{inviter}`, `{organization}`, `{url}`. */
  invitation: MailTemplate;
}

export const MAIL_COPY: LocalizedCopy<MailCopy> = { en: MAIL_COPY_EN, de: MAIL_COPY_DE, fr: MAIL_COPY_FR, es: MAIL_COPY_ES, it: MAIL_COPY_IT, nl: MAIL_COPY_NL };

/**
 * Templates for a recipient's locale (the user's stored preference). Same rule as every other copy
 * module: an active locale must have templates (a missing one throws so the gap is noticed in
 * tests, never silently sent in English); inactive or unknown locales get English.
 */
export function getMailCopy(locale: string | null | undefined): MailCopy {
  return pick(locale ?? "en", MAIL_COPY);
}

/** Fills `{placeholders}` in subject and text; unknown placeholders are left as they are. */
export function renderMail(template: MailTemplate, values: Record<string, string>): MailTemplate {
  const fill = (s: string) => s.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? values[key]! : match));
  return { subject: fill(template.subject), text: fill(template.text) };
}
