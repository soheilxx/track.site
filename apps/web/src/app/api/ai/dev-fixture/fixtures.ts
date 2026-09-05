/**
 * Pure part of the development-only fixture route (no server imports, unit-tested): the guard and
 * the deterministic synthetic transcript. Every message is generated from its index — no customer
 * data, nothing persisted.
 */
export const FIXTURES = ["long-conversation"] as const;
export type FixtureName = (typeof FIXTURES)[number];

/**
 * Alive in development and test. A production *build* under test (`next start` for the e2e specs,
 * which always runs with `NODE_ENV=production`) must opt in explicitly with `AI_DEV_FIXTURES=1`;
 * `APP_ENV=production` keeps the route dead whatever else is set.
 */
export function devFixturesEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.APP_ENV === "production") return false;
  return env.NODE_ENV !== "production" || env.AI_DEV_FIXTURES === "1";
}

export interface FixtureMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  ui: null;
  createdAt: string;
}

const LINES = ["Which events should the shop send to Meta?", "Show me the delivery state of GA4.", "Why is purchase missing the currency parameter?", "Run the diagnostics again.", "What is still missing before publishing?", "Explain the consent state for Germany."];
const ANSWERS = ["The draft maps page_view, view_content, add_to_cart, begin_checkout and purchase. Nothing goes live before you confirm.", "GA4 received the last accepted event through the server route; the browser route is blocked until analytics consent is granted.", "The purchase payload from the checkout page has no currency field, so the value cannot be attributed. The measurement plan marks it as required.", "Diagnostics finished: the snippet is installed, the domain is verified and one destination is waiting for a credential.", "Two things: the Meta access token through the secure credential card, and a test event for begin_checkout.", "With denied marketing consent, Meta and TikTok are blocked at the policy gate; GA4 continues in consent mode with no identifiers.\n\nThe simulator shows the exact field list per destination."];

export function fixtureMessages(count: number, base = new Date("2026-01-01T09:00:00.000Z")): FixtureMessage[] {
  return Array.from({ length: count }, (_, i) => {
    const user = i % 2 === 0;
    const text = user ? LINES[(i / 2) % LINES.length]! : ANSWERS[((i - 1) / 2) % ANSWERS.length]!;
    return { id: `fixture-${i}`, role: user ? "user" : "assistant", content: `${text} (#${i + 1})`, ui: null, createdAt: new Date(base.getTime() + i * 60_000).toISOString() };
  });
}
