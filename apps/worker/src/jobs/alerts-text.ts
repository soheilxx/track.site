import type { AlertEventDetail, AlertRuleKind, AlertSeverity } from "@track-site/db";

/**
 * Minimal localized notification text of the `alerts` job (six programme locales). The web app's
 * mail templates are web-only, so the worker carries its own table: a subject prefix, severity
 * words, one title + summary template per rule kind, the e-mail body frame and the words the
 * templates refer to (`{state}`, `{direction}`). Placeholders are filled in one pass from the
 * redacted event detail (snake_case keys) plus `site`, `severity`, `time` and `url`; a value can
 * never be re-interpreted as a placeholder. Unknown locales fall back to English.
 */
export const ALERT_TEXT_LOCALES = ["en", "de", "fr", "es", "it", "nl"] as const;
export type AlertTextLocale = (typeof ALERT_TEXT_LOCALES)[number];

export interface AlertKindText {
  title: string;
  summary: string;
}

export interface AlertTextCopy {
  subjectPrefix: string;
  severity: Record<AlertSeverity, string>;
  kinds: Record<AlertRuleKind, AlertKindText>;
  test: AlertKindText;
  /** e-mail body frame around the summary */
  body: string;
  labels: { site: string; severity: string; triggered: string; open: string; allSites: string };
  /** words the templates reference through `{state}` / `{direction}` */
  words: Record<string, string>;
}

const EN: AlertTextCopy = {
  subjectPrefix: "[Track alert]",
  severity: { info: "Info", warning: "Warning", critical: "Critical" },
  kinds: {
    event_drop: {
      title: "Event volume dropped {drop_percent} % on {site}",
      summary:
        "{observed} accepted events in the last {window_minutes} minutes instead of about {expected} (average of the same window over the last {baseline_weeks} weeks). Threshold: {threshold_percent} %.",
    },
    vendor_outage: {
      title: "Deliveries to {integration_name} are failing",
      summary:
        "{integration_name} ({connector_type}) rejected {error_rate_percent} % of {attempts} delivery attempts in the last 24 hours (threshold {threshold_percent} %). Last error class: {last_error_class}. Destination status: {status}.",
    },
    credential_expiry: {
      title: "Credential of {integration_name} {state}",
      summary:
        "The {credential_kind} credential of {integration_name} {state} ({days_left} days left, expires {expires_at}). Rotate it in the destination settings so deliveries do not stop.",
    },
    consent_errors: {
      title: "{rate_percent} % of events blocked by consent on {site}",
      summary:
        "{consent_dropped} of {received} events in the last {window_minutes} minutes were blocked for missing or denied consent (threshold {threshold_percent} %). Check the consent banner and the policy of the site.",
    },
    queue_lag: {
      title: "Delivery queue of {integration_name} is {lag_minutes} minutes behind",
      summary:
        "The oldest queued event for {integration_name} has been waiting {lag_seconds} seconds (threshold {threshold_seconds} seconds); {queue_ready} events are ready. Check the destination health and the worker.",
    },
    conversion_anomaly: {
      title: "Conversions {direction} {deviation_percent} % on {site}",
      summary:
        "{observed} conversions in the last {window_minutes} minutes instead of about {expected} (average of the same window over the last {baseline_weeks} weeks). Threshold: {threshold_percent} %.",
    },
  },
  test: {
    title: "Test notification from Track",
    summary:
      'This is a test of the notification channel "{channel}". No rule fired; nothing needs your attention.',
  },
  body: "{summary}\n\n{site_label}: {site}\n{severity_label}: {severity}\n{triggered_label}: {time}\n\n{open_label}: {url}\n\n— Track",
  labels: {
    site: "Site",
    severity: "Severity",
    triggered: "Triggered",
    open: "Open the alert history",
    allSites: "All sites",
  },
  words: {
    expired: "has expired",
    expiring: "is about to expire",
    disconnected: "is disconnected",
    drop: "dropped",
    spike: "rose",
  },
};

