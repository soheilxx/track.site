import type { ConsentCopy, ContactFormCopy, FooterCopy, HeaderCopy, LocalizedCopy } from "../types";
import { HEADER_COPY_EN, FOOTER_COPY_EN, CONSENT_COPY_EN, FORM_COPY_EN } from "./en";
import { HEADER_COPY_DE, FOOTER_COPY_DE, CONSENT_COPY_DE, FORM_COPY_DE } from "./de";
import { HEADER_COPY_ES, FOOTER_COPY_ES, CONSENT_COPY_ES, FORM_COPY_ES } from "./es";
import { HEADER_COPY_FR, FOOTER_COPY_FR, CONSENT_COPY_FR, FORM_COPY_FR } from "./fr";
import { HEADER_COPY_IT, FOOTER_COPY_IT, CONSENT_COPY_IT, FORM_COPY_IT } from "./it";
import { HEADER_COPY_NL, FOOTER_COPY_NL, CONSENT_COPY_NL, FORM_COPY_NL } from "./nl";

/**
 * Copy shared by several pages: the site shell (header + mobile drawer, footer, consent dialog, skip
 * link) and the contact form.
 *
 * The shell reads `HEADER_COPY`, `FOOTER_COPY` and `CONSENT_COPY`; their shapes (the navigation model —
 * groups, columns, links with a one-line benefit) live in types.ts. Every href is locale-neutral
 * (next-intl's <Link> adds the prefix) and points to a route that exists today; nothing links to a
 * page that is not built.
 */

/* ------------------------------------------------------------------------ header */

export const HEADER_COPY: LocalizedCopy<HeaderCopy> = { en: HEADER_COPY_EN, de: HEADER_COPY_DE, fr: HEADER_COPY_FR, es: HEADER_COPY_ES, it: HEADER_COPY_IT, nl: HEADER_COPY_NL };

/* ------------------------------------------------------------------------ footer */
export const FOOTER_COPY: LocalizedCopy<FooterCopy> = { en: FOOTER_COPY_EN, de: FOOTER_COPY_DE, fr: FOOTER_COPY_FR, es: FOOTER_COPY_ES, it: FOOTER_COPY_IT, nl: FOOTER_COPY_NL };

/* ----------------------------------------------------------------------- consent */

/** Consent dialog texts (components/marketing/consent-dialog.tsx). Not mounted today — see that file. */
export const CONSENT_COPY: LocalizedCopy<ConsentCopy> = { en: CONSENT_COPY_EN, de: CONSENT_COPY_DE, fr: CONSENT_COPY_FR, es: CONSENT_COPY_ES, it: CONSENT_COPY_IT, nl: CONSENT_COPY_NL };

/* ------------------------------------------------------------------ flat shared copy */
/** Contact form labels and messages, shared by /contact, /demo and /support. */
export const FORM_COPY: LocalizedCopy<ContactFormCopy> = { en: FORM_COPY_EN, de: FORM_COPY_DE, fr: FORM_COPY_FR, es: FORM_COPY_ES, it: FORM_COPY_IT, nl: FORM_COPY_NL };
