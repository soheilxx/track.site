import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ACTIVE_LOCALES, ALL_LOCALES, DEFAULT_LOCALE, LOCALE_COOKIE, LOCALE_NAMES, OG_LOCALES, isKnownLocale, isLocale, routing } from "./routing";

/**
 * Enable-stage gate (docs/14-localization.md §3): every programme locale is active, and the files
 * the runtime loads by locale exist for each of them — message catalogs with the English key set,
 * 30 published Tracking Knowledge articles and the curated learning paths. The copy model is covered
 * by pick.test.ts, catalogue labels by @track-site/catalog, structure by knowledge:validate.
 */
const webRoot = path.resolve(import.meta.dirname, "..", "..");
const messagesDir = path.join(webRoot, "messages");
const contentDir = path.join(webRoot, "content", "knowledge");

function flattenKeys(value: unknown, prefix = ""): string[] {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.keys(value as Record<string, unknown>).flatMap((key) => flattenKeys((value as Record<string, unknown>)[key], prefix ? `${prefix}.${key}` : key));
  }
  return [prefix];
}

const readJson = (file: string): unknown => JSON.parse(readFileSync(file, "utf8"));

interface LearningPathFile {
  id: string;
  title: string;
  description: string;
  groupIds: string[];
}

function readPaths(locale: string): LearningPathFile[] | null {
  const file = path.join(contentDir, `paths.${locale}.json`);
  if (!existsSync(file)) return null;
  const parsed = readJson(file) as LearningPathFile[] | { paths: LearningPathFile[] };
  return Array.isArray(parsed) ? parsed : parsed.paths;
}

function frontMatter(file: string): Record<string, string> {
  const raw = readFileSync(file, "utf8");
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw)?.[1] ?? "";
  const data: Record<string, string> = {};
  for (const line of block.split(/\r?\n/)) {
    const m = /^([A-Za-z]+):\s*"?([^"\n]*)"?\s*$/.exec(line);
    if (m) data[m[1]!] = m[2]!;
  }
  return data;
}

describe("six active locales", () => {
  it("activates every programme locale with English as default and a name, OG code and switcher entry each", () => {
    expect([...ALL_LOCALES]).toEqual(["en", "de", "fr", "es", "it", "nl"]);
    expect([...ACTIVE_LOCALES]).toEqual([...ALL_LOCALES]);
    expect([...routing.locales]).toEqual([...ALL_LOCALES]);
    expect(routing.defaultLocale).toBe(DEFAULT_LOCALE);
    expect(DEFAULT_LOCALE).toBe("en");
    expect(routing.localePrefix).toBe("always");
    expect(routing.localeDetection).toBe(false);
    expect(routing.alternateLinks).toBe(false);
    expect(LOCALE_COOKIE).toBe("NEXT_LOCALE");
    for (const locale of ALL_LOCALES) {
      expect(isLocale(locale), locale).toBe(true);
      expect(isKnownLocale(locale), locale).toBe(true);
      expect(LOCALE_NAMES[locale], locale).toMatch(/^[A-ZÀ-Ý][a-zà-ÿ]+$/);
      expect(OG_LOCALES[locale], locale).toMatch(new RegExp(`^${locale}_[A-Z]{2}$`));
    }
    expect(isLocale("xx")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });

  it("ships every message namespace with the English key set for every active locale", () => {
    const namespaces = readdirSync(path.join(messagesDir, "en")).filter((f) => f.endsWith(".json"));
    expect(namespaces.length).toBeGreaterThanOrEqual(5);
    for (const locale of ACTIVE_LOCALES) {
      for (const ns of namespaces) {
        const file = path.join(messagesDir, locale, ns);
        expect(existsSync(file), `messages/${locale}/${ns}`).toBe(true);
        const keys = flattenKeys(readJson(file)).sort();
        expect(keys, `messages/${locale}/${ns} keys`).toEqual(flattenKeys(readJson(path.join(messagesDir, "en", ns))).sort());
      }
    }
  });

  it("publishes all 30 Tracking Knowledge topics in every active locale under the English slug", () => {
    const en = readdirSync(path.join(contentDir, "en")).filter((f) => f.endsWith(".mdx")).sort();
    expect(en).toHaveLength(30);
    for (const locale of ACTIVE_LOCALES) {
      const dir = path.join(contentDir, locale);
      expect(existsSync(dir), `content/knowledge/${locale}`).toBe(true);
      const files = readdirSync(dir).filter((f) => f.endsWith(".mdx")).sort();
      expect(files, `content/knowledge/${locale}`).toEqual(en);
      for (const file of files) {
        const fm = frontMatter(path.join(dir, file));
        const group = file.replace(/\.mdx$/, "");
        expect(fm.status, `${locale}/${file} status`).toBe("published");
        expect(fm.translationGroupId ?? group, `${locale}/${file} translationGroupId`).toBe(group);
        // the release uses the English slug in every language (docs/14 §7) so hreflang and the redirect matrix stay simple
        expect(fm.slug ?? group, `${locale}/${file} slug`).toBe(frontMatter(path.join(contentDir, "en", file)).slug ?? group);
      }
    }
  });

  it("ships the curated learning paths for every active locale with the English ids and article order", () => {
    const en = readPaths("en");
    expect(en).not.toBeNull();
    expect(en!.length).toBeGreaterThanOrEqual(3);
    for (const locale of ACTIVE_LOCALES) {
      const paths = readPaths(locale);
      expect(paths, `content/knowledge/paths.${locale}.json`).not.toBeNull();
      expect(paths!.map((p) => p.id), `paths.${locale}.json ids`).toEqual(en!.map((p) => p.id));
      for (const p of en!) {
        const twin = paths!.find((q) => q.id === p.id)!;
        expect(twin.groupIds, `paths.${locale}.json ${p.id} groupIds`).toEqual(p.groupIds);
        expect(twin.title.trim().length, `paths.${locale}.json ${p.id} title`).toBeGreaterThan(5);
        expect(twin.description.trim().length, `paths.${locale}.json ${p.id} description`).toBeGreaterThan(20);
      }
    }
  });
});
