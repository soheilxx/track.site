import { z } from "zod";

/**
 * Versioned structured-output schema for every assistant turn. With strict structured outputs all
 * properties are required; optional business values are nullable. The server re-validates the
 * final answer with this Zod schema before it reaches the UI.
 */
export const UI_SCHEMA_VERSION = "2026-09-02";

export const setupStepSchema = z.enum(["site", "business_type", "platform", "installation", "consent", "destinations", "event_plan", "test", "review", "publish", "health"]);
export type SetupStep = z.infer<typeof setupStepSchema>;

export const intentSchema = z.enum(["onboarding", "configuration", "diagnosis", "explanation", "confirmation", "status", "off_topic", "refusal"]);

export const cardSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("info"), title: z.string(), body: z.string(), tone: z.enum(["neutral", "ok", "warn", "bad"]) }),
  z.object({ type: z.literal("checklist"), title: z.string(), items: z.array(z.object({ label: z.string(), done: z.boolean(), detail: z.string().nullable() })) }),
  z.object({ type: z.literal("snippet"), title: z.string(), language: z.enum(["html", "text"]), code: z.string(), note: z.string().nullable() }),
  z.object({ type: z.literal("choice"), title: z.string(), field: z.string(), options: z.array(z.object({ value: z.string(), label: z.string(), description: z.string().nullable(), recommended: z.boolean() })), multiple: z.boolean() }),
  z.object({ type: z.literal("event_plan"), title: z.string(), events: z.array(z.object({ name: z.string(), critical: z.boolean(), capture: z.string(), source: z.string().nullable(), enabled: z.boolean() })) }),
  z.object({ type: z.literal("mapping_table"), title: z.string(), destination: z.string(), rows: z.array(z.object({ event: z.string(), vendor_event: z.string(), enabled: z.boolean() })) }),
  z.object({ type: z.literal("test_status"), title: z.string(), items: z.array(z.object({ label: z.string(), status: z.enum(["pending", "ok", "failed", "skipped"]), detail: z.string().nullable() })) }),
  z.object({ type: z.literal("delivery_timeline"), title: z.string(), steps: z.array(z.object({ stage: z.string(), status: z.enum(["done", "current", "pending", "blocked"]), detail: z.string().nullable() })) }),
  z.object({ type: z.literal("diff"), title: z.string(), version_from: z.number().int().nullable(), version_to: z.number().int(), changes: z.array(z.object({ summary: z.string(), op: z.enum(["add", "remove", "change"]) })), recipients: z.array(z.object({ name: z.string(), type: z.string(), purpose: z.string(), events: z.array(z.string()) })) }),
  z.object({ type: z.literal("credential_request"), title: z.string(), integration_id: z.string(), connector_type: z.string(), credential_kind: z.string(), label: z.string(), help: z.string(), oauth_provider: z.string().nullable() }),
  z.object({ type: z.literal("status"), title: z.string(), metrics: z.array(z.object({ label: z.string(), value: z.string(), tone: z.enum(["neutral", "ok", "warn", "bad"]) })) }),
]);
export type UiCard = z.infer<typeof cardSchema>;

export const inputComponentSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }),
  z.object({ type: z.literal("text"), field: z.string(), label: z.string(), placeholder: z.string().nullable(), pattern: z.string().nullable(), help: z.string().nullable() }),
  z.object({ type: z.literal("url"), field: z.string(), label: z.string(), placeholder: z.string().nullable() }),
  z.object({
    type: z.literal("pixel_id"),
    field: z.string(),
    label: z.string(),
    connector_type: z.string(),
    pattern: z.string().nullable().describe("regex copied verbatim from required_public_ids of create_integration_draft / get_destination_status; null when you do not have it (the UI then skips the format check and the server validates)"),
    example: z.string().nullable().describe("example value copied verbatim from required_public_ids; null when you do not have it"),
  }),
  z.object({ type: z.literal("yes_no"), field: z.string(), label: z.string() }),
  z.object({ type: z.literal("confirm"), action: z.string(), label: z.string(), approval_id: z.string() }),
  z.object({ type: z.literal("oauth"), provider: z.string(), integration_id: z.string(), label: z.string() }),
  z.object({ type: z.literal("secure_credential"), integration_id: z.string(), credential_kind: z.string(), label: z.string() }),
]);
export type UiInputComponent = z.infer<typeof inputComponentSchema>;

