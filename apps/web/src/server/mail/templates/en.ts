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
};
