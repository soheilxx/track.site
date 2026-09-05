import { can, scanForPii, type OrgRole } from "@track-site/core";
import { scopeCopy } from "./scope-copy.ts";
import { ALWAYS_TOOLS, READ_ONLY_TOOLS } from "./state-machine.ts";
import type { ToolRegistry } from "./tools/registry.ts";
import { setupStepSchema, type AssistantUiResponse, type SetupStep } from "./ui-schema.ts";

/**
 * Server-side intent gate and tool allow-list (supplement §9 "Strikte fachliche Begrenzung").
 * Runs before any tool is selectable and before the model is called. It is deterministic and
 * rule-based on purpose: the model can be manipulated, this gate cannot. Allowed domains are
 * exactly the supplement's list; everything else — and every attempt to override instructions,
 * exfiltrate prompts or secrets, reach other tenants, run arbitrary code/queries or bypass approvals
 * and consent — is answered with a short friendly refusal, without a model call and without tools.
 *
 * The lexicons cover EN, DE, FR, ES, IT and NL. False refusals are cheap (a friendly sentence plus
 * three in-scope quick actions); a missed refusal is still harmless for the tenant because the
 * tool allow-list, the approval tokens and the DLP layer stay in force behind the gate.
 */
export const SCOPE_DOMAINS = ["setup", "site_detection", "snippet", "event_plan", "destinations", "integrations", "consent", "debugging", "diagnostics", "releases", "account"] as const;
export type ScopeDomain = (typeof SCOPE_DOMAINS)[number];

export type ScopeRefusalReason = "off_topic" | "injection" | "secret";

export type ScopeVerdict = { allowed: true; domain: ScopeDomain | null; contextual: boolean } | { allowed: false; reason: ScopeRefusalReason; domain: null };

/**
 * `\b` and `\w` are ASCII-only in JavaScript, so "diagnóstico", "événement" or "prüfen" would never
 * match a stem. Text and pattern sources are therefore folded the same way (NFKD, marks removed,
 * ß → ss) before matching; the lexicons below stay readable in their natural spelling.
 */
function fold(s: string): string {
  return s.normalize("NFKD").replace(/\p{M}+/gu, "").replace(/ß/g, "ss");
}
const R = (re: RegExp): RegExp => new RegExp(fold(re.source), re.flags);
/** `\b(a|b)\w*` — word stems that may carry inflections. */
const stems = (list: string[]): RegExp => R(new RegExp(`\\b(?:${list.join("|")})\\w*`, "i"));
/** `\b(a|b)\b` — exact words or phrases. */
const words = (list: string[]): RegExp => R(new RegExp(`\\b(?:${list.join("|")})\\b`, "i"));

