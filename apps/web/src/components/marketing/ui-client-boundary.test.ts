import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Server/client boundary guard for @track-site/ui (packages/ui/README.md "Composing pages"): every
 * primitive that attaches event handlers or uses client-only React hooks must be a client module,
 * otherwise a server component that renders it fails at runtime ("Event handlers cannot be passed to
 * Client Component props"). Server-safe primitives (Card, Table, Status, Breadcrumbs, the diagram
 * primitives …) deliberately carry no directive so they stay usable with function props such as
 * `linkComponent` from server components.
 */
const UI_SRC = path.resolve(process.cwd(), "..", "..", "packages", "ui", "src");

/** JSX event handler attribute (`onClick={…}`, `onValueChange={…}`) or a handler passed as a prop. */
const EVENT_HANDLER = /\son[A-Z][A-Za-z]*=\{/;
/** Hooks that only work in client components (`useId` is allowed in server components). */
const CLIENT_HOOK = /\buse(?:State|Reducer|Effect|LayoutEffect|InsertionEffect|Ref|Context|SyncExternalStore|Transition|DeferredValue|Optimistic|ActionState|ImperativeHandle)\(/;
/** `"use client"` as the first statement (comments allowed before it). */
const CLIENT_DIRECTIVE = /^(?:\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/))*\s*["']use client["'];?/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

describe("@track-site/ui client boundary", () => {
  const files = walk(UI_SRC);

  it("scans the primitives", () => {
    expect(files.length).toBeGreaterThan(10);
    expect(files.some((f) => f.endsWith(path.join("primitives", "button.tsx")))).toBe(true);
    expect(files.some((f) => f.endsWith("diagram.tsx"))).toBe(true);
  });

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const interactive = EVENT_HANDLER.test(source) || CLIENT_HOOK.test(source);
    const name = path.relative(UI_SRC, file).replace(/\\/g, "/");
    it(`${name}: ${interactive ? 'attaches handlers or client hooks and is marked "use client"' : "is server-safe"}`, () => {
      if (interactive) expect(CLIENT_DIRECTIVE.test(source), `${name} attaches event handlers or uses client-only hooks but has no "use client" directive`).toBe(true);
      else expect(CLIENT_DIRECTIVE.test(source), `${name} is marked "use client" without attaching handlers or hooks — keep it server-safe`).toBe(false);
    });
  }
});
