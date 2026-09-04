import type { MailCopy } from "./index";

/**
 * Dutch (nl) transactional e-mails, informal "je/jij" like the rest of the Dutch copy. Same shape as
 * en.ts; see docs/14-localization.md. Keep `{url}`, `{inviter}` and `{organization}` exactly as they are.
 */

export const MAIL_COPY_NL: MailCopy = {
  resetPassword: {
    subject: "Stel je Track-wachtwoord opnieuw in",
    text: "Stel je wachtwoord opnieuw in: {url}\n\nHeb je dit niet aangevraagd? Negeer dan deze e-mail.",
  },
  verifyEmail: {
    subject: "Bevestig je e-mailadres voor Track",
    text: "Welkom bij Track. Bevestig je e-mailadres: {url}",
  },
  invitation: {
    subject: "{inviter} heeft je uitgenodigd voor {organization} op Track",
    text: "Uitnodiging accepteren: {url}",
  },
};
