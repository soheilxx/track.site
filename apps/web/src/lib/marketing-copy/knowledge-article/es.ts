import type { KnowledgeArticleCopy } from "../types";

/**
 * Spanish (es, Spain) copy of the knowledge-article area. Same shape as en.ts; see docs/14-localization.md.
 * Register: tú. "Tracking Knowledge", "Track" and "Track AI" stay identical in every language.
 */

export const KNOWLEDGE_ARTICLE_COPY_ES: KnowledgeArticleCopy = {
  breadcrumbs: { label: "Ruta de navegación", home: "Track" },
  meta: { by: "Por", published: "Publicado", updated: "Actualizado", reviewed: "Última revisión", readingTime: "Tiempo de lectura", minutes: "{n} min de lectura" },
  progress: "Progreso de lectura",
  toc: "Contenido",
  takeaways: "Puntos clave",
  callouts: { note: "Nota", warning: "Atención", privacy: "Privacidad", practice: "En la práctica" },
  code: { copy: "Copiar código", copied: "Copiado" },
  steps: "Pasos",
  checklist: { open: "Pendiente", done: "Hecho" },
  sources: { heading: "Fuentes primarias", text: "Documentación y estándares en los que se basa este artículo." },
  legal: "Este artículo ofrece información general, no asesoramiento jurídico. Consulta a tu asesor en protección de datos para tu situación concreta.",
  editor: "Editor responsable",
  cta: {
    eyebrow: "Track",
    items: {
      "ai-setup": { title: "Configura el tracking con Track AI", text: "Describe tu sitio y tus plataformas; Track AI propone la configuración de eventos y tú apruebas cada cambio antes de que entre en producción.", label: "Ver la configuración con IA" },
      integrations: { title: "Conecta tus plataformas", text: "Meta, Google, TikTok, LinkedIn y más: en el navegador y server-side con el mismo modelo de eventos y un único estado de consentimiento.", label: "Explorar las integraciones" },
      "server-side": { title: "Tracking server-side sin la fontanería", text: "La recogida first-party, la deduplicación y la entrega a las APIs de servidor de las plataformas están integradas en Track.", label: "Cómo funciona el tracking server-side" },
      ecommerce: { title: "Eventos de tienda verificados", text: "Los pedidos de Shopify, WooCommerce y Shopware llegan a Track como eventos de servidor verificados, deduplicados contra el navegador.", label: "Ver las integraciones de tienda" },
      consent: { title: "Consentimiento aplicado en origen", text: "Track pasa cada evento por tu estado de consentimiento antes de que nada salga del navegador o del servidor.", label: "Ver la gestión del consentimiento" },
      attribution: { title: "Atribución que puedes comprobar", text: "Track muestra por plataforma qué identificadores de clic se capturaron, se reenviaron o se bloquearon.", label: "Ver la atribución" },
      "data-quality": { title: "Encuentra los huecos en los datos antes que las plataformas", text: "La bandeja de calidad de datos señala valores ausentes, compras duplicadas y entregas fallidas con una solución explicable.", label: "Ver la calidad de datos" },
      debugger: { title: "Depura los eventos mientras ocurren", text: "El depurador de eventos muestra cada evento con su origen, estado de consentimiento, marca de deduplicación y resultado de entrega.", label: "Ver el depurador de eventos" },
      product: { title: "Descubre cómo funciona Track", text: "Snippet, entrega server-side, consentimiento y configuración con IA en un solo recorrido.", label: "Cómo funciona" },
    },
  },
  related: "Artículos relacionados",
  feedback: { heading: "¿Te ha resultado útil este artículo?", yes: "Sí", no: "No", sending: "Enviando…", thanks: "Gracias por tu opinión.", error: "No se ha podido guardar tu opinión. Inténtalo de nuevo más tarde." },
};
