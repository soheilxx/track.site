import { isFeatureEnabled } from "@/server/flags";
import { ArticleFeedbackForm, type FeedbackLabels } from "./feedback-form";

export type { FeedbackLabels } from "./feedback-form";

/**
 * Feedback widget of a Tracking Knowledge article, gated by the feature flag `knowledge.feedback`
 * (global default only — the marketing site has no organization; Track Operations → Controls). Server
 * component: the flag is resolved where the article is rendered (build / revalidation for static pages)
 * with the code default when the database is unavailable; the buttons themselves are the client island
 * `ArticleFeedbackForm`.
 */
export async function ArticleFeedback(props: { translationGroupId: string; locale: string; labels: FeedbackLabels }) {
  if (!(await isFeatureEnabled(null, "knowledge.feedback"))) return null;
  return <ArticleFeedbackForm {...props} />;
}
