import type { ConsentCopy, ContactFormCopy, FooterCopy, HeaderCopy } from "../types";

/**
 * Spanish (es, European Spanish, tuteo) copy of the shared area. Same shape as en.ts; see docs/14-localization.md.
 */

export const HEADER_COPY_ES: HeaderCopy = {
  brandHome: "Track – inicio",
  mainNav: "Principal",
  skipToContent: "Saltar al contenido",
  groups: [
    {
      key: "product",
      label: "Producto",
      columns: [
        {
          key: "overview",
          title: "Visión general",
          links: [
            { href: "/features", label: "Funcionalidades", description: "Lo que hace Track, desde la configuración guiada hasta la entrega" },
            { href: "/how-it-works", label: "Cómo funciona", description: "Crea un sitio, instala el snippet, conecta destinos, publica" },
          ],
        },
        {
          key: "capabilities",
          title: "Capacidades",
          wide: true,
          links: [
            { href: "/features/ai-setup", label: "Configuración guiada por IA", description: "Describe tu sitio, confirma cada paso, publica una configuración firmada" },
            { href: "/features/server-side-tracking", label: "Router de eventos server-side", description: "Entrega desde el navegador y el servidor con un ID de evento compartido para la deduplicación" },
            { href: "/features/event-debugger", label: "Depurador de eventos", description: "Cada evento con su instantánea de consentimiento, su decisión de enrutamiento y la respuesta del proveedor" },
            { href: "/features/data-quality", label: "Calidad de datos", description: "Un Health Score con componentes explicables; cada incidencia enlaza con su solución" },
            { href: "/features/consent", label: "Consentimiento", description: "Opt-in estricto por defecto y Consent Mode v2; sin la finalidad adecuada no se envía nada" },
            { href: "/features/attribution", label: "Atribución", description: "IDs de clic solo para el destino que los necesita, y solo con consentimiento" },
          ],
        },
      ],
    },
    {
      key: "integrations",
      label: "Integraciones",
      columns: [
        {
          key: "ads",
          title: "Plataformas publicitarias",
          links: [
            { href: "/integrations/meta", label: "Meta Ads" },
            { href: "/integrations/google-ads", label: "Google Ads" },
            { href: "/integrations/tiktok", label: "TikTok Ads" },
            { href: "/integrations/linkedin", label: "LinkedIn Ads" },
            { href: "/integrations/microsoft", label: "Microsoft Ads" },
            { href: "/integrations/reddit", label: "Reddit Ads" },
          ],
        },
        {
          key: "data",
          title: "Analítica y datos",
          links: [
            { href: "/integrations/google-analytics", label: "Google Analytics 4" },
            { href: "/integrations/webhook", label: "Webhooks" },
            { href: "/integrations/affiliate-postbacks", label: "Postbacks de afiliación" },
          ],
        },
        {
          key: "shops",
          title: "Plataformas de e-commerce",
          links: [
            { href: "/integrations/shopify", label: "Shopify" },
            { href: "/integrations/woocommerce", label: "WooCommerce" },
            { href: "/integrations/shopware", label: "Shopware 6" },
          ],
        },
      ],
      more: { href: "/integrations", label: "Todas las integraciones", description: "Etiqueta en el navegador más API server-side para cada plataforma que la ofrezca" },
    },
    {
      key: "resources",
      label: "Recursos",
      columns: [
        {
          key: "learn",
          title: "Aprender",
          links: [
            { href: "/tracking-knowledge", label: "Tracking Knowledge", description: "Guías sobre tracking server-side, tracking de e-commerce, consentimiento y atribución" },
            { href: "/docs", label: "Documentación", description: "Instala el snippet, envía eventos, integra el consentimiento, configura destinos" },
          ],
        },
        {
          key: "docs",
          title: "Accesos rápidos a la documentación",
          links: [
            { href: "/docs#install", label: "Instalar el snippet" },
            { href: "/docs#events", label: "Enviar eventos del navegador" },
            { href: "/docs#server", label: "API de servidor y conversiones offline" },
            { href: "/docs#consent", label: "Integración del consentimiento" },
          ],
        },
        {
          key: "help",
          title: "Ayuda",
          links: [
            { href: "/support", label: "Soporte" },
            { href: "/status", label: "Estado del sistema" },
            { href: "/security", label: "Seguridad" },
            { href: "/contact", label: "Contacto" },
            { href: "/demo", label: "Reservar una demo" },
          ],
        },
      ],
    },
  ],
  pricing: { href: "/pricing", label: "Precios" },
  login: { href: "/login", label: "Iniciar sesión" },
  start: { href: "/signup", label: "Empieza gratis" },
  language: "Idioma",
  openMenu: "Abrir menú",
  closeMenu: "Cerrar menú",
  menuTitle: "Menú",
};