const DE: AlertTextCopy = {
  subjectPrefix: "[Track-Alarm]",
  severity: { info: "Info", warning: "Warnung", critical: "Kritisch" },
  kinds: {
    event_drop: {
      title: "Eventvolumen auf {site} um {drop_percent} % gesunken",
      summary:
        "{observed} akzeptierte Events in den letzten {window_minutes} Minuten statt etwa {expected} (Durchschnitt desselben Zeitfensters der letzten {baseline_weeks} Wochen). Schwelle: {threshold_percent} %.",
    },
    vendor_outage: {
      title: "Zustellungen an {integration_name} schlagen fehl",
      summary:
        "{integration_name} ({connector_type}) hat {error_rate_percent} % von {attempts} Zustellversuchen der letzten 24 Stunden abgelehnt (Schwelle {threshold_percent} %). Letzte Fehlerklasse: {last_error_class}. Status der Destination: {status}.",
    },
    credential_expiry: {
      title: "Zugangsdaten von {integration_name} {state}",
      summary:
        "Die {credential_kind}-Zugangsdaten von {integration_name} {state} ({days_left} Tage verbleibend, Ablauf {expires_at}). Rotieren Sie sie in den Destination-Einstellungen, damit Zustellungen nicht stoppen.",
    },
    consent_errors: {
      title: "{rate_percent} % der Events auf {site} durch Consent blockiert",
      summary:
        "{consent_dropped} von {received} Events der letzten {window_minutes} Minuten wurden wegen fehlender oder verweigerter Einwilligung blockiert (Schwelle {threshold_percent} %). Prüfen Sie Consent-Banner und Policy der Site.",
    },
    queue_lag: {
      title: "Zustellwarteschlange von {integration_name} hängt {lag_minutes} Minuten nach",
      summary:
        "Das älteste wartende Event für {integration_name} wartet seit {lag_seconds} Sekunden (Schwelle {threshold_seconds} Sekunden); {queue_ready} Events sind bereit. Prüfen Sie Destination Health und Worker.",
    },
    conversion_anomaly: {
      title: "Conversions auf {site} um {deviation_percent} % {direction}",
      summary:
        "{observed} Conversions in den letzten {window_minutes} Minuten statt etwa {expected} (Durchschnitt desselben Zeitfensters der letzten {baseline_weeks} Wochen). Schwelle: {threshold_percent} %.",
    },
  },
  test: {
    title: "Testbenachrichtigung von Track",
    summary:
      "Dies ist ein Test des Benachrichtigungskanals „{channel}“. Keine Regel hat ausgelöst; es ist nichts zu tun.",
  },
  body: "{summary}\n\n{site_label}: {site}\n{severity_label}: {severity}\n{triggered_label}: {time}\n\n{open_label}: {url}\n\n— Track",
  labels: {
    site: "Site",
    severity: "Schweregrad",
    triggered: "Ausgelöst",
    open: "Alarmverlauf öffnen",
    allSites: "Alle Sites",
  },
  words: {
    expired: "sind abgelaufen",
    expiring: "laufen bald ab",
    disconnected: "sind getrennt",
    drop: "gesunken",
    spike: "gestiegen",
  },
};

const FR: AlertTextCopy = {
  subjectPrefix: "[Alerte Track]",
  severity: { info: "Info", warning: "Avertissement", critical: "Critique" },
  kinds: {
    event_drop: {
      title: "Le volume d'événements sur {site} a chuté de {drop_percent} %",
      summary:
        "{observed} événements acceptés au cours des {window_minutes} dernières minutes au lieu d'environ {expected} (moyenne de la même fenêtre sur les {baseline_weeks} dernières semaines). Seuil : {threshold_percent} %.",
    },
    vendor_outage: {
      title: "Les envois vers {integration_name} échouent",
      summary:
        "{integration_name} ({connector_type}) a rejeté {error_rate_percent} % de {attempts} tentatives d'envoi au cours des dernières 24 heures (seuil {threshold_percent} %). Dernière classe d'erreur : {last_error_class}. Statut de la destination : {status}.",
    },
    credential_expiry: {
      title: "L'identifiant de {integration_name} {state}",
      summary:
        "L'identifiant {credential_kind} de {integration_name} {state} ({days_left} jours restants, expiration le {expires_at}). Renouvelez-le dans les réglages de la destination pour que les envois continuent.",
    },
    consent_errors: {
      title: "{rate_percent} % des événements bloqués par le consentement sur {site}",
      summary:
        "{consent_dropped} événements sur {received} au cours des {window_minutes} dernières minutes ont été bloqués faute de consentement (seuil {threshold_percent} %). Vérifiez la bannière de consentement et la politique du site.",
    },
    queue_lag: {
      title: "La file d'envoi de {integration_name} a {lag_minutes} minutes de retard",
      summary:
        "Le plus ancien événement en attente pour {integration_name} patiente depuis {lag_seconds} secondes (seuil {threshold_seconds} secondes) ; {queue_ready} événements sont prêts. Vérifiez la santé de la destination et le worker.",
    },
    conversion_anomaly: {
      title: "Les conversions sur {site} ont {direction} de {deviation_percent} %",
      summary:
        "{observed} conversions au cours des {window_minutes} dernières minutes au lieu d'environ {expected} (moyenne de la même fenêtre sur les {baseline_weeks} dernières semaines). Seuil : {threshold_percent} %.",
    },
  },
  test: {
    title: "Notification de test de Track",
    summary:
      "Ceci est un test du canal de notification « {channel} ». Aucune règle ne s'est déclenchée ; rien ne requiert votre attention.",
  },
  body: "{summary}\n\n{site_label} : {site}\n{severity_label} : {severity}\n{triggered_label} : {time}\n\n{open_label} : {url}\n\n— Track",
  labels: {
    site: "Site",
    severity: "Gravité",
    triggered: "Déclenchée",
    open: "Ouvrir l'historique des alertes",
    allSites: "Tous les sites",
  },
  words: {
    expired: "a expiré",
    expiring: "va expirer",
    disconnected: "est déconnecté",
    drop: "chuté",
    spike: "augmenté",
  },
};