export const quickActionSchema = z.object({ id: z.string(), label: z.string(), message: z.string(), kind: z.enum(["primary", "secondary"]) });

export const assistantUiResponseSchema = z.object({
  message: z.string(),
  intent: intentSchema,
  stage: setupStepSchema,
  current_step: setupStepSchema,
  progress_percent: z.number().int().min(0).max(100),
  status: z.enum(["ok", "needs_input", "blocked", "error"]),
  cards: z.array(cardSchema).max(6),
  input_component: inputComponentSchema,
  quick_actions: z.array(quickActionSchema).max(4),
  completed_steps: z.array(setupStepSchema),
  missing_fields: z.array(z.string()),
  warnings: z.array(z.string()),
  requires_confirmation: z.boolean(),
  confirmation_summary: z.string().nullable(),
  tool_result_summary: z.string().nullable(),
  next_best_action: z.string().nullable(),
});
export type AssistantUiResponse = z.infer<typeof assistantUiResponseSchema>;

/** Strict JSON Schema for `text.format` (all required, additionalProperties false, nullable via type arrays). */
export function assistantUiJsonSchema(): Record<string, unknown> {
  return strictJsonSchema(z.toJSONSchema(assistantUiResponseSchema, { target: "draft-2020-12", unrepresentable: "any" }) as Record<string, unknown>);
}

