import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { FeedbackTable } from "@/components/ops/content/feedback-table";
import { formatDateTime } from "@/components/ops/content/format";
import { ContentHeader } from "@/components/ops/content/header";
import { Footnote } from "@/components/ops/content/section";
import { ContentSubnav } from "@/components/ops/content/subnav";
import { OpsForbidden } from "@/components/ops/shell";
import { FEEDBACK_WINDOW_DAYS, loadContentFeedback } from "@/server/ops/content";
import { checkPlatform, platformLocale } from "@/server/ops/platform";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("opsContent.sections");
  return { title: t("feedback") };
}

/** Reader feedback per article: anonymous "was this helpful?" votes (all-time and the last 30 days, per locale) joined with the board. */
export default async function OpsContentFeedbackPage() {
  const access = await checkPlatform("PLATFORM_SUPPORT");
  if (!access.ok) return <OpsForbidden reason={access.reason} />;
  const { ctx } = access;
  const [t, locale] = await Promise.all([getTranslations("opsContent"), platformLocale(ctx.user)]);
  const feedback = await loadContentFeedback(ctx, locale);
  return (
    <div className="space-y-6">
      <ContentHeader section="feedback" intro={t("feedback.intro", { days: FEEDBACK_WINDOW_DAYS })} locale={locale} />
      <ContentSubnav current="feedback" />
      <FeedbackTable feedback={feedback} locale={locale} now={feedback.generatedAt} />
      <Footnote>{t("common.generatedAt", { time: formatDateTime(feedback.generatedAt, locale) ?? feedback.generatedAt })}</Footnote>
    </div>
  );
}