const ES: AlertTextCopy = {
  subjectPrefix: "[Alerta de Track]",
  severity: { info: "Info", warning: "Aviso", critical: "Crítico" },
  kinds: {
    event_drop: {
      title: "El volumen de eventos en {site} cayó un {drop_percent} %",
      summary:
        "{observed} eventos aceptados en los últimos {window_minutes} minutos en lugar de unos {expected} (media de la misma ventana en las últimas {baseline_weeks} semanas). Umbral: {threshold_percent} %.",
    },
    vendor_outage: {
      title: "Los envíos a {integration_name} están fallando",
      summary:
        "{integration_name} ({connector_type}) rechazó el {error_rate_percent} % de {attempts} intentos de envío en las últimas 24 horas (umbral {threshold_percent} %). Última clase de error: {last_error_class}. Estado del destino: {status}.",
    },
    credential_expiry: {
      title: "La credencial de {integration_name} {state}",
      summary:
        "La credencial {credential_kind} de {integration_name} {state} ({days_left} días restantes, caduca el {expires_at}). Renuévala en la configuración del destino para que los envíos no se detengan.",
    },
    consent_errors: {
      title: "El {rate_percent} % de los eventos en {site} bloqueados por consentimiento",
      summary:
        "{consent_dropped} de {received} eventos en los últimos {window_minutes} minutos se bloquearon por falta o denegación de consentimiento (umbral {threshold_percent} %). Revisa el banner de consentimiento y la política del sitio.",
    },
    queue_lag: {
      title: "La cola de envío de {integration_name} lleva {lag_minutes} minutos de retraso",
      summary:
        "El evento más antiguo en cola para {integration_name} lleva {lag_seconds} segundos esperando (umbral {threshold_seconds} segundos); {queue_ready} eventos están listos. Revisa la salud del destino y el worker.",
    },
    conversion_anomaly: {
      title: "Las conversiones en {site} {direction} un {deviation_percent} %",
      summary:
        "{observed} conversiones en los últimos {window_minutes} minutos en lugar de unas {expected} (media de la misma ventana en las últimas {baseline_weeks} semanas). Umbral: {threshold_percent} %.",
    },
  },
  test: {
    title: "Notificación de prueba de Track",
    summary:
      "Esta es una prueba del canal de notificación «{channel}». Ninguna regla se activó; no hay nada que atender.",
  },
  body: "{summary}\n\n{site_label}: {site}\n{severity_label}: {severity}\n{triggered_label}: {time}\n\n{open_label}: {url}\n\n— Track",
  labels: {
    site: "Sitio",
    severity: "Gravedad",
    triggered: "Activada",
    open: "Abrir el historial de alertas",
    allSites: "Todos los sitios",
  },
  words: {
    expired: "ha caducado",
    expiring: "está a punto de caducar",
    disconnected: "está desconectada",
    drop: "cayeron",
    spike: "subieron",
  },
};