/** Validation keywords the strict subset drops; their meaning is moved into the description instead. */
const HINTED_KEYWORDS = ["minLength", "maxLength", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minItems", "maxItems", "uniqueItems", "minProperties", "maxProperties", "pattern", "format"] as const;

/** Keywords that have no strict-mode equivalent at all (open maps); a schema using them must be redesigned. */
const UNREPRESENTABLE_KEYWORDS = ["propertyNames", "patternProperties"] as const;

function unrepresentable(path: string, keyword: string): Error {
  return new Error(`strictJsonSchema: "${keyword}" at ${path || "(root)"} cannot be expressed in OpenAI strict mode; use explicit z.object / z.array shapes instead of z.record, z.map or loose objects`);
}

function hintsOf(obj: Record<string, unknown>): string[] {
  const hints: string[] = [];
  if (typeof obj.minLength === "number" && obj.minLength === obj.maxLength) hints.push(`exactly ${obj.minLength} characters`);
  else {
    if (typeof obj.minLength === "number") hints.push(`at least ${obj.minLength} characters`);
    if (typeof obj.maxLength === "number") hints.push(`at most ${obj.maxLength} characters`);
  }
  if (typeof obj.minimum === "number" && typeof obj.maximum === "number") hints.push(`between ${obj.minimum} and ${obj.maximum}`);
  else {
    if (typeof obj.minimum === "number") hints.push(`minimum ${obj.minimum}`);
    if (typeof obj.maximum === "number") hints.push(`maximum ${obj.maximum}`);
  }
  if (typeof obj.exclusiveMinimum === "number") hints.push(`greater than ${obj.exclusiveMinimum}`);
  if (typeof obj.exclusiveMaximum === "number") hints.push(`less than ${obj.exclusiveMaximum}`);
  if (typeof obj.multipleOf === "number") hints.push(`multiple of ${obj.multipleOf}`);
  if (typeof obj.minItems === "number") hints.push(`at least ${obj.minItems} items`);
  if (typeof obj.maxItems === "number") hints.push(`at most ${obj.maxItems} items`);
  if (obj.uniqueItems === true) hints.push("unique items");
  if (typeof obj.minProperties === "number") hints.push(`at least ${obj.minProperties} properties`);
  if (typeof obj.maxProperties === "number") hints.push(`at most ${obj.maxProperties} properties`);
  if (typeof obj.pattern === "string") hints.push(`matching ${obj.pattern}`);
  if (typeof obj.format === "string") hints.push(`format ${obj.format}`);
  return hints;
}

/**
 * Turns a generated JSON Schema into the OpenAI strict subset: every object lists all properties
 * as required, forbids additional properties, and optional fields become nullable. Validation
 * keywords the subset drops are moved into the description so the model still knows them.
 *
 * Open maps (z.record, z.map, patternProperties) have no strict representation at all, so they
 * throw here — which happens inside defineTool at module load, i.e. in typecheck/test runs, never
 * as a 400 from the provider at runtime.
 */
export function strictJsonSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const visit = (node: unknown, path: string): unknown => {
    if (Array.isArray(node)) return node.map((n, i) => visit(n, `${path}[${i}]`));
    if (!node || typeof node !== "object") return node;
    const obj = { ...(node as Record<string, unknown>) };
    delete obj.$schema;
    delete obj.default;
    for (const keyword of UNREPRESENTABLE_KEYWORDS) if (keyword in obj) throw unrepresentable(path, keyword);
    const hints = hintsOf(obj);
    if (hints.length) obj.description = [typeof obj.description === "string" ? obj.description : "", `(${hints.join(", ")})`].filter(Boolean).join(" ");
    for (const keyword of HINTED_KEYWORDS) delete obj[keyword];
    if (obj.type === "object" && obj.properties && typeof obj.properties === "object") {
      const props = { ...(obj.properties as Record<string, unknown>) };
      const required = new Set((obj.required as string[] | undefined) ?? []);
      for (const key of Object.keys(props)) {
        let p = visit(props[key], `${path}.${key}`) as Record<string, unknown>;
        if (!required.has(key)) {
          p = makeNullable(p);
        }
        props[key] = p;
      }
      obj.properties = props;
      obj.required = Object.keys(props);
      // a closed object is what strict mode demands; Zod strips unknown keys on re-validation anyway
      obj.additionalProperties = false;
    }
    // anything left here is a record-style map (additionalProperties as a schema without a property list)
    if ("additionalProperties" in obj && obj.additionalProperties !== false) throw unrepresentable(path, "additionalProperties");
    for (const key of ["items", "anyOf", "oneOf", "allOf"]) {
      if (key in obj) obj[key] = visit(obj[key], `${path}.${key}`);
    }
    if ("oneOf" in obj) {
      obj.anyOf = obj.oneOf;
      delete obj.oneOf;
    }
    if (obj.$defs && typeof obj.$defs === "object") {
      const defs = { ...(obj.$defs as Record<string, unknown>) };
      for (const k of Object.keys(defs)) defs[k] = visit(defs[k], `${path}.$defs.${k}`);
      obj.$defs = defs;
    }
    return obj;
  };
  return visit(schema, "") as Record<string, unknown>;
}

/**
 * Adds `null` to a property schema. A bare type array is not enough when the node also carries
 * `enum` or `const`: those keywords are validated on their own, so `null` has to be listed in the
 * enum, and a `const` node is wrapped in an anyOf instead (a const can only hold one value).
 */
function makeNullable(p: Record<string, unknown>): Record<string, unknown> {
  if ("const" in p) return { anyOf: [p, { type: "null" }] };
  const withEnum = (node: Record<string, unknown>): Record<string, unknown> => (Array.isArray(node.enum) && !node.enum.includes(null) ? { ...node, enum: [...node.enum, null] } : node);
  if (Array.isArray(p.type)) return p.type.includes("null") ? withEnum(p) : withEnum({ ...p, type: [...p.type, "null"] });
  if (typeof p.type === "string") return p.type === "null" ? p : withEnum({ ...p, type: [p.type, "null"] });
  if (Array.isArray(p.anyOf)) return p.anyOf.some((v) => (v as Record<string, unknown>).type === "null") ? p : { ...p, anyOf: [...p.anyOf, { type: "null" }] };
  return { anyOf: [p, { type: "null" }] };
}
