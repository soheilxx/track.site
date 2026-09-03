/**
 * SEO gate for the marketing site. Runs against a live server (default http://localhost:3000, override with
 * SEO_BASE_URL) and checks every public route in every active locale: HTTP 200, `<html lang>` equal to the
 * locale, exactly one <title>, a meta description within limits, a self-referencing canonical, reciprocal
 * hreflang alternates for every active locale plus x-default, exactly one <h1>, no `noindex`, and JSON-LD where a
 * page type requires it. Tracking Knowledge articles additionally need BlogPosting + BreadcrumbList JSON-LD, an
 * absolute `og:image` with `og:image:alt` and `twitter:card=summary_large_image`. Also checks the unprefixed → /en
 * redirects and the Blog → Tracking Knowledge redirects (direct, no chain), robots.txt, the sitemap index with
 * its per-locale pages/knowledge sitemaps (every published article listed) and the RSS feed per locale.
 * Exit code 1 on any failure so CI can gate on it.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ACTIVE_LOCALES, DEFAULT_LOCALE } from "../src/i18n/routing";

const base = (process.env.SEO_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const LOCALES = ACTIVE_LOCALES;
/** Every public URL carries its locale prefix, English included. */
const prefix = (locale: string) => `/${locale}`;
const KNOWLEDGE = "/tracking-knowledge";
const STATIC = ["", "/features", "/how-it-works", "/integrations", "/pricing", "/security", "/privacy", "/data-processing", "/subprocessors", "/terms", "/imprint", "/status", "/docs", "/contact", "/demo", "/support", KNOWLEDGE];
const JSON_LD_REQUIRED = new Set(["", "/pricing", KNOWLEDGE]);
const INTEGRATIONS = ["meta", "google-analytics", "google-ads", "tiktok", "linkedin", "reddit", "shopify", "woocommerce", "shopware"];
const HREFLANGS = [...LOCALES, "x-default"];

interface KnowledgeFile {
  /** File name = old shared blog slug. */
  file: string;
  /** Localized slug from front matter (falls back to the file name). */
  slug: string;
  published: boolean;
}

/** Published knowledge articles of a locale from the content directory (front matter read with a light regex). */
const knowledgeArticles = (locale: string): KnowledgeFile[] => {
  try {
    const dir = join(process.cwd(), "content", "knowledge", locale);
    return readdirSync(dir)
      .filter((f) => f.endsWith(".mdx"))
      .map((f) => {
        const raw = readFileSync(join(dir, f), "utf8");
        const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw)?.[1] ?? "";
        const file = f.replace(/\.mdx$/, "");
        const slug = /^slug:\s*"?([a-z0-9-]+)"?/m.exec(fm)?.[1] ?? file;
        const status = /^status:\s*"?([a-z]+)"?/m.exec(fm)?.[1] ?? "draft";
        return { file, slug, published: status === "published" };
      });
  } catch {
    return [];
  }
};
const knowledgeSlugs = (locale: string) => knowledgeArticles(locale).filter((a) => a.published).map((a) => a.slug);

interface Finding {
  url: string;
  problem: string;
}
const findings: Finding[] = [];
const fail = (url: string, problem: string) => findings.push({ url, problem });

const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;
const attr = (html: string, re: RegExp) => html.match(re)?.[1] ?? null;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const metaContent = (html: string, key: "name" | "property", value: string) => attr(html, new RegExp(`<meta\\s+${key}="${escapeRe(value)}"\\s+content="([^"]*)"`, "i")) ?? attr(html, new RegExp(`<meta\\s+content="([^"]*)"\\s+${key}="${escapeRe(value)}"`, "i"));

