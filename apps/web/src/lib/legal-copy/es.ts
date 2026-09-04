import type { LegalCopy } from "./index";

/**
 * Spanish (es, Spain) legal and trust documents (security, privacy, data processing, terms). Same shape
 * as en.ts; see docs/14-localization.md. Faithful translation of the operator's English documents: no
 * obligation, article reference or legal basis is added or dropped; GDPR → RGPD, the supervisory
 * authority example is the AEPD. Operator facts (company, address, DPO) are not in here — they come
 * from the environment (`operatorFromEnv`). `updated` stays the date of the English revision.
 */

export const LEGAL_ES: LegalCopy = {
  security: {
    title: "Seguridad",
    intro: "Cómo protege Track los datos de los clientes: arquitectura, controles y las garantías que puedes verificar en el producto.",
    updated: "2026-09-03",
    sections: [
      { title: "Aislamiento por tenant", paragraphs: ["Todas las tablas de tenant llevan el ID de organización y la seguridad a nivel de fila de PostgreSQL se aplica al rol de la aplicación. El rol del worker solo omite la RLS en el almacén de eventos particionado y en el registro de auditoría, nunca en la configuración de los tenants."] },
      { title: "Secretos", paragraphs: ["Las credenciales de los proveedores se cifran con cifrado de sobre (claves de datos AES-256-GCM envueltas por AWS KMS o una clave maestra local). El asistente, el navegador y los logs solo ven en todo caso una referencia y los cuatro últimos caracteres."] },
      { title: "Configuración firmada", paragraphs: ["Los bundles de configuración son inmutables, versionados y firmados con Ed25519. El SDK de navegador verifica la firma con WebCrypto antes de aplicar una configuración y rechaza todo lo demás (fail closed)."] },
      { title: "Data plane", paragraphs: ["El collector valida los orígenes, aplica límites de tasa y peticiones de servidor firmadas con HMAC, y entrega los eventos a una cola duradera antes de responder. Los workers procesan con reintentos, circuit breakers y una dead-letter queue. Los kill switches detienen la recogida y la entrega por sitio u organización en cuestión de segundos."], bullets: ["Sin fingerprinting, sin identidad entre sitios", "El escáner de PII bloquea los datos personales en las propiedades de los eventos antes de almacenarlos", "Las direcciones IP se truncan en la ingesta", "Log de auditoría y registro de consumo de solo escritura incremental (triggers de base de datos)"] },
      { title: "Acceso y operaciones", paragraphs: ["Control de acceso basado en roles con seis roles de organización, MFA y passkeys, acceso de emergencia (break-glass) con motivo obligatorio y entrada de auditoría, tareas de retención por tipo de datos y un contacto para la divulgación de vulnerabilidades publicado en esta página."] },
    ],
  },
  privacy: {
    title: "Política de privacidad",
    intro: "Esta política explica cómo trata el operador de track.site los datos personales de los visitantes del sitio web, de los clientes y de sus usuarios.",
    updated: "2026-09-03",
    sections: [
      { title: "Responsable del tratamiento", paragraphs: ["El responsable del tratamiento de este sitio web y de los datos de las cuentas de cliente es el operador indicado en el aviso legal. En el caso de los datos de eventos tratados por cuenta de los clientes, el cliente es el responsable y el operador actúa como encargado del tratamiento conforme al contrato de encargo del tratamiento."] },
      { title: "Datos que tratamos como responsable", paragraphs: ["Datos de cuenta (nombre, correo electrónico, organización, rol), datos de facturación (gestionados por Stripe; almacenamos los IDs de cliente y de suscripción), solicitudes de soporte, logs de seguridad (IP truncada, familia del agente de usuario) y cookies estrictamente necesarias para la autenticación y la preferencia de idioma."] },
      { title: "Datos que tratamos como encargado", paragraphs: ["Eventos enviados por los sitios web y los sistemas de los clientes: nombre y parámetros del evento, estado del consentimiento, identificadores seudónimos, datos de matching con hash, IP truncada y contexto de la página, además de los registros de entrega a los destinos configurados por el cliente. El tratamiento sigue la política de consentimiento del cliente; sin la finalidad requerida no se almacena ni se transmite ningún dato."] },
      { title: "Finalidades y base jurídica", paragraphs: ["Ejecución del contrato (art. 6.1.b) del RGPD) para cuentas, facturación y soporte; interés legítimo (art. 6.1.f)) para la seguridad y la prevención de abusos; consentimiento (art. 6.1.a)) cuando el visitante de un cliente ha aceptado finalidades de analítica o marketing; obligaciones legales (art. 6.1.c)) para los registros contables."] },
      { title: "Destinatarios y transferencias", paragraphs: ["Los subencargados figuran en la página de subencargados. Las transferencias fuera de la UE se basan en cláusulas contractuales tipo o en el Marco de Privacidad de Datos UE-EE. UU. Los proveedores publicitarios reciben datos solo para los destinos que el cliente ha configurado, y el asistente de configuración muestra el destinatario y la base de la transferencia de cada uno."] },
      { title: "Plazos de retención", paragraphs: ["Eventos 13 meses, IDs de clic 90 días, instantáneas de consentimiento 3 años, intentos de entrega 90 días, log de auditoría 2 años, transcripciones de chat 30 días, registros de solicitudes de los interesados 3 años; configurables por organización dentro de estos máximos. Los datos de la cuenta se eliminan 30 días después del cierre de la cuenta."] },
      { title: "Tus derechos", paragraphs: ["Acceso, rectificación, supresión, limitación, portabilidad y oposición. Los clientes tramitan las solicitudes de sus visitantes a través del centro de privacidad; los visitantes pueden dirigirse directamente al operador. Puedes presentar una reclamación ante una autoridad de control, por ejemplo la Agencia Española de Protección de Datos (AEPD) en España."] },
      { title: "Asistente de IA", paragraphs: ["El asistente de configuración utiliza la Responses API de OpenAI con retención cero de datos. Los secretos y los datos personales se eliminan antes de que un mensaje llegue al modelo; el modelo solo puede actuar mediante herramientas tipadas que se validan y auditan en el servidor."] },
    ],
  },
  "data-processing": {
    title: "Contrato de encargo del tratamiento",
    intro: "Resumen de las condiciones de encargo aplicables a los datos de eventos de los clientes. El contrato completo se facilita durante el onboarding y a petición.",
    updated: "2026-09-03",
    sections: [
      { title: "Objeto", paragraphs: ["Recogida, normalización, evaluación del consentimiento, almacenamiento y entrega de eventos de sitios web y de servidor a los destinos configurados por el cliente, además de paneles, diagnósticos y el asistente de configuración."] },
      { title: "Instrucciones", paragraphs: ["El cliente instruye al operador a través de la configuración del producto: sitios, destinos, mapeos, política de consentimiento y retención. Las versiones de configuración están firmadas y son auditables, de modo que las instrucciones quedan documentadas."] },
      { title: "Medidas técnicas y organizativas", paragraphs: ["Véase la página de seguridad: aislamiento por tenant con seguridad a nivel de fila, cifrado de sobre, configuración firmada, kill switches, escaneo de PII, IP truncadas, RBAC con MFA, registro de auditoría y alojamiento en la UE."] },
      { title: "Subencargados", paragraphs: ["Figuran en la página de subencargados; los clientes son informados de los cambios con 30 días de antelación y pueden oponerse."] },
      { title: "Solicitudes de los interesados y supresión", paragraphs: ["El centro de privacidad tramita las solicitudes de exportación y supresión sobre identificadores seudónimos en todos los sitios de la organización y registra el resultado. Las ejecuciones de retención eliminan los datos al final de los plazos configurados."] },
      { title: "Auditoría y terminación", paragraphs: ["Los logs de auditoría, las matrices de integración y los historiales de versiones están disponibles en el producto. A la terminación, el cliente puede exportar sus datos; las copias residuales se eliminan en un plazo de 30 días."] },
    ],
  },
  terms: {
    title: "Condiciones del servicio",
    intro: "Las condiciones bajo las que el operador presta Track a clientes empresariales.",
    updated: "2026-09-03",
    sections: [
      { title: "Servicio", paragraphs: ["Track es un tag manager, un router de eventos server-side que respeta el consentimiento y una capa de analítica, ofrecidos como suscripción. Las funciones y los límites se describen en la página de precios y en el plan que el cliente ha seleccionado."] },
      { title: "Obligaciones del cliente", paragraphs: ["Los clientes son responsables de una implementación lícita del consentimiento en sus propiedades, de la exactitud de la configuración de los destinos y de mantener actualizadas las credenciales de los proveedores. Los clientes no deben enviar categorías especiales de datos personales ni utilizar el servicio para fingerprinting o para eludir el consentimiento."] },
      { title: "Tarifas", paragraphs: ["Las tarifas se facturan a través de Stripe por plan e intervalo. El consumo por encima del límite del plan genera avisos y un periodo de gracia antes de que se apliquen los límites estrictos. Los precios se muestran en la página de precios tal como están configurados en Stripe."] },
      { title: "Disponibilidad y soporte", paragraphs: ["El operador persigue una alta disponibilidad del data plane y publica los incidentes en la página de estado. El soporte se presta por correo electrónico; los planes Enterprise incluyen un SLA."] },
      { title: "Responsabilidad", paragraphs: ["La responsabilidad se limita al importe pagado en los doce meses anteriores al hecho causante, salvo en caso de dolo, negligencia grave, daños a la vida o a la salud y responsabilidad legal imperativa."] },
      { title: "Duración y terminación", paragraphs: ["Las suscripciones se renuevan por intervalo y pueden cancelarse con efecto al final del periodo. El operador puede suspender, previo aviso, las cuentas que infrinjan estas condiciones, salvo cuando sea necesaria una actuación inmediata para proteger la plataforma."] },
      { title: "Ley aplicable", paragraphs: ["Se aplica la ley del domicilio social del operador; las protecciones imperativas de los consumidores no se ven afectadas."] },
    ],
  },
};
