import { describe, expect, it } from "vitest";
import { z } from "zod";
import { assertOptionalsAcceptNull, defineTool, ToolRegistry } from "./registry.ts";

const tool = (input: z.ZodObject<z.ZodRawShape>, name = "t") =>
  defineTool({
    name,
    description: "test tool",
    kind: "read",
    permission: "config.read",
    input,
    handler: async (args) => args,
  });

describe("assertOptionalsAcceptNull", () => {
  it("accepts nullable, nullable-with-default and required fields", () => {
    expect(() => assertOptionalsAcceptNull(z.object({ a: z.string().nullable(), b: z.number().nullable().default(null), c: z.string(), d: z.enum(["x"]).nullish() }))).not.toThrow();
  });

  it("rejects optional or defaulted fields that do not accept null, at any depth", () => {
    expect(() => assertOptionalsAcceptNull(z.object({ a: z.string().optional() }))).toThrow(/property \.a accepts undefined but not null/);
    expect(() => assertOptionalsAcceptNull(z.object({ a: z.number().default(1) }))).toThrow(/property \.a /);
    expect(() => assertOptionalsAcceptNull(z.object({ list: z.array(z.object({ x: z.string().optional() })) }))).toThrow(/property \.list\[\]\.x /);
    expect(() => assertOptionalsAcceptNull(z.object({ u: z.discriminatedUnion("type", [z.object({ type: z.literal("a") }), z.object({ type: z.literal("b"), v: z.string().optional() })]) }))).toThrow(/property \.u<1>\.v /);
    expect(() => assertOptionalsAcceptNull(z.object({ nested: z.object({ deep: z.boolean().optional() }).nullable() }))).toThrow(/property \.nested\.deep /);
  });
});

describe("defineTool", () => {
  it("fails at registration for inputs whose optionals reject null", () => {
    expect(() => tool(z.object({ limit: z.number().optional() }), "bad_tool")).toThrow(/tool bad_tool: property \.limit accepts undefined but not null/);
  });

  it("emits a strict schema and re-validates arguments with the allowed values in the message", async () => {
    const t = tool(z.object({ mode: z.enum(["browser", "server"]), note: z.string().nullable() }));
    expect(t.jsonSchema).toMatchObject({ type: "object", additionalProperties: false, required: ["mode", "note"] });
    const invalid = t.validate({ mode: "hybrid", note: null });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.error).toMatch(/mode: .*(browser|server)/);
    expect(t.validate({ mode: "server", note: null })).toEqual({ ok: true, value: { mode: "server", note: null } });
  });

  it("lists registered tools as strict function definitions", () => {
    const registry = new ToolRegistry().register(tool(z.object({ q: z.string().nullable() }), "one"));
    expect(registry.openaiTools(["one", "missing"])).toEqual([{ type: "function", name: "one", description: "test tool", parameters: registry.get("one")!.jsonSchema, strict: true }]);
  });
});
