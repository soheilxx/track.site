import type { MailCopy } from "./index";

/**
 * Italian (it) transactional e-mails, informal "tu" like the rest of the Italian copy. Same shape as
 * en.ts; see docs/14-localization.md. Keep `{url}`, `{inviter}` and `{organization}` exactly as they are.
 */

export const MAIL_COPY_IT: MailCopy = {
  resetPassword: {
    subject: "Reimposta la tua password di Track",
    text: "Reimposta la tua password: {url}\n\nSe non hai richiesto tu questa operazione, ignora questa e-mail.",
  },
  verifyEmail: {
    subject: "Verifica il tuo indirizzo e-mail per Track",
    text: "Ti diamo il benvenuto in Track. Conferma il tuo indirizzo e-mail: {url}",
  },
  invitation: {
    subject: "{inviter} ti ha invitato in {organization} su Track",
    text: "Accetta l'invito: {url}",
  },
};