const IT: AlertTextCopy = {
  subjectPrefix: "[Avviso Track]",
  severity: { info: "Info", warning: "Avvertimento", critical: "Critico" },
  kinds: {
    event_drop: {
      title: "Il volume di eventi su {site} è calato del {drop_percent} %",
      summary:
        "{observed} eventi accettati negli ultimi {window_minutes} minuti invece di circa {expected} (media della stessa finestra nelle ultime {baseline_weeks} settimane). Soglia: {threshold_percent} %.",
    },
    vendor_outage: {
      title: "Le consegne a {integration_name} stanno fallendo",
      summary:
        "{integration_name} ({connector_type}) ha rifiutato il {error_rate_percent} % di {attempts} tentativi di consegna nelle ultime 24 ore (soglia {threshold_percent} %). Ultima classe di errore: {last_error_class}. Stato della destinazione: {status}.",
    },
    credential_expiry: {
      title: "La credenziale di {integration_name} {state}",
      summary:
        "La credenziale {credential_kind} di {integration_name} {state} ({days_left} giorni rimanenti, scadenza {expires_at}). Rinnovala nelle impostazioni della destinazione perché le consegne non si fermino.",
    },
    consent_errors: {
      title: "{rate_percent} % degli eventi su {site} bloccati dal consenso",
      summary:
        "{consent_dropped} di {received} eventi negli ultimi {window_minutes} minuti sono stati bloccati per consenso mancante o negato (soglia {threshold_percent} %). Controlla il banner del consenso e la policy del sito.",
    },
    queue_lag: {
      title: "La coda di consegna di {integration_name} è in ritardo di {lag_minutes} minuti",
      summary:
        "L'evento più vecchio in coda per {integration_name} attende da {lag_seconds} secondi (soglia {threshold_seconds} secondi); {queue_ready} eventi sono pronti. Controlla la salute della destinazione e il worker.",
    },
    conversion_anomaly: {
      title: "Le conversioni su {site} sono {direction} del {deviation_percent} %",
      summary:
        "{observed} conversioni negli ultimi {window_minutes} minuti invece di circa {expected} (media della stessa finestra nelle ultime {baseline_weeks} settimane). Soglia: {threshold_percent} %.",
    },
  },
  test: {
    title: "Notifica di prova da Track",
    summary:
      "Questa è una prova del canale di notifica «{channel}». Nessuna regola è scattata; non c'è nulla da fare.",
  },
  body: "{summary}\n\n{site_label}: {site}\n{severity_label}: {severity}\n{triggered_label}: {time}\n\n{open_label}: {url}\n\n— Track",
  labels: {
    site: "Sito",
    severity: "Gravità",
    triggered: "Attivato",
    open: "Apri la cronologia degli avvisi",
    allSites: "Tutti i siti",
  },
  words: {
    expired: "è scaduta",
    expiring: "sta per scadere",
    disconnected: "è disconnessa",
    drop: "calate",
    spike: "aumentate",
  },
};

