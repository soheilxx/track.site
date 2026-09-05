/**
 * Server-authored, localized copy for the scope gate (supplement §9 "Strikte fachliche Begrenzung").
 * The refusal is the assistant's final answer of the turn (it is persisted like any other answer),
 * so the text is produced on the server in the user's locale; the browser never localizes model text.
 */
export const SCOPE_LOCALES = ["en", "de", "fr", "es", "it", "nl"] as const;
export type ScopeLocale = (typeof SCOPE_LOCALES)[number];

export interface ScopeQuickAction {
  id: "check_installation" | "connect_integration" | "fix_issues" | "credential_card";
  label: string;
  /** the message sent as the user's next turn — phrased in-scope so the gate lets it through */
  message: string;
}

export interface ScopeCopy {
  offTopic: string;
  secret: string;
  quickActions: { checkInstallation: ScopeQuickAction; connectIntegration: ScopeQuickAction; fixIssues: ScopeQuickAction; credentialCard: ScopeQuickAction };
}

const COPY: Record<ScopeLocale, ScopeCopy> = {
  en: {
    offTopic: "I'm specialised in setting up and optimising your Track setup. Right now I can check your installation, connect an integration or fix open tracking issues.",
    secret: "That looks like an access token or secret. For your security I don't process secrets in the chat and the value was not stored. Please use the secure credential card instead — it stores the secret encrypted and never shows it to the assistant.",
    quickActions: {
      checkInstallation: { id: "check_installation", label: "Check my installation", message: "Check whether the Track snippet is installed correctly on my site." },
      connectIntegration: { id: "connect_integration", label: "Connect an integration", message: "Help me connect a destination such as Meta, Google Ads or GA4." },
      fixIssues: { id: "fix_issues", label: "Fix tracking issues", message: "Run the tracking diagnostics and show me what needs fixing." },
      credentialCard: { id: "credential_card", label: "Open the secure credential card", message: "Show me the secure credential card for my destination." },
    },
  },
  de: {
    offTopic: "Ich bin auf die Einrichtung und Optimierung deines Track-Setups spezialisiert. Ich kann jetzt deine Installation prüfen, eine Integration verbinden oder offene Trackingprobleme beheben.",
    secret: "Das sieht nach einem Zugangstoken oder Secret aus. Zu deiner Sicherheit verarbeite ich Secrets nicht im Chat, und der Wert wurde nicht gespeichert. Nutze bitte die sichere Credential-Karte – sie speichert das Secret verschlüsselt und zeigt es dem Assistenten nie.",
    quickActions: {
      checkInstallation: { id: "check_installation", label: "Installation prüfen", message: "Prüfe, ob das Track-Snippet auf meiner Site korrekt eingebunden ist." },
      connectIntegration: { id: "connect_integration", label: "Integration verbinden", message: "Hilf mir, ein Ziel wie Meta, Google Ads oder GA4 zu verbinden." },
      fixIssues: { id: "fix_issues", label: "Trackingprobleme beheben", message: "Führe die Tracking-Diagnose aus und zeige mir, was behoben werden muss." },
      credentialCard: { id: "credential_card", label: "Sichere Credential-Karte öffnen", message: "Zeige mir die sichere Credential-Karte für mein Ziel." },
    },
  },
  fr: {
    offTopic: "Je suis spécialisé dans la configuration et l'optimisation de votre installation Track. Je peux dès maintenant vérifier votre installation, connecter une intégration ou corriger les problèmes de tracking en suspens.",
    secret: "Cela ressemble à un jeton d'accès ou à un secret. Pour votre sécurité, je ne traite pas les secrets dans le chat et la valeur n'a pas été enregistrée. Utilisez plutôt la carte d'identifiants sécurisée : elle stocke le secret chiffré et ne le montre jamais à l'assistant.",
    quickActions: {
      checkInstallation: { id: "check_installation", label: "Vérifier mon installation", message: "Vérifie si le snippet Track est correctement installé sur mon site." },
      connectIntegration: { id: "connect_integration", label: "Connecter une intégration", message: "Aide-moi à connecter une destination comme Meta, Google Ads ou GA4." },
      fixIssues: { id: "fix_issues", label: "Corriger les problèmes de tracking", message: "Lance le diagnostic de tracking et montre-moi ce qu'il faut corriger." },
      credentialCard: { id: "credential_card", label: "Ouvrir la carte d'identifiants sécurisée", message: "Montre-moi la carte d'identifiants sécurisée pour ma destination." },
    },
  },
  es: {
    offTopic: "Estoy especializado en configurar y optimizar tu instalación de Track. Ahora mismo puedo comprobar tu instalación, conectar una integración o resolver problemas de tracking pendientes.",
    secret: "Esto parece un token de acceso o un secreto. Por tu seguridad no proceso secretos en el chat y el valor no se ha guardado. Usa la tarjeta de credenciales segura: guarda el secreto cifrado y nunca se lo muestra al asistente.",
    quickActions: {
      checkInstallation: { id: "check_installation", label: "Comprobar mi instalación", message: "Comprueba si el snippet de Track está instalado correctamente en mi sitio." },
      connectIntegration: { id: "connect_integration", label: "Conectar una integración", message: "Ayúdame a conectar un destino como Meta, Google Ads o GA4." },
      fixIssues: { id: "fix_issues", label: "Resolver problemas de tracking", message: "Ejecuta el diagnóstico de tracking y muéstrame qué hay que corregir." },
      credentialCard: { id: "credential_card", label: "Abrir la tarjeta de credenciales segura", message: "Muéstrame la tarjeta de credenciales segura para mi destino." },
    },
  },
  it: {
    offTopic: "Sono specializzato nella configurazione e nell'ottimizzazione del tuo setup Track. Posso subito verificare la tua installazione, collegare un'integrazione o risolvere i problemi di tracking aperti.",
    secret: "Sembra un token di accesso o un segreto. Per la tua sicurezza non elaboro segreti nella chat e il valore non è stato salvato. Usa la scheda credenziali sicura: salva il segreto cifrato e non lo mostra mai all'assistente.",
    quickActions: {
      checkInstallation: { id: "check_installation", label: "Verifica la mia installazione", message: "Verifica se lo snippet Track è installato correttamente sul mio sito." },
      connectIntegration: { id: "connect_integration", label: "Collega un'integrazione", message: "Aiutami a collegare una destinazione come Meta, Google Ads o GA4." },
      fixIssues: { id: "fix_issues", label: "Risolvi i problemi di tracking", message: "Esegui la diagnostica del tracking e mostrami cosa va corretto." },
      credentialCard: { id: "credential_card", label: "Apri la scheda credenziali sicura", message: "Mostrami la scheda credenziali sicura per la mia destinazione." },
    },
  },
  nl: {
    offTopic: "Ik ben gespecialiseerd in het inrichten en optimaliseren van je Track-setup. Ik kan nu je installatie controleren, een integratie koppelen of openstaande trackingproblemen oplossen.",
    secret: "Dit lijkt op een toegangstoken of geheim. Voor je veiligheid verwerk ik geen geheimen in de chat en de waarde is niet opgeslagen. Gebruik de beveiligde credential-kaart: die bewaart het geheim versleuteld en toont het nooit aan de assistent.",
    quickActions: {
      checkInstallation: { id: "check_installation", label: "Mijn installatie controleren", message: "Controleer of het Track-snippet correct op mijn site is geïnstalleerd." },
      connectIntegration: { id: "connect_integration", label: "Een integratie koppelen", message: "Help me een bestemming zoals Meta, Google Ads of GA4 te koppelen." },
      fixIssues: { id: "fix_issues", label: "Trackingproblemen oplossen", message: "Voer de diagnose van mijn tracking uit en laat me zien wat er opgelost moet worden." },
      credentialCard: { id: "credential_card", label: "Beveiligde credential-kaart openen", message: "Toon mij de beveiligde credential-kaart voor mijn bestemming." },
    },
  },
};

export function scopeCopy(locale: string | null | undefined): ScopeCopy {
  const key = (locale ?? "en").slice(0, 2).toLowerCase();
  return COPY[(SCOPE_LOCALES as readonly string[]).includes(key) ? (key as ScopeLocale) : "en"];
}
