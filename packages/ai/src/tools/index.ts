import { ToolRegistry } from "./registry.ts";
import { CONFIRM_TOOL_LIST } from "./confirm.ts";
import { DESTINATION_TOOLS } from "./destinations.ts";
import { DRAFT_TOOLS } from "./draft.ts";
import { READ_TOOLS } from "./read.ts";

export * from "./registry.ts";
export { connectorContextFor, DESTINATION_SETTING_KEYS } from "./destinations.ts";

let registry: ToolRegistry | null = null;

/** All tools (read, draft, confirm). The per-turn subset is chosen by the state machine and role. */
export function buildToolRegistry(): ToolRegistry {
  if (registry) return registry;
  registry = new ToolRegistry();
  for (const t of [...READ_TOOLS, ...DRAFT_TOOLS, ...DESTINATION_TOOLS, ...CONFIRM_TOOL_LIST]) registry.register(t);
  return registry;
}

export const TOOL_SET_VERSION = "2026-09-03.2";
