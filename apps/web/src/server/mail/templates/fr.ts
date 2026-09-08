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
  contactReply: {
    subject: "Réponse à votre demande adressée à Track [{reference}]",
    text: "Bonjour {name},\n\n{body}\n\nCordialement\n{operator}\nTrack\n\n—\nCet e-mail répond à la demande que vous avez adressée à Track (référence {reference}). Répondez simplement à cet e-mail si vous avez d’autres questions.",
  },
  breakGlassApproved: {
    subject: "Le support Track a un accès en lecture seule à {organization} jusqu’au {until}",
    text: "Un opérateur du support Track a obtenu un accès limité dans le temps et en lecture seule à votre organisation {organization} sur Track.\n\nJusqu’au : {until}\nMotif : {reason}\nTicket : {ticket}\nAccès : {grantId}\n\nRien ne peut être modifié en votre nom, et chaque page ouverte par l’opérateur est consignée dans votre journal d’audit : {url}\n\nSi vous ne vous attendiez pas à cet accès, contactez le support Track en indiquant l’identifiant de l’accès.",
  },
  breakGlassRevoked: {
    subject: "L’accès du support Track à {organization} est terminé",
    text: "L’accès en lecture seule du support à votre organisation {organization} sur Track est terminé (accès {grantId}).\n\nTout ce que l’opérateur a ouvert est consigné dans votre journal d’audit : {url}",
  },
  twoFactorReset: {
    subject: "Votre double authentification pour {product} a été réinitialisée",
    text: "Votre double authentification pour {product} a été réinitialisée par {actorRole}.\n\nLe secret de l’application d’authentification et vos codes de secours ont été supprimés, et vous avez été déconnecté partout. Connectez-vous avec votre mot de passe et configurez à nouveau la double authentification dans Paramètres → Sécurité.\n\nSi vous n’avez pas demandé cette réinitialisation, contactez-nous immédiatement : {supportLink}\n\n— Track",
    roles: { platformAdmin: "un administrateur de la plateforme Track", owner: "un propriétaire de votre organisation", admin: "un administrateur de votre organisation" },
  },
  supportAssigned: {
    subject: "[Track #{number}] attribué à vous : {subject}",
    text: "{actor} vous a attribué le ticket de support n° {number}.\n\nObjet : {subject}\n\nOuvrir le ticket dans Track Operations : {url}\n\n—\nVous recevez cet e-mail parce que « M’envoyer un e-mail quand un ticket m’est attribué » est activé dans vos paramètres de notification (la cloche dans Track Operations).",
    system: "Le service support (attribution automatique)",
  },
  supportCustomerReply: {
    subject: "[Track #{number}] nouvelle réponse du client : {subject}",
    text: "{requester} a répondu sur le ticket de support n° {number}, qui vous est attribué.\n\nObjet : {subject}\n\nOuvrir le ticket dans Track Operations : {url}\n\n—\nVous recevez cet e-mail parce que « M’envoyer un e-mail quand un client répond sur mon ticket » est activé dans vos paramètres de notification (la cloche dans Track Operations).",
  },
};
