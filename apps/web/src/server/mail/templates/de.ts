import type { MailCopy } from "./index";

/**
 * German (de) transactional e-mails, informal "du" like the rest of the German copy. Same shape as
 * en.ts; see docs/14-localization.md. Keep `{url}`, `{inviter}` and `{organization}` exactly as they are.
 */

export const MAIL_COPY_DE: MailCopy = {
  resetPassword: {
    subject: "Setze dein Track-Passwort zurück",
    text: "Setze dein Passwort zurück: {url}\n\nWenn du das nicht angefordert hast, ignoriere diese E-Mail.",
  },
  verifyEmail: {
    subject: "Bestätige deine E-Mail-Adresse für Track",
    text: "Willkommen bei Track. Bestätige deine E-Mail-Adresse: {url}",
  },
  invitation: {
    subject: "{inviter} hat dich zu {organization} auf Track eingeladen",
    text: "Einladung annehmen: {url}",
  },
};
