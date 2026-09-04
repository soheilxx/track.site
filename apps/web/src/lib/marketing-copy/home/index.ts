import type { HomeCopy, LocalizedCopy } from "../types";
import { HOME_COPY_EN } from "./en";
import { HOME_COPY_DE } from "./de";
import { HOME_COPY_ES } from "./es";
import { HOME_COPY_FR } from "./fr";
import { HOME_COPY_IT } from "./it";
import { HOME_COPY_NL } from "./nl";

/**
 * Home page copy (supplement §4): benefit first, technical proof later; no invented customers,
 * numbers or results — every statement is a verifiable product fact or clearly labelled sample data.
 * The demo labels are function-free (placeholders in braces) because they are passed to a client
 * component; see `components/marketing/demo/text.ts`.
 */

export const HOME_COPY: LocalizedCopy<HomeCopy> = { en: HOME_COPY_EN, de: HOME_COPY_DE, fr: HOME_COPY_FR, es: HOME_COPY_ES, it: HOME_COPY_IT, nl: HOME_COPY_NL };
