import type { Tone } from "@track-site/ui";
import type { KnowledgeStatus } from "@/lib/knowledge";

/** Semantic tone per editorial status; the text next to it always carries the meaning as well. */
export const STATUS_TONE: Record<KnowledgeStatus | "missing", Tone> = {
  published: "ok",
  reviewed: "info",
  translated: "neutral",
  draft: "neutral",
  missing: "bad",
};
