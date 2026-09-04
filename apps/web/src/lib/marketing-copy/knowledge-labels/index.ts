import type { KnowledgeLabels, LocalizedCopy } from "../types";
import { KNOWLEDGE_LABELS_EN } from "./en";
import { KNOWLEDGE_LABELS_DE } from "./de";
import { KNOWLEDGE_LABELS_NL } from "./nl";
import { KNOWLEDGE_LABELS_FR } from "./fr";
import { KNOWLEDGE_LABELS_ES } from "./es";
import { KNOWLEDGE_LABELS_IT } from "./it";

export type { KnowledgeAuthorLabels, KnowledgeLabels } from "../types";

/**
 * Localized labels of the Tracking Knowledge taxonomy (nine topic worlds, content types, levels,
 * recency filter) and of the editorial author records, plus the social-card alt template. The ids
 * are fixed in `lib/knowledge.ts`, which projects these tables into its `TOPICS`, `*_LABELS` and
 * `AUTHORS` constants; pages never read this module directly.
 */
export const KNOWLEDGE_LABELS: LocalizedCopy<KnowledgeLabels> = { en: KNOWLEDGE_LABELS_EN, de: KNOWLEDGE_LABELS_DE, fr: KNOWLEDGE_LABELS_FR, es: KNOWLEDGE_LABELS_ES, it: KNOWLEDGE_LABELS_IT, nl: KNOWLEDGE_LABELS_NL };
