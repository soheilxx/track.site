import { generateStaticParams as cardParams, renderArticleSocialCard } from "../card";

/**
 * Stable URL of the generated 1200×630 social card (one per published article and locale):
 * page metadata and JSON-LD reference this path directly. A route handler is used instead of the
 * opengraph-image file convention because Next appends a build hash to image routes under dynamic
 * segments, which made hand-composed URLs answer 404 (release report defect D1).
 */
export const dynamic = "force-static";
export const generateStaticParams = cardParams;

export async function GET(_request: Request, ctx: { params: Promise<{ locale: string; slug: string }> }) {
  return renderArticleSocialCard(ctx);
}