async function checkPage(locale: string, neutralPath: string, opts: { jsonLd: boolean; article: boolean }) {
  const path = `${prefix(locale)}${neutralPath}`;
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
  const lang = attr(html, /<html[^>]*\slang="([^"]+)"/i);
  if (lang !== locale) fail(url, `<html lang> is ${lang ?? "missing"}, expected ${locale}`);
  const titles = count(html, /<title[^>]*>[^<]+<\/title>/gi);
  if (titles !== 1) fail(url, `expected one <title>, found ${titles}`);
  const title = attr(html, /<title[^>]*>([^<]+)<\/title>/i) ?? "";
  if (title.length < 10 || title.length > 70) fail(url, `title length ${title.length} (10–70)`);
  const description = metaContent(html, "name", "description");
  if (!description) fail(url, "missing meta description");
  else if (description.length < 50 || description.length > 170) fail(url, `description length ${description.length} (50–170)`);
  const canonical = attr(html, /<link\s+rel="canonical"\s+href="([^"]+)"/i) ?? attr(html, /<link\s+href="([^"]+)"\s+rel="canonical"/i);
  if (!canonical) fail(url, "missing canonical");
  else if (!new RegExp(`${escapeRe(path)}/?$`).test(canonical)) fail(url, `canonical ${canonical} is not self-referencing`);
  for (const l of HREFLANGS) {
    const href = attr(html, new RegExp(`<link[^>]*hreflang="${l}"[^>]*href="([^"]+)"`, "i")) ?? attr(html, new RegExp(`<link[^>]*href="([^"]+)"[^>]*hreflang="${l}"`, "i"));
    if (!href) fail(url, `missing hreflang ${l}`);
    else if (!opts.article) {
      // localized article slugs may differ per locale; static pages share the neutral path
      const expected = `${prefix(l === "x-default" ? DEFAULT_LOCALE : l)}${neutralPath}`;
      if (!new RegExp(`${escapeRe(expected)}/?$`).test(href)) fail(url, `hreflang ${l} points to ${href}, expected …${expected}`);
    } else if (!new RegExp(`/${l === "x-default" ? DEFAULT_LOCALE : l}${escapeRe(KNOWLEDGE)}/[a-z0-9-]+/?$`).test(href)) fail(url, `hreflang ${l} points to ${href}, expected a ${KNOWLEDGE} article`);
  }
  const h1 = count(html, /<h1[\s>]/gi);
  if (h1 !== 1) fail(url, `expected one <h1>, found ${h1}`);
  if (/<meta\s+name="robots"\s+content="[^"]*noindex/i.test(html)) fail(url, "noindex on a public page");
  if (opts.jsonLd && !/<script[^>]+type="application\/ld\+json"/i.test(html)) fail(url, "missing JSON-LD");
  if (neutralPath.startsWith(KNOWLEDGE) && !/"@type":\s*"BreadcrumbList"/.test(html)) fail(url, "missing BreadcrumbList JSON-LD");
  if (/\bBlog\b/.test(html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<[^>]+>/g, " "))) fail(url, 'visible "Blog" label (must be "Tracking Knowledge")');
  if (opts.article) {
    if (!/"@type":\s*"BlogPosting"/.test(html)) fail(url, "missing BlogPosting JSON-LD");
    if (!/<time[\s>]/i.test(html)) fail(url, "missing <time> for the publication date");
  }
  if (neutralPath.startsWith(KNOWLEDGE)) {
    const ogImage = metaContent(html, "property", "og:image");
    if (!ogImage || !/^https?:\/\//.test(ogImage)) fail(url, `og:image missing or not absolute (${ogImage ?? "none"})`);
    else if (!ogImage.includes("/opengraph-image")) fail(url, `og:image ${ogImage} is not the generated social card`);
    if (!metaContent(html, "property", "og:image:alt")) fail(url, "missing og:image:alt");
    if (metaContent(html, "name", "twitter:card") !== "summary_large_image") fail(url, "twitter:card is not summary_large_image");
  }
}

async function checkRedirects() {
  const firstSlug = knowledgeArticles(DEFAULT_LOCALE)[0];
  const otherLocale = LOCALES.find((l) => l !== DEFAULT_LOCALE);
  const cases: Array<[string, string]> = [
    ["/", `/${DEFAULT_LOCALE}`],
    ["/pricing?plan=growth", `/${DEFAULT_LOCALE}/pricing?plan=growth`],
    // Blog → Tracking Knowledge: direct targets, no chain through /en/blog, query preserved
    ["/blog", `/${DEFAULT_LOCALE}${KNOWLEDGE}`],
    ["/blog/feed.xml", `/${DEFAULT_LOCALE}${KNOWLEDGE}/feed.xml`],
    [`/${DEFAULT_LOCALE}/blog?category=guides`, `/${DEFAULT_LOCALE}${KNOWLEDGE}?category=guides`],
    ...(firstSlug ? ([[`/blog/${firstSlug.file}?utm_source=x`, `/${DEFAULT_LOCALE}${KNOWLEDGE}/${firstSlug.slug}?utm_source=x`], [`/${DEFAULT_LOCALE}/blog/${firstSlug.file}`, `/${DEFAULT_LOCALE}${KNOWLEDGE}/${firstSlug.slug}`]] as Array<[string, string]>) : []),
    ...(otherLocale ? ([[`/${otherLocale}/blog`, `/${otherLocale}${KNOWLEDGE}`], [`/${otherLocale}/blog/feed.xml`, `/${otherLocale}${KNOWLEDGE}/feed.xml`]] as Array<[string, string]>) : []),
  ];
  if (otherLocale) {
    const first = knowledgeArticles(otherLocale)[0];
    if (first) cases.push([`/${otherLocale}/blog/${first.file}`, `/${otherLocale}${KNOWLEDGE}/${first.slug}`]);
  }
  for (const [from, to] of cases) {
    const res = await fetch(`${base}${from}`, { redirect: "manual" }).catch(() => null);
    if (!res) {
      fail(`${base}${from}`, "fetch failed");
      continue;
    }
    if (res.status !== 308 && res.status !== 301) fail(`${base}${from}`, `expected a permanent redirect, got ${res.status}`);
    const location = res.headers.get("location") ?? "";
    const got = location.startsWith("http") ? new URL(location).pathname + new URL(location).search : location;
    if (got !== to) fail(`${base}${from}`, `redirects to ${location || "(none)"}, expected ${to}`);
  }
}

