import type { LegalCopy } from "./index";

/**
 * French (fr) legal and trust documents (security, privacy, data processing, terms). Same shape as
 * en.ts; see docs/14-localization.md. Faithful translation of the operator's English documents: no
 * obligation, article reference or legal basis is added or dropped; GDPR → RGPD, the supervisory
 * authority example is the CNIL. Operator facts (company, address, DPO) are not in here — they come
 * from the environment (`operatorFromEnv`). `updated` stays the date of the English revision.
 */

export const LEGAL_FR: LegalCopy = {
  security: {
    title: "Sécurité",
    intro: "Comment Track protège les données de ses clients : architecture, contrôles et garanties que vous pouvez vérifier dans le produit.",
    updated: "2026-09-03",
    sections: [
      { title: "Isolation des tenants", paragraphs: ["Chaque table tenant porte l’identifiant d’organisation, et la sécurité au niveau des lignes (row-level security) de PostgreSQL est appliquée au rôle applicatif. Le rôle worker ne contourne la RLS que pour le magasin d’événements partitionné et la piste d’audit, jamais pour la configuration des tenants."] },
      { title: "Secrets", paragraphs: ["Les identifiants d’accès des fournisseurs sont protégés par chiffrement d’enveloppe (clés de données AES-256-GCM enveloppées par AWS KMS ou par une clé maître locale). L’assistant, le navigateur et les journaux ne voient jamais qu’une référence et les quatre derniers caractères."] },
      { title: "Configuration signée", paragraphs: ["Les bundles de configuration sont immuables, versionnés et signés Ed25519. Le SDK navigateur vérifie la signature avec WebCrypto avant d’appliquer une configuration et rejette tout le reste (fail closed)."] },
      { title: "Data plane", paragraphs: ["Le collecteur valide les origines, applique la limitation de débit et les requêtes serveur signées HMAC, et remet les événements à une file d’attente durable avant de répondre. Les workers traitent avec nouvelles tentatives, circuit breakers et dead-letter queue. Les kill switches arrêtent la collecte et la livraison par site ou par organisation en quelques secondes."], bullets: ["Pas de fingerprinting, pas d’identité inter-sites", "Le scanner PII bloque les données personnelles dans les propriétés d’événement avant stockage", "Les adresses IP sont tronquées à l’ingestion", "Journal d’audit et registre d’utilisation en ajout seul (triggers de base de données)"] },
      { title: "Accès et exploitation", paragraphs: ["Contrôle d’accès basé sur les rôles avec six rôles d’organisation, MFA et passkeys, accès d’urgence (break-glass) avec motif obligatoire et entrée d’audit, tâches de conservation par type de données, et un contact de signalement des vulnérabilités publié sur cette page."] },
    ],
  },
  privacy: {
    title: "Politique de confidentialité",
    intro: "Cette politique explique comment l’exploitant de www.track.site traite les données personnelles des visiteurs du site web, des clients et de leurs utilisateurs.",
    updated: "2026-09-03",
    sections: [
      { title: "Responsable du traitement", paragraphs: ["Le responsable du traitement pour ce site web et les données des comptes clients est l’exploitant désigné dans les mentions légales. Pour les données d’événements traitées pour le compte des clients, le client est le responsable du traitement et l’exploitant agit en tant que sous-traitant dans le cadre de l’accord de traitement des données."] },
      { title: "Données que nous traitons en tant que responsable du traitement", paragraphs: ["Données de compte (nom, e-mail, organisation, rôle), données de facturation (gérées par Stripe ; nous stockons les identifiants de client et d’abonnement), demandes de support, journaux de sécurité (IP tronquée, famille de user agent) et cookies strictement nécessaires à l’authentification et à la préférence de langue."] },
      { title: "Données que nous traitons en tant que sous-traitant", paragraphs: ["Événements envoyés par les sites web et les systèmes des clients : nom et paramètres de l’événement, état du consentement, identifiants pseudonymes, données de correspondance hachées, IP tronquée et contexte de page, ainsi que les enregistrements de livraison vers les destinations configurées par le client. Le traitement suit la politique de consentement du client ; sans la finalité requise, aucune donnée n’est stockée ni transmise."] },
      { title: "Finalités et base juridique", paragraphs: ["Exécution du contrat (art. 6, par. 1, point b) du RGPD) pour les comptes, la facturation et le support ; intérêt légitime (art. 6, par. 1, point f)) pour la sécurité et la prévention des abus ; consentement (art. 6, par. 1, point a)) lorsqu’un visiteur d’un client a accepté des finalités analytics ou marketing ; obligations légales (art. 6, par. 1, point c)) pour les documents comptables."] },
      { title: "Destinataires et transferts", paragraphs: ["Les sous-traitants ultérieurs sont listés sur la page Sous-traitants ultérieurs. Les transferts hors de l’UE reposent sur des clauses contractuelles types ou sur le cadre de protection des données UE–États-Unis (EU-US Data Privacy Framework). Les plateformes publicitaires ne reçoivent des données que pour les destinations configurées par le client, et l’assistant guidé affiche le destinataire et la base de transfert pour chacune."] },
      { title: "Conservation", paragraphs: ["Événements 13 mois, identifiants de clic 90 jours, instantanés de consentement 3 ans, tentatives de livraison 90 jours, journal d’audit 2 ans, transcriptions de chat 30 jours, dossiers de demandes d’exercice des droits 3 ans — configurables par organisation dans la limite de ces maxima. Les données de compte sont supprimées 30 jours après la clôture du compte."] },
      { title: "Vos droits", paragraphs: ["Accès, rectification, effacement, limitation, portabilité et opposition. Les clients traitent les demandes de leurs visiteurs via le centre de confidentialité ; les visiteurs peuvent contacter l’exploitant directement. Vous pouvez introduire une réclamation auprès d’une autorité de contrôle, par exemple la CNIL en France."] },
      { title: "Assistant IA", paragraphs: ["L’assistant de configuration utilise l’OpenAI Responses API sans conservation des données (zero data retention). Les secrets et les données personnelles sont masqués avant qu’un message n’atteigne le modèle ; le modèle ne peut agir qu’au travers d’outils typés, validés et audités côté serveur."] },
    ],
  },
  "data-processing": {
    title: "Accord de traitement des données",
    intro: "Résumé des conditions de sous-traitance applicables aux données d’événements des clients. L’accord complet est fourni lors de l’onboarding et sur demande.",
    updated: "2026-09-03",
    sections: [
      { title: "Objet", paragraphs: ["Collecte, normalisation, évaluation du consentement, stockage et livraison des événements de site web et de serveur vers les destinations configurées par le client, ainsi que les tableaux de bord, les diagnostics et l’assistant de configuration."] },
      { title: "Instructions", paragraphs: ["Le client donne ses instructions à l’exploitant au travers de la configuration du produit : sites, destinations, mappings, politique de consentement et conservation. Les versions de configuration sont signées et auditables, de sorte que les instructions sont documentées."] },
      { title: "Mesures techniques et organisationnelles", paragraphs: ["Voir la page Sécurité : isolation des tenants avec sécurité au niveau des lignes, chiffrement d’enveloppe, configuration signée, kill switches, scanner PII, IP tronquées, RBAC avec MFA, piste d’audit, hébergement dans l’UE."] },
      { title: "Sous-traitants ultérieurs", paragraphs: ["Listés sur la page Sous-traitants ultérieurs ; les clients sont informés des modifications 30 jours à l’avance et peuvent s’y opposer."] },
      { title: "Demandes des personnes concernées et suppression", paragraphs: ["Le centre de confidentialité traite les demandes d’export et de suppression sur la base d’identifiants pseudonymes, sur l’ensemble des sites de l’organisation, et consigne le résultat. Les tâches de conservation suppriment les données à l’expiration des durées configurées."] },
      { title: "Audit et résiliation", paragraphs: ["Les journaux d’audit, les matrices d’intégration et les historiques de versions sont disponibles dans le produit. À la résiliation, le client peut exporter ses données ; les copies résiduelles sont supprimées sous 30 jours."] },
    ],
  },
  terms: {
    title: "Conditions générales d’utilisation",
    intro: "Les conditions auxquelles l’exploitant fournit Track aux clients professionnels.",
    updated: "2026-09-03",
    sections: [
      { title: "Service", paragraphs: ["Track est un tag manager, un routeur d’événements côté serveur respectueux du consentement et une couche d’analytics, proposés sous forme d’abonnement. Les fonctionnalités et les limites sont décrites sur la page des tarifs et dans la formule choisie par le client."] },
      { title: "Obligations du client", paragraphs: ["Les clients sont responsables d’une mise en œuvre licite du consentement sur leurs propriétés, de l’exactitude de la configuration des destinations et de la mise à jour des identifiants d’accès des fournisseurs. Les clients ne doivent pas envoyer de catégories particulières de données personnelles ni utiliser le service à des fins de fingerprinting ou de contournement du consentement."] },
      { title: "Frais", paragraphs: ["Les frais sont facturés par Stripe selon la formule et la période. Une consommation supérieure à la limite de la formule déclenche des avertissements et une période de grâce avant l’application des limites strictes. Les prix sont affichés sur la page des tarifs tels qu’ils sont configurés dans Stripe."] },
      { title: "Disponibilité et support", paragraphs: ["L’exploitant vise une haute disponibilité du data plane et publie les incidents sur la page d’état. Le support est assuré par e-mail ; les formules Enterprise incluent un SLA."] },
      { title: "Responsabilité", paragraphs: ["La responsabilité est limitée au montant payé au cours des douze mois précédant l’événement, sauf en cas de faute intentionnelle, de négligence grave, d’atteinte à la vie ou à la santé et de responsabilité légale impérative."] },
      { title: "Durée et résiliation", paragraphs: ["Les abonnements se renouvellent par période et peuvent être résiliés pour la fin de la période. L’exploitant peut suspendre, après notification, les comptes qui enfreignent ces conditions, sauf lorsqu’une action immédiate est nécessaire pour protéger la plateforme."] },
      { title: "Droit applicable", paragraphs: ["Le droit du siège social de l’exploitant s’applique ; les protections impératives des consommateurs restent inchangées."] },
    ],
  },
};
