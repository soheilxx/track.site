import type { HowItWorksCopy, LocalizedCopy } from "../types";
import { HOW_IT_WORKS_EN } from "./en";
import { HOW_IT_WORKS_DE } from "./de";
import { HOW_IT_WORKS_ES } from "./es";
import { HOW_IT_WORKS_FR } from "./fr";
import { HOW_IT_WORKS_IT } from "./it";
import { HOW_IT_WORKS_NL } from "./nl";

/*
 * /how-it-works. Keeps the `HowItWorksCopy` shape (title, intro, steps, architecture, faq) and adds
 * what the redesigned page needs. The customer sees four milestones (`steps`); the long list of
 * technical checks lives in the collapsible `checks` section and mirrors the setup state machine in
 * packages/ai (site, business type, platform, installation, consent, destinations, event plan,
 * test, review, publish, health) without turning it into a step count.
 */

export const HOW_IT_WORKS: LocalizedCopy<HowItWorksCopy> = { en: HOW_IT_WORKS_EN, de: HOW_IT_WORKS_DE, fr: HOW_IT_WORKS_FR, es: HOW_IT_WORKS_ES, it: HOW_IT_WORKS_IT, nl: HOW_IT_WORKS_NL };
