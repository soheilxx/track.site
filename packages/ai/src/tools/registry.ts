import { z } from "zod";
import { AppError, ok, toErrResult, type OrgRole, type Permission, type Result } from "@track-site/core";
import { can } from "@track-site/core";
import { strictJsonSchema } from "../ui-schema.ts";
import type { AgentContext } from "../context.ts";

/**
 * Typed tool registry. Every tool has a strict JSON schema (generated from Zod, re-validated
 * server-side), a kind (read | draft | confirm), the permission it needs and an idempotent handler.
 * The model never gets a tool that can take arbitrary organization ids or URLs.
 */
export type ToolKind = "read" | "draft" | "confirm";

export interface ToolDefinition<I extends z.ZodObject<z.ZodRawShape>, O> {
  name: string;
  description: string;
  kind: ToolKind;
  permission: Permission;
  input: I;
  handler: (args: z.infer<I>, ctx: AgentContext) => Promise<O>;
}

export interface RegisteredTool {
  name: string;
  description: string;
  kind: ToolKind;
  permission: Permission;
  jsonSchema: Record<string, unknown>;
  validate: (args: unknown) => { ok: true; value: unknown } | { ok: false; error: string };
  run: (args: unknown, ctx: AgentContext) => Promise<Result<unknown>>;
}

export function defineTool<I extends z.ZodObject<z.ZodRawShape>, O>(def: ToolDefinition<I, O>): RegisteredTool {
  const jsonSchema = strictJsonSchema(z.toJSONSchema(def.input, { target: "draft-2020-12", unrepresentable: "any" }) as Record<string, unknown>);
  return {
    name: def.name,
    description: def.description,
    kind: def.kind,
    permission: def.permission,
    jsonSchema,
    validate: (args) => {
      const parsed = def.input.safeParse(args);
      return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
    },
    run: async (args, ctx) => {
      const parsed = def.input.safeParse(args);
      if (!parsed.success) return toErrResult(new AppError("VALIDATION_ERROR", "Invalid tool arguments"));
      if (!can(ctx.role as OrgRole, def.permission)) return toErrResult(new AppError("FORBIDDEN", `Missing permission ${def.permission}`));
      try {
        const data = await def.handler(parsed.data, ctx);
        return ok(data);
      } catch (e) {
        return toErrResult(e);
      }
    },
  };
}

export class ToolRegistry {
  private readonly tools = new Map<string, RegisteredTool>();
  register(tool: RegisteredTool): this {
    this.tools.set(tool.name, tool);
    return this;
  }
  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }
  list(): RegisteredTool[] {
    return Array.from(this.tools.values());
  }
  /** OpenAI function tool definitions for a subset of names. */
  openaiTools(names: string[]): Array<{ type: "function"; name: string; description: string; parameters: Record<string, unknown>; strict: true }> {
    return names
      .map((n) => this.tools.get(n))
      .filter((t): t is RegisteredTool => Boolean(t))
      .map((t) => ({ type: "function" as const, name: t.name, description: t.description, parameters: t.jsonSchema, strict: true as const }));
  }
}