const NL: AlertTextCopy = {
  subjectPrefix: "[Track-melding]",
  severity: { info: "Info", warning: "Waarschuwing", critical: "Kritiek" },
  kinds: {
    event_drop: {
      title: "Eventvolume op {site} is {drop_percent} % gedaald",
      summary:
        "{observed} geaccepteerde events in de laatste {window_minutes} minuten in plaats van ongeveer {expected} (gemiddelde van hetzelfde venster in de laatste {baseline_weeks} weken). Drempel: {threshold_percent} %.",
    },
    vendor_outage: {
      title: "Leveringen aan {integration_name} mislukken",
      summary:
        "{integration_name} ({connector_type}) heeft {error_rate_percent} % van {attempts} leverpogingen in de laatste 24 uur afgewezen (drempel {threshold_percent} %). Laatste foutklasse: {last_error_class}. Status van de bestemming: {status}.",
    },
    credential_expiry: {
      title: "Inloggegevens van {integration_name} {state}",
      summary:
        "De {credential_kind}-inloggegevens van {integration_name} {state} ({days_left} dagen resterend, verloopt op {expires_at}). Vernieuw ze in de instellingen van de bestemming zodat leveringen niet stoppen.",
    },
    consent_errors: {
      title: "{rate_percent} % van de events op {site} geblokkeerd door toestemming",
      summary:
        "{consent_dropped} van {received} events in de laatste {window_minutes} minuten zijn geblokkeerd wegens ontbrekende of geweigerde toestemming (drempel {threshold_percent} %). Controleer de toestemmingsbanner en het beleid van de site.",
    },
    queue_lag: {
      title: "Leveringswachtrij van {integration_name} loopt {lag_minutes} minuten achter",
      summary:
        "Het oudste wachtende event voor {integration_name} wacht al {lag_seconds} seconden (drempel {threshold_seconds} seconden); {queue_ready} events staan klaar. Controleer de gezondheid van de bestemming en de worker.",
    },
    conversion_anomaly: {
      title: "Conversies op {site} zijn {deviation_percent} % {direction}",
      summary:
        "{observed} conversies in de laatste {window_minutes} minuten in plaats van ongeveer {expected} (gemiddelde van hetzelfde venster in de laatste {baseline_weeks} weken). Drempel: {threshold_percent} %.",
    },
  },
  test: {
    title: "Testmelding van Track",
    summary:
      "Dit is een test van het meldingskanaal '{channel}'. Er is geen regel afgegaan; er is niets te doen.",
  },
  body: "{summary}\n\n{site_label}: {site}\n{severity_label}: {severity}\n{triggered_label}: {time}\n\n{open_label}: {url}\n\n— Track",
  labels: {
    site: "Site",
    severity: "Ernst",
    triggered: "Geactiveerd",
    open: "Meldingsgeschiedenis openen",
    allSites: "Alle sites",
  },
  words: {
    expired: "zijn verlopen",
    expiring: "verlopen binnenkort",
    disconnected: "zijn losgekoppeld",
    drop: "gedaald",
    spike: "gestegen",
  },
};

export const ALERT_TEXT: Record<AlertTextLocale, AlertTextCopy> = {
  en: EN,
  de: DE,
  fr: FR,
  es: ES,
  it: IT,
  nl: NL,
};

export function alertTextLocale(locale: string | null | undefined): AlertTextLocale {
  return (ALERT_TEXT_LOCALES as readonly string[]).includes(locale ?? "")
    ? (locale as AlertTextLocale)
    : "en";
}

/** Fills `{placeholders}` in one pass; unknown placeholders are left as they are. */
export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{([a-z_]+)\}/g, (match, key: string) =>
    key in values ? values[key]! : match,
  );
}

export interface AlertTextInput {
  type: "alert.triggered" | "alert.test";
  kind: AlertRuleKind;
  severity: AlertSeverity;
  detail: AlertEventDetail;
  siteName: string | null;
  triggeredAt: Date;
  url: string;
  /** channel name for the test notification */
  channelName?: string;
}

export interface RenderedAlertText {
  title: string;
  summary: string;
  subject: string;
  body: string;
  labels: AlertTextCopy["labels"];
}

/** Title, summary, e-mail subject and body of an alert in the channel's language. */
export function renderAlertText(
  locale: string | null | undefined,
  input: AlertTextInput,
): RenderedAlertText {
  const copy = ALERT_TEXT[alertTextLocale(locale)];
  const values: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.detail)) {
    if (v === null || v === undefined) continue;
    values[k] = typeof v === "string" && k in copy.words ? copy.words[k]! : String(v);
  }
  // words referenced by the templates (`{state}`, `{direction}`) are looked up in the locale's word list
  for (const key of ["state", "direction"]) {
    const raw = input.detail[key];
    if (typeof raw === "string") values[key] = copy.words[raw] ?? raw;
  }
  if (typeof input.detail.lag_seconds === "number")
    values.lag_minutes = String(Math.round(input.detail.lag_seconds / 60));
  values.site = input.siteName ?? copy.labels.allSites;
  values.severity = copy.severity[input.severity];
  values.time = input.triggeredAt.toISOString().replace("T", " ").slice(0, 16) + " UTC";
  values.url = input.url;
  values.channel = input.channelName ?? "";
  values.site_label = copy.labels.site;
  values.severity_label = copy.labels.severity;
  values.triggered_label = copy.labels.triggered;
  values.open_label = copy.labels.open;
  const kindText = input.type === "alert.test" ? copy.test : copy.kinds[input.kind];
  const title = fillTemplate(kindText.title, values);
  const summary = fillTemplate(kindText.summary, values);
  values.summary = summary;
  return {
    title,
    summary,
    subject: `${copy.subjectPrefix} ${values.severity}: ${title}`,
    body: fillTemplate(copy.body, values),
    labels: copy.labels,
  };
}
