import type { MailCopy } from "./index";

/**
 * English (source language) transactional e-mails. Same shape as every other locale file; see
 * docs/14-localization.md. Keep `{url}`, `{inviter}` and `{organization}` exactly as they are.
 */

export const MAIL_COPY_EN: MailCopy = {
  resetPassword: {
    subject: "Reset your Track password",
    text: "Reset your password: {url}\n\nIf you did not request this, ignore this e-mail.",
  },
  verifyEmail: {
    subject: "Verify your e-mail for Track",
    text: "Welcome to Track. Confirm your e-mail address: {url}",
  },
  invitation: {
    subject: "{inviter} invited you to {organization} on Track",
    text: "Accept the invitation: {url}",
  },
  contactReply: {
    subject: "Re: your request to Track [{reference}]",
    text: "Hello {name},\n\n{body}\n\nKind regards\n{operator}\nTrack\n\n—\nThis e-mail answers the request you sent to Track (reference {reference}). Simply reply to this e-mail if you have further questions.",
  },
  breakGlassApproved: {
    subject: "Track support has read-only access to {organization} until {until}",
    text: "A Track support operator has been granted time-boxed, read-only access to your organisation {organization} on Track.\n\nUntil: {until}\nReason: {reason}\nTicket: {ticket}\nGrant: {grantId}\n\nNothing can be changed on your behalf, and every page the operator opens is recorded in your audit log: {url}\n\nIf you did not expect this, contact Track support and quote the grant id.",
  },
  breakGlassRevoked: {
    subject: "Track support access to {organization} has ended",
    text: "The read-only support access to your organisation {organization} on Track has ended (grant {grantId}).\n\nEverything the operator opened is recorded in your audit log: {url}",
  },
  twoFactorReset: {
    subject: "Your two-factor authentication for {product} was reset",
    text: "Your two-factor authentication for {product} was reset by {actorRole}.\n\nThe authenticator secret and your backup codes were deleted, and you were signed out everywhere. Sign in with your password and set up two-factor authentication again under Settings → Security.\n\nIf this was not requested, contact us right away: {supportLink}\n\n— Track",
    roles: { platformAdmin: "a Track platform administrator", owner: "an owner of your organisation", admin: "an administrator of your organisation" },
  },
};
