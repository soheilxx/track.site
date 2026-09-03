import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildToolRegistry } from "./tools/index.ts";
import { assistantUiJsonSchema, inputComponentSchema, strictJsonSchema } from "./ui-schema.ts";

/** keywords OpenAI strict mode rejects or that must have been rewritten */
const FORBIDDEN_KEYWORDS = ["$schema", "default", "minLength", "maxLength", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minItems", "maxItems", "uniqueItems", "minProperties", "maxProperties", "pattern", "format", "propertyNames", "patternProperties", "oneOf"];

/** Walks a schema the way the provider does and lists everything strict mode would reject. */
function strictViolations(schema: unknown, path = "(root)", out: string[] = []): string[] {
  if (Array.isArray(schema)) {
    schema.forEach((s, i) => strictViolations(s, `${path}[${i}]`, out));
    return out;
  }
  if (!schema || typeof schema !== "object") return out;
  const node = schema as Record<string, unknown>;
  for (const keyword of FORBIDDEN_KEYWORDS) if (keyword in node) out.push(`${path}: ${keyword}`);
  const types = Array.isArray(node.type) ? (node.type as string[]) : typeof node.type === "string" ? [node.type] : [];
  const isObject = types.includes("object") || "properties" in node;
  if (isObject) {
    if (node.additionalProperties !== false) out.push(`${path}: additionalProperties must be false`);
    const props = (node.properties ?? {}) as Record<string, unknown>;
    const required = (node.required as string[] | undefined) ?? [];
    for (const key of Object.keys(props)) {
      if (!required.includes(key)) out.push(`${path}.${key}: not required`);
      strictViolations(props[key], `${path}.${key}`, out);
    }
    for (const key of required) if (!(key in props)) out.push(`${path}.${key}: required but not a property`);
  }
  if (types.includes("array") && !("items" in node)) out.push(`${path}: array without items`);
  // a nullable type array does not make `enum`/`const` accept null; those keywords are validated on their own
  if (types.includes("null") && Array.isArray(node.enum) && !node.enum.includes(null)) out.push(`${path}: nullable enum without null`);
  if (types.includes("null") && "const" in node) out.push(`${path}: nullable const`);
  if (Array.isArray(node.anyOf)) {
    const variants = node.anyOf as Array<Record<string, unknown>>;
    const objects = variants.filter((v) => v.type === "object" || "properties" in v);
    if (variants.length > 1 && objects.length === variants.length) {
      const discriminators = objects.map((v) => Object.entries((v.properties ?? {}) as Record<string, Record<string, unknown>>).filter(([, p]) => "const" in p || Array.isArray(p.enum)).map(([k]) => k));
      const shared = discriminators.reduce((acc, keys) => acc.filter((k) => keys.includes(k)));
      if (shared.length === 0) out.push(`${path}: object union without a shared const/enum discriminator`);
    }
  }
  for (const key of ["items", "anyOf", "allOf"]) if (key in node) strictViolations(node[key], `${path}.${key}`, out);
  if (node.$defs && typeof node.$defs === "object") for (const [k, v] of Object.entries(node.$defs as Record<string, unknown>)) strictViolations(v, `${path}.$defs.${k}`, out);
  return out;
}

const json = (schema: z.ZodType) => z.toJSONSchema(schema, { target: "draft-2020-12", unrepresentable: "any" }) as Record<string, unknown>;
const propsOf = (schema: Record<string, unknown>) => schema.properties as Record<string, Record<string, unknown>>;

describe("strictJsonSchema", () => {
  it("moves every dropped validation keyword into a description hint", () => {
    const out = strictJsonSchema({
      type: "object",
      properties: {
        n: { type: "number", exclusiveMinimum: 0, exclusiveMaximum: 10, multipleOf: 0.5, description: "ratio" },
        tags: { type: "array", items: { type: "string", minLength: 1, pattern: "^[a-z]+$" }, minItems: 1, maxItems: 5, uniqueItems: true },
        opts: { type: "object", properties: { a: { type: "string", format: "uuid" } }, required: ["a"], minProperties: 1, maxProperties: 3 },
      },
      required: ["n", "tags", "opts"],
    });
    const props = propsOf(out);
    expect(props.n).toEqual({ type: "number", description: "ratio (greater than 0, less than 10, multiple of 0.5)" });
    expect(props.tags!.description).toBe("(at least 1 items, at most 5 items, unique items)");
    expect((props.tags!.items as Record<string, unknown>).description).toBe("(at least 1 characters, matching ^[a-z]+$)");
    expect(props.opts!.description).toBe("(at least 1 properties, at most 3 properties)");
    expect(propsOf(props.opts!).a!.description).toBe("(format uuid)");
    expect(strictViolations(out)).toEqual([]);
  });

  it("makes optional properties nullable, requires every property and closes objects", () => {
    const out = strictJsonSchema(json(z.object({ a: z.string().optional(), b: z.number() })));
    expect(out.required).toEqual(["a", "b"]);
    expect(out.additionalProperties).toBe(false);
    expect(propsOf(out).a!.type).toEqual(["string", "null"]);
    expect(strictViolations(out)).toEqual([]);
  });

  it("lists null in the enum and wraps consts when an optional property becomes nullable", () => {
    const out = strictJsonSchema(json(z.object({ mode: z.enum(["browser", "server"]).optional(), kind: z.literal("pixel").optional(), n: z.number().nullable().optional() })));
    expect(propsOf(out).mode).toEqual({ type: ["string", "null"], enum: ["browser", "server", null] });
    expect(propsOf(out).kind).toEqual({ anyOf: [{ type: "string", const: "pixel" }, { type: "null" }] });
    expect(propsOf(out).n).toEqual({ type: ["number", "null"] });
    expect(strictViolations(out)).toEqual([]);
    expect(strictViolations({ type: "object", additionalProperties: false, required: ["a"], properties: { a: { type: ["string", "null"], enum: ["x"] } } })).toEqual(["(root).a: nullable enum without null"]);
  });

  it("does not add a second null variant to an anyOf that already has one", () => {
    const out = strictJsonSchema({ type: "object", properties: { v: { anyOf: [{ type: "string" }, { type: "null" }] } } });
    expect(propsOf(out).v).toEqual({ anyOf: [{ type: "string" }, { type: "null" }] });
  });

  it("rewrites oneOf into anyOf", () => {
    const out = strictJsonSchema({ type: "object", properties: { v: { oneOf: [{ type: "string" }, { type: "number" }] } }, required: ["v"] });
    expect(propsOf(out).v).toEqual({ anyOf: [{ type: "string" }, { type: "number" }] });
  });

  it("fails fast on records because strict mode has no open maps", () => {
    expect(() => strictJsonSchema(json(z.object({ settings: z.record(z.string(), z.string()) })))).toThrow(/"(propertyNames|additionalProperties)" at \.settings /);
    expect(() => strictJsonSchema(json(z.object({ nested: z.object({ ids: z.record(z.string().regex(/^[a-z]+$/), z.number()) }) })))).toThrow(/ at \.nested\.ids /);
    expect(() => strictJsonSchema({ type: "object", properties: { m: { type: "object", additionalProperties: { type: "string" } } }, required: ["m"] })).toThrow(/"additionalProperties" at \.m /);
    expect(() => strictJsonSchema({ type: "object", properties: { m: { type: "object", patternProperties: { "^x": { type: "string" } } } }, required: ["m"] })).toThrow(/patternProperties/);
  });
});

describe("registered tools", () => {
  const tools = buildToolRegistry().list();

  it("registers the full tool set", () => {
    expect(tools.length).toBeGreaterThan(10);
    expect(tools.map((t) => t.name)).toContain("set_destination_settings_draft");
  });

  it("emits strict-mode compatible schemas for every tool and for the assistant UI", () => {
    for (const tool of tools) expect(strictViolations(tool.jsonSchema, tool.name)).toEqual([]);
    expect(strictViolations(assistantUiJsonSchema(), "assistant_ui")).toEqual([]);
  });

  it("keeps every function description within the provider's 1024-character limit", () => {
    for (const tool of tools) expect(tool.description.length, tool.name).toBeLessThanOrEqual(1024);
  });

  it("uses object roots and plain anyOf unions with const/enum discriminators everywhere", () => {
    for (const tool of tools) expect(tool.jsonSchema.type, tool.name).toBe("object");
    const ui = assistantUiJsonSchema();
    const cards = (propsOf(ui).cards!.items as Record<string, unknown>).anyOf as Array<Record<string, unknown>>;
    expect(cards.length).toBeGreaterThan(5);
    for (const card of cards) expect(propsOf(card).type!.const, "card discriminator").toEqual(expect.any(String));
    for (const component of propsOf(ui).input_component!.anyOf as Array<Record<string, unknown>>) expect(propsOf(component).type!.const, "input discriminator").toEqual(expect.any(String));
  });

  it("tells the model where integration_id / draft_id come from for every tool it calls itself", () => {
    // confirm tools are exempt: their arguments are injected by the UI approval route and the model is told never to call them
    const sources = /(list_integrations|get_workspace_state|create_integration_draft|get_destination_status|prepare_publish|context block)/;
    for (const tool of tools.filter((t) => t.kind !== "confirm")) {
      const props = propsOf(tool.jsonSchema);
      for (const key of ["integration_id", "draft_id"]) {
        if (!(key in props)) continue;
        expect(`${tool.description} ${String(props[key]!.description ?? "")}`, `${tool.name}.${key}`).toMatch(sources);
      }
    }
  });

  it("exposes the destination setting keys as a closed enum instead of a record", () => {
    const tool = buildToolRegistry().get("set_destination_settings_draft")!;
    const settings = propsOf(tool.jsonSchema).settings as { anyOf: Array<Record<string, unknown>> };
    const array = settings.anyOf[0]!;
    expect(array.type).toBe("array");
    const entry = array.items as Record<string, unknown>;
    expect(entry.additionalProperties).toBe(false);
    const key = propsOf(entry).key!;
    expect(key.enum).toEqual(expect.arrayContaining(["test_event_code", "conversion_rules", "allowFields", "includeIdentifiers", "timeoutMs"]));
    expect(key.enum).not.toContain("allowed_fields");
  });
});

describe("pixel_id input component", () => {
  it("accepts unknown pattern and example as null", () => {
    const parsed = inputComponentSchema.parse({ type: "pixel_id", field: "pixel_id", label: "Meta Pixel ID", connector_type: "meta", pattern: null, example: null });
    expect(parsed).toMatchObject({ type: "pixel_id", pattern: null, example: null });
    const schema = strictJsonSchema(json(inputComponentSchema));
    const pixel = (schema.anyOf as Array<Record<string, unknown>>).find((o) => (propsOf(o).type as { const?: string }).const === "pixel_id")!;
    expect(propsOf(pixel).pattern!.type).toEqual(["string", "null"]);
    expect(propsOf(pixel).example!.type).toEqual(["string", "null"]);
  });
});
