import type { MailCopy } from "./index";

/**
 * French (fr) transactional e-mails, formal "vous" like the rest of the French copy. Same shape as
 * en.ts; see docs/14-localization.md. Keep `{url}`, `{inviter}` and `{organization}` exactly as they are.
 */

export const MAIL_COPY_FR: MailCopy = {
  resetPassword: {
    subject: "Réinitialisez votre mot de passe Track",
    text: "Réinitialisez votre mot de passe : {url}\n\nSi vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail.",
  },
  verifyEmail: {
    subject: "Vérifiez votre adresse e-mail pour Track",
    text: "Bienvenue sur Track. Confirmez votre adresse e-mail : {url}",
  },
  invitation: {
    subject: "{inviter} vous invite à rejoindre {organization} sur Track",
    text: "Acceptez l’invitation : {url}",
  },
};