/** Per-domain lexicon. One hit is enough; the best-scoring domain classifies the task. */
const DOMAIN_TERMS: Record<ScopeDomain, RegExp[]> = {
  setup: [
    stems(["setup", "set up", "einricht", "onboard", "configur", "konfigur", "ajust", "impostaz", "instell", "inricht", "loslegen", "commencer", "empezar", "iniziare", "beginnen"]),
    words(["track", "tracking", "tracker", "get(ting)? started", "next step", "nächste[rn]? schritt", "étape suivante", "siguiente paso", "prossimo passo", "volgende stap", "what.?s (next|missing)", "was (fehlt|jetzt)", "wat (mist|ontbreekt)", "status", "stand", "fortschritt", "progress", "avancement", "progreso", "progresso", "voortgang"]),
    stems(["missing", "fehlt", "fehlen", "manque", "falta", "manca", "ontbreek"]),
  ],
  site_detection: [
    words(["website", "web site", "webseite", "site web", "sitio", "sito", "homepage", "domain", "domäne", "domaine", "dominio", "domein", "url", "shop", "store", "boutique", "tienda", "negozio", "winkel", "cms", "wordpress", "shopify", "woocommerce", "magento", "shopware", "prestashop", "bigcommerce", "wix", "webflow", "squarespace", "typo3", "drupal", "joomla", "jimdo", "headless", "next\\.?js", "nuxt", "react", "vue", "php", "plattform", "platform", "plateforme", "plataforma", "piattaforma"]),
    /https?:\/\/|\b[a-z0-9-]+\.(com|de|fr|es|it|nl|io|shop|net|org|eu|co|at|ch|be|uk)\b/i,
    stems(["detect", "erkenn", "détect", "detecta", "rileva", "herken", "scan", "analy[sz]"]),
  ],
  snippet: [
    stems(["snippet", "script tag", "tracking.?code", "code snippet", "embed", "einbind", "eingebunden", "einbau", "eingebaut", "installation", "installiert", "installed", "installé", "instalado", "installato", "geïnstalleerd", "verif", "verifiz", "vérif", "comprob", "controll", "controle", "prüf", "überprüf", "bevestig"]),
    words(["check", "checks", "checked", "head tag", "<script", "dns", "txt record", "txt-record", "meta tag", "meta-tag", "integr[ae]r le code", "insertar el código", "inserire il codice", "code plaatsen"]),
  ],
  event_plan: [
    stems(["event", "ereignis", "événement", "evento", "gebeurtenis", "conversion", "konversion", "conversión", "conversione", "conversie", "trigger", "auslöser", "déclencheur", "disparador", "attivatore", "objectif", "objetivo", "obiettivo", "purchase", "kauf", "achat", "compra", "acquisto", "aankoop", "warenkorb", "panier", "carrito", "carrello", "winkelwagen", "checkout", "kasse", "afrekenen", "registr", "newsletter", "pageview", "seitenaufruf", "revenue", "umsatz", "ingresos", "fatturato", "omzet", "bestell", "commande", "pedido", "ordine", "bestelling", "währung", "devise", "moneda", "valuta", "currency"]),
    words(["measurement plan", "messplan", "plan de mesure", "plan de medición", "piano di misurazione", "meetplan", "event plan", "eventplan", "kpi", "goal", "goals", "ziel", "ziele", "add.?to.?cart", "lead", "leads", "anfrage", "formular", "formulaire", "formulario", "modulo", "formulier", "sign.?up", "page.?view", "view.?content", "chiffre d'affaires", "order", "orders", "value", "wert", "valeur", "valor", "valore", "waarde", "caisse", "caja", "cassa"]),
  ],
  destinations: [
    stems(["destination", "destino", "destinazione", "bestemming", "pixel", "webhook", "mapping", "zuordnung", "mappage", "mapeo", "mappatura", "toewijzing", "connect", "verbind", "anbind", "connecte", "conecta", "collega", "koppel", "credential", "zugangsdaten", "identifiant", "credencial", "credenzial", "inloggegeven", "token", "oauth", "zugriff", "accès", "acceso", "accesso", "toegang"]),
    words(["ziel", "ziele", "conversions? api", "capi", "measurement protocol", "server.?side", "serverseitig", "côté serveur", "del lado del servidor", "lato server", "serverzijde", "api key", "api-key", "clé api", "clave api", "chiave api", "api-sleutel", "feld", "field", "fields", "champ", "campo", "veld", "access", "meta", "facebook", "instagram", "google ads", "google analytics", "ga4", "gtm", "tag manager", "tiktok", "linkedin", "reddit", "pinterest", "snapchat", "microsoft ads", "bing", "criteo", "taboola", "outbrain", "awin", "affiliate", "partner", "amazon ads", "tradedesk", "adroll", "x ads", "twitter", "quora", "spotify", "yahoo", "klaviyo", "hubspot", "salesforce", "mailchimp", "matomo", "piwik", "plausible"]),
  ],
  integrations: [stems(["integration", "integratie", "integración", "integrazione", "intégration", "connector", "konnektor", "connecteur", "conector", "connettore", "plugin", "erweiterung", "extension", "extensión", "estensione", "extensie"]), words(["app", "apps"])],
  consent: [
    stems(["consent", "einwilligung", "zustimmung", "consentement", "consentimiento", "consenso", "toestemming", "cookie", "usercentrics", "cookiebot", "onetrust", "iubenda", "didomi", "borlabs", "complianz", "privacy", "datenschutz", "confidentialité", "privacidad", "opt.?in", "opt.?out", "minimi[sz]", "minimización", "minimizzazione", "minimalisatie", "retention", "aufbewahr", "conservation", "retención", "conservazione", "bewaartermijn", "anonymi[sz]", "pseudonym", "löschfrist", "zweck", "finalité", "finalidad", "finalità", "doeleinde"]),
    words(["banner", "cmp", "tcf", "gpp", "gpc", "gdpr", "dsgvo", "rgpd", "avg", "ccpa", "purpose", "purposes"]),
  ],
  debugging: [
    stems(["debug", "fehlersuche", "dépann", "depur", "duplic", "dedup", "doppelt", "dublette", "duplikat", "doublon", "dubbel", "fix", "behebe", "beheben", "behoben", "corrig", "resol", "risolv", "risolt", "correg", "oplos", "opgelos", "verhelp", "datenqualit", "payload", "parameter", "param", "attribut", "verworfen", "rejected", "abgelehnt", "rejeté", "rechazado", "rifiutato", "afgewezen", "error", "fehler", "erreur", "errore", "fout", "incorrect", "sbagliat", "verkeerd", "broken", "kaputt", "problem", "problème", "probleem", "issue", "discrepan", "abweich", "mismatch", "unterschied", "explorer", "debugger", "lineage", "delivery", "zustellung", "livraison", "entrega", "consegna", "levering", "deliver", "zugestellt", "forwarded", "weitergeleitet", "transmis", "reenviado", "inoltrato", "doorgestuurd", "gclid", "fbclid", "ttclid", "msclkid", "utm"]),
    words(["not (firing|working|tracked|received|arriving|showing)", "wird nicht (ausgelöst|erfasst|gesendet|gemessen|angezeigt)", "ne (fonctionne|s'affiche|se déclenche|arrive) pas", "no (funciona|se dispara|llega|aparece)", "non (funziona|arriva|parte|appare)", "werkt niet", "komt niet (aan|binnen)", "data quality", "qualité des données", "calidad de (los )?datos", "qualità dei dati", "datakwaliteit", "schema", "drop", "drops", "dropped", "wrong", "falsch", "faux", "roto", "kapot", "bug", "bugs", "numbers", "zahlen", "chiffres", "números", "numeri", "cijfers", "écart", "click.?id", "fbp", "fbc"]),
  ],
  diagnostics: [
    stems(["diagnos", "health", "gesund", "santé", "salud", "salute", "gezondheid", "anomal", "improve", "verbesser", "améliore", "mejor", "migliora", "verbeter", "optimi[sz]", "audit", "recommend", "empfehl", "recommand", "recomend", "raccomand", "aanbevel", "coverage", "abdeckung", "couverture", "cobertura", "copertura", "dekking", "einbruch", "baisse", "caída", "calo", "daling", "alert", "alarm", "warn"]),
    words(["spike", "score", "test everything", "teste alles", "tout tester", "probar todo", "testa tutto", "alles testen"]),
  ],
  releases: [
    stems(["draft", "entwurf", "brouillon", "borrador", "bozza", "version", "versie", "versión", "versione", "publish", "veröffentlich", "publier", "publicar", "pubblica", "publiceer", "release", "freigabe", "freigeben", "approv", "genehmig", "approb", "aprob", "goedkeur", "rollback", "zurückroll", "zurücksetz", "revert", "rückgängig", "annuler", "deshacer", "annulla", "ongedaan", "pausier", "anhalten", "stopp", "arrêt", "detener", "deactivat", "deaktivier", "désactiv", "desactiv", "disattiv", "uitschakel", "compare", "vergleich", "änderung", "modification", "cambio", "modifica", "wijziging", "scheduled", "geplant", "planifié", "programado", "programmato", "gepland", "incident", "notfall"]),
    words(["test", "tests", "concept", "go live", "live (schalten|gehen|stellen)", "mettre en ligne", "poner en marcha", "mettere online", "undo", "pause", "pausa", "stop", "diff", "change", "changes", "what changed", "was hat sich geändert", "kill switch"]),
  ],
  account: [
    stems(["billing", "abrechnung", "facturation", "facturación", "fatturazione", "facturering", "invoice", "rechnung", "facture", "factura", "fattura", "factuur", "tarif", "pricing", "preis", "prix", "precio", "prezzo", "prijs", "upgrade", "downgrade", "limit", "kontingent", "quota", "cuota", "overage", "mehrverbrauch", "dépassement", "excedente", "eccedenza", "trial", "testphase", "essai", "proefperiode", "subscription", "abonnement", "suscripción", "abbonamento", "permission", "berechtigung", "permiso", "permesso", "member", "mitglied", "membre", "miembro", "membro", "invite", "einlad", "inviter", "invitar", "invitare", "uitnodig", "setting", "einstellung", "paramètre", "impostazion", "instelling", "workspace", "organi[sz]ation", "organización", "organizzazione", "organisatie", "account", "konto", "compte", "cuenta", "two.?factor", "sso", "password", "passwort", "contraseña", "login", "anmeld", "connexion", "inloggen", "export", "usage", "verbrauch", "utilisation", "utilizzo", "gebruik"]),
    words(["plan", "plans", "role", "roles", "rolle", "rollen", "rôle", "rôles", "rol", "rollen", "ruolo", "ruoli", "rechten", "team", "lid", "mot de passe", "accesso", "inicio de sesión", "2fa", "prueba", "prova", "delete my data", "daten löschen", "supprimer mes données", "eliminar mis datos", "cancellare i miei dati", "mijn gegevens verwijderen", "events? per month", "events? pro monat", "abo", "uso"]),
  ],
};

