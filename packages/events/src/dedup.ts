/**
 * Vendor-facing deduplication id. Purchases and refunds share one id per order across every path
 * (browser pixel, server API, verified shop webhook), so vendors that deduplicate on event id count
 * the order once without any of the paths having to know about each other. Every other event keeps
 * the id of its own observation.
 */
export function vendorDedupId(e: { name: string; commerce?: { order_id?: string | null } | null; source_event_id: string }): string {
  const orderId = e.commerce?.order_id;
  if ((e.name === "purchase" || e.name === "refund") && orderId) return `${e.name}:${orderId}`.slice(0, 128);
  return e.source_event_id;
}
