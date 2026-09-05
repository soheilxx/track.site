/**
 * Locale-neutral paths of the Tracking Knowledge area, in a module without dependencies so client
 * islands (hub directory, search) can import them without pulling the route tables (`routes.ts` →
 * integrations catalogue, 24 KB) or the server-only content loader (`knowledge.ts`) into their
 * bundle. `routes.ts` and `knowledge.ts` re-export these names.
 */

/** Fixed product name and path of the knowledge area (formerly "Blog"); identical in every language. */
export const KNOWLEDGE_PATH = "/tracking-knowledge";

/** Locale-neutral path of an article (`/tracking-knowledge/<slug>`); next-intl's `<Link>` adds the locale prefix. */
export function articlePath(slug: string): string {
  return `${KNOWLEDGE_PATH}/${slug}`;
}
