import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NAMESPACES, registerNamespace } from "./namespaces";
import { ACTIVE_LOCALES } from "./routing";

/**
 * Message namespace parity (dashboard shell, phase 5): every namespace registered in `namespaces.ts`
 * ships one file per active locale with exactly the English key set, every catalog file under
 * `messages/en` is registered (otherwise `loadMessages` would silently skip it), and the top-level
 * keys of the namespaces do not collide (the catalogs are merged with `Object.assign`). Same key
 * flattening rule as `scripts/i18n-parity.mjs` and `routing.test.ts`.
 */
const messagesDir = path.resolve(import.meta.dirname, "..", "..", "messages");

function flattenKeys(value: unknown, prefix = ""): string[] {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.keys(value as Record<string, unknown>).flatMap((key) => flattenKeys((value as Record<string, unknown>)[key], prefix ? `${prefix}.${key}` : key));
  }
  return [prefix];
}

const readJson = (file: string): Record<string, unknown> => JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;

/** Leaves that are plain strings; ICU placeholders (`{name}`) must match between locales. */
function placeholders(value: unknown, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  if (typeof value === "string") {
    const found = Array.from(value.matchAll(/\{([a-zA-Z0-9_]+)\}/g), (m) => m[1]!).sort();
    if (found.length) out.set(prefix, found.join(","));
    return out;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      for (const [k, v] of placeholders(child, prefix ? `${prefix}.${key}` : key)) out.set(k, v);
    }
  }
  return out;
}

describe("message namespaces", () => {
  it("registers the shell namespace once and rejects invalid names", () => {
    expect(NAMESPACES).toContain("shell");
    expect(new Set(NAMESPACES).size).toBe(NAMESPACES.length);
    registerNamespace("shell");
    expect(NAMESPACES.filter((ns) => ns === "shell")).toHaveLength(1);
    expect(() => registerNamespace("Not Valid")).toThrow();
  });

  it("registers every catalog file that exists for English", () => {
    const files = readdirSync(path.join(messagesDir, "en"))
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort();
    expect([...NAMESPACES].sort()).toEqual(files);
  });

  it("ships every namespace for every active locale with identical keys and placeholders", () => {
    for (const ns of NAMESPACES) {
      const enFile = path.join(messagesDir, "en", `${ns}.json`);
      expect(existsSync(enFile), `messages/en/${ns}.json`).toBe(true);
      const en = readJson(enFile);
      const enKeys = flattenKeys(en).sort();
      const enPlaceholders = placeholders(en);
      expect(enKeys.length, `messages/en/${ns}.json is empty`).toBeGreaterThan(0);
      for (const locale of ACTIVE_LOCALES) {
        const file = path.join(messagesDir, locale, `${ns}.json`);
        expect(existsSync(file), `messages/${locale}/${ns}.json`).toBe(true);
        const data = readJson(file);
        expect(flattenKeys(data).sort(), `messages/${locale}/${ns}.json keys`).toEqual(enKeys);
        for (const [key, expected] of enPlaceholders) expect(placeholders(data).get(key) ?? "", `messages/${locale}/${ns}.json ${key} placeholders`).toBe(expected);
      }
    }
  });

  it("gives every namespace a unique top-level key so merged catalogs never overwrite each other", () => {
    const seen = new Map<string, string>();
    for (const ns of NAMESPACES) {
      for (const key of Object.keys(readJson(path.join(messagesDir, "en", `${ns}.json`)))) {
        expect(seen.has(key), `top-level key "${key}" in ${ns}.json is already used by ${seen.get(key)}.json`).toBe(false);
        seen.set(key, ns);
      }
    }
  });
});
