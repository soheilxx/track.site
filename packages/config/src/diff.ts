import type { ConfigBundle } from "./bundle.ts";

export interface DiffEntry {
  op: "add" | "remove" | "change";
  path: string;
  before: unknown;
  after: unknown;
  /** human readable, shown in the publish confirmation */
  summary: string;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function walk(before: unknown, after: unknown, path: string, out: DiffEntry[]): void {
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  if (isObject(before) && isObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const k of keys) walk(before[k], after[k], path ? `${path}.${k}` : k, out);
    return;
  }
  if (Array.isArray(before) && Array.isArray(after) && before.every(isObject) && after.every(isObject)) {
    const keyOf = (o: Record<string, unknown>) => String(o.id ?? o.name ?? o.event ?? JSON.stringify(o));
    const bm = new Map(before.map((o) => [keyOf(o as Record<string, unknown>), o]));
    const am = new Map(after.map((o) => [keyOf(o as Record<string, unknown>), o]));
    for (const [k, v] of bm) {
      if (!am.has(k)) out.push({ op: "remove", path: `${path}[${k}]`, before: v, after: undefined, summary: describe("remove", path, k, v, undefined) });
    }
    for (const [k, v] of am) {
      if (!bm.has(k)) out.push({ op: "add", path: `${path}[${k}]`, before: undefined, after: v, summary: describe("add", path, k, undefined, v) });
      else walk(bm.get(k), v, `${path}[${k}]`, out);
    }
    return;
  }
  const op: DiffEntry["op"] = before === undefined ? "add" : after === undefined ? "remove" : "change";
  out.push({ op, path, before, after, summary: describe(op, path, null, before, after) });
}

function describe(op: DiffEntry["op"], path: string, key: string | null, before: unknown, after: unknown): string {
  const root = path.split(/[.[]/)[0];
  const label = root === "destinations" ? "Destination" : root === "events" ? "Event" : root === "consent" ? "Consent" : root === "settings" ? "Setting" : root;
  const name = key ?? path.replace(/^[a-z_]+\.?/, "");
  if (op === "add") return `${label} ${name} added`;
  if (op === "remove") return `${label} ${name} removed`;
  return `${label} ${name}: ${fmt(before)} → ${fmt(after)}`;
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return "none";
  if (typeof v === "object") return JSON.stringify(v).slice(0, 60);
  return String(v);
}

export function diffBundles(before: ConfigBundle | null, after: ConfigBundle): DiffEntry[] {
  const out: DiffEntry[] = [];
  const strip = (b: ConfigBundle | null) => (b ? { ...b, version: undefined, created_at: undefined } : {});
  walk(strip(before), strip(after), "", out);
  return out;
}

/** Recipients, fields and purposes affected by a bundle, for the publish confirmation. */
export function publishImpact(bundle: ConfigBundle): {
  recipients: Array<{ name: string; type: string; purpose: string; events: string[] }>;
  events: string[];
  purposes: string[];
} {
  const recipients = bundle.destinations
    .filter((d) => d.enabled)
    .map((d) => ({ name: d.name, type: d.type, purpose: d.purpose, events: d.mappings.filter((m) => m.enabled).map((m) => m.event) }));
  return {
    recipients,
    events: bundle.events.filter((e) => e.enabled).map((e) => e.name),
    purposes: Array.from(new Set(recipients.map((r) => r.purpose))),
  };
}
