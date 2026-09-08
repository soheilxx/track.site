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
  contactReply: {
    subject: "Risposta alla tua richiesta a Track [{reference}]",
    text: "Ciao {name},\n\n{body}\n\nCordiali saluti\n{operator}\nTrack\n\n—\nQuesta e-mail risponde alla richiesta che hai inviato a Track (riferimento {reference}). Se hai altre domande, rispondi semplicemente a questa e-mail.",
  },
  breakGlassApproved: {
    subject: "Il supporto Track ha accesso in sola lettura a {organization} fino al {until}",
    text: "Un operatore del supporto Track ha ottenuto un accesso limitato nel tempo e in sola lettura alla tua organizzazione {organization} su Track.\n\nFino al: {until}\nMotivo: {reason}\nTicket: {ticket}\nAccesso: {grantId}\n\nNulla può essere modificato a tuo nome e ogni pagina aperta dall'operatore viene registrata nel tuo registro di audit: {url}\n\nSe non ti aspettavi questo accesso, contatta il supporto Track indicando l'identificativo dell'accesso.",
  },
  breakGlassRevoked: {
    subject: "L'accesso del supporto Track a {organization} è terminato",
    text: "L'accesso in sola lettura del supporto alla tua organizzazione {organization} su Track è terminato (accesso {grantId}).\n\nTutto ciò che l'operatore ha aperto è registrato nel tuo registro di audit: {url}",
  },
  twoFactorReset: {
    subject: "La tua autenticazione a due fattori per {product} è stata reimpostata",
    text: "La tua autenticazione a due fattori per {product} è stata reimpostata da {actorRole}.\n\nIl segreto dell'app di autenticazione e i tuoi codici di backup sono stati eliminati e sei stato disconnesso ovunque. Accedi con la tua password e configura di nuovo l'autenticazione a due fattori in Impostazioni → Sicurezza.\n\nSe non l'hai richiesto, contattaci subito: {supportLink}\n\n— Track",
    roles: { platformAdmin: "un amministratore della piattaforma Track", owner: "un proprietario della tua organizzazione", admin: "un amministratore della tua organizzazione" },
  },
};