/** Generic product/support words that keep an otherwise unmatched message in scope (the dashboard context makes them product-related). */
const WEAK_IN_SCOPE = words(["help", "hilfe", "aide", "ayuda", "aiuto", "hulp", "how (do|can|does|to)", "wie (kann|geht|funktioniert|mache)", "comment (faire|puis-je|fonctionne)", "cómo (puedo|funciona|hago)", "come (posso|funziona|faccio)", "hoe (kan|werkt|doe)", "dashboard", "panel", "assistant", "assistent", "ai", "ki", "data", "daten", "données", "datos", "dati", "gegevens", "report", "bericht", "rapport", "informe", "explain", "erklär\\w*", "expli\\w*", "spiega\\w*", "leg uit", "what (is|does|are|do)", "was (ist|bedeutet|sind|macht)", "qu'est-ce", "qué (es|significa|hace)", "cos'è", "cosa (significa|sono|fa)", "wat (is|betekent|zijn|doet)", "why", "warum", "wieso", "pourquoi", "por qué", "perché", "waarom", "show", "zeig\\w*", "montre\\w*", "muestra", "mostra", "toon", "open", "öffne", "ouvre", "abre", "apri", "continue", "weiter", "continuer", "continuar", "continua", "doorgaan", "again", "nochmal", "encore", "otra vez", "di nuovo", "opnieuw", "back", "zurück", "retour", "atrás", "indietro", "terug", "skip", "übersprin\\w*", "passer", "saltar", "salta", "overslaan", "done", "fertig", "terminé", "hecho", "fatto", "klaar", "thanks", "danke", "merci", "gracias", "grazie", "bedankt", "dank", "yes", "ja", "oui", "sí", "si", "no", "nein", "non", "nee", "ok", "okay", "sure", "gern\\w*", "volontiers", "claro", "certo", "prima", "correct", "richtig", "exact", "exacto", "esatto", "klopt", "wrong", "falsch", "faux", "incorrecto", "sbagliato", "fout"]);

/**
 * Clearly off-topic requests in six languages. They are refused even if a product word appears
 * ("write a poem about my shop") — the assistant is not a general chatbot. Stems are chosen so that
 * common customer vocabulary (shops selling songs, games, food or fitness; law or medical practices
 * as lead-gen sites; "resume the setup"; German "Wahl", "war") never triggers them.
 */
