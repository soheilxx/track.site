/**
 * Message namespaces (one JSON file per namespace and locale under `apps/web/messages/<locale>/`).
 * `loadMessages()` in `request.ts` merges them in this order, so every file must have a unique
 * top-level key (e.g. `shell.json` → `{ "shell": { … } }`); `namespaces.test.ts` enforces that every
 * registered namespace exists for every active locale with identical key sets and that no file in
 * `messages/en` is left unregistered.
 *
 * Each dashboard module owns its own namespace. Register it by appending ONE line at the end of
 * this file — nothing else in the file changes:
 *
 *   registerNamespace("events");
 */
const registry: string[] = ["common", "auth", "app", "chat", "destinations"];

/** Adds a namespace once; the order of registration is the merge order. */
export function registerNamespace(namespace: string): void {
  if (!/^[a-z][a-z0-9-]*$/.test(namespace)) throw new Error(`invalid message namespace "${namespace}"`);
  if (!registry.includes(namespace)) registry.push(namespace);
}

/** The registered namespaces in merge order (live view of the registry). */
export const NAMESPACES: readonly string[] = registry;

registerNamespace("shell");
registerNamespace("insights");
registerNamespace("command-center");
registerNamespace("destinations-health");
registerNamespace("consent");
registerNamespace("data-quality");

registerNamespace("events");

registerNamespace("releases");

registerNamespace("billing-usage");

registerNamespace("team");

registerNamespace("alerts");

registerNamespace("assistant");

registerNamespace("ops");
registerNamespace("ops-break-glass");
registerNamespace("ops-organisations");
registerNamespace("ops-health");
registerNamespace("ops-revenue");
registerNamespace("ops-inbox");
registerNamespace("ops-controls");
registerNamespace("ops-audit");

registerNamespace("ops-users");
registerNamespace("ops-growth");
registerNamespace("ops-content");

registerNamespace("security");
registerNamespace("support");
registerNamespace("support-portal");

registerNamespace("support-tickets");

registerNamespace("support-macros");
registerNamespace("support-ticket");

registerNamespace("support-sla");

registerNamespace("support-notifications");

registerNamespace("support-reports");
