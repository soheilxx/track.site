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
  contactReply: {
    subject: "Antwoord op je aanvraag bij Track [{reference}]",
    text: "Hallo {name},\n\n{body}\n\nMet vriendelijke groet\n{operator}\nTrack\n\n—\nDeze e-mail beantwoordt de aanvraag die je bij Track hebt ingediend (referentie {reference}). Heb je nog vragen? Antwoord dan gewoon op deze e-mail.",
  },
  breakGlassApproved: {
    subject: "Track-support heeft tot {until} alleen-lezen toegang tot {organization}",
    text: "Een supportmedewerker van Track heeft tijdelijke, alleen-lezen toegang gekregen tot je organisatie {organization} op Track.\n\nTot: {until}\nReden: {reason}\nTicket: {ticket}\nToegang: {grantId}\n\nEr kan niets namens jou worden gewijzigd, en elke pagina die de medewerker opent wordt vastgelegd in je auditlog: {url}\n\nVerwachtte je dit niet? Neem dan contact op met Track-support en vermeld het toegangs-id.",
  },
  breakGlassRevoked: {
    subject: "De supporttoegang van Track tot {organization} is beëindigd",
    text: "De alleen-lezen supporttoegang tot je organisatie {organization} op Track is beëindigd (toegang {grantId}).\n\nAlles wat de medewerker heeft geopend staat in je auditlog: {url}",
  },
};