export const FOOTER_COPY_ES: FooterCopy = {
  tagline: "Tag manager AI-first, router de eventos server-side que respeta el consentimiento y capa de eventos first-party.",
  region: "Región de datos de la UE por defecto. Encargado del tratamiento según el art. 28 del RGPD.",
  rights: "Todos los derechos reservados.",
  legalNote: "Las páginas legales se ofrecen a título informativo y no constituyen asesoramiento jurídico.",
  language: "Idioma",
  columns: [
    {
      key: "product",
      title: "Producto",
      links: [
        { href: "/features", label: "Funcionalidades" },
        { href: "/how-it-works", label: "Cómo funciona" },
        { href: "/pricing", label: "Precios" },
        { href: "/docs", label: "Documentación" },
      ],
    },
    {
      key: "integrations",
      title: "Integraciones",
      links: [
        { href: "/integrations", label: "Todas las integraciones" },
        { href: "/integrations/meta", label: "Meta Ads" },
        { href: "/integrations/google-ads", label: "Google Ads" },
        { href: "/integrations/google-analytics", label: "Google Analytics 4" },
        { href: "/integrations/shopify", label: "Shopify" },
        { href: "/integrations/woocommerce", label: "WooCommerce" },
        { href: "/integrations/shopware", label: "Shopware 6" },
      ],
    },
    {
      key: "knowledge",
      title: "Conocimiento",
      links: [
        { href: "/tracking-knowledge", label: "Tracking Knowledge" },
        { href: "/docs#install", label: "Instalar el snippet" },
        { href: "/docs#server", label: "API de servidor" },
        { href: "/docs#consent", label: "Integración del consentimiento" },
        { href: "/tracking-knowledge/feed.xml", label: "Feed RSS" },
      ],
    },
    {
      key: "company",
      title: "Empresa",
      links: [
        { href: "/contact", label: "Contacto" },
        { href: "/demo", label: "Reservar una demo" },
        { href: "/support", label: "Soporte" },
        { href: "/status", label: "Estado del sistema" },
        { href: "/security", label: "Seguridad" },
      ],
    },
    {
      key: "legal",
      title: "Legal",
      links: [
        { href: "/privacy", label: "Privacidad" },
        { href: "/terms", label: "Condiciones" },
        { href: "/data-processing", label: "Encargo de tratamiento (DPA)" },
        { href: "/subprocessors", label: "Subencargados" },
        { href: "/imprint", label: "Aviso legal" },
      ],
    },
  ],
};

export const CONSENT_COPY_ES: ConsentCopy = {
  title: "Cookies y tecnologías similares",
  description: "Este sitio web solo almacena lo que necesita para funcionar. Las categorías opcionales solo se activan cuando las permites.",
  categories: {
    necessary: { label: "Estrictamente necesarias", text: "Idioma, tema, sesión y seguridad. Siempre activas." },
    analytics: { label: "Analítica", text: "Medición agregada del uso para mejorar el sitio web." },
    marketing: { label: "Marketing", text: "Medición de conversiones para campañas publicitarias." },
  },
  acceptAll: "Aceptar todas",
  declineOptional: "Rechazar opcionales",
  save: "Guardar selección",
  close: "Cerrar",
  privacy: { href: "/privacy", label: "Política de privacidad" },
};

export const FORM_COPY_ES: ContactFormCopy = { name: "Nombre", email: "Correo electrónico", company: "Empresa (opcional)", message: "Mensaje", submit: "Enviar", sent: "Gracias: hemos recibido tu mensaje y te responderemos por correo electrónico.", invalid: "Revisa los campos: nombre, un correo electrónico válido y un mensaje de al menos 10 caracteres.", rateLimited: "Demasiadas solicitudes desde esta red; inténtalo de nuevo más tarde.", generic: "Algo ha salido mal. Inténtalo de nuevo.", privacy: "Guardamos tu solicitud para responderla y la eliminamos una vez gestionada. Consulta la política de privacidad." };
