import type { MailCopy } from "./index";

/**
 * Spanish (es, Spain) transactional e-mails, informal "tú" like the rest of the Spanish copy. Same shape
 * as en.ts; see docs/14-localization.md. Keep `{url}`, `{inviter}` and `{organization}` exactly as they are.
 */

export const MAIL_COPY_ES: MailCopy = {
  resetPassword: {
    subject: "Restablece tu contraseña de Track",
    text: "Restablece tu contraseña: {url}\n\nSi no has solicitado este cambio, ignora este correo.",
  },
  verifyEmail: {
    subject: "Verifica tu correo electrónico para Track",
    text: "Te damos la bienvenida a Track. Confirma tu dirección de correo electrónico: {url}",
  },
  invitation: {
    subject: "{inviter} te ha invitado a {organization} en Track",
    text: "Acepta la invitación: {url}",
  },
};
