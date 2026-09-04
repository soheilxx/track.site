import type { HowItWorksCopy } from "../types";
import { SNIPPET } from "./samples";

/**
 * Spanish (es, European Spanish, tuteo) copy of the how-it-works area. Same shape as en.ts; see docs/14-localization.md.
 */

export const HOW_IT_WORKS_ES: HowItWorksCopy = {
  eyebrow: "Cómo funciona",
  title: "De tu dominio a conversiones verificadas en todas las plataformas",
  intro: "Un snippet en tu sitio, una sesión guiada con el asistente, una configuración firmada que tú apruebas. A partir de ahí, Track se encarga de los eventos, con el consentimiento evaluado para cada destino y un depurador que te muestra lo que ha pasado.",
  cta: "Empieza con tu dominio",
  ctaSecondary: "Ver las funcionalidades",
  stage: {
    title: "Snippet → Track → plataformas",
    description: "El snippet de tu sitio web envía eventos desde el navegador; tu tienda o tu servidor envían las mismas conversiones con un ID de evento compartido. Track evalúa el consentimiento en un filtro de políticas y transmite cada evento a Meta, Google Ads, Google Analytics 4 y TikTok.",
    caption: "Snippet → Track → Consentimiento/política → plataformas. La misma imagen que ves en el depurador para cada evento real.",
  },
  milestonesTitle: "Cuatro hitos, una sesión",
  milestonesText: "Esta es la perspectiva del cliente. Las comprobaciones técnicas detrás de cada hito se enumeran más abajo.",
  youLabel: "Tú",
  outcomeLabel: "Obtienes",
  steps: [
    { title: "Crea tu sitio", text: "Regístrate con tu dominio. Track crea el sitio, un ID de tracking público de seis caracteres y el snippet de una línea.", you: "introduces el dominio y pegas el snippet, o instalas la app de Shopify, WooCommerce o Shopware", outcome: "una instalación verificada: Track ve la primera vista de página y confirma la propiedad por DNS, archivo o metaetiqueta" },
    { title: "Deja que el asistente proponga la configuración", text: "El asistente detecta la plataforma y la herramienta de consentimiento, propone un plan de eventos para tu tipo de negocio y te pide los IDs públicos de las plataformas que utilizas.", you: "respondes a unas pocas preguntas e introduces los IDs de píxel en el chat y los tokens de acceso en la tarjeta segura de credenciales", outcome: "un borrador de configuración con eventos mapeados y un evento de prueba real aceptado por el proveedor" },
    { title: "Aprueba y publica", text: "Ves el diff, los destinatarios y el requisito de consentimiento de cada destino. Una aprobación publica un bundle firmado y versionado.", you: "lees el diff y haces clic en aprobar", outcome: "una configuración activa con su número de versión y rollback disponible con un clic" },
    { title: "Observa y mejora", text: "El depurador muestra cada evento con su decisión, el Health Score indica qué corregir y el asistente propone la solución.", you: "revisas la puntuación cuando cambia y apruebas las mejoras", outcome: "conversiones verificadas en todas las plataformas, con evidencia por evento" },
  ],
  snippet: { title: "El snippet", code: SNIPPET, copy: "Copiar snippet", copied: "Copiado", note: "Servido desde un host CDN first-party; la configuración que carga está firmada con Ed25519 y se verifica antes de ejecutar nada." },
  published: {
    title: "Configuración · versión 13",
    state: "activa",
    facts: [
      { label: "Aprobada por", value: "ti, vinculada al diff que leíste" },
      { label: "Firma", value: "Ed25519, verificada por el SDK" },
      { label: "Destinos", value: "Meta (navegador + servidor), Google Ads (servidor)" },
      { label: "Rollback", value: "versión 12, un clic" },
    ],
  },
  flows: {
    title: "De dónde vienen tus eventos",
    text: "Cambia entre los modos de entrega. Cada destino puede funcionar solo en el navegador, solo en el servidor o en ambos; el modo híbrido es el predeterminado porque los dos caminos cubren mutuamente sus huecos.",
    tabsLabel: "Modos de entrega",
    items: [
      {
        id: "browser",
        label: "Solo navegador",
        title: "Eventos desde el SDK del navegador",
        text: "El snippet recoge vistas de página, vistas de producto y eventos de carrito en el navegador del visitante y los envía al host de ingesta de Track. Las etiquetas de los proveedores solo se cargan después del consentimiento. Este modo se instala rápido, pero depende del navegador: los scripts bloqueados y las pestañas cerradas pierden eventos.",
        points: ["Instalación: un snippet", "Consentimiento: evaluado en el navegador y de nuevo en el servidor", "Hueco: ningún evento si el script se bloquea o la pestaña se cierra demasiado pronto"],
      },
      {
        id: "server",
        label: "Solo servidor",
        title: "Eventos desde tu servidor o tu tienda",
        text: "Tu plataforma de e-commerce, tu backend o tu CRM envían conversiones a la API de servidor con una clave de origen. Compras, reembolsos y conversiones offline llegan de forma fiable y nunca se bloquean en el navegador. Los datos de coincidencia se limitan a lo que conoce tu servidor.",
        points: ["Instalación: app de la tienda o una petición firmada desde tu backend", "Fiable para compras, reembolsos y leads de tu CRM", "Hueco: menos señales del navegador para la coincidencia"],
      },
      {
        id: "hybrid",
        label: "Navegador + servidor",
        title: "Dos caminos, un ID de evento",
        text: "El navegador y el servidor envían la misma conversión con el mismo ID de evento. Track normaliza ambos, aplica la decisión de consentimiento por destino y los transmite; los proveedores deduplican por ID de evento o por ID de pedido. Obtienes el alcance del camino del servidor con la calidad de coincidencia del camino del navegador.",
        points: ["Modo por defecto para cada destino que admite ambos", "Deduplicación: ID de evento (Meta, TikTok, Pinterest, Snapchat, Microsoft, LinkedIn…), ID de pedido (Google Ads)", "Consentimiento: una decisión por evento y destino para ambos caminos"],
      },
    ],
  },
  checks: {
    title: "Lo que Track comprueba por el camino",
    summary: "Mostrar las comprobaciones técnicas detrás de los cuatro hitos",
    intro: "Estas comprobaciones se ejecutan dentro de la sesión guiada y, más adelante, en el worker. Son la razón por la que bastan los cuatro hitos: no tienes que verificarlas a mano.",
    groups: [
      { title: "Sitio e instalación", items: ["Formato y accesibilidad del dominio", "Propiedad mediante registro DNS, archivo de verificación o metaetiqueta", "Snippet presente y firma de la configuración verificada en el navegador", "Primera vista de página recibida en el host de ingesta"] },
      { title: "Plataforma, herramienta de consentimiento y plan de eventos", items: ["Plataforma de e-commerce o CMS detectada con un nivel de confianza", "Herramienta de consentimiento detectada (TCF 2.2, GPP, Cookiebot, OneTrust, Usercentrics o API de consentimiento)", "Plantilla de plan de eventos elegida según el tipo de negocio (tienda, generación de leads, SaaS, publisher)", "Parámetros obligatorios por evento estándar, reglas de nomenclatura para eventos personalizados, PII bloqueada en las propiedades"] },
      { title: "Destinos y credenciales", items: ["IDs públicos validados contra el formato del proveedor", "Tokens de acceso guardados en el almacén cifrado mediante tarjeta u OAuth; nunca en la transcripción", "Finalidad de consentimiento requerida por cada destino registrada", "Matriz de IDs de clic comprobada: cada ID se transmite solo a su plataforma"] },
      { title: "Prueba, revisión y publicación", items: ["Evento de prueba enviado a través de la cola y el worker reales; veredicto del proveedor registrado", "Diff, lista de destinatarios y aprobador vinculados a un único token de aprobación", "Bundle firmado con Ed25519, versionado e inmutable", "Entrada de auditoría por cada llamada a herramienta y cada aprobación"] },
      { title: "Después de la puesta en marcha", items: ["Health Score: cobertura de consentimiento, eventos críticos, calidad del esquema, duplicados, entrega, actualidad", "Reintentos con backoff, circuit breaker y cola de mensajes fallidos por destino", "Incidencias agrupadas por huella, cada una con la herramienta que la resuelve", "Rollback a cualquier versión anterior"] },
    ],
  },
  architectureTitle: "Dos planos, una configuración firmada",
  architectureText: "Un plano de control para las personas y el asistente, un plano de datos para los eventos. No comparten nada salvo la configuración firmada: una prueba técnica después de los hitos, no un requisito para usar Track.",
  architectureColumns: { component: "Componente", responsibility: "Responsabilidad" },
  architecture: [
    { title: "SDK del navegador", text: "Almacenamiento condicionado al consentimiento, adaptadores de CMP, transporte por lotes, tracking de SPA, cargadores de proveedores con IDs de deduplicación compartidos. Se mantiene por debajo de 30 KB gzip gracias a un presupuesto en CI." },
    { title: "Collector", text: "Lista de orígenes permitidos, límites de velocidad, peticiones de servidor firmadas con HMAC, kill switches, traspaso a una cola duradera antes de devolver el 202." },
    { title: "Worker", text: "Normalización, análisis de PII, política de consentimiento, almacén de eventos, deduplicación de conversiones, registro de consumo, fan-out, entrega con reintentos y DLQ." },
    { title: "Plano de control", text: "Panel y asistente: herramientas tipadas, aprobaciones, registro de auditoría, RBAC, facturación, centro de privacidad, separados del plano de datos." },
  ],
  faqTitle: "Preguntas",
  faq: [
    { q: "¿Necesito un tag manager?", a: "No. El tracker carga por sí mismo las etiquetas de los proveedores después del consentimiento. Las configuraciones de GTM existentes pueden coexistir durante la migración." },
    { q: "¿Dónde se tratan los datos?", a: "En la UE. Las API de los proveedores solo reciben lo que has configurado, bajo la base de transferencia documentada que se muestra para cada destino." },
    { q: "¿Cómo se protege la configuración?", a: "Los bundles son inmutables, versionados y firmados con Ed25519; el SDK verifica la firma antes de aplicar cualquier configuración." },
    { q: "¿Qué pasa si el proveedor de IA no está disponible?", a: "Los mismos estados de configuración están disponibles como asistente basado en reglas. Nada en el pipeline depende de que un modelo esté en línea." },
  ],
  closing: { title: "Listo cuando tú lo estés", text: "Crea tu sitio, pega el snippet y deja que el asistente configure el primer destino.", cta: "Empieza gratis", secondary: "Leer la documentación" },
};
