import type { KnowledgeCopy, KnowledgeHubCopy, LocalizedCopy } from "../types";
import { KNOWLEDGE_COPY_EN, KNOWLEDGE_HUB_COPY_EN } from "./en";
import { KNOWLEDGE_COPY_DE, KNOWLEDGE_HUB_COPY_DE } from "./de";
import { KNOWLEDGE_COPY_FR, KNOWLEDGE_HUB_COPY_FR } from "./fr";
import { KNOWLEDGE_COPY_ES, KNOWLEDGE_HUB_COPY_ES } from "./es";
import { KNOWLEDGE_COPY_IT, KNOWLEDGE_HUB_COPY_IT } from "./it";
import { KNOWLEDGE_COPY_NL, KNOWLEDGE_HUB_COPY_NL } from "./nl";

export type { KnowledgeCopy, KnowledgeHubCopy, PluralText } from "../types";

/**
 * Copy of the Tracking Knowledge hub (supplement §6: hero + search, featured story, topic worlds,
 * learning paths, platform/shop guides, fresh lists, directory with filters, restrained product CTA).
 * The product name stays "Tracking Knowledge" in every language; everything around it is localized.
 * Placeholders (`{n}`, `{total}`, `{q}`) are filled by `components/marketing/knowledge/hub/text.ts`
 * because the object crosses the server → client boundary as a prop. No popularity numbers, badges
 * or success rates: every count shown on the page is a real count from the loader.
 */
export const KNOWLEDGE_HUB_COPY: LocalizedCopy<KnowledgeHubCopy> = { en: KNOWLEDGE_HUB_COPY_EN, de: KNOWLEDGE_HUB_COPY_DE, fr: KNOWLEDGE_HUB_COPY_FR, es: KNOWLEDGE_HUB_COPY_ES, it: KNOWLEDGE_HUB_COPY_IT, nl: KNOWLEDGE_HUB_COPY_NL };

/**
 * Surrounding copy of the knowledge area used by the index page metadata, the RSS feed and the
 * social cards (`app/[locale]/(marketing)/tracking-knowledge/copy.ts` resolves it with `pick`).
 */
export const KNOWLEDGE_COPY: LocalizedCopy<KnowledgeCopy> = { en: KNOWLEDGE_COPY_EN, de: KNOWLEDGE_COPY_DE, fr: KNOWLEDGE_COPY_FR, es: KNOWLEDGE_COPY_ES, it: KNOWLEDGE_COPY_IT, nl: KNOWLEDGE_COPY_NL };
