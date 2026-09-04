import type { FeatureCopy, FeatureDetailLabels, FeatureUiCopy, FeaturesPageCopy, LocalizedCopy } from "../types";
import { FEATURES_EN, FEATURES_PAGE_COPY_EN, FEATURE_DETAIL_COPY_EN, FEATURE_UI_COPY_EN } from "./en";
import { FEATURES_DE, FEATURES_PAGE_COPY_DE, FEATURE_DETAIL_COPY_DE, FEATURE_UI_COPY_DE } from "./de";
import { FEATURES_ES, FEATURES_PAGE_COPY_ES, FEATURE_DETAIL_COPY_ES, FEATURE_UI_COPY_ES } from "./es";
import { FEATURES_FR, FEATURES_PAGE_COPY_FR, FEATURE_DETAIL_COPY_FR, FEATURE_UI_COPY_FR } from "./fr";
import { FEATURES_IT, FEATURES_PAGE_COPY_IT, FEATURE_DETAIL_COPY_IT, FEATURE_UI_COPY_IT } from "./it";
import { FEATURES_NL, FEATURES_PAGE_COPY_NL, FEATURE_DETAIL_COPY_NL, FEATURE_UI_COPY_NL } from "./nl";

/*
 * Feature pages (/features, /features/[slug]).
 *
 * `FEATURES` keeps the `FeatureCopy` shape (slug, title, short, intro, sections, bullets, faq) and
 * adds what the redesigned pages need: a customer benefit, the narrative next to the data-flow
 * diagram, a before/after comparison and the caption of the product view. `FEATURES_PAGE_COPY` is
 * the overview page, `FEATURE_DETAIL_COPY` the labels of the detail pages and `FEATURE_UI_COPY` the
 * labels and example fixtures of the static product views (every value is a deliberately marked
 * example state, never live data). Only verifiable product facts: the counts, names and reasons
 * below mirror packages/events, packages/policy, packages/analytics and the integrations catalog.
 */

export const FEATURES: LocalizedCopy<FeatureCopy[]> = { en: FEATURES_EN, de: FEATURES_DE, fr: FEATURES_FR, es: FEATURES_ES, it: FEATURES_IT, nl: FEATURES_NL };

export const FEATURES_PAGE_COPY: LocalizedCopy<FeaturesPageCopy> = { en: FEATURES_PAGE_COPY_EN, de: FEATURES_PAGE_COPY_DE, fr: FEATURES_PAGE_COPY_FR, es: FEATURES_PAGE_COPY_ES, it: FEATURES_PAGE_COPY_IT, nl: FEATURES_PAGE_COPY_NL };

export const FEATURE_DETAIL_COPY: LocalizedCopy<FeatureDetailLabels> = { en: FEATURE_DETAIL_COPY_EN, de: FEATURE_DETAIL_COPY_DE, fr: FEATURE_DETAIL_COPY_FR, es: FEATURE_DETAIL_COPY_ES, it: FEATURE_DETAIL_COPY_IT, nl: FEATURE_DETAIL_COPY_NL };

export const FEATURE_UI_COPY: LocalizedCopy<FeatureUiCopy> = { en: FEATURE_UI_COPY_EN, de: FEATURE_UI_COPY_DE, fr: FEATURE_UI_COPY_FR, es: FEATURE_UI_COPY_ES, it: FEATURE_UI_COPY_IT, nl: FEATURE_UI_COPY_NL };