const STRONG_OFF_TOPIC: RegExp[] = [
  words(["poems?", "gedichte?", "poèmes?", "poemas?", "poesia", "poesie", "haiku", "limerick", "sonnets?", "sonett", "lyrics", "liedtext", "songtext", "paroles de (la )?chanson", "letra de (la )?canción", "testo della canzone", "songtekst", "jokes?", "witz", "witze", "blague", "blagues", "chistes?", "barzellett[ae]", "grap", "grappen", "riddles?", "rätsel", "devinettes?", "adivinanzas?", "indovinell[oi]", "raadsels?", "essays?", "aufsatz", "aufsätze", "dissertation", "ensayo", "saggio", "opstel", "fanfic", "love letter", "liebesbrief", "lettre d'amour", "carta de amor", "lettera d'amore", "liefdesbrief", "wedding speech", "hochzeitsrede", "discours de mariage", "discurso de boda", "discorso di nozze", "bruiloftstoespraak", "lebenslauf", "curriculum vitae", "cover letter", "lettre de motivation", "lettera di presentazione", "sollicitatiebrief", "motivatiebrief", "screenplay", "drehbuch", "sceneggiatura", "horoscope", "horoskop", "horóscopo", "oroscopo", "horoscoop", "tarot", "astrolog\\w*", "short story", "kurzgeschichte", "bedtime story", "gutenachtgeschichte"]),
  /\b(write|tell|schreib\w*|erzähl\w*|écris|raconte|escribe|cuenta|scrivi|racconta|schrijf|vertel)(?: me| mir| moi|-moi| mí| mi| me)?\b[^.?!\n]{0,12}\b(a|an|une|un|una|un|een|eine|einen|ein)\s+(story|stories|geschichte|histoire|historia|cuento|storia|racconto|verhaal|märchen|conte|favola|sprookje)\b/i,
  words(["recipes?", "rezepte?", "recettes?", "recetas?", "ricett[ae]", "recept(en)?", "cocktail recipe"]),
  words(["weather", "wetter", "météo", "weerbericht", "forecast", "vorhersage", "prévisions? météo", "pronóstico del tiempo", "previsioni del tempo", "che tempo fa", "qué tiempo hace"]),
  stems(["translate", "übersetz", "traduis", "traduire", "traduce", "traducir", "traduci", "tradurre", "vertaal", "vertalen"]),
  words(["homework", "hausaufgaben?", "devoirs", "tarea escolar", "deberes", "compiti", "huiswerk", "math problem", "matheaufgabe", "exercice de math", "problema de matemáticas", "problema di matematica", "wiskundeprobleem", "integral", "derivative", "ableitung", "dérivée", "derivada", "derivata", "afgeleide", "prime numbers?", "primzahl(en)?", "nombres? premiers?", "números? primos?", "numer[oi] prim[oi]", "priemgetal(len)?", "history of", "geschichte (der|des|von)", "histoire (de|du|des)", "storia (di|del|della)", "geschiedenis van", "capital of", "hauptstadt von", "capitale (de|du|di|del)", "capital de", "hoofdstad van", "population of", "einwohnerzahl", "population de", "población de", "popolazione di", "inwoneraantal", "who (is|was) the (president|king|queen|prime minister|chancellor)", "wer (ist|war) (der|die) (präsident\\w*|bundeskanzler\\w*|könig\\w*)", "qui est le (président|roi|premier ministre)", "quién es el (presidente|rey)", "chi è il (presidente|re)", "wie is de (president|koning|premier)", "election results?", "wahlergebnis\\w*", "résultats des élections", "resultados electorales", "risultati elettorali", "verkiezingsuitslag", "politics?", "politik", "politique", "política", "politica", "politiek", "religion", "religión", "religione", "religie"]),
  words(["stock (price|market|tips?)", "aktienkurs\\w*", "börsenkurs\\w*", "cours de (la )?bourse", "cotización bursátil", "quotazion[ei] di borsa", "beurskoers\\w*", "invest(ment)? (advice|tips?)", "anlageberatung", "anlagetipps?", "conseils? (d'investissement|en placement)", "consejos? de inversión", "consigli? di investimento", "beleggingsadvies", "lottery numbers", "lottozahlen", "numéros du loto", "números de lotería", "numeri del lotto", "lottonummers"]),
  words(["match results?", "spielergebnis\\w*", "résultat du match", "resultado del partido", "risultato della partita", "wedstrijduitslag", "champions league", "bundesliga", "premier league", "la liga", "serie a", "eredivisie", "world cup", "weltmeisterschaft", "coupe du monde", "mundial de fútbol", "mondiali di calcio", "olympi\\w*", "movie recommendation\\w*", "filmempfehlung\\w*", "recommandations? de films?", "recomendaciones? de películas?", "consigli? di film", "filmtips?", "netflix", "celebrit\\w*", "berühmtheit\\w*", "célébrité\\w*", "famos[oa]s?", "beroemdheid"]),
  words(["symptoms?", "symptome?", "symptômes?", "síntomas?", "sintom[ai]", "symptomen", "headache", "kopfschmerz\\w*", "mal de tête", "dolor de cabeza", "mal di testa", "hoofdpijn", "fever", "fieber", "fièvre", "fiebre", "febbre", "koorts", "covid", "pregnan\\w*", "schwanger\\w*", "enceinte", "embaraz\\w*", "incinta", "zwanger", "depress\\w*", "anxiety", "anxiété", "ansiedad", "ansia", "lawsuit", "procès", "demanda judicial", "causa legale", "rechtszaak"]),
  /\b(write|schreib\w*|écris|rédige|escribe|redacta|scrivi|schrijf)\b[^.?!\n]{0,40}\b(python|java|c\+\+|c#|rust|golang|bash script|shell script|powershell script|chrome extension|browser extension|discord bot|telegram bot|scraper|crawler|excel (formula|formel|formule|fórmula)|formule excel|formula excel|excel-formule)\b/i,
  words(["bombs?", "bombe", "explosives?", "sprengstoff", "malware", "ransomware", "keylogger", "phishing", "ddos", "counterfeit", "contrefaçon", "falsificar", "falsificare", "vervalsen", "hack(ing)? (into|a|the) (bank|account|wifi|phone|email|website)", "steal (the|a|my|their|customer)", "stehlen", "voler les", "robar (los|las|el|la)", "rubare (i|le|il|la)", "stelen"]),
].map(R);

/** Instruction override, role hijack, prompt/secret exfiltration, cross-tenant access, code/query/HTTP execution, hidden instructions. */
const INJECTION: RegExp[] = [
  // instruction override
  /\b(ignore|disregard|forget|override|bypass|discard)\b[^.?!\n]{0,40}\b(previous|prior|above|earlier|all|any|your|the|these|those|system|developer|safety|security)\b[^.?!\n]{0,40}\b(instruction|rule|guideline|prompt|restriction|guardrail|polic(y|ies)|constraint|boundar|safety)/i,
  /\b(ignor|vergiss|vergesse|übergeh|umgeh|missacht|setz\w*[^.?!\n]{0,12}außer kraft)\w*\b[^.?!\n]{0,40}\b(anweisung|regel|vorgabe|prompt|einschränkung|beschränkung|sicherheits|richtlinie|grenze)/i,
  /\b(ignor|oubli|contourn|outrepass|passe outre)\w*\b[^.?!\n]{0,40}\b(instruction|règle|consigne|prompt|restriction|directive|garde-fou)/i,
  /\b(ignor|olvid|omit|evit|elud|anul)\w*\b[^.?!\n]{0,40}\b(instruccion|regla|prompt|restricci|directriz|indicaci)/i,
  /\b(ignor|dimentic|scavalc|aggir|disattend)\w*\b[^.?!\n]{0,40}\b(istruzion|regol|prompt|restrizion|direttiv|vincol)/i,
  /\b(negeer|vergeet|omzeil|overrul)\w*\b[^.?!\n]{0,40}\b(instructie|regel|prompt|beperking|richtlijn|grens)/i,
  /\b(new|updated|real|actual|true|secret|hidden|override|priority|admin|system|developer) (instructions?|rules?|prompt|directives?|mode)\s*[:\-–]/i,
  /\b(neue|geheime|versteckte|echte|eigentliche|wahre|übergeordnete|admin|system|entwickler)[- ]?(anweisung|regel|prompt|direktive|modus)\w*\s*[:\-–]/i,
  /\b(nouvelles?|secrètes?|cachées?|vraies?|réelles?|prioritaires?)\s+(instructions?|règles?|consignes?|directives?)\s*[:\-–]/i,
  /\b(nuevas?|secretas?|ocultas?|verdaderas?|reales?|prioritarias?)\s+(instrucciones?|reglas?|directivas?|órdenes)\s*[:\-–]/i,
  /\b(nuove|segrete|nascoste|vere|reali|prioritarie)\s+(istruzioni|regole|direttive)\s*[:\-–]/i,
  /\b(nieuwe|geheime|verborgen|echte|werkelijke|prioritaire)\s+(instructies?|regels?|richtlijnen?)\s*[:\-–]/i,
  /\b(you are now|from now on you are|pretend (to be|you are|that you are)|roleplay as|you must now behave|act as if you (have|had) no|enter (developer|debug|god|admin|unrestricted|dan) mode|developer mode|jailbreak|\bDAN\b|do anything now|no restrictions mode|unfiltered mode)\b/i,
  /\b(du bist (ab )?jetzt|ab (jetzt|sofort) bist du|tu so,? als (ob|wärst)|verhalte dich,? als (ob|wärst)|spiel(e)? die rolle|entwicklermodus|debug-?modus|admin-?modus|ohne (jegliche |alle )?einschränkungen)\b/i,
  /\b(tu es (maintenant|désormais)|à partir de maintenant tu es|fais comme si tu|joue le rôle|comporte-toi comme si|mode développeur|mode débogage|sans (aucune )?restriction)/i,
  /\b(ahora eres|a partir de ahora eres|finge (que eres|ser)|actúa como si|compórtate como si|modo desarrollador|modo depuración|sin (ninguna )?restricci)/i,
  /\b(ora sei|da ora (in poi )?sei|fingi (di essere|che)|comportati come se|recita (il ruolo|la parte)|modalità sviluppatore|modalità debug|senza (alcuna )?restrizion)/i,
  /\b(je bent nu|vanaf nu ben je|doe alsof je|gedraag je alsof|speel de rol|ontwikkelaarsmodus|debugmodus|zonder (enige )?beperkingen)/i,
  // prompt / reasoning exfiltration
  /\b(system|developer|hidden|secret) (prompt|instructions?|message|rules|guidelines)\b/i,
  /\b(reveal|print|show|display|repeat|echo|output|dump|leak|expose|paste|quote)\b[^.?!\n]{0,40}\b(your (prompt|instructions|rules|guidelines|configuration|config|reasoning|thoughts|thinking|chain of thought)|the prompt you|rules you follow)/i,
  /\b(zeig|verrat|nenn|gib|schreib|wiederhol|drucke|leak)\w*\b[^.?!\n]{0,40}\b(system-?prompt|systemanweisung\w*|deine? (anweisungen|regeln|richtlinien|konfiguration|prompt)|gedankengang|gedankengänge|denkprozess)/i,
  /\b(montre|révèle|affiche|répète|donne|imprime|divulgue)\w*\b[^.?!\n]{0,40}\b(prompt système|message système|tes (règles|instructions|consignes)|ta configuration|ton (prompt|raisonnement)|chaîne de pensée)/i,
  /\b(muestra|revela|imprime|repite|dame|enséñame|filtra)\w*\b[^.?!\n]{0,40}\b(prompt del sistema|mensaje del sistema|tus (reglas|instrucciones)|tu (configuración|prompt|razonamiento)|cadena de pensamiento)/i,
  /\b(mostra|rivela|stampa|ripeti|dammi|svela|fai vedere)\w*\b[^.?!\n]{0,40}\b(prompt di sistema|messaggio di sistema|le tue (regole|istruzioni)|la tua configurazione|il tuo (prompt|ragionamento)|catena di pensiero)/i,
  /\b(toon|onthul|print|herhaal|geef|lek)\w*\b[^.?!\n]{0,40}\b(systeemprompt|systeembericht|je (regels|instructies|configuratie|prompt|redenering)|gedachtegang)/i,
  /\b(chain of thought|think (out loud|aloud)|show your (reasoning|thinking|thoughts)|reasoning tokens|scratchpad|inner monologue)\b/i,
  // secret / credential exfiltration (the plaintext value, not the existence of a credential)
  /\b(actual|real|full|raw|plaintext|plain[- ]text|clear[- ]text|decrypted|unmasked|stored|saved|complete|entire|whole|original) (value of (the |my |your )?)?(api[- ]?keys?|secrets?|tokens?|passwords?|credentials?|private keys?|access tokens?|client secrets?|refresh tokens?|master key|signing key|encryption key)\b/i,
  /\b(print|dump|echo|paste|leak|expose|decrypt|unmask|reveal|exfiltrate)\b[^.?!\n]{0,30}\b(api[- ]?keys?|secrets?|tokens?|passwords?|credentials?|private keys?|access tokens?|client secrets?|master key|signing key|encryption key|env(ironment)? (vars?|variables?)|\.env|vault)\b/i,
  /\b(echte[rnms]?|vollständige[rnms]?|unmaskierte[rnms]?|entschlüsselte[rnms]?|gespeicherte[rnms]?|im klartext|klartext)\b[^.?!\n]{0,20}\b(api[- ]?keys?|api[- ]?schlüssel|secrets?|tokens?|passw(ort|örter)|zugangsdaten|privaten? schlüssel|access[- ]?tokens?|client[- ]?secrets?|master[- ]?key)/i,
  /\b(drucke|dump|leake?|entschlüssel|demaskier|enthüll|verrat)\w*\b[^.?!\n]{0,40}\b(api[- ]?keys?|api[- ]?schlüssel|secrets?|tokens?|passw(ort|örter)|zugangsdaten|privaten? schlüssel|access[- ]?tokens?|client[- ]?secrets?|master[- ]?key|umgebungsvariable\w*|\.env|tresor|vault)/i,
  /\b(réel(le)?s?|complets?|complètes?|en clair|déchiffrés?|stockés?|enregistrés?)\b[^.?!\n]{0,20}\b(clés? api|secrets?|jetons?|tokens?|mots? de passe|identifiants|clés? privées?|client secret)/i,
  /\b(imprime|affiche en clair|divulgue|déchiffre|révèle|expose)\w*\b[^.?!\n]{0,40}\b(clés? api|secrets?|jetons?|tokens?|mots? de passe|identifiants|clés? privées?|client secret|variables? d'environnement|\.env|coffre)/i,
  /\b(real(es)?|complet[oa]s?|en texto plano|descifrad[oa]s?|guardad[oa]s?|almacenad[oa]s?)\b[^.?!\n]{0,20}\b(claves? (de )?api|secretos?|tokens?|contraseñas?|credenciales|claves? privadas?|client secret)/i,
  /\b(imprime|vuelca|filtra|descifra|revela|expón|muestra en texto plano)\w*\b[^.?!\n]{0,40}\b(claves? (de )?api|secretos?|tokens?|contraseñas?|credenciales|claves? privadas?|client secret|variables? de entorno|\.env|bóveda)/i,
  /\b(real[ei]|complet[oaie]|in chiaro|decifrat[oaie]|salvat[oaie]|memorizzat[oaie])\b[^.?!\n]{0,20}\b(chiavi? api|segret[oi]|tokens?|password|credenziali|chiavi? privat[ae]|client secret)/i,
  /\b(stampa|esporta in chiaro|svela|decifra|rivela|esponi)\w*\b[^.?!\n]{0,40}\b(chiavi? api|segret[oi]|tokens?|password|credenziali|chiavi? privat[ae]|client secret|variabili d'ambiente|\.env|cassaforte)/i,
  /\b(echte|volledige|onversleutelde|ontsleutelde|opgeslagen|in platte tekst)\b[^.?!\n]{0,20}\b(api[- ]?sleutels?|geheim(en)?|tokens?|wachtwoord(en)?|inloggegevens|privésleutels?|client secret)/i,
  /\b(print|dump|lek|ontsleutel|onthul|toon in platte tekst)\w*\b[^.?!\n]{0,40}\b(api[- ]?sleutels?|geheim(en)?|tokens?|wachtwoord(en)?|inloggegevens|privésleutels?|client secret|omgevingsvariabele\w*|\.env|kluis)/i,
  /\b(OPENAI_API_KEY|MASTER_KEY|AUTH_SECRET|APPROVAL_TOKEN_SECRET|DATABASE_URL|CONFIG_SIGNING_PRIVATE_KEY|STRIPE_SECRET_KEY)\b/,
  /\bprocess\.env\b/,
  // arbitrary execution / network / data access
  /\b(run|execute|exec|launch)\b[^.?!\n]{0,30}\b(shell|bash|powershell|cmd|terminal|command|sql|database query|db query|bash script|shell script|python script|node script|curl|wget|http request|migration)\b/i,
  /\b(führ\w*|starte|lass\w*[^.?!\n]{0,10}laufen)\b[^.?!\n]{0,30}\b(shell|bash|befehl|kommando|sql|datenbankabfrage|db-?abfrage|shell-?skript|python-?skript|curl|wget|http-?anfrage|migration)/i,
  /\b(exécute|lance|effectue)\w*\b[^.?!\n]{0,30}\b(shell|bash|commande|sql|requête (sql|de base de données|http)|script shell|script python|curl|wget|migration)/i,
  /\b(ejecuta|lanza|corre|realiza)\w*\b[^.?!\n]{0,30}\b(shell|bash|comando|sql|consulta (sql|de base de datos|http)|script de shell|script de python|curl|wget|petición http|migración)/i,
  /\b(esegui|lancia|avvia)\w*\b[^.?!\n]{0,30}\b(shell|bash|comando|sql|query (sql|al database|http)|script shell|script python|curl|wget|richiesta http|migrazione)/i,
  /\b(voer[^.?!\n]{0,30}uit|start|draai)\b[^.?!\n]{0,30}\b(shell|bash|commando|sql|databasequery|shellscript|pythonscript|curl|wget|http-?verzoek|migratie)/i,
  /\bselect\s+(\*|[\w.]+(\s*,\s*[\w.]+)*)\s+from\s+[\w.]+\s+(where|limit|order by|;)|\binsert\s+into\s+\w+|\bupdate\s+\w+\s+set\s+\w+\s*=|\bdelete\s+from\s+\w+|\bdrop\s+(table|database|schema)\b|\btruncate\s+table\b|\balter\s+table\b|\bgrant\s+all\b|\brm\s+-rf\b|\bsudo\s+\w|\bchmod\s+[0-7]|\bcurl\s+-[a-zA-Z]|\bwget\s+https?:|\bpython\s+-c\b|\bnode\s+-e\b|\beval\(|\bexec\(|\$\(/i,
  /\b(search (the )?(web|internet|google|online)|google (it|this|that|for)|look (it|this|that )?up online|browse (the web|to)|web ?search|internet ?search|im (internet|web|netz) (such|nachschau|googl)\w*|google (das|mal|danach)|cherche sur (le web|internet|google)|recherche (sur )?internet|busca en (internet|la web|google)|búscalo en internet|cerca (su|in) (internet|google|rete)|zoek (het )?op (internet|google|het web))\b/i,
  // cross-tenant / identity boundary
  /\b(other|another|different|foreign|all|every|each|any) (tenants?|organi[sz]ations?|workspaces?)\b/i,
  /\b(other|another|different|foreign|all|every) (customers?|clients?|accounts?|companies|users?)['’]? (data|sites?|configs?|configurations?|events?|credentials?|settings?|pixels?|tokens?|secrets?)\b/i,
  /\b(andere[rnms]?|fremde[rnms]?|alle|sämtliche|jede[rnms]?) (mandanten|organisationen?|workspaces?)\b/i,
  /\b(andere[rnms]?|fremde[rnms]?|aller|alle) (kunden|konten|accounts?|firmen|unternehmen|nutzer)[- ]?(daten|sites?|konfig\w*|events?|zugangsdaten|einstellungen|pixel|tokens?|secrets?)\b/i,
  /\b(autres?|tous les|toutes les|chaque|n'importe quel(le)?) (locataires?|organisations?|espaces? de travail)\b/i,
  /\b(autres?|tous les|toutes les|des autres) (clients?|comptes?|entreprises?|utilisateurs?)['’]? ?(données|sites?|configs?|configurations?|événements?|identifiants|paramètres|pixels?|jetons?|secrets?)\b/i,
  /\b(otr[oa]s?|tod[oa]s? l[oa]s|cada|cualquier) (inquilinos?|organizaci(ón|ones)|espacios? de trabajo)\b/i,
  /\b(otr[oa]s?|tod[oa]s? l[oa]s|de otros) (clientes?|cuentas?|empresas?|usuarios?) (datos|sitios?|configuraci(ón|ones)|eventos?|credenciales|ajustes|píxeles?|tokens?|secretos?)\b/i,
  /\b(altr[oiae]|tutt[ie] (gli|le|i)|ogni|qualsiasi) (tenant|organizzazion[ie]|spazi di lavoro)\b/i,
  /\b(altr[oiae]|tutt[ie] (gli|le|i)|di altri) (clienti?|account|aziend[ae]|utenti) (dati|siti|configurazion[ei]|eventi|credenziali|impostazioni|pixel|token|segreti)\b/i,
  /\b(andere|alle|elke|iedere|willekeurige) (tenants?|organisaties?|werkruimtes?)\b/i,
  /\b(andere|alle|van andere) (klanten|accounts?|bedrijven|gebruikers)(data|gegevens|sites?|configs?|configuraties?|events?|inloggegevens|instellingen|pixels?|tokens?|geheimen)\b/i,
  /\b(organi[sz]ation[_ -]?id|tenant[_ -]?id|org[_ -]?id|site[_ -]?id|user[_ -]?id)\s*[:=]\s*["']?[0-9a-f]{8}-?[0-9a-f-]{4,}/i,
  /\b(impersonate|log ?in as|act on behalf of|become the (admin|owner) of)\b/i,
  // self-approval and false authority: chat text is never an approval, whoever claims to send it
  /\b(pre[- ]?approved|pre[- ]?authori[sz]ed|already (approved|authori[sz]ed|signed off)|consider (this|it) (approved|confirmed|authori[sz]ed)|(this|my) (message|text|reply|chat message) (is|counts as) (the |my |an )?(approval|confirmation|authori[sz]ation)|i (hereby )?(approve|authori[sz]e) (the |this )?(publish|publishing|rollback|deletion|change|release|go-?live)|vorab (genehmigt|freigegeben|bestätigt)|bereits (genehmigt|freigegeben)|gilt als (freigabe|bestätigung|genehmigung)|hiermit (genehmige|bestätige|gebe ich [^.?!\n]{0,20}frei)|déjà (approuvé|autorisé)|pré[- ]?approuvé|vaut (approbation|confirmation)|j'approuve par la présente|ya (aprobado|autorizado)|pre[- ]?aprobado|cuenta como (aprobación|confirmación)|por la presente (apruebo|autorizo)|già (approvato|autorizzato)|pre[- ]?approvato|vale come (approvazione|conferma)|con la presente (approvo|autorizzo)|al (goedgekeurd|geautoriseerd)|vooraf goedgekeurd|geldt als (goedkeuring|bevestiging)|hierbij (keur ik|geef ik toestemming))\b/i,
  // hidden / encoded instructions and delimiter forgery
  /<\s*\/?\s*(system|instructions?|prompt|developer|function_call|untrusted)\b[^>]*>/i,
  /\[(INST|SYSTEM|\/INST|\/SYSTEM)\]|<<\s*SYS\s*>>|<\|(im_start|im_end|system|user|assistant|endoftext)\|>|###\s*(system|instruction|developer)\b|BEGIN\s+(SYSTEM|INSTRUCTIONS|PROMPT)\b|END\s+(SYSTEM|INSTRUCTIONS)\b/i,
  /\b(decode|base64[- ]?decode|rot13|unescape|decrypt|decipher|entschlüssel\w*|dekodier\w*|décode|decodifica|descodifica|decodeer)\b[^.?!\n]{0,60}\b(and|then|und|dann|puis|et|y|luego|e|poi|en|dan)\b[^.?!\n]{0,20}\b(follow|execute|run|obey|apply|do|befolg\w*|führ\w*|ausführ\w*|suis|exécute|applique|sigue|ejecuta|aplica|segui|esegui|applica|volg|voer|pas toe)/i,
].map(R);

/**
 * Approval and consent bypass are refused only in directive form: "publish without confirmation",
 * "send events regardless of consent". Questions about the rules ("what happens without consent?")
 * stay in scope — they are exactly what the assistant should explain.
 */
const BYPASS_ACTION = stems(["publish", "go live", "deploy", "roll ?back", "rollback", "delete", "remove", "pause", "disconnect", "rotate", "activate", "enable", "execute", "proceed", "do it", "just do", "apply", "veröffentlich", "live (schalten|stellen)", "lösch", "entfern", "pausier", "trenn", "rotier", "aktivier", "ausführ", "mach es", "anwend", "publie", "mets? en ligne", "supprime", "désactive", "active", "exécute", "applique", "publica", "elimina", "borra", "pausa", "activa", "ejecuta", "aplica", "pubblica", "cancella", "rimuovi", "attiva", "esegui", "applica", "publiceer", "verwijder", "pauzeer", "activeer", "voer", "pas toe", "track", "send", "forward", "collect", "fire", "record", "store", "schick", "sende", "erfass", "weiterleit", "speicher", "feuer", "envoi", "collect", "transmet", "enregistr", "env[ií]", "recog", "reenv[ií]", "registr", "guard", "invi", "raccogl", "inoltr", "salv", "verstuur", "verzamel", "doorstuur", "registreer", "opsla"]);
const BYPASS_APPROVAL = R(/\b(without|skip(ping)?|bypass(ing)?|no need for|forget|w\/o) (the |an? |any |my |a second )?(confirmation|approval|approval (card|token|step)|diff card|review step)\b|\b(ohne|überspring\w*|umgeh\w*|verzicht\w* auf|keine) (die |eine |jede |meine )?(bestätigung|freigabe|freigabekarte|freigabe-?token|diff-?karte)\b|\b(sans|saute|contourne|pas besoin de) (la |une |ma |de )?(confirmation|approbation|validation|carte d'approbation|token d'approbation)\b|\b(sin|salta|omite|evita|no hace falta|no necesito) (la |una |mi |de )?(confirmación|aprobación|tarjeta de aprobación|token de aprobación)\b|\b(senza|salta|evita|non serve|non ho bisogno di) (la |una |mia |di )?(conferma|approvazione|scheda di approvazione|token di approvazione)\b|\b(zonder|omzeil|geen|niet nodig) (de |een |mijn )?(bevestiging|goedkeuring|goedkeuringskaart|goedkeuringstoken)\b/i);
const BYPASS_CONSENT = R(/\b(regardless of|without|even without|irrespective of|despite (missing|no|the lack of)|ignoring|before (the|any)) (the |a |any |their |user )?(consent|opt[- ]?in|permission|cookie banner|cmp)\b|\b(disable|turn off|switch off|deactivate|bypass|circumvent) (the |all |any )?(consent|cmp|cookie banner|opt[- ]?in|gdpr|privacy) ?(checks?|gates?|requirements?|mode|logic|rules?|banner)?\b|\b(ohne|unabhängig von|trotz fehlender|vor der|ungeachtet der) (die |der |eine |jede |einer )?(einwilligung|zustimmung|consent|opt[- ]?in|erlaubnis)\b|\b(deaktivier\w*|abschalt\w*|ausschalt\w*|umgeh\w*|ignorier\w*) (die |den |das |alle )?(einwilligung\w*|zustimmung\w*|consent\w*|cmp|cookie-?banner|opt[- ]?in)\b|\b(sans|indépendamment du|malgré l'absence de|avant le|en ignorant le) (le |un |tout |leur )?(consentement|opt[- ]?in|consent|autorisation)\b|\b(désactive|contourne|ignore) (le |la |les |tout )?(consentement|cmp|bannière (de )?cookies|opt[- ]?in)\b|\b(sin|independientemente del|a pesar de no tener|antes del|ignorando el) (el |un |todo |su )?(consentimiento|opt[- ]?in|consent|permiso)\b|\b(desactiva|elude|ignora|omite) (el |la |los |todo )?(consentimiento|cmp|banner de cookies|opt[- ]?in)\b|\b(senza|indipendentemente dal|nonostante (manchi|l'assenza del)|prima del|ignorando il) (il |un |ogni |loro )?(consenso|opt[- ]?in|consent|permesso)\b|\b(disattiva|aggira|ignora) (il |la |i |tutto )?(consenso|cmp|banner (dei )?cookie|opt[- ]?in)\b|\b(zonder|ongeacht|ondanks (ontbrekende|geen)|voordat|met negeren van) (de |een |elke |hun )?(toestemming|opt[- ]?in|consent|permissie)\b|\b(schakel\w*[^.?!\n]{0,20}uit|omzeil|negeer) (de |alle )?(toestemming|cmp|cookiebanner|opt[- ]?in)\b/i);
const IS_QUESTION = R(/\?|^(does|do|is|are|can|could|will|would|should|what|how|why|when|which|where|kann|können|könnte|wird|werden|ist|sind|darf|dürfen|sollte|was|wie|warum|wieso|wann|welche[rsn]?|wo|est-ce|puis-je|peut|peuvent|pourquoi|comment|quand|quel(le)?s?|où|puede|pueden|podría|es|son|qué|cómo|por qué|cuándo|cuál(es)?|dónde|può|possono|potrebbe|è|sono|cosa|come|perché|quando|quale|dove|kan|kunnen|zou|wordt|worden|zijn|wat|hoe|waarom|wanneer|welke|waar)\b/i);

/** Markers the DLP interceptor leaves behind, plus a second scan for raw secrets in case a caller skipped the interceptor. */
const SECRET_MARKERS = /\[redacted:(secret|jwt)\]|\[system note: a credential-like value was removed/i;

/** Answers to the assistant's questions: ids, urls, domains, "label: value" replies and bracketed UI messages. */
const DATA_LIKE = /^(https?:\/\/\S+|[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?|[0-9]{6,20}|[A-Z0-9-]{4,20}|G-[A-Z0-9]{6,12}|AW-[0-9]{6,12}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[\w .+-]{1,40}:\s*\S.{0,80}|\[[^\]]{1,200}\])$/i;

/** Zero-width and bidi-control characters hide text from readers; they are stripped so hidden words are judged like visible ones. */
const INVISIBLE = /\u200b|\u200c|\u200d|\u2060|\ufeff|[\u202a-\u202e]|[\u2066-\u2069]/g;

function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

function normalise(message: string): string {
  return (message ?? "").normalize("NFKC").replace(INVISIBLE, "").trim();
}

/** Names the first rule that refuses a message (category + index; never the content) — for tests, evals and support diagnostics. */
export function explainScope(message: string): { rule: string } | null {
  const text = normalise(message);
  if (SECRET_MARKERS.test(text) || scanForPii(text, ["secret", "jwt"]).length > 0) return { rule: "secret" };
  const folded = fold(text);
  const injection = INJECTION.findIndex((re) => re.test(folded));
  if (injection >= 0) return { rule: `injection:${injection}` };
  if (!IS_QUESTION.test(folded) && BYPASS_ACTION.test(folded)) {
    if (BYPASS_APPROVAL.test(folded)) return { rule: "bypass:approval" };
    if (BYPASS_CONSENT.test(folded)) return { rule: "bypass:consent" };
  }
  const offTopic = STRONG_OFF_TOPIC.findIndex((re) => re.test(folded));
  if (offTopic >= 0) return { rule: `off_topic:${offTopic}` };
  return null;
}

function classifyDomain(text: string): ScopeDomain | null {
  let best: { domain: ScopeDomain; score: number } | null = null;
  for (const domain of SCOPE_DOMAINS) {
    let score = 0;
    for (const re of DOMAIN_TERMS[domain]) {
      const matches = text.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`));
      if (matches) score += matches.length;
    }
    if (score > 0 && (!best || score > best.score)) best = { domain, score };
  }
  return best?.domain ?? null;
}

/**
 * Deterministic verdict for one user message. Short conversational replies, data-like inputs (ids,
 * urls, labelled answers) and anything with a product/tracking term pass; clearly off-topic tasks,
 * injection markers, directive approval/consent bypasses and secret-bearing messages are refused
 * before any tool becomes selectable.
 */
export function evaluateScope(input: { message: string; history?: Array<{ role: string; content: string }> }): ScopeVerdict {
  const text = normalise(input.message);
  if (SECRET_MARKERS.test(text) || scanForPii(text, ["secret", "jwt"]).length > 0) return { allowed: false, reason: "secret", domain: null };
  const folded = fold(text);
  if (INJECTION.some((re) => re.test(folded))) return { allowed: false, reason: "injection", domain: null };
  if (!IS_QUESTION.test(folded) && BYPASS_ACTION.test(folded) && (BYPASS_APPROVAL.test(folded) || BYPASS_CONSENT.test(folded))) return { allowed: false, reason: "injection", domain: null };
  if (STRONG_OFF_TOPIC.some((re) => re.test(folded))) return { allowed: false, reason: "off_topic", domain: null };
  const domain = classifyDomain(folded);
  if (domain) return { allowed: true, domain, contextual: false };
  const contextual = countWords(text) <= 6 || DATA_LIKE.test(text) || WEAK_IN_SCOPE.test(folded);
  if (contextual) return { allowed: true, domain: null, contextual: true };
  return { allowed: false, reason: "off_topic", domain: null };
}

/** Tools relevant per task; the `ALWAYS_TOOLS` (state lookups, diagnostics, step navigation, credential card) come on top. `null` = no task restriction. */
const DOMAIN_TOOLS: Record<ScopeDomain, string[] | null> = {
  setup: null,
  site_detection: ["inspect_site", "detect_site_stack", "set_business_profile_draft", "verify_domain"],
  snippet: ["verify_snippet_installation", "verify_domain", "inspect_site", "detect_site_stack", "run_test_event"],
  event_plan: ["propose_event_plan", "create_trigger_draft", "upsert_event_mapping_draft", "validate_draft", "set_business_profile_draft"],
  destinations: ["create_integration_draft", "save_public_pixel_id_draft", "upsert_event_mapping_draft", "set_destination_settings_draft", "validate_integration_credentials", "send_destination_test_event", "validate_draft"],
  integrations: ["create_integration_draft", "save_public_pixel_id_draft", "upsert_event_mapping_draft", "set_destination_settings_draft", "validate_integration_credentials", "send_destination_test_event", "validate_draft"],
  consent: ["set_consent_policy_draft", "validate_draft"],
  debugging: ["run_test_event", "send_destination_test_event", "validate_draft", "upsert_event_mapping_draft", "verify_snippet_installation", "validate_integration_credentials"],
  diagnostics: ["validate_integration_credentials", "verify_snippet_installation", "verify_domain", "run_test_event", "validate_draft"],
  releases: ["validate_draft", "prepare_publish", "publish_config_version"],
  account: [],
};

/** Site states in which the assistant may only read (nothing is configured on a suspended, archived or deleted site). */
const READ_ONLY_SITE_STATUSES: ReadonlySet<string> = new Set(["suspended", "archived", "deleted", "disabled", "paused"]);

/**
 * Applies the role, site-status and task dimensions on top of the setup-step allow-list. The
 * registry (when given) re-checks every tool's permission for the role, so a tool the role may not
 * run is never even offered to the model.
 */
export function filterToolsForTurn(names: string[], options: { role: string; siteStatus?: string | null; domain: ScopeDomain | null; registry?: Pick<ToolRegistry, "get"> }): string[] {
  const readOnly = READ_ONLY_SITE_STATUSES.has((options.siteStatus ?? "").toLowerCase()) || options.domain === "account";
  const domainTools = options.domain ? DOMAIN_TOOLS[options.domain] : null;
  return names.filter((name) => {
    if (readOnly && !READ_ONLY_TOOLS.includes(name)) return false;
    if (domainTools && !ALWAYS_TOOLS.includes(name) && !domainTools.includes(name)) return false;
    const tool = options.registry?.get(name);
    if (tool && !can(options.role as OrgRole, tool.permission)) return false;
    return true;
  });
}

export interface SetupSummary {
  currentStep: SetupStep;
  progressPercent: number;
  completedSteps: SetupStep[];
}

/** Recovers the real setup state from the context block so a refusal still reports honest progress values. */
export function setupSummaryFromContextBlock(block: string): SetupSummary {
  const step = /current_step:\s*([a-z_]+)/.exec(block)?.[1];
  const progress = /progress:\s*(\d{1,3})%/.exec(block)?.[1];
  const completed = /completed:\s*([a-z_,\s]+?);/.exec(block)?.[1] ?? "";
  const parsedStep = setupStepSchema.safeParse(step);
  return {
    currentStep: parsedStep.success ? parsedStep.data : "site",
    progressPercent: progress ? Math.max(0, Math.min(100, Number(progress))) : 0,
    completedSteps: completed
      .split(",")
      .map((s) => s.trim())
      .filter((s) => setupStepSchema.safeParse(s).success) as SetupStep[],
  };
}

/** The short friendly refusal: no tool call, no model call, at most three allowed quick actions in the user's language. */
export function refusalUi(input: { reason: ScopeRefusalReason; locale: string | null | undefined; setup: SetupSummary }): AssistantUiResponse {
  const copy = scopeCopy(input.locale);
  const actions = input.reason === "secret" ? [copy.quickActions.credentialCard, copy.quickActions.checkInstallation, copy.quickActions.fixIssues] : [copy.quickActions.checkInstallation, copy.quickActions.connectIntegration, copy.quickActions.fixIssues];
  return {
    message: input.reason === "secret" ? copy.secret : copy.offTopic,
    intent: input.reason === "off_topic" ? "off_topic" : "refusal",
    stage: input.setup.currentStep,
    current_step: input.setup.currentStep,
    progress_percent: input.setup.progressPercent,
    status: "ok",
    cards: [],
    input_component: { type: "none" },
    quick_actions: actions.slice(0, 3).map((a, i) => ({ id: a.id, label: a.label, message: a.message, kind: i === 0 ? ("primary" as const) : ("secondary" as const) })),
    completed_steps: input.setup.completedSteps,
    missing_fields: [],
    warnings: [],
    requires_confirmation: false,
    confirmation_summary: null,
    tool_result_summary: null,
    next_best_action: null,
  };
}
