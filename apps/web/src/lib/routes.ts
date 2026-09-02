import { INTEGRATIONS } from "./integrations-catalog";

/** Indexable marketing routes (locale-neutral paths). Blog routes are added from content. */
export const FEATURE_PAGES = ["ai-setup", "server-side-tracking", "event-debugger", "data-quality", "consent", "attribution"] as const;

export const STATIC_MARKETING_ROUTES: Array<{ path: string; changeFrequency: "daily" | "weekly" | "monthly"; priority: number }> = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/features", changeFrequency: "monthly", priority: 0.9 },
  ...FEATURE_PAGES.map((f) => ({ path: `/features/${f}`, changeFrequency: "monthly" as const, priority: 0.8 })),
  { path: "/how-it-works", changeFrequency: "monthly", priority: 0.8 },
  { path: "/integrations", changeFrequency: "weekly", priority: 0.9 },
  ...INTEGRATIONS.map((i) => ({ path: `/integrations/${i.slug}`, changeFrequency: "monthly" as const, priority: 0.7 })),
  { path: "/pricing", changeFrequency: "monthly", priority: 0.9 },
  { path: "/security", changeFrequency: "monthly", priority: 0.6 },
  { path: "/privacy", changeFrequency: "monthly", priority: 0.5 },
  { path: "/data-processing", changeFrequency: "monthly", priority: 0.5 },
  { path: "/subprocessors", changeFrequency: "monthly", priority: 0.4 },
  { path: "/docs", changeFrequency: "weekly", priority: 0.8 },
  { path: "/blog", changeFrequency: "daily", priority: 0.8 },
  { path: "/contact", changeFrequency: "monthly", priority: 0.5 },
  { path: "/demo", changeFrequency: "monthly", priority: 0.6 },
  { path: "/support", changeFrequency: "monthly", priority: 0.5 },
  { path: "/terms", changeFrequency: "monthly", priority: 0.3 },
  { path: "/imprint", changeFrequency: "monthly", priority: 0.3 },
  { path: "/status", changeFrequency: "daily", priority: 0.3 },
];
