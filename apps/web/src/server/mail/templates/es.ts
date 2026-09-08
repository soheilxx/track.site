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
  contactReply: {
    subject: "Respuesta a tu solicitud a Track [{reference}]",
    text: "Hola {name}:\n\n{body}\n\nUn saludo\n{operator}\nTrack\n\n—\nEste correo responde a la solicitud que enviaste a Track (referencia {reference}). Si tienes más preguntas, responde a este correo.",
  },
  breakGlassApproved: {
    subject: "El soporte de Track tiene acceso de solo lectura a {organization} hasta {until}",
    text: "Un operador del soporte de Track ha recibido acceso temporal y de solo lectura a tu organización {organization} en Track.\n\nHasta: {until}\nMotivo: {reason}\nTicket: {ticket}\nAcceso: {grantId}\n\nNo se puede cambiar nada en tu nombre, y cada página que abra el operador queda registrada en tu registro de auditoría: {url}\n\nSi no esperabas este acceso, contacta con el soporte de Track e indica el identificador del acceso.",
  },
  breakGlassRevoked: {
    subject: "El acceso del soporte de Track a {organization} ha terminado",
    text: "El acceso de solo lectura del soporte a tu organización {organization} en Track ha terminado (acceso {grantId}).\n\nTodo lo que abrió el operador está registrado en tu registro de auditoría: {url}",
  },
  twoFactorReset: {
    subject: "Tu verificación en dos pasos para {product} se ha restablecido",
    text: "Tu verificación en dos pasos para {product} ha sido restablecida por {actorRole}.\n\nSe han eliminado el secreto de la aplicación de autenticación y tus códigos de respaldo, y se ha cerrado tu sesión en todas partes. Inicia sesión con tu contraseña y vuelve a configurar la verificación en dos pasos en Ajustes → Seguridad.\n\nSi no has solicitado esto, contáctanos de inmediato: {supportLink}\n\n— Track",
    roles: { platformAdmin: "un administrador de la plataforma Track", owner: "un propietario de tu organización", admin: "un administrador de tu organización" },
  },
  supportAssigned: {
    subject: "[Track #{number}] asignado a ti: {subject}",
    text: "{actor} te ha asignado el ticket de soporte n.º {number}.\n\nAsunto: {subject}\n\nAbrir el ticket en Track Operations: {url}\n\n—\nRecibes este correo porque «Enviarme un correo cuando se me asigne un ticket» está activado en tus ajustes de notificaciones (la campana en Track Operations).",
    system: "El servicio de soporte (asignación automática)",
  },
  supportCustomerReply: {
    subject: "[Track #{number}] nueva respuesta del cliente: {subject}",
    text: "{requester} ha respondido en el ticket de soporte n.º {number}, que está asignado a ti.\n\nAsunto: {subject}\n\nAbrir el ticket en Track Operations: {url}\n\n—\nRecibes este correo porque «Enviarme un correo cuando un cliente responda en mi ticket» está activado en tus ajustes de notificaciones (la campana en Track Operations).",
  },
};
