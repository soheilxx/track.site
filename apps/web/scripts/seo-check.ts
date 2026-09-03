/**
 * SEO gate for the marketing site. Runs against a live server (default http://localhost:3000, override with
 * SEO_BASE_URL) and checks every public route in both locales: HTTP 200, exactly one <title>, a meta description
 * within limits, a canonical URL, hreflang alternates for en/de/x-default, exactly one <h1>, no `noindex`, and
 * JSON-LD where a page type requires it. Also checks robots.txt, the sitemap and that every blog post is listed.
 * Exit code 1 on any failure so CI can gate on it.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";

const base = (process.env.SEO_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const LOCALES = ["en", "de"] as const;
/** next-intl localePrefix "as-needed": English lives at the root, German under /de */
const prefix = (locale: string) => (locale === "en" ? "" : `/${locale}`);
const STATIC = ["", "/features", "/how-it-works", "/integrations", "/pricing", "/security", "/privacy", "/data-processing", "/subprocessors", "/terms", "/imprint", "/status", "/docs", "/contact", "/demo", "/support", "/blog"];
const JSON_LD_REQUIRED = new Set(["", "/pricing", "/blog"]);
const INTEGRATIONS = ["meta", "google-analytics", "google-ads", "tiktok", "linkedin", "reddit", "shopify", "woocommerce", "shopware"];

const blogSlugs = (locale: string) =>
  readdirSync(join(process.cwd(), "content", "blog", locale))
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => f.replace(/\.mdx$/, ""));

interface Finding {
  url: string;
  problem: string;
}
const findings: Finding[] = [];
const fail = (url: string, problem: string) => findings.push({ url, problem });

const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;
const attr = (html: string, re: RegExp) => html.match(re)?.[1] ?? null;

async function checkPage(path: string, opts: { jsonLd: boolean; article: boolean }) {
  const url = `${base}${path}`;
  let res: Response;
  try {
    res = await fetch(url, { redirect: "manual", headers: { "user-agent": "track.site-seo-check" } });
  } catch (e) {
    fail(url, `fetch failed: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }
  if (res.status !== 200) {
    fail(url, `status ${res.status}`);
    return;
  }
  const html = await res.text();
  const titles = count(html, /<title[^>]*>[^<]+<\/title>/gi);
  if (titles !== 1) fail(url, `expected one <title>, found ${titles}`);
  const title = attr(html, /<title[^>]*>([^<]+)<\/title>/i) ?? "";
  if (title.length < 10 || title.length > 70) fail(url, `title length ${title.length} (10–70)`);
  const description = attr(html, /<meta\s+name="description"\s+content="([^"]*)"/i) ?? attr(html, /<meta\s+content="([^"]*)"\s+name="description"/i);
  if (!description) fail(url, "missing meta description");
  else if (description.length < 50 || description.length > 170) fail(url, `description length ${description.length} (50–170)`);
  if (!/<link\s+rel="canonical"\s+href="[^"]+"/i.test(html) && !/<link\s+href="[^"]+"\s+rel="canonical"/i.test(html)) fail(url, "missing canonical");
  for (const lang of ["en", "de", "x-default"]) {
    if (!new RegExp(`hreflang="${lang}"`, "i").test(html)) fail(url, `missing hreflang ${lang}`);
  }
  const h1 = count(html, /<h1[\s>]/gi);
  if (h1 !== 1) fail(url, `expected one <h1>, found ${h1}`);
  if (/<meta\s+name="robots"\s+content="[^"]*noindex/i.test(html)) fail(url, "noindex on a public page");
  if (opts.jsonLd && !/<script[^>]+type="application\/ld\+json"/i.test(html)) fail(url, "missing JSON-LD");
  if (opts.article && !/"@type":\s*"(BlogPosting|Article)"/.test(html)) fail(url, "missing BlogPosting JSON-LD");
  if (opts.article && !/<time[\s>]/i.test(html)) fail(url, "missing <time> for the publication date");
}

async function checkRobotsAndSitemap() {
  const robots = await fetch(`${base}/robots.txt`).catch(() => null);
  if (!robots || robots.status !== 200) fail(`${base}/robots.txt`, "missing");
  else {
    const text = await robots.text();
    if (!/sitemap:\s*https?:\/\//i.test(text)) fail(`${base}/robots.txt`, "no Sitemap: line");
    if (!/disallow:\s*\/app/i.test(text)) fail(`${base}/robots.txt`, "dashboard not disallowed");
  }
  const sm = await fetch(`${base}/sitemap.xml`).catch(() => null);
  if (!sm || sm.status !== 200) {
    fail(`${base}/sitemap.xml`, "missing");
    return;
  }
  const xml = await sm.text();
  for (const locale of LOCALES) {
    for (const p of STATIC) {
      const path = `${prefix(locale)}${p}`;
      const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (!new RegExp(`<loc>https?://[^<]*${escaped}/?</loc>`).test(xml)) fail(`${base}/sitemap.xml`, `missing ${path || "/"}`);
    }
    for (const slug of blogSlugs(locale)) if (!xml.includes(`${prefix(locale)}/blog/${slug}`)) fail(`${base}/sitemap.xml`, `missing ${prefix(locale)}/blog/${slug}`);
  }
  const feed = await fetch(`${base}/blog/feed.xml`).catch(() => null);
  if (!feed || feed.status !== 200) fail(`${base}/blog/feed.xml`, "missing RSS feed");
}

/** Limited concurrency: a dev server compiles routes on demand and must not be flooded; production tolerates more. */
const concurrency = Number(process.env.SEO_CONCURRENCY ?? 4);
async function runAll(tasks: Array<() => Promise<void>>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (next < tasks.length) await tasks[next++]!();
  });
  await Promise.all(workers);
}

const started = Date.now();
const jobs: Array<() => Promise<void>> = [];
for (const locale of LOCALES) {
  for (const p of STATIC) jobs.push(() => checkPage(`${prefix(locale)}${p}` || "/", { jsonLd: JSON_LD_REQUIRED.has(p), article: false }));
  for (const slug of INTEGRATIONS) jobs.push(() => checkPage(`${prefix(locale)}/integrations/${slug}`, { jsonLd: false, article: false }));
  for (const slug of blogSlugs(locale)) jobs.push(() => checkPage(`${prefix(locale)}/blog/${slug}`, { jsonLd: true, article: true }));
}
jobs.push(() => checkRobotsAndSitemap());
await runAll(jobs);

const pages = LOCALES.length * (STATIC.length + INTEGRATIONS.length) + blogSlugs("en").length + blogSlugs("de").length;
if (findings.length) {
  console.error(`SEO check: ${findings.length} problem(s) on ${pages} pages (${Date.now() - started} ms)`);
  for (const f of findings) console.error(`  ${f.url} — ${f.problem}`);
  process.exit(1);
}
process.stdout.write(`SEO check passed: ${pages} pages, robots, sitemap and feed OK (${Date.now() - started} ms)\n`);
