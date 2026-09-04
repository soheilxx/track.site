/**
 * Locale-neutral fixtures of the secondary area (code samples, snippets) shared by every language file.
 * Not copy: translators never edit this file.
 */

export const SNIPPET = `<script async src="https://cdn.track.site/v1/tracker.js" data-site-id="TRACKING_ID"></script>`;

export const CONSENT_CALL = `tsq.push(["consent", { granted: ["necessary", "analytics", "marketing"], source: "api", policy_version: "2026-09" }]);`;

export const SERVER_CALL = `curl -X POST https://api.track.site/v1/s \\\n  -H "Authorization: Bearer tsk_..." -H "Content-Type: application/json" \\\n  -d '{"events":[{"name":"purchase","ts":1767225600000,"props":{"offline":true},"commerce":{"order_id":"A1001","currency":"EUR","value":129.9},"user_data":{"email":"customer@example.com"},"click_ids":{"gclid":"Cj0K..."},"consent":{"granted":["necessary","marketing"],"source":"crm"}}]}'`;

export const browserEvents = (comment: string) => `window.tsq = window.tsq || [];\ntsq.push(["track", "purchase", { order_id: "A1001", currency: "EUR", value: 129.9, items: [{ item_id: "SKU-1", price: 99.9, quantity: 1 }] }]);\ntsq.push(["identify", { user_id: "u_42", email: "customer@example.com" }]); // ${comment}`;
