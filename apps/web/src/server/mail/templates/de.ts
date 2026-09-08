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
  contactReply: {
    subject: "Antwort auf deine Anfrage an Track [{reference}]",
    text: "Hallo {name},\n\n{body}\n\nViele Grüße\n{operator}\nTrack\n\n—\nDiese E-Mail beantwortet deine Anfrage an Track (Referenz {reference}). Antworte einfach auf diese E-Mail, wenn du weitere Fragen hast.",
  },
  breakGlassApproved: {
    subject: "Der Track-Support hat bis {until} Lesezugriff auf {organization}",
    text: "Ein Support-Operator von Track hat zeitlich begrenzten, rein lesenden Zugriff auf deine Organisation {organization} auf Track erhalten.\n\nBis: {until}\nGrund: {reason}\nTicket: {ticket}\nZugriff: {grantId}\n\nEs kann nichts in deinem Namen geändert werden, und jede Seite, die der Operator öffnet, wird in deinem Audit-Log festgehalten: {url}\n\nWenn du das nicht erwartet hast, wende dich an den Track-Support und nenne die Zugriffs-ID.",
  },
  breakGlassRevoked: {
    subject: "Der Support-Zugriff von Track auf {organization} ist beendet",
    text: "Der rein lesende Support-Zugriff auf deine Organisation {organization} auf Track ist beendet (Zugriff {grantId}).\n\nAlles, was der Operator geöffnet hat, steht in deinem Audit-Log: {url}",
  },
};
