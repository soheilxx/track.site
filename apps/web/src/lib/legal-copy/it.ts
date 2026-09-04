import type { LegalCopy } from "./index";

/**
 * Italian (it) legal and trust documents (security, privacy, data processing, terms). Same shape as
 * en.ts; see docs/14-localization.md. Faithful translation of the operator's English documents: no
 * obligation, article reference or legal basis is added or dropped; "GDPR" is kept as the common Italian
 * name of the regulation, the supervisory authority example is the Garante per la protezione dei dati
 * personali. Operator facts (company, address, DPO) are not in here — they come from the environment
 * (`operatorFromEnv`). `updated` stays the date of the English revision.
 */

export const LEGAL_IT: LegalCopy = {
  security: {
    title: "Sicurezza",
    intro: "Come Track protegge i dati dei clienti: architettura, controlli e le garanzie che puoi verificare nel prodotto.",
    updated: "2026-09-03",
    sections: [
      { title: "Isolamento dei tenant", paragraphs: ["Ogni tabella tenant contiene l’ID dell’organizzazione e la row-level security di PostgreSQL è applicata al ruolo applicativo. Il ruolo worker aggira la RLS solo per l’archivio eventi partizionato e la traccia di audit, mai per la configurazione dei tenant."] },
      { title: "Secret", paragraphs: ["Le credenziali dei vendor sono cifrate con envelope encryption (chiavi dati AES-256-GCM avvolte da AWS KMS o da una master key locale). L’assistente, il browser e i log vedono sempre e solo un riferimento e gli ultimi quattro caratteri."] },
      { title: "Configurazione firmata", paragraphs: ["I bundle di configurazione sono immutabili, versionati e firmati con Ed25519. L’SDK browser verifica la firma con WebCrypto prima di applicare una configurazione e rifiuta tutto il resto (fail closed)."] },
      { title: "Data plane", paragraphs: ["Il collector valida le origini, applica rate limit e richieste server firmate con HMAC e passa gli eventi a una coda durevole prima di rispondere. I worker elaborano con retry, circuit breaker e una dead-letter queue. I kill switch fermano raccolta e consegna per sito o organizzazione in pochi secondi."], bullets: ["Nessun fingerprinting, nessuna identità cross-site", "Lo scanner PII blocca i dati personali nelle proprietà degli eventi prima del salvataggio", "Gli indirizzi IP vengono troncati all’ingresso", "Log di audit e registro dei consumi solo in append (trigger del database)"] },
      { title: "Accesso e operazioni", paragraphs: ["Controllo degli accessi basato sui ruoli con sei ruoli di organizzazione, MFA e passkey, accesso break-glass con motivazione obbligatoria e voce di audit, job di conservazione per tipo di dato e un contatto per la segnalazione delle vulnerabilità pubblicato in questa pagina."] },
    ],
  },
  privacy: {
    title: "Informativa sulla privacy",
    intro: "Questa informativa spiega come il gestore di track.site tratta i dati personali dei visitatori del sito web, dei clienti e dei loro utenti.",
    updated: "2026-09-03",
    sections: [
      { title: "Titolare del trattamento", paragraphs: ["Il titolare del trattamento per questo sito web e per i dati degli account dei clienti è il gestore indicato nelle note legali. Per i dati degli eventi trattati per conto dei clienti, il cliente è il titolare del trattamento e il gestore agisce come responsabile del trattamento ai sensi dell’accordo sul trattamento dei dati."] },
      { title: "Dati che trattiamo come titolare", paragraphs: ["Dati dell’account (nome, e-mail, organizzazione, ruolo), dati di fatturazione (gestiti da Stripe; conserviamo gli ID di cliente e abbonamento), richieste di supporto, log di sicurezza (IP troncato, famiglia dello user agent) e cookie strettamente necessari per l’autenticazione e la preferenza di lingua."] },
      { title: "Dati che trattiamo come responsabile", paragraphs: ["Eventi inviati dai siti web e dai sistemi dei clienti: nome e parametri dell’evento, stato del consenso, identificatori pseudonimi, dati di matching con hash, IP troncato e contesto della pagina, oltre ai record di consegna verso le destinazioni configurate dal cliente. Il trattamento segue la policy di consenso del cliente; senza la finalità richiesta nessun dato viene salvato o trasmesso."] },
      { title: "Finalità e base giuridica", paragraphs: ["Esecuzione del contratto (art. 6, par. 1, lett. b) GDPR) per account, fatturazione e supporto; legittimo interesse (art. 6, par. 1, lett. f)) per la sicurezza e la prevenzione degli abusi; consenso (art. 6, par. 1, lett. a)) quando il visitatore di un cliente ha acconsentito a finalità di analytics o marketing; obblighi di legge (art. 6, par. 1, lett. c)) per le registrazioni contabili."] },
      { title: "Destinatari e trasferimenti", paragraphs: ["I sub-responsabili sono elencati nella pagina dei sub-responsabili. I trasferimenti al di fuori dell’UE si basano su clausole contrattuali standard o sull’EU-US Data Privacy Framework. I fornitori pubblicitari ricevono dati solo per le destinazioni configurate dal cliente e la procedura guidata mostra per ciascuna il destinatario e la base del trasferimento."] },
      { title: "Conservazione", paragraphs: ["Eventi 13 mesi, click ID 90 giorni, snapshot del consenso 3 anni, tentativi di consegna 90 giorni, log di audit 2 anni, trascrizioni della chat 30 giorni, record DSAR 3 anni; configurabile per organizzazione entro questi massimi. I dati dell’account vengono cancellati 30 giorni dopo la chiusura dell’account."] },
      { title: "I tuoi diritti", paragraphs: ["Accesso, rettifica, cancellazione, limitazione, portabilità e opposizione. I clienti gestiscono le richieste dei visitatori tramite il centro privacy; i visitatori possono rivolgersi direttamente al gestore. Puoi proporre reclamo a un’autorità di controllo, ad esempio il Garante per la protezione dei dati personali in Italia."] },
      { title: "Assistente AI", paragraphs: ["L’assistente di configurazione usa la Responses API di OpenAI con zero data retention. Secret e dati personali vengono oscurati prima che un messaggio raggiunga il modello; il modello può agire solo tramite strumenti tipizzati, validati e sottoposti ad audit lato server."] },
    ],
  },
  "data-processing": {
    title: "Accordo sul trattamento dei dati",
    intro: "Sintesi delle condizioni da responsabile del trattamento che si applicano ai dati degli eventi dei clienti. L’accordo completo viene fornito durante l’onboarding e su richiesta.",
    updated: "2026-09-03",
    sections: [
      { title: "Oggetto", paragraphs: ["Raccolta, normalizzazione, valutazione del consenso, archiviazione e consegna di eventi di siti web e server verso le destinazioni configurate dal cliente, oltre a dashboard, diagnostica e assistente di configurazione."] },
      { title: "Istruzioni", paragraphs: ["Il cliente istruisce il gestore tramite la configurazione del prodotto: siti, destinazioni, mappature, policy di consenso e conservazione. Le versioni della configurazione sono firmate e verificabili, quindi le istruzioni sono documentate."] },
      { title: "Misure tecniche e organizzative", paragraphs: ["Vedi la pagina sulla sicurezza: isolamento dei tenant con row-level security, envelope encryption, configurazione firmata, kill switch, scansione PII, IP troncati, RBAC con MFA, traccia di audit, hosting in UE."] },
      { title: "Sub-responsabili", paragraphs: ["Elencati nella pagina dei sub-responsabili; i clienti vengono informati delle modifiche con 30 giorni di anticipo e possono opporsi."] },
      { title: "Richieste degli interessati e cancellazione", paragraphs: ["Il centro privacy elabora le richieste di esportazione e cancellazione sulla base di identificatori pseudonimi su tutti i siti dell’organizzazione e registra l’esito. I job di conservazione cancellano i dati alla fine dei periodi configurati."] },
      { title: "Audit e cessazione", paragraphs: ["Log di audit, matrici di integrazione e cronologie delle versioni sono disponibili nel prodotto. Alla cessazione il cliente può esportare i dati; le copie residue vengono cancellate entro 30 giorni."] },
    ],
  },
  terms: {
    title: "Termini di servizio",
    intro: "Le condizioni alle quali il gestore fornisce Track ai clienti business.",
    updated: "2026-09-03",
    sections: [
      { title: "Servizio", paragraphs: ["Track è un tag manager, un router di eventi server-side che rispetta il consenso e un livello di analytics, offerto in abbonamento. Funzionalità e limiti sono descritti nella pagina dei prezzi e nel piano scelto dal cliente."] },
      { title: "Obblighi del cliente", paragraphs: ["I clienti sono responsabili di un’implementazione lecita del consenso sulle proprie proprietà, dell’esattezza della configurazione delle destinazioni e dell’aggiornamento delle credenziali dei fornitori. I clienti non devono inviare categorie particolari di dati personali né usare il servizio per fingerprinting o per aggirare il consenso."] },
      { title: "Corrispettivi", paragraphs: ["I corrispettivi vengono fatturati da Stripe per piano e intervallo. L’utilizzo oltre il limite del piano attiva avvisi e un periodo di tolleranza prima che si applichino i limiti rigidi. I prezzi sono mostrati nella pagina dei prezzi come configurati in Stripe."] },
      { title: "Disponibilità e supporto", paragraphs: ["Il gestore punta a un’elevata disponibilità del data plane e pubblica gli incidenti nella pagina di stato. Il supporto viene fornito via e-mail; i piani Enterprise includono uno SLA."] },
      { title: "Responsabilità", paragraphs: ["La responsabilità è limitata all’importo pagato nei dodici mesi precedenti l’evento, salvo dolo, colpa grave, lesioni alla vita o alla salute e responsabilità inderogabile per legge."] },
      { title: "Durata e cessazione", paragraphs: ["Gli abbonamenti si rinnovano per intervallo e possono essere disdetti con effetto alla fine del periodo. Il gestore può sospendere, previo avviso, gli account che violano questi termini, salvo i casi in cui sia necessaria un’azione immediata per proteggere la piattaforma."] },
      { title: "Legge applicabile", paragraphs: ["Si applica la legge della sede legale del gestore; restano ferme le tutele inderogabili dei consumatori."] },
    ],
  },
};
