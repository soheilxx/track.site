import type { LegalCopy } from "./index";

/**
 * Dutch (nl) legal and trust documents (security, privacy, data processing, terms), informal "je/jij" like the rest of
 * the Dutch copy. Same shape as en.ts; see docs/14-localization.md. Operator facts (company, address, DPO) are not in
 * here — they come from the environment (`operatorFromEnv`). Faithful translation of the English documents: the AVG
 * (GDPR) article references and obligations are unchanged; the Dutch supervisory authority is named only as an example.
 */

export const LEGAL_NL: LegalCopy = {
  security: {
    title: "Beveiliging",
    intro: "Hoe Track klantgegevens beschermt: architectuur, controles en de garanties die je in het product kunt verifiëren.",
    updated: "2026-09-03",
    sections: [
      { title: "Tenant-isolatie", paragraphs: ["Elke tenanttabel bevat de organisatie-ID en PostgreSQL row-level security wordt afgedwongen voor de applicatierol. De workerrol omzeilt RLS alleen voor de gepartitioneerde eventstore en de audittrail, nooit voor tenantconfiguratie."] },
      { title: "Secrets", paragraphs: ["Credentials van leveranciers worden versleuteld met envelope-encryptie (AES-256-GCM-datasleutels, gewrapt door AWS KMS of een lokale mastersleutel). De assistent, de browser en de logs zien alleen een referentie en de laatste vier tekens."] },
      { title: "Ondertekende configuratie", paragraphs: ["Configuratiebundles zijn onveranderlijk, geversioneerd en Ed25519-ondertekend. De browser-SDK verifieert de handtekening met WebCrypto voordat een configuratie wordt toegepast en wijst al het andere af (fail closed)."] },
      { title: "Data plane", paragraphs: ["De collector valideert origins, past rate limits en HMAC-ondertekende serverrequests toe en geeft events door aan een duurzame queue voordat hij antwoordt. Workers verwerken met retries, circuit breakers en een dead-letter queue. Kill switches stoppen verzameling en aflevering per site of organisatie binnen seconden."], bullets: ["Geen fingerprinting, geen cross-site-identiteit", "PII-scanner blokkeert persoonsgegevens in eventproperties vóór opslag", "IP-adressen worden bij ontvangst ingekort", "Append-only auditlog en usage ledger (databasetriggers)"] },
      { title: "Toegang en beheer", paragraphs: ["Rolgebaseerde toegangscontrole met zes organisatierollen, MFA en passkeys, break-glass-toegang met verplichte reden en auditvermelding, bewaarjobs per gegevenssoort, en een op deze pagina gepubliceerd contactpunt voor het melden van kwetsbaarheden."] },
    ],
  },
  privacy: {
    title: "Privacyverklaring",
    intro: "Deze verklaring legt uit hoe de exploitant van track.site persoonsgegevens van websitebezoekers, klanten en hun gebruikers verwerkt.",
    updated: "2026-09-03",
    sections: [
      { title: "Verwerkingsverantwoordelijke", paragraphs: ["De verwerkingsverantwoordelijke voor deze website en de gegevens van klantaccounts is de in het colofon genoemde exploitant. Voor eventdata die namens klanten wordt verwerkt, is de klant de verwerkingsverantwoordelijke en treedt de exploitant op als verwerker onder de verwerkersovereenkomst."] },
      { title: "Gegevens die we als verwerkingsverantwoordelijke verwerken", paragraphs: ["Accountgegevens (naam, e-mail, organisatie, rol), facturatiegegevens (afgehandeld door Stripe; wij slaan klant- en abonnements-ID's op), supportverzoeken, beveiligingslogs (ingekort IP-adres, user-agent-familie) en cookies die strikt noodzakelijk zijn voor authenticatie en taalvoorkeur."] },
      { title: "Gegevens die we als verwerker verwerken", paragraphs: ["Events die door websites en systemen van klanten worden verstuurd: eventnaam en parameters, toestemmingsstatus, pseudonieme identifiers, gehashte matchinggegevens, ingekort IP-adres en paginacontext, plus de afleverrecords naar de destinations die de klant heeft geconfigureerd. De verwerking volgt het toestemmingsbeleid van de klant; zonder het vereiste doel wordt er geen data opgeslagen of verzonden."] },
      { title: "Doeleinden en rechtsgrondslag", paragraphs: ["Uitvoering van de overeenkomst (art. 6 lid 1 sub b AVG) voor accounts, facturatie en support; gerechtvaardigd belang (art. 6 lid 1 sub f) voor beveiliging en misbruikpreventie; toestemming (art. 6 lid 1 sub a) wanneer een bezoeker van een klant heeft ingestemd met analytics- of marketingdoeleinden; wettelijke verplichtingen (art. 6 lid 1 sub c) voor de boekhouding."] },
      { title: "Ontvangers en doorgiften", paragraphs: ["Subverwerkers staan op de pagina Subverwerkers. Doorgiften buiten de EU steunen op standaardcontractbepalingen of het EU-US Data Privacy Framework. Advertentieleveranciers ontvangen alleen data voor destinations die de klant heeft geconfigureerd, en de wizard toont voor elke destination de ontvanger en de doorgiftegrondslag."] },
      { title: "Bewaartermijnen", paragraphs: ["Events 13 maanden, click-ID's 90 dagen, toestemmingssnapshots 3 jaar, afleverpogingen 90 dagen, auditlog 2 jaar, chattranscripten 30 dagen, DSAR-records 3 jaar — per organisatie instelbaar binnen deze maxima. Accountgegevens worden 30 dagen na het sluiten van het account verwijderd."] },
      { title: "Je rechten", paragraphs: ["Inzage, rectificatie, verwijdering, beperking, overdraagbaarheid en bezwaar. Klanten handelen verzoeken van bezoekers af via het privacycenter; bezoekers kunnen ook rechtstreeks contact opnemen met de exploitant. Je kunt een klacht indienen bij een toezichthoudende autoriteit, in Nederland de Autoriteit Persoonsgegevens."] },
      { title: "AI-assistent", paragraphs: ["De setupassistent gebruikt de OpenAI Responses API met zero data retention. Secrets en persoonsgegevens worden gemaskeerd voordat een bericht het model bereikt; het model kan alleen handelen via getypeerde tools die server-side worden gevalideerd en geauditeerd."] },
    ],
  },
  "data-processing": {
    title: "Verwerkersovereenkomst",
    intro: "Samenvatting van de verwerkersvoorwaarden die gelden voor eventdata van klanten. De volledige overeenkomst wordt verstrekt tijdens de onboarding en op verzoek.",
    updated: "2026-09-03",
    sections: [
      { title: "Onderwerp", paragraphs: ["Verzameling, normalisatie, toestemmingsevaluatie, opslag en aflevering van website- en serverevents aan door de klant geconfigureerde destinations, plus dashboards, diagnostiek en de setupassistent."] },
      { title: "Instructies", paragraphs: ["De klant instrueert de exploitant via de productconfiguratie: sites, destinations, mappings, toestemmingsbeleid en bewaartermijnen. Configuratieversies zijn ondertekend en auditeerbaar, zodat instructies gedocumenteerd zijn."] },
      { title: "Technische en organisatorische maatregelen", paragraphs: ["Zie de pagina Beveiliging: tenant-isolatie met row-level security, envelope-encryptie, ondertekende configuratie, kill switches, PII-scanning, ingekorte IP-adressen, RBAC met MFA, audittrail, EU-hosting."] },
      { title: "Subverwerkers", paragraphs: ["Vermeld op de pagina Subverwerkers; klanten worden 30 dagen van tevoren over wijzigingen geïnformeerd en kunnen bezwaar maken."] },
      { title: "Verzoeken van betrokkenen en verwijdering", paragraphs: ["Het privacycenter verwerkt export- en verwijderverzoeken op basis van pseudonieme identifiers over alle sites van de organisatie en registreert het resultaat. Bewaarruns verwijderen data aan het einde van de ingestelde termijnen."] },
      { title: "Audit en beëindiging", paragraphs: ["Auditlogs, integratiematrices en versiegeschiedenissen zijn beschikbaar in het product. Bij beëindiging kan de klant data exporteren; resterende kopieën worden binnen 30 dagen verwijderd."] },
    ],
  },
  terms: {
    title: "Gebruiksvoorwaarden",
    intro: "De voorwaarden waaronder de exploitant Track aan zakelijke klanten levert.",
    updated: "2026-09-03",
    sections: [
      { title: "Dienst", paragraphs: ["Track is een tagmanager, toestemmingsbewuste server-side eventrouter en analyticslaag die als abonnement wordt aangeboden. Functies en limieten staan beschreven op de prijzenpagina en in het abonnement dat de klant heeft gekozen."] },
      { title: "Verplichtingen van de klant", paragraphs: ["Klanten zijn verantwoordelijk voor een rechtmatige toestemmingsimplementatie op hun properties, voor de juistheid van de destination-configuratie en voor het actueel houden van credentials van leveranciers. Klanten mogen geen bijzondere categorieën van persoonsgegevens versturen en de dienst niet gebruiken voor fingerprinting of het omzeilen van toestemming."] },
      { title: "Vergoedingen", paragraphs: ["Vergoedingen worden door Stripe gefactureerd per abonnement en periode. Verbruik boven de abonnementslimiet leidt tot waarschuwingen en een respijtperiode voordat harde limieten gelden. Prijzen worden op de prijzenpagina getoond zoals ze in Stripe zijn geconfigureerd."] },
      { title: "Beschikbaarheid en support", paragraphs: ["De exploitant streeft naar een hoge beschikbaarheid van het data plane en publiceert incidenten op de statuspagina. Support wordt per e-mail geleverd; Enterprise-abonnementen bevatten een SLA."] },
      { title: "Aansprakelijkheid", paragraphs: ["De aansprakelijkheid is beperkt tot het bedrag dat in de twaalf maanden vóór de gebeurtenis is betaald, behalve bij opzet, grove nalatigheid, schade aan leven of gezondheid en dwingendrechtelijke aansprakelijkheid."] },
      { title: "Looptijd en beëindiging", paragraphs: ["Abonnementen worden per periode verlengd en kunnen tegen het einde van de periode worden opgezegd. De exploitant kan accounts die deze voorwaarden schenden na kennisgeving opschorten, behalve wanneer onmiddellijk ingrijpen nodig is om het platform te beschermen."] },
      { title: "Toepasselijk recht", paragraphs: ["Het recht van de statutaire zetel van de exploitant is van toepassing; dwingende consumentenbescherming blijft onverlet."] },
    ],
  },
};
