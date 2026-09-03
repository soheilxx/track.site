import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { buildToolRegistry } from "./tools/index.ts";
import { assistantUiJsonSchema } from "./ui-schema.ts";

it("dumps schemas", () => {
  const reg = buildToolRegistry();
  const out: Record<string, unknown> = { __ui: assistantUiJsonSchema() };
  for (const t of reg.list()) out[t.name] = { description: t.description, parameters: t.jsonSchema };
  writeFileSync("C:/Users/Soheil/AppData/Local/Temp/claude/C--Users-Soheil-Downloads/c4e10eac-a8e9-429a-81d6-317c47246f54/scratchpad/schemas.json", JSON.stringify(out, null, 2));
});
