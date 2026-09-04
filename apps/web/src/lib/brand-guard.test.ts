import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Brand guard (supplement §2): the visible product name is exactly "Track". `track.site` may only
 * appear where the domain or a technical address is meant. This test scans the user-facing sources
 * and fails on any occurrence that is not covered by the allow-list below, so a new "track.site"
 * product mention (or a `TRACK` / `Track.site` wordmark) cannot slip back in unnoticed.
 *
 * Scanned: `messages/**`, `src/components/**`, `src/app/**`, `src/lib/marketing-copy/**`, `src/lib/marketing-copy.ts`,
 * `src/lib/knowledge.ts` (test files are skipped; they assert URLs and hosts on purpose).
 *
 * Allow-list — an occurrence is technical (and therefore allowed) when it is
 *  1. part of a URL with a scheme: `https://track.site/...`, `https://www.track.site/de`
 *  2. a host name: `ingest.` / `www.` / `cdn.` / `api.` / `app.` / `collector.` + `track.site`
 *  3. an e-mail address: `no-reply@track.site`, `privacy@track.site`
 *  4. a path or snippet continuation: `track.site/docs/...` (URL without scheme, API examples)
 *  5. a legal domain note naming the website operator: "operator of track.site", "Betreiber von
 *     track.site" (imprint / privacy: the domain is the legal subject, not the product name)
 *  6. a technical identifier: `track.site-verify`, `track.site-webhook`, `[track.site]` log prefixes
 * Everything else — "Log in to your track.site workspace", "© 2026 track.site", `TRACK.site` — is a
 * product mention and must say "Track".
 */
const ALLOWED = [
  /https?:\/\/[^\s"'`<>)]*track\.site/gi, // 1. URL with scheme
  /\b(?:ingest|www|cdn|api|app|collector)\.track\.site\b/gi, // 2. host names
  /[\w.+-]+@track\.site\b/gi, // 3. e-mail addresses
  /\btrack\.site\/[\w./?#=&-]*/gi, // 4. path / snippet continuation
  /\b(?:operator of|Betreiber von|Betreiberin von)\s+track\.site\b/gi, // 5. legal domain notes
  /\btrack\.site-(?:verify|webhook)\b|\[track\.site\]/gi, // 6. technical identifiers
];

/** Wordmark spellings that are never allowed as visible text. */
const FORBIDDEN_WORDMARKS = [/\bTRACK\.site\b/, /\bTrack\.site\b/, /\bTRACK\b(?!_)/];

const WEB_ROOT = process.cwd();
const SCAN_DIRS = ["messages", path.join("src", "components"), path.join("src", "app"), path.join("src", "lib", "marketing-copy")];
const SCAN_FILES = [path.join("src", "lib", "marketing-copy.ts"), path.join("src", "lib", "knowledge.ts")];
const EXTENSIONS = new Set([".json", ".ts", ".tsx", ".mdx", ".md", ".css", ".svg", ".txt"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXTENSIONS.has(path.extname(entry)) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

function scannedFiles(): string[] {
  const files = SCAN_DIRS.flatMap((d) => walk(path.join(WEB_ROOT, d)));
  for (const f of SCAN_FILES) files.push(path.join(WEB_ROOT, f));
  return files;
}

/** Lines of `text` that still mention `track.site` after every allowed pattern has been removed. */
export function brandViolations(text: string): Array<{ line: number; text: string }> {
  const violations: Array<{ line: number; text: string }> = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    let line = raw;
    for (const re of ALLOWED) line = line.replace(re, " ");
    if (/track\.site/i.test(line) || FORBIDDEN_WORDMARKS.some((re) => re.test(raw))) violations.push({ line: i + 1, text: raw.trim().slice(0, 160) });
  });
  return violations;
}

describe("brand guard: visible name is 'Track', 'track.site' only as domain or technical address", () => {
  it("scans a meaningful set of files", () => {
    const files = scannedFiles();
    expect(files.length).toBeGreaterThan(50);
    expect(files.some((f) => f.endsWith(path.join("messages", "en", "common.json")))).toBe(true);
    expect(files.some((f) => f.endsWith(path.join("components", "marketing", "header.tsx")))).toBe(true);
  });

  it("treats URLs, host names, e-mail addresses, snippets and legal domain notes as technical", () => {
    expect(brandViolations('<script async src="https://cdn.track.site/v1/tracker.js"></script>')).toEqual([]);
    expect(brandViolations("curl -X POST https://api.track.site/v1/s")).toEqual([]);
    expect(brandViolations("Dashboard root layout (app.track.site)")).toEqual([]);
    expect(brandViolations("Write to privacy@track.site or no-reply@track.site")).toEqual([]);
    expect(brandViolations("docs at track.site/docs/connectors/webhook")).toEqual([]);
    expect(brandViolations("Legal information about the operator of track.site pursuant to § 5 DDG")).toEqual([]);
    expect(brandViolations("Angaben gemäß § 5 DDG zum Betreiber von track.site.")).toEqual([]);
  });

  it("flags product mentions and forbidden wordmarks", () => {
    expect(brandViolations("Log in to your track.site workspace.")).toHaveLength(1);
    expect(brandViolations("© 2026 track.site. All rights reserved.")).toHaveLength(1);
    expect(brandViolations("Welcome to TRACK.site")).toHaveLength(1);
    expect(brandViolations("Powered by Track.site")).toHaveLength(1);
    expect(brandViolations("TRACK — tag manager")).toHaveLength(1);
    expect(brandViolations("Replace TRACKING_ID with your id; TRACK_SITE_URL stays")).toEqual([]);
    expect(brandViolations("Welcome to Track.")).toEqual([]);
  });

  it("finds no visible 'track.site' outside the allow-list in messages, components, app routes, marketing copy and knowledge", () => {
    const report: string[] = [];
    for (const file of scannedFiles()) {
      for (const v of brandViolations(readFileSync(file, "utf8"))) report.push(`${path.relative(WEB_ROOT, file)}:${v.line}: ${v.text}`);
    }
    expect(report, `visible "track.site" / forbidden wordmark found:\n${report.join("\n")}`).toEqual([]);
  });
});
