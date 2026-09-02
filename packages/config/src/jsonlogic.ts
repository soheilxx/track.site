import jsonLogic from "json-logic-js";

/**
 * Safe declarative transformations: JSONLogic restricted to an allow-list of operators with
 * depth and node limits. No eval, no function construction, no property access beyond `var`.
 */
export const ALLOWED_OPS = new Set([
  "var",
  "missing",
  "missing_some",
  "if",
  "==",
  "===",
  "!=",
  "!==",
  "!",
  "!!",
  "and",
  "or",
  ">",
  ">=",
  "<",
  "<=",
  "+",
  "-",
  "*",
  "/",
  "%",
  "min",
  "max",
  "cat",
  "substr",
  "in",
  "merge",
  "map",
  "filter",
  "reduce",
  "some",
  "all",
  "none",
  // custom, pure helpers
  "lower",
  "upper",
  "trim",
  "round",
  "to_number",
  "to_string",
  "coalesce",
]);

export const MAX_DEPTH = 8;
export const MAX_NODES = 200;

let customOpsRegistered = false;
function registerCustomOps(): void {
  if (customOpsRegistered) return;
  customOpsRegistered = true;
  jsonLogic.add_operation("lower", (v: unknown) => (typeof v === "string" ? v.toLowerCase() : v));
  jsonLogic.add_operation("upper", (v: unknown) => (typeof v === "string" ? v.toUpperCase() : v));
  jsonLogic.add_operation("trim", (v: unknown) => (typeof v === "string" ? v.trim() : v));
  jsonLogic.add_operation("round", (v: unknown, digits?: unknown) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    const d = typeof digits === "number" ? digits : 0;
    return Math.round(n * 10 ** d) / 10 ** d;
  });
  jsonLogic.add_operation("to_number", (v: unknown) => {
    const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
    return Number.isFinite(n) ? n : null;
  });
  jsonLogic.add_operation("to_string", (v: unknown) => (v === null || v === undefined ? null : String(v)));
  jsonLogic.add_operation("coalesce", (...args: unknown[]) => args.find((a) => a !== null && a !== undefined && a !== "") ?? null);
}

export interface LogicValidation {
  ok: boolean;
  errors: string[];
  nodes: number;
  depth: number;
}

export function validateLogic(rule: unknown): LogicValidation {
  const errors: string[] = [];
  let nodes = 0;
  let maxDepth = 0;
  const walk = (node: unknown, depth: number, path: string): void => {
    nodes++;
    maxDepth = Math.max(maxDepth, depth);
    if (nodes > MAX_NODES) return;
    if (depth > MAX_DEPTH) {
      errors.push(`${path}: nesting deeper than ${MAX_DEPTH}`);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((n, i) => walk(n, depth + 1, `${path}[${i}]`));
      return;
    }
    if (node && typeof node === "object") {
      const keys = Object.keys(node as Record<string, unknown>);
      if (keys.length !== 1) {
        errors.push(`${path}: an operator object must have exactly one key`);
        return;
      }
      const op = keys[0]!;
      if (!ALLOWED_OPS.has(op)) {
        errors.push(`${path}: operator "${op}" is not allowed`);
        return;
      }
      if (op === "var") {
        const arg = (node as Record<string, unknown>)[op];
        const name = Array.isArray(arg) ? arg[0] : arg;
        if (typeof name === "string" && /(^|\.)(__proto__|constructor|prototype)(\.|$)/.test(name)) {
          errors.push(`${path}: forbidden variable path`);
        }
      }
      walk((node as Record<string, unknown>)[op], depth + 1, `${path}.${op}`);
    }
  };
  walk(rule, 0, "$");
  if (nodes > MAX_NODES) errors.push(`rule exceeds ${MAX_NODES} nodes`);
  return { ok: errors.length === 0, errors, nodes, depth: maxDepth };
}

/** Apply a validated rule. Throws on invalid rules so callers never run unchecked logic. */
export function applyLogic(rule: unknown, data: Record<string, unknown>): unknown {
  const v = validateLogic(rule);
  if (!v.ok) throw new Error(`invalid logic: ${v.errors.join("; ")}`);
  registerCustomOps();
  return jsonLogic.apply(rule as never, data);
}

/** Apply an object of rules field by field: `{ value: {var: "commerce.value"}, currency: "EUR" }`. */
export function applyFieldMap(fieldMap: Record<string, unknown>, data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [field, rule] of Object.entries(fieldMap)) {
    const value = rule !== null && typeof rule === "object" ? applyLogic(rule, data) : rule;
    if (value !== undefined) out[field] = value;
  }
  return out;
}
