import type { LocalizedCopy, SecondaryCopy } from "../types";
import { SECONDARY_COPY_EN } from "./en";
import { SECONDARY_COPY_DE } from "./de";
import { SECONDARY_COPY_FR } from "./fr";
import { SECONDARY_COPY_ES } from "./es";
import { SECONDARY_COPY_IT } from "./it";
import { SECONDARY_COPY_NL } from "./nl";

/**
 * Copy of the secondary public pages: docs, support, contact, demo, status, security and the
 * frame of the legal pages (privacy, terms, data processing, subprocessors, imprint). The legal
 * texts themselves stay in lib/legal-copy/<locale>.ts; this module only carries the page chrome around
 * them (eyebrows, table-of-contents labels, operator labels, related links).
 *
 * The shape is `SecondaryCopy` in types.ts. Only
 * verifiable product facts: every claim below mirrors docs, legal-copy or the connector catalogue.
 */

export const SECONDARY_COPY: LocalizedCopy<SecondaryCopy> = { en: SECONDARY_COPY_EN, de: SECONDARY_COPY_DE, fr: SECONDARY_COPY_FR, es: SECONDARY_COPY_ES, it: SECONDARY_COPY_IT, nl: SECONDARY_COPY_NL };

/** Date the subprocessor list and the legal frame were last reviewed (shown as "Last updated"). */
export const SUBPROCESSORS_UPDATED = "2026-09-03";
