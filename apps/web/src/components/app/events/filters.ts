/** Explorer filter vocabularies shared by the server queries, the page and the client component (no server-only imports). */
export type ExplorerWindow = "1h" | "24h" | "7d" | "30d";
export const EXPLORER_WINDOWS: readonly ExplorerWindow[] = ["1h", "24h", "7d", "30d"];

export const EXPLORER_STATUSES = ["all", "stored", "routed", "delivered", "failed", "deduplicated", "rejected"] as const;
export type ExplorerStatus = (typeof EXPLORER_STATUSES)[number];

export const EXPLORER_SOURCES = ["all", "browser", "server", "shopify", "woocommerce", "shopware", "webhook"] as const;
export type ExplorerSource = (typeof EXPLORER_SOURCES)[number];

export interface ExplorerFilters {
  name: string | null;
  source: ExplorerSource;
  status: ExplorerStatus;
  window: ExplorerWindow;
  before: string | null;
}
