import type { AuthCopy } from "../types";

/**
 * Spanish (es, European Spanish, tuteo) copy of the auth area. Same shape as en.ts; see docs/14-localization.md.
 */

export const AUTH_COPY_ES: AuthCopy = {
  plan: { selected: "Seleccionado en la página de precios: {plan}, {interval}. El pago viene después de la configuración; allí todavía puedes cambiar de plan.", intervals: { monthly: "facturación mensual", yearly: "facturación anual" } },
  shell: {
    brandHome: "Track – inicio",
    legalLabel: "Legal",
    legal: { privacy: "Privacidad", terms: "Condiciones", imprint: "Aviso legal", security: "Seguridad" },
    region: "Región de datos de la UE · Encargado del tratamiento según el art. 28 del RGPD",
    stepsLabel: "Pasos de la configuración",
  },
  steps: ["Crear cuenta", "Confirmar correo", "Añadir tu sitio web"],
  signals: [
    { icon: "passkey", title: "Passkeys e inicio de sesión en dos pasos", text: "Inicia sesión con una passkey o protege tu cuenta con una app de autenticación." },
    { icon: "eu", title: "Región de datos de la UE", text: "Los datos de eventos se tratan en la UE por defecto. Track actúa como encargado del tratamiento según el art. 28 del RGPD." },
    { icon: "consent", title: "El consentimiento decide la entrega", text: "Un evento solo llega a una plataforma cuando el estado del consentimiento lo permite. Nada se da por supuesto." },
  ],
  preview: {
    eyebrow: "Lo que configurarás a continuación",
    title: "Un snippet. Eventos verificados. Consentimiento respetado.",
    text: "Track recibe los eventos de tu sitio web, los comprueba contra el estado del consentimiento y tu política, y los entrega a las plataformas que conectes.",
    caption: "Ilustración con valores de ejemplo, no datos reales.",
    diagram: {
      title: "Flujo de datos: sitio web, Track, filtro de consentimiento, destinos",
      website: "Sitio web",
      websiteSub: "navegador · servidor",
      track: "Track",
      trackSub: "eventos verificados",
      consent: "Consentimiento",
      consentState: "concedido",
      destinations: ["Meta", "Google Ads", "GA4"],
      delivered: "entregado (ejemplo)",
    },
  },
};