async function fetchXml(path: string): Promise<string | null> {
  const res = await fetch(`${base}${path}`).catch(() => null);
  if (!res || res.status !== 200) {
    fail(`${base}${path}`, "missing");
    return null;
  }
  return res.text();
}

const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);

async function checkRobotsAndSitemaps() {
  const robots = await fetch(`${base}/robots.txt`).catch(() => null);
  if (!robots || robots.status !== 200) fail(`${base}/robots.txt`, "missing");
  else {
    const text = await robots.text();
    if (!/sitemap:\s*https?:\/\/[^\s]+\/sitemap\.xml/i.test(text)) fail(`${base}/robots.txt`, "no Sitemap: line pointing to the sitemap index");
    if (!/disallow:\s*\/app/i.test(text)) fail(`${base}/robots.txt`, "dashboard not disallowed");
    if (!/disallow:\s*\/api/i.test(text)) fail(`${base}/robots.txt`, "API not disallowed");
  }
  const index = await fetchXml("/sitemap.xml");
  if (!index) return;
  if (!/<sitemapindex[\s>]/.test(index)) fail(`${base}/sitemap.xml`, "not a sitemap index");
  const listed = locs(index);
  for (const locale of LOCALES) {
    for (const section of ["pages", "knowledge"] as const) {
      const name = `${section}-${locale}.xml`;
      const entry = listed.find((l) => l.endsWith(`/sitemaps/${name}`));
      if (!entry) {
        fail(`${base}/sitemap.xml`, `missing sitemap ${name}`);
        continue;
      }
      const xml = await fetchXml(`/sitemaps/${name}`);
      if (!xml) continue;
      const urls = locs(xml);
      const expected = section === "pages" ? STATIC.map((p) => `${prefix(locale)}${p}`) : knowledgeSlugs(locale).map((slug) => `${prefix(locale)}${KNOWLEDGE}/${slug}`);
      for (const path of expected) if (!urls.some((u) => new RegExp(`${escapeRe(path)}/?$`).test(u))) fail(`${base}/sitemaps/${name}`, `missing ${path}`);
      if (urls.some((u) => u.includes("/blog/"))) fail(`${base}/sitemaps/${name}`, "still lists /blog URLs");
      for (const l of HREFLANGS) if (!new RegExp(`hreflang="${l}"`).test(xml)) fail(`${base}/sitemaps/${name}`, `no xhtml alternates for ${l}`);
    }
    const feedPath = `${prefix(locale)}${KNOWLEDGE}/feed.xml`;
    const feed = await fetch(`${base}${feedPath}`).catch(() => null);
    if (!feed || feed.status !== 200) fail(`${base}${feedPath}`, "missing RSS feed");
    else if ((await feed.text()).includes("/blog/")) fail(`${base}${feedPath}`, "feed still links to /blog URLs");
  }
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
let pages = 0;
for (const locale of LOCALES) {
  for (const p of STATIC) jobs.push(() => checkPage(locale, p, { jsonLd: JSON_LD_REQUIRED.has(p), article: false }));
  for (const slug of INTEGRATIONS) jobs.push(() => checkPage(locale, `/integrations/${slug}`, { jsonLd: false, article: false }));
  for (const slug of knowledgeSlugs(locale)) jobs.push(() => checkPage(locale, `${KNOWLEDGE}/${slug}`, { jsonLd: true, article: true }));
  pages += STATIC.length + INTEGRATIONS.length + knowledgeSlugs(locale).length;
}
jobs.push(() => checkRedirects());
jobs.push(() => checkRobotsAndSitemaps());
await runAll(jobs);

if (findings.length) {
  console.error(`SEO check: ${findings.length} problem(s) on ${pages} pages (${Date.now() - started} ms)`);
  for (const f of findings) console.error(`  ${f.url} — ${f.problem}`);
  process.exit(1);
}
process.stdout.write(`SEO check passed: ${pages} pages in ${LOCALES.join("/")}, redirects, robots, sitemap index and feeds OK (${Date.now() - started} ms)\n`);
