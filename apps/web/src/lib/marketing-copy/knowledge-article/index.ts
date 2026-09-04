import type { KnowledgeArticleCopy, LocalizedCopy } from "../types";
import { KNOWLEDGE_ARTICLE_COPY_EN } from "./en";
import { KNOWLEDGE_ARTICLE_COPY_DE } from "./de";
import { KNOWLEDGE_ARTICLE_COPY_FR } from "./fr";
import { KNOWLEDGE_ARTICLE_COPY_ES } from "./es";
import { KNOWLEDGE_ARTICLE_COPY_IT } from "./it";
import { KNOWLEDGE_ARTICLE_COPY_NL } from "./nl";

/**
 * Copy of the Tracking Knowledge article template (redesign supplement §6 "Neues Artikeltemplate"):
 * breadcrumbs, meta labels, table of contents, callout titles, sources, the contextual Track CTA,
 * related articles and the feedback question. The product name "Tracking Knowledge" and the brand
 * "Track" stay identical in every language; everything else is translated. CTA texts only repeat
 * what the linked feature pages state — no numbers, no social proof, no invented outcomes.
 */
export const KNOWLEDGE_ARTICLE_COPY: LocalizedCopy<KnowledgeArticleCopy> = { en: KNOWLEDGE_ARTICLE_COPY_EN, de: KNOWLEDGE_ARTICLE_COPY_DE, fr: KNOWLEDGE_ARTICLE_COPY_FR, es: KNOWLEDGE_ARTICLE_COPY_ES, it: KNOWLEDGE_ARTICLE_COPY_IT, nl: KNOWLEDGE_ARTICLE_COPY_NL };

export type { KnowledgeArticleCopy, KnowledgeCtaItem, KnowledgeCtaKey } from "../types";
