#!/usr/bin/env node
/**
 * QA crawl for the evidence pack (docs/qa): SEO head checks, JSON-LD validation, internal link and
 * image integrity, and the Blog → Tracking Knowledge redirect matrix, against a RUNNING production
 * build (`pnpm --filter @track-site/web start -p <port>`).
 *
 * URL sources
 *   - `/sitemap.xml` → every per-locale sitemap → every `<loc>` (public pages, anonymous requests).
 *     Sitemap URLs carry the configured marketing origin (`HOST_MARKETING` in `.env`); when that
 *     differs from `--base` the origin is rewritten for fetching and the declared origin is kept in
 *     the report (canonical / hreflang / JSON-LD URLs are compared against the declared origin).
 *   - the dashboard page routes under `src/app/app` (`DASHBOARD_ROUTES`) plus `/app/...` links
 *     discovered on those pages (up to `--discover-max`). Dashboard requests carry the cookies of the
 *     Playwright storage state written by `e2e/auth.setup.ts` (`--auth`).
 *
 * Per page: HTTP status, `<html lang>`, exactly one `<h1>`, `<title>` (length above `--title-max`
 * reported), meta description, self-referencing canonical, hreflang set (six locales + x-default on
 * public pages), robots meta, every `application/ld+json` block parsed and validated per `@type`
 * (BlogPosting/TechArticle, BreadcrumbList, FAQPage, Organization, WebSite, Blog, WebPage,
 * SoftwareApplication/Offer), every internal `<a href>`, image (`img`, `srcset`, `og:image`,
 * icons, feeds) resolved with HEAD (GET fallback), redirects followed manually so that redirect
 * chains are visible (0 hops = ok, 1 hop = reported as info, ≥ 2 hops = finding, 4xx/5xx = broken).
 *
 * Redirect matrix: all index/feed rows plus a deterministic sample of `--sample` article rows from
 * `docs/redirects-blog-to-tracking-knowledge.md`; each old URL must answer exactly one 308 whose
 * Location is the documented target, and the target must answer 200 without a further redirect.
 * Locales that are active but absent from the matrix get derived rows (`extra`).
 *
 * Output: `<out>/crawl.json` (per URL, machine-readable) and `<out>/summary.md`.
 *
 * Usage (from the repo root, server already running):
 *   node apps/web/scripts/qa/crawl.mjs --base http://localhost:3003 --out docs/qa/2026-09-05/seo
 * Options: --auth <storageState.json> (default apps/web/e2e/.auth/owner.json)
 *          --matrix <redirect matrix .md> (default docs/redirects-blog-to-tracking-knowledge.md)
 *          --sample 40 --concurrency 8 --title-max 60 --timeout 60000 --discover-max 80
 *          --limit <n> (smoke test: only the first n public URLs) --no-dashboard
 * Needs `jsdom` (devDependency of apps/web; resolved relative to this file, so any cwd works).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

/** Progress line on stdout (the repo's `no-console` rule allows only warn/error; reports go to files). */
const stdout = (line) => process.stdout.write(`${line}\n`);

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..", "..");
const abs = (p) => (path.isAbsolute(p) ? p : path.join(repoRoot, p));

function parseArgs(argv) {
  const o = {
    base: process.env.CRAWL_BASE_URL ?? "http://localhost:3003",
    out: "docs/qa/2026-09-05/seo",
    auth: "apps/web/e2e/.auth/owner.json",
    matrix: "docs/redirects-blog-to-tracking-knowledge.md",
    sample: 40,
    concurrency: 8,
    titleMax: 60,
    timeout: 60_000,
    limit: 0,
    discoverMax: 80,
    dashboard: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--base") o.base = next();
    else if (a === "--out") o.out = next();
    else if (a === "--auth") o.auth = next();
    else if (a === "--matrix") o.matrix = next();
    else if (a === "--sample") o.sample = Number(next());
    else if (a === "--concurrency") o.concurrency = Number(next());
    else if (a === "--title-max") o.titleMax = Number(next());
    else if (a === "--timeout") o.timeout = Number(next());
    else if (a === "--limit") o.limit = Number(next());
    else if (a === "--discover-max") o.discoverMax = Number(next());
    else if (a === "--no-dashboard") o.dashboard = false;
    else throw new Error(`unknown argument ${a}`);
  }
  o.base = o.base.replace(/\/$/, "");
  return o;
}
const opts = parseArgs(process.argv.slice(2));
const BASE = new URL(opts.base);
const UA = "track.site-qa-crawl/1.0 (docs/qa evidence; scripts/qa/crawl.mjs)";
const HREFLANG_EXPECTED = 7; // six programme locales + x-default (supplement §7)
const LOCALE_RE = /^[a-z]{2}$/;

/** Dashboard page routes (every `page.tsx` under `src/app/app` without a dynamic segment). Dynamic ones are discovered from links. */
const DASHBOARD_ROUTES = [
  "/app",
  "/app/ai-setup",
  "/app/billing",
  "/app/billing/usage",
  "/app/consent",
  "/app/consent/simulator",
  "/app/data-quality",
  "/app/data-quality/revenue-leaks",
  "/app/destinations",
  "/app/events",
  "/app/events/explorer",
  "/app/events/matrix",
  "/app/events/test-lab",
  "/app/insights",
  "/app/insights/attribution",
  "/app/insights/audiences",
  "/app/onboarding",
  "/app/onboarding/organization",
  "/app/releases",
  "/app/settings",
  "/app/settings/alerts",
  "/app/sites",
  "/app/team",
  "/app/team/audit",
];
/** Legacy dashboard paths that `next.config.ts` answers with a 308 (docs/11 §4). */
const DASHBOARD_LEGACY = [
  ["/app/setup", "/app/ai-setup"],
  ["/app/debugger", "/app/events/explorer"],
  ["/app/audiences", "/app/insights/audiences"],
];

/* ------------------------------------------------------------------ helpers */

function loadCookieHeader(file) {
  if (!existsSync(file)) return { header: null, note: `storage state ${file} not found` };
  const state = JSON.parse(readFileSync(file, "utf8"));
  const now = Date.now() / 1000;
  const all = state.cookies ?? [];
  const live = all.filter((c) => !c.expires || c.expires < 0 || c.expires > now);
  const expired = all.filter((c) => !live.includes(c)).map((c) => c.name);
  return { header: live.length ? live.map((c) => `${c.name}=${c.value}`).join("; ") : null, names: live.map((c) => c.name), expired };
}
const auth = loadCookieHeader(abs(opts.auth));
const cookieHeader = auth.header;

const isAppPath = (href) => {
  try {
    const p = new URL(href).pathname;
    return p === "/app" || p.startsWith("/app/") || p === "/api" || p.startsWith("/api/");
  } catch {
    return false;
  }
};

async function httpRequest(url, { method = "GET", auth: withAuth = false, accept } = {}) {
  const headers = { "user-agent": UA, accept: accept ?? "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8" };
  if ((withAuth || isAppPath(url)) && cookieHeader) headers.cookie = cookieHeader;
  const started = Date.now();
  try {
    const res = await fetch(url, { method, headers, redirect: "manual", signal: AbortSignal.timeout(opts.timeout) });
    return { res, ms: Date.now() - started, error: null };
  } catch (e) {
    return { res: null, ms: Date.now() - started, error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) };
  }
}

/** Origins that count as "this site": the crawl base plus the origin declared in the sitemap. */
const internalOrigins = new Set([BASE.origin]);
let declaredOrigin = BASE.origin;
function toFetchable(u) {
  if (u.origin === BASE.origin) return new URL(u.href);
  if (internalOrigins.has(u.origin)) {
    const c = new URL(u.href);
    c.protocol = BASE.protocol;
    c.host = BASE.host;
    return c;
  }
  return null;
}
const stripSlash = (p) => (p.length > 1 ? p.replace(/\/+$/, "") : p);
const pathAndSearch = (href) => {
  const u = new URL(href);
  return stripSlash(u.pathname) + u.search;
};
const localeOf = (pathname) => {
  const seg = pathname.split("/").filter(Boolean)[0];
  return seg && LOCALE_RE.test(seg) ? seg : null;
};
const codePoints = (s) => [...s].length;

async function pool(items, worker, concurrency) {
  let next = 0;
  const results = new Array(items.length);
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

/* ------------------------------------------------------------------ sitemaps, robots, feeds */

const resources = { robots: null, sitemapIndex: null, sitemaps: [], feeds: [] };
const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());

async function collectSitemapUrls() {
  const indexUrl = `${BASE.origin}/sitemap.xml`;
  const { res, error } = await httpRequest(indexUrl, { accept: "application/xml" });
  if (error || !res || res.status !== 200) {
    resources.sitemapIndex = { url: indexUrl, status: res?.status ?? null, error };
    return [];
  }
  const xml = await res.text();
  const entries = locs(xml);
  if (entries[0]) {
    declaredOrigin = new URL(entries[0]).origin;
    internalOrigins.add(declaredOrigin);
  }
  resources.sitemapIndex = { url: indexUrl, status: res.status, isIndex: /<sitemapindex[\s>]/.test(xml), sitemaps: entries };
  const pages = [];
  for (const declared of entries) {
    const fetchable = toFetchable(new URL(declared)) ?? new URL(declared);
    const r = await httpRequest(fetchable.href, { accept: "application/xml" });
    const entry = { declared, fetched: fetchable.href, status: r.res?.status ?? null, error: r.error, urls: 0, alternatesMissing: [], hreflangs: new Set() };
    if (r.res && r.res.status === 200) {
      const body = await r.res.text();
      const blocks = [...body.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]);
      entry.urls = blocks.length;
      for (const block of blocks) {
        const loc = /<loc>([^<]+)<\/loc>/.exec(block)?.[1]?.trim();
        const alts = [...block.matchAll(/hreflang="([^"]+)"/g)].map((m) => m[1]);
        alts.forEach((a) => entry.hreflangs.add(a));
        if (alts.length !== HREFLANG_EXPECTED) entry.alternatesMissing.push({ loc, hreflangs: alts.length });
        if (loc) {
          const locale = localeOf(new URL(loc).pathname);
          pages.push({ declared: loc, sitemap: declared, locale, kind: "public" });
        }
      }
      if (body.includes("/blog/")) entry.blogUrls = true;
    }
    entry.hreflangs = [...entry.hreflangs];
    resources.sitemaps.push(entry);
  }
  // dedupe by declared URL, keep first
  const seen = new Set();
  return pages.filter((p) => (seen.has(p.declared) ? false : (seen.add(p.declared), true)));
}

async function checkRobotsAndFeeds(locales) {
  const robotsUrl = `${BASE.origin}/robots.txt`;
  const r = await httpRequest(robotsUrl, { accept: "text/plain" });
  const text = r.res && r.res.status === 200 ? await r.res.text() : "";
  resources.robots = {
    url: robotsUrl,
    status: r.res?.status ?? null,
    error: r.error,
    sitemapLine: /sitemap:\s*https?:\/\/\S+\/sitemap\.xml/i.exec(text)?.[0] ?? null,
    disallowApp: /disallow:\s*\/app/i.test(text),
    disallowApi: /disallow:\s*\/api/i.test(text),
  };
  for (const locale of locales) {
    const url = `${BASE.origin}/${locale}/tracking-knowledge/feed.xml`;
    const f = await httpRequest(url, { accept: "application/rss+xml, application/xml" });
    const entry = { locale, url, status: f.res?.status ?? null, error: f.error, contentType: f.res?.headers.get("content-type") ?? null, items: 0, blogUrls: false };
    if (f.res && f.res.status === 200) {
      const body = await f.res.text();
      entry.items = (body.match(/<item[\s>]/g) ?? []).length;
      entry.blogUrls = body.includes("/blog/");
    }
    resources.feeds.push(entry);
  }
}

/* ------------------------------------------------------------------ link checks */

/** href (+ auth flag) → result; one request per unique target. */
const linkResults = new Map();
function checkLink(href) {
  const key = href;
  if (!linkResults.has(key)) linkResults.set(key, doCheckLink(href));
  return linkResults.get(key);
}
async function doCheckLink(href) {
  const chain = [];
  let current = href;
  for (let hop = 0; hop < 6; hop++) {
    let method = "HEAD";
    let { res, error } = await httpRequest(current, { method });
    if (!error && res && (res.status === 405 || res.status === 501 || res.status === 404 || res.status >= 500)) {
      // some handlers answer HEAD differently; the GET result is authoritative
      method = "GET";
      ({ res, error } = await httpRequest(current, { method }));
    }
    if (error || !res) return { href, status: null, error: error ?? "no response", chain, cls: "error" };
    await res.arrayBuffer().catch(() => {});
    const status = res.status;
    if (status >= 300 && status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return { href, status, chain, cls: "broken", detail: "redirect without Location" };
      const target = new URL(loc, current);
      chain.push({ url: current, status, location: target.href });
      const f = toFetchable(target);
      if (!f) return { href, status, chain, hops: chain.length, final: { url: target.href, status: null, external: true }, cls: "redirect-external" };
      current = f.href;
      continue;
    }
    const contentType = res.headers.get("content-type");
    const hops = chain.length;
    let cls;
    if (status >= 200 && status < 300) cls = hops === 0 ? "ok" : hops === 1 ? "redirect" : "chain";
    else if (status === 401 || status === 403) cls = "forbidden";
    else if (status === 405) cls = "method";
    else cls = "broken";
    return { href, status, chain, hops, method, final: { url: current, status, contentType }, cls };
  }
  return { href, status: null, chain, hops: chain.length, cls: "loop", detail: "more than 6 redirects" };
}

function parseSrcset(value) {
  return value
    .split(",")
    .map((c) => c.trim().split(/\s+/)[0])
    .filter(Boolean);
}

function classifyHref(raw, pageUrl) {
  const t = (raw ?? "").trim();
  if (!t || t.startsWith("#")) return { skip: "fragment" };
  if (/^(mailto|tel|javascript|data|sms|blob):/i.test(t)) return { skip: "scheme" };
  let u;
  try {
    u = new URL(t, pageUrl);
  } catch {
    return { skip: "invalid", invalid: t };
  }
  if (!/^https?:$/.test(u.protocol)) return { skip: "scheme" };
  const f = toFetchable(u);
  if (!f) return { external: u.href };
  f.hash = "";
  return { internal: f.href, declared: u.href };
}

/* ------------------------------------------------------------------ JSON-LD validation */

const isAbsUrl = (v) => typeof v === "string" && /^https?:\/\/\S+$/.test(v);
const nonEmpty = (v) => typeof v === "string" && v.trim().length > 0;
const isDate = (v) => typeof v === "string" && !Number.isNaN(Date.parse(v));
const typesOf = (node) => (Array.isArray(node?.["@type"]) ? node["@type"] : node?.["@type"] ? [node["@type"]] : []);

function validateJsonLd(node, report, where = "$", top = true) {
  if (Array.isArray(node)) {
    node.forEach((n, i) => validateJsonLd(n, report, `${where}[${i}]`, top));
    return;
  }
  if (!node || typeof node !== "object") {
    report.errors.push(`${where}: not an object`);
    return;
  }
  if (Array.isArray(node["@graph"])) {
    if (!node["@context"]) report.warnings.push(`${where}: @graph without @context`);
    node["@graph"].forEach((n, i) => validateJsonLd(n, report, `${where}.@graph[${i}]`, false));
    return;
  }
  const types = typesOf(node);
  if (!types.length) {
    report.errors.push(`${where}: missing @type`);
    return;
  }
  if (top && !/schema\.org/.test(String(node["@context"] ?? ""))) report.errors.push(`${where} (${types.join("/")}): missing or non-schema.org @context`);
  const err = (m) => report.errors.push(`${where} ${types.join("/")}: ${m}`);
  const warn = (m) => report.warnings.push(`${where} ${types.join("/")}: ${m}`);
  const req = (field, test = nonEmpty) => {
    if (!test(node[field])) err(`missing/invalid ${field}`);
  };
  const rec = (field, test = nonEmpty) => {
    if (!test(node[field])) warn(`missing recommended ${field}`);
  };
  const urlField = (field) => {
    if (node[field] !== undefined && !isAbsUrl(node[field])) err(`${field} is not an absolute URL (${JSON.stringify(node[field]).slice(0, 80)})`);
    else if (isAbsUrl(node[field]) && new URL(node[field]).origin !== declaredOrigin) warn(`${field} origin ${new URL(node[field]).origin} differs from the declared site origin ${declaredOrigin}`);
  };
  for (const type of types) report.types.push(type);
  for (const type of types) {
    switch (type) {
      case "BlogPosting":
      case "TechArticle":
      case "Article":
      case "NewsArticle": {
        req("headline");
        if (nonEmpty(node.headline) && codePoints(node.headline) > 110) warn(`headline has ${codePoints(node.headline)} characters (Google truncates > 110)`);
        req("datePublished", isDate);
        rec("dateModified", isDate);
        if (!node.author || typeof node.author !== "object") err("missing author");
        else {
          const authors = Array.isArray(node.author) ? node.author : [node.author];
          for (const a of authors) {
            if (!typesOf(a).length || !nonEmpty(a.name)) err("author needs @type and name");
            if (a.url !== undefined && !isAbsUrl(a.url)) err("author.url is not an absolute URL");
          }
        }
        if (!node.publisher || typeof node.publisher !== "object") warn("missing recommended publisher");
        else {
          if (!nonEmpty(node.publisher.name)) err("publisher.name missing");
          const logo = node.publisher.logo;
          const logoUrl = typeof logo === "string" ? logo : logo?.url;
          if (!isAbsUrl(logoUrl)) err("publisher.logo missing or not an absolute URL");
        }
        const images = Array.isArray(node.image) ? node.image : node.image ? [node.image] : [];
        if (!images.length) warn("missing recommended image");
        for (const im of images) {
          const u = typeof im === "string" ? im : im?.url;
          if (!isAbsUrl(u)) err("image entry is not an absolute URL");
        }
        if (!node.mainEntityOfPage) rec("mainEntityOfPage");
        else {
          const id = typeof node.mainEntityOfPage === "string" ? node.mainEntityOfPage : node.mainEntityOfPage["@id"];
          if (!isAbsUrl(id)) err("mainEntityOfPage/@id is not an absolute URL");
        }
        urlField("url");
        rec("description");
        rec("inLanguage");
        break;
      }
      case "BreadcrumbList": {
        const items = node.itemListElement;
        if (!Array.isArray(items) || !items.length) {
          err("itemListElement missing or empty");
          break;
        }
        items.forEach((it, i) => {
          if (!typesOf(it).includes("ListItem")) err(`itemListElement[${i}] is not a ListItem`);
          if (it.position !== i + 1) err(`itemListElement[${i}].position is ${it.position}, expected ${i + 1}`);
          if (!nonEmpty(it.name)) err(`itemListElement[${i}].name missing`);
          const item = typeof it.item === "string" ? it.item : it.item?.["@id"];
          if (i < items.length - 1 && !isAbsUrl(item)) err(`itemListElement[${i}].item missing or not an absolute URL`);
          if (i === items.length - 1 && item !== undefined && !isAbsUrl(item)) err(`itemListElement[${i}].item is not an absolute URL`);
        });
        break;
      }
      case "FAQPage": {
        const qs = node.mainEntity;
        if (!Array.isArray(qs) || !qs.length) {
          err("mainEntity missing or empty");
          break;
        }
        qs.forEach((q, i) => {
          if (!typesOf(q).includes("Question")) err(`mainEntity[${i}] is not a Question`);
          if (!nonEmpty(q.name)) err(`mainEntity[${i}].name missing`);
          const a = q.acceptedAnswer;
          if (!a || typeof a !== "object" || !typesOf(a).includes("Answer") || !nonEmpty(a.text)) err(`mainEntity[${i}].acceptedAnswer needs @type Answer and text`);
        });
        break;
      }
      case "Organization": {
        req("name");
        req("url", isAbsUrl);
        urlField("url");
        const logo = node.logo;
        const logoUrl = typeof logo === "string" ? logo : logo?.url;
        if (logo === undefined) warn("missing recommended logo");
        else if (!isAbsUrl(logoUrl)) err("logo is not an absolute URL");
        if (node.sameAs !== undefined && !Array.isArray(node.sameAs)) err("sameAs must be an array");
        break;
      }
      case "WebSite": {
        req("name");
        req("url", isAbsUrl);
        urlField("url");
        rec("inLanguage");
        break;
      }
      case "Blog": {
        req("name");
        req("url", isAbsUrl);
        urlField("url");
        rec("description");
        if (node.publisher && !nonEmpty(node.publisher.name)) err("publisher.name missing");
        break;
      }
      case "WebPage": {
        req("name");
        req("url", isAbsUrl);
        urlField("url");
        break;
      }
      case "SoftwareApplication": {
        req("name");
        req("applicationCategory");
        rec("operatingSystem");
        const offers = Array.isArray(node.offers) ? node.offers : node.offers ? [node.offers] : [];
        if (!offers.length) err("offers missing");
        offers.forEach((o, i) => {
          if (!typesOf(o).includes("Offer")) err(`offers[${i}] is not an Offer`);
          if (o.price === undefined || o.price === null || o.price === "") err(`offers[${i}].price missing`);
          if (!nonEmpty(o.priceCurrency)) err(`offers[${i}].priceCurrency missing`);
        });
        break;
      }
      case "Offer": {
        if (node.price === undefined) err("price missing");
        req("priceCurrency");
        break;
      }
      case "ImageObject": {
        req("url", isAbsUrl);
        break;
      }
      case "HowTo": {
        req("name");
        const steps = Array.isArray(node.step) ? node.step : [];
        if (!steps.length) err("step missing or empty");
        steps.forEach((s, i) => {
          if (!typesOf(s).includes("HowToStep")) err(`step[${i}] is not a HowToStep`);
          if (!nonEmpty(s.name) && !nonEmpty(s.text)) err(`step[${i}] needs name or text`);
        });
        break;
      }
      case "ItemList": {
        const items = node.itemListElement;
        if (!Array.isArray(items) || !items.length) {
          err("itemListElement missing or empty");
          break;
        }
        items.forEach((it, i) => {
          if (!typesOf(it).includes("ListItem")) err(`itemListElement[${i}] is not a ListItem`);
          if (it.position !== undefined && it.position !== i + 1) err(`itemListElement[${i}].position is ${it.position}, expected ${i + 1}`);
          const target = typeof it.url === "string" ? it.url : typeof it.item === "string" ? it.item : it.item?.url ?? it.item?.["@id"];
          if (!nonEmpty(it.name) && !(it.item && typeof it.item === "object" && nonEmpty(it.item.name))) err(`itemListElement[${i}] needs name`);
          if (target !== undefined && !isAbsUrl(target)) err(`itemListElement[${i}] url/item is not an absolute URL`);
        });
        break;
      }
      case "ContactPage":
      case "AboutPage":
      case "CollectionPage": {
        req("name");
        req("url", isAbsUrl);
        urlField("url");
        break;
      }
      case "ListItem":
      case "Question":
      case "Answer":
        break;
      default:
        warn(`no validation rules for @type ${type}`);
    }
  }
}

/* ------------------------------------------------------------------ page crawl */

const known = new Set();
const queue = [];
function enqueue(entry) {
  const key = entry.declared;
  if (known.has(key)) return false;
  known.add(key);
  queue.push(entry);
  return true;
}

async function crawlPage(entry) {
  const fetchUrl = (toFetchable(new URL(entry.declared)) ?? new URL(entry.declared)).href;
  const pathname = new URL(entry.declared).pathname;
  const page = {
    url: entry.declared,
    fetched: fetchUrl,
    path: pathname,
    kind: entry.kind,
    locale: entry.locale ?? null,
    source: entry.sitemap ?? entry.source ?? null,
    status: null,
    ms: null,
    contentType: null,
    lang: null,
    title: null,
    titleLength: null,
    titleCount: 0,
    h1Count: 0,
    h1: [],
    description: null,
    descriptionLength: null,
    canonical: null,
    canonicalSelf: null,
    hreflang: [],
    hreflangCount: 0,
    robots: null,
    ogImage: null,
    jsonLd: [],
    links: { total: 0, internal: 0, external: 0, skipped: 0, invalid: [], ok: 0, redirect: [], chain: [], broken: [], forbidden: [], method: [] },
    images: { total: 0, internal: 0, external: 0, ok: 0, redirect: [], chain: [], broken: [], notImage: [] },
    findings: [],
  };
  const add = (severity, code, detail) => page.findings.push({ severity, code, detail });
  const { res, ms, error } = await httpRequest(fetchUrl, { auth: entry.kind === "dashboard" });
  page.ms = ms;
  if (error || !res) {
    page.error = error;
    add("error", "fetch", error ?? "no response");
    return page;
  }
  page.status = res.status;
  page.contentType = res.headers.get("content-type");
  if (res.status !== 200) {
    const loc = res.headers.get("location");
    add("error", "status", `HTTP ${res.status}${loc ? ` → ${loc}` : ""}`);
    await res.arrayBuffer().catch(() => {});
    return page;
  }
  const html = await res.text();
  page.bytes = Buffer.byteLength(html);
  const dom = new JSDOM(html, { url: fetchUrl });
  try {
    const doc = dom.window.document;
    const isPublic = entry.kind === "public";
    page.lang = doc.documentElement.getAttribute("lang");
    if (isPublic && page.locale && page.lang !== page.locale) add("error", "lang", `<html lang> is ${page.lang ?? "missing"}, expected ${page.locale}`);

    // only the HTML document title counts; inline SVG diagrams carry their own accessible <title> elements
    const allTitles = [...doc.querySelectorAll("title")];
    const titles = allTitles.filter((t) => t.namespaceURI === "http://www.w3.org/1999/xhtml");
    page.svgTitleCount = allTitles.length - titles.length;
    page.titleCount = titles.length;
    page.title = titles[0]?.textContent?.trim() ?? null;
    page.titleLength = page.title ? codePoints(page.title) : null;
    if (!page.title) add("error", "title", "missing <title>");
    else if (page.titleCount !== 1) add("error", "title", `${page.titleCount} <title> elements`);
    else if (page.titleLength > opts.titleMax) add("warn", "title-length", `title has ${page.titleLength} characters (> ${opts.titleMax}): "${page.title}"`);

    const h1s = [...doc.querySelectorAll("h1")];
    page.h1Count = h1s.length;
    page.h1 = h1s.map((h) => h.textContent.replace(/\s+/g, " ").trim().slice(0, 120));
    if (h1s.length !== 1) add("error", "h1", `${h1s.length} <h1> elements`);

    page.description = doc.querySelector('meta[name="description"]')?.getAttribute("content")?.trim() ?? null;
    page.descriptionLength = page.description ? codePoints(page.description) : null;
    if (!page.description) add(isPublic ? "error" : "info", "description", "missing meta description");

    page.canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null;
    if (page.canonical) {
      const c = new URL(page.canonical, fetchUrl);
      page.canonicalSelf = stripSlash(c.href) === stripSlash(page.url);
      if (!page.canonicalSelf) add(isPublic ? "error" : "warn", "canonical", `canonical ${page.canonical} is not the page URL ${page.url}`);
    } else add(isPublic ? "error" : "info", "canonical", "missing canonical");

    const alternates = [...doc.querySelectorAll('link[rel="alternate"][hreflang]')].map((l) => ({ lang: l.getAttribute("hreflang"), href: l.getAttribute("href") }));
    page.hreflang = alternates;
    page.hreflangCount = alternates.length;
    if (isPublic) {
      if (alternates.length !== HREFLANG_EXPECTED) add("error", "hreflang", `${alternates.length} hreflang links, expected ${HREFLANG_EXPECTED}`);
      const langs = alternates.map((a) => a.lang);
      const dupes = langs.filter((l, i) => langs.indexOf(l) !== i);
      if (dupes.length) add("error", "hreflang", `duplicate hreflang ${[...new Set(dupes)].join(", ")}`);
      if (!langs.includes("x-default")) add("error", "hreflang", "missing x-default");
      const self = alternates.find((a) => a.lang === page.locale);
      if (page.locale && !self) add("error", "hreflang", `no hreflang entry for the page locale ${page.locale}`);
      else if (self && stripSlash(new URL(self.href, fetchUrl).href) !== stripSlash(page.url)) add("error", "hreflang", `hreflang ${page.locale} points to ${self.href}, not to the page itself`);
      const xd = alternates.find((a) => a.lang === "x-default");
      if (xd && !/\/en(\/|$)/.test(new URL(xd.href, fetchUrl).pathname)) add("error", "hreflang", `x-default ${xd.href} is not the English page`);
      for (const a of alternates) if (!isAbsUrl(a.href)) add("error", "hreflang", `hreflang ${a.lang} href is not absolute: ${a.href}`);
    }

    page.robots = doc.querySelector('meta[name="robots"]')?.getAttribute("content") ?? null;
    if (isPublic && page.robots && /noindex/i.test(page.robots)) add("error", "robots", `noindex on a public page (${page.robots})`);
    if (!isPublic && !(page.robots && /noindex/i.test(page.robots))) add("info", "robots", "dashboard page without a noindex meta (robots.txt disallows /app)");

    page.ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute("content") ?? null;

    // JSON-LD
    const scripts = [...doc.querySelectorAll('script[type="application/ld+json"]')];
    for (const [i, s] of scripts.entries()) {
      const report = { index: i, types: [], errors: [], warnings: [] };
      try {
        const data = JSON.parse(s.textContent ?? "");
        validateJsonLd(data, report);
      } catch (e) {
        report.errors.push(`JSON parse error: ${e instanceof Error ? e.message : String(e)}`);
      }
      page.jsonLd.push(report);
      for (const m of report.errors) add("error", "jsonld", m);
      for (const m of report.warnings) add("warn", "jsonld", m);
    }
    if (isPublic && !scripts.length) add("info", "jsonld", "no JSON-LD block");

    // links and images
    const linkTargets = new Map(); // href → {kinds:Set, texts:[]}
    const imageTargets = new Map();
    const push = (map, raw, kind, text) => {
      const c = classifyHref(raw, fetchUrl);
      const bucket = map === linkTargets ? page.links : page.images;
      bucket.total++;
      if (c.skip) {
        if (c.invalid !== undefined) page.links.invalid.push(c.invalid);
        if (map === linkTargets) page.links.skipped++;
        return;
      }
      if (c.external) {
        bucket.external++;
        return;
      }
      bucket.internal++;
      const e = map.get(c.internal) ?? { kinds: new Set(), texts: [] };
      e.kinds.add(kind);
      if (text && e.texts.length < 3) e.texts.push(text);
      map.set(c.internal, e);
    };
    for (const a of doc.querySelectorAll("a[href]")) push(linkTargets, a.getAttribute("href"), "a", a.textContent.replace(/\s+/g, " ").trim().slice(0, 60));
    for (const l of doc.querySelectorAll('link[rel="alternate"][type="application/rss+xml"], link[rel="manifest"]')) push(linkTargets, l.getAttribute("href"), l.getAttribute("rel"));
    for (const img of doc.querySelectorAll("img[src]")) push(imageTargets, img.getAttribute("src"), "img", img.getAttribute("alt") ?? "");
    for (const el of doc.querySelectorAll("img[srcset], source[srcset]")) for (const c of parseSrcset(el.getAttribute("srcset"))) push(imageTargets, c, "srcset");
    for (const el of doc.querySelectorAll("source[src], video[src], video[poster], audio[src]")) push(imageTargets, el.getAttribute("src") ?? el.getAttribute("poster"), el.tagName.toLowerCase());
    for (const m of doc.querySelectorAll('meta[property="og:image"], meta[name="twitter:image"]')) push(imageTargets, m.getAttribute("content"), "og");
    for (const l of doc.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]')) push(imageTargets, l.getAttribute("href"), "icon");

    const record = (bucket, href, meta, r, isImage) => {
      const item = { href, kinds: [...meta.kinds], text: meta.texts[0], status: r.status ?? null, hops: r.hops ?? 0, chain: r.chain?.map((h) => `${h.status} ${h.url} → ${h.location}`) ?? [], final: r.final?.url ?? null, error: r.error ?? r.detail ?? null };
      if (r.cls === "ok") bucket.ok++;
      else if (r.cls === "redirect") bucket.redirect.push(item);
      else if (r.cls === "chain" || r.cls === "loop") bucket.chain.push(item);
      else if (r.cls === "forbidden") (bucket.forbidden ?? bucket.broken).push(item);
      else if (r.cls === "method") (bucket.method ?? bucket.broken).push(item);
      else bucket.broken.push(item);
      if (isImage && r.final?.contentType && !/^image\//.test(r.final.contentType) && r.cls !== "broken") bucket.notImage.push({ href, contentType: r.final.contentType });
    };
    await pool([...linkTargets.entries()], async ([href, meta]) => record(page.links, href, meta, await checkLink(href), false), opts.concurrency);
    await pool([...imageTargets.entries()], async ([href, meta]) => record(page.images, href, meta, await checkLink(href), true), opts.concurrency);

    for (const b of page.links.broken) add("error", "link", `${b.href} → ${b.status ?? b.error}${b.chain.length ? ` via ${b.chain.join(" ; ")}` : ""}`);
    for (const c of page.links.chain) add("error", "link-chain", `${c.href}: ${c.chain.join(" ; ")}`);
    for (const f of page.links.forbidden) add("warn", "link-forbidden", `${f.href} → ${f.status}`);
    for (const m of page.links.method) add("info", "link-method", `${m.href} → ${m.status} (not a GET resource)`);
    for (const r of page.links.redirect) add("info", "link-redirect", `${r.href} → ${r.chain[0]}`);
    for (const inv of page.links.invalid) add("warn", "link-invalid", `unparsable href ${inv}`);
    for (const b of page.images.broken) add("error", "image", `${b.href} → ${b.status ?? b.error}`);
    for (const c of page.images.chain) add("error", "image-chain", `${c.href}: ${c.chain.join(" ; ")}`);
    for (const r of page.images.redirect) add("info", "image-redirect", `${r.href} → ${r.chain[0]}`);
    for (const n of page.images.notImage) add("warn", "image-type", `${n.href} answers ${n.contentType}`);

    // dashboard discovery: internal /app/... HTML pages linked from a dashboard page
    if (entry.kind === "dashboard" && opts.dashboard) {
      for (const [href, meta] of linkTargets) {
        if (!meta.kinds.has("a")) continue;
        const u = new URL(href);
        if (!(u.pathname === "/app" || u.pathname.startsWith("/app/"))) continue;
        const r = await checkLink(href);
        if (r.cls !== "ok" || !/text\/html/.test(r.final?.contentType ?? "")) continue;
        if (discovered >= opts.discoverMax) break;
        const declared = `${BASE.origin}${u.pathname}`;
        if (enqueue({ declared, kind: "dashboard", locale: null, source: `discovered on ${page.url}`, discovered: true })) discovered++;
      }
    }
    page.linkedPaths = [...new Set([...linkTargets.keys()].map((h) => new URL(h).pathname))];
  } finally {
    dom.window.close();
  }
  return page;
}
let discovered = 0;

/* ------------------------------------------------------------------ redirect matrix */

function parseMatrix(file) {
  if (!existsSync(file)) return { rows: [], error: `matrix ${file} not found` };
  const rows = [];
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*([a-z]+)\s*\|/.exec(line);
    if (m) rows.push({ from: m[1], to: m[2], rule: m[3] });
  }
  return { rows, error: null };
}

async function checkRedirect(from, to, { expectStatus = 308, group, note } = {}) {
  const fromUrl = `${BASE.origin}${from}`;
  const r = await httpRequest(fromUrl, { method: "GET" });
  const result = { group, from, to, note: note ?? null, status: r.res?.status ?? null, location: null, locationPath: null, targetStatus: null, targetLocation: null, error: r.error, problems: [] };
  if (r.error || !r.res) {
    result.problems.push(`fetch failed: ${r.error}`);
    return result;
  }
  await r.res.arrayBuffer().catch(() => {});
  result.location = r.res.headers.get("location");
  if (result.status !== expectStatus) result.problems.push(`status ${result.status}, expected ${expectStatus}`);
  if (result.location) {
    const target = new URL(result.location, fromUrl);
    result.locationPath = pathAndSearch(target.href);
    if (result.locationPath !== to) result.problems.push(`Location ${result.locationPath}, expected ${to}`);
    const f = toFetchable(target);
    if (!f) result.problems.push(`Location leaves the site: ${target.href}`);
    else {
      const t = await httpRequest(f.href, { method: "GET" });
      if (t.error || !t.res) result.problems.push(`target fetch failed: ${t.error}`);
      else {
        await t.res.arrayBuffer().catch(() => {});
        result.targetStatus = t.res.status;
        result.targetLocation = t.res.headers.get("location");
        if (t.res.status !== 200) result.problems.push(`target answers ${t.res.status}${result.targetLocation ? ` → ${result.targetLocation} (redirect chain)` : ""}`);
      }
    }
  } else if (result.status >= 300 && result.status < 400) result.problems.push("redirect without Location");
  else result.problems.push("no redirect");
  return result;
}

async function checkRedirectMatrix(locales, firstSlugByLocale) {
  const { rows, error } = parseMatrix(abs(opts.matrix));
  const out = { file: opts.matrix, error, rowsTotal: rows.length, indexRows: 0, articleRows: 0, sampled: 0, results: [], extras: [] };
  if (error) return out;
  const isIndex = (r) => /\/blog(\/feed\.xml)?$/.test(r.from);
  const indexRows = rows.filter(isIndex);
  const articleRows = rows.filter((r) => !isIndex(r));
  out.indexRows = indexRows.length;
  out.articleRows = articleRows.length;
  const n = Math.min(opts.sample, articleRows.length);
  const sample = Array.from({ length: n }, (_, i) => articleRows[Math.floor((i * articleRows.length) / n)]);
  out.sampled = sample.length;
  const cases = [...indexRows.map((r) => ({ ...r, group: "index/feed" })), ...sample.map((r) => ({ ...r, group: "article-sample" }))];
  out.results = await pool(cases, (c) => checkRedirect(c.from, c.to, { group: c.group, note: c.rule }), opts.concurrency);

  // derived rows: locales active on the site but absent from the matrix, query preservation, dashboard legacy paths
  const matrixLocales = new Set(rows.map((r) => /^\/([a-z]{2})\/blog/.exec(r.from)?.[1]).filter(Boolean));
  const extras = [];
  for (const l of locales) {
    if (matrixLocales.has(l)) continue;
    extras.push({ from: `/${l}/blog`, to: `/${l}/tracking-knowledge`, note: `locale ${l} not in the matrix (derived from the pattern rules)` });
    extras.push({ from: `/${l}/blog/feed.xml`, to: `/${l}/tracking-knowledge/feed.xml`, note: `locale ${l} not in the matrix (derived)` });
    const slug = firstSlugByLocale.get(l);
    if (slug) extras.push({ from: `/${l}/blog/${slug}`, to: `/${l}/tracking-knowledge/${slug}`, note: `locale ${l} not in the matrix (derived)` });
  }
  const enSlug = firstSlugByLocale.get("en");
  if (enSlug) {
    extras.push({ from: `/blog/${enSlug}?utm_source=qa&utm_medium=crawl`, to: `/en/tracking-knowledge/${enSlug}?utm_source=qa&utm_medium=crawl`, note: "query string preserved (unprefixed)" });
    extras.push({ from: `/en/blog/${enSlug}?category=guides`, to: `/en/tracking-knowledge/${enSlug}?category=guides`, note: "query string preserved (prefixed)" });
  }
  extras.push({ from: "/", to: "/en", note: "root → default locale (proxy)" });
  extras.push({ from: "/pricing", to: "/en/pricing", note: "unprefixed marketing URL → /en (next.config)" });
  for (const [from, to] of DASHBOARD_LEGACY) extras.push({ from, to, note: "dashboard legacy path (next.config, session cookie sent)" });
  out.extras = await pool(extras, (e) => checkRedirect(e.from, e.to, { group: "extra", note: e.note }), opts.concurrency);
  return out;
}

/* ------------------------------------------------------------------ summary */

function aggregate(pages, key) {
  const map = new Map();
  for (const p of pages) {
    for (const item of [...p.links[key], ...p.images[key]]) {
      const e = map.get(item.href) ?? { href: item.href, status: item.status, chain: item.chain, error: item.error, pages: [] };
      if (e.pages.length < 5) e.pages.push(p.url);
      e.count = (e.count ?? 0) + 1;
      map.set(item.href, e);
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

const md = {
  esc: (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " "),
  table: (headers, rows) => [`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.map(md.esc).join(" | ")} |`)].join("\n"),
};

function buildSummary(data) {
  const { meta, pages, redirectMatrix } = data;
  const pub = pages.filter((p) => p.kind === "public");
  const dash = pages.filter((p) => p.kind === "dashboard");
  const statusDist = {};
  for (const p of pages) statusDist[p.status ?? "error"] = (statusDist[p.status ?? "error"] ?? 0) + 1;
  const errorsOf = (p) => p.findings.filter((f) => f.severity === "error");
  const failing = pages.filter((p) => errorsOf(p).length);
  const longTitles = pages.filter((p) => p.findings.some((f) => f.code === "title-length"));
  const broken = aggregate(pages, "broken");
  const chains = aggregate(pages, "chain");
  const redirects = aggregate(pages, "redirect");
  const forbidden = aggregate(pages.map((p) => ({ ...p, images: { forbidden: [] } })), "forbidden");
  const schemaTypes = {};
  const schemaErrors = new Map();
  const schemaWarnings = new Map();
  for (const p of pages)
    for (const b of p.jsonLd) {
      for (const t of b.types) schemaTypes[t] = (schemaTypes[t] ?? 0) + 1;
      for (const e of b.errors) {
        const k = e.replace(/\$\[\d+\]\s*/, "");
        const v = schemaErrors.get(k) ?? { count: 0, pages: [] };
        v.count++;
        if (v.pages.length < 3) v.pages.push(p.url);
        schemaErrors.set(k, v);
      }
      for (const w of b.warnings) {
        const k = w.replace(/\$\[\d+\]\s*/, "");
        const v = schemaWarnings.get(k) ?? { count: 0, pages: [] };
        v.count++;
        if (v.pages.length < 3) v.pages.push(p.url);
        schemaWarnings.set(k, v);
      }
    }
  const pagesWithLd = pages.filter((p) => p.jsonLd.length).length;
  const ldBlocks = pages.reduce((n, p) => n + p.jsonLd.length, 0);
  const ldErrorBlocks = pages.reduce((n, p) => n + p.jsonLd.filter((b) => b.errors.length).length, 0);
  const uniqueLinks = meta.linkChecks;
  const rm = redirectMatrix;
  const rmFail = rm.results.filter((r) => r.problems.length);
  const exFail = rm.extras.filter((r) => r.problems.length);
  const sitemapPaths = new Set(pub.map((p) => new URL(p.url).pathname));
  const linkedPublicNotInSitemap = new Map();
  for (const p of pages)
    for (const lp of p.linkedPaths ?? []) {
      if (!localeOf(lp) || sitemapPaths.has(stripSlash(lp))) continue;
      if (/\.(xml|json|png|svg|ico|txt|webp|jpg)$/.test(lp)) continue;
      const v = linkedPublicNotInSitemap.get(stripSlash(lp)) ?? 0;
      linkedPublicNotInSitemap.set(stripSlash(lp), v + 1);
    }

  const lines = [];
  lines.push(`# SEO, structured data and link integrity — crawl summary`);
  lines.push("");
  lines.push(`Generated ${meta.finishedAt} by \`node apps/web/scripts/qa/crawl.mjs\` against \`${meta.base}\` (production build \`next start\`, BUILD_ID \`${meta.buildId ?? "n/a"}\`). Raw data: \`crawl.json\` next to this file (one entry per URL under \`pages\`, every unique link target under \`linkChecks\`, the redirect matrix results under \`redirectMatrix\`, robots/sitemaps/feeds under \`resources\`).`);
  lines.push("");
  lines.push(`Run: started ${meta.startedAt}, finished ${meta.finishedAt} (${Math.round(meta.durationMs / 1000)} s), concurrency ${meta.concurrency}, request timeout ${meta.timeout} ms. Declared site origin (sitemap \`<loc>\`, canonicals, hreflang, JSON-LD): \`${meta.declaredOrigin}\`${meta.declaredOrigin !== meta.base ? ` — differs from the crawl base; URLs were rewritten to \`${meta.base}\` for fetching and compared against the declared origin (this is the \`HOST_MARKETING\` value of the local \`.env\`, not a page defect)` : ""}. Dashboard requests carried the stored Playwright session (${meta.auth.names?.join(", ") ?? "no cookies"}${meta.auth.expired?.length ? `; expired and dropped: ${meta.auth.expired.join(", ")}` : ""}).`);
  lines.push("");
  lines.push("## Counts");
  lines.push("");
  lines.push(
    md.table(
      ["Metric", "Value"],
      [
        ["Sitemaps in the index", `${meta.sitemaps} (${resources.sitemaps.map((s) => `${path.basename(new URL(s.declared).pathname)}: ${s.urls}`).join(", ")})`],
        ["Public URLs from the sitemaps", pub.length],
        ["Dashboard URLs", `${dash.length} (${DASHBOARD_ROUTES.length} static routes + ${dash.filter((p) => p.source?.startsWith("discovered")).length} discovered via links)`],
        ["Pages crawled", pages.length],
        ["HTTP status distribution", Object.entries(statusDist).map(([k, v]) => `${k}: ${v}`).join(", ")],
        ["Pages with ≥ 1 error finding", failing.length],
        ["Pages with exactly one h1", pages.filter((p) => p.h1Count === 1).length],
        [`Titles longer than ${opts.titleMax} characters`, longTitles.length],
        ["Public pages with 7 hreflang links", `${pub.filter((p) => p.hreflangCount === HREFLANG_EXPECTED).length} / ${pub.length}`],
        ["Public pages with self-canonical", `${pub.filter((p) => p.canonicalSelf).length} / ${pub.length}`],
        ["Public pages with meta description", `${pub.filter((p) => p.description).length} / ${pub.length}`],
        ["JSON-LD blocks parsed", `${ldBlocks} on ${pagesWithLd} pages; ${ldErrorBlocks} blocks with errors`],
        ["JSON-LD @type counts", Object.entries(schemaTypes).map(([k, v]) => `${k}: ${v}`).join(", ")],
        ["Unique internal link/image targets checked", uniqueLinks.total],
        ["…answering 200 directly", uniqueLinks.ok],
        ["…via exactly one redirect", uniqueLinks.redirect],
        ["…via a redirect chain (≥ 2 hops)", uniqueLinks.chain],
        ["…broken (4xx/5xx or fetch error)", uniqueLinks.broken],
        ["…401/403", uniqueLinks.forbidden],
        ["…405 (not a GET resource)", uniqueLinks.method],
        ["Redirect matrix rows checked", `${rm.results.length} of ${rm.rowsTotal} (${rm.indexRows} index/feed + ${rm.sampled} sampled of ${rm.articleRows} article rows); ${rmFail.length} failures`],
        ["Derived redirect checks (not in the matrix)", `${rm.extras.length}; ${exFail.length} failures`],
      ],
    ),
  );
  lines.push("");
  lines.push("## Page failures (error findings)");
  lines.push("");
  if (!failing.length) lines.push("None: every crawled URL answered 200 with one h1, a title, a meta description, a self-canonical, the full hreflang set (public pages) and valid JSON-LD, and every internal link and image on it resolved without a chain.");
  else {
    lines.push(md.table(["URL", "Kind", "Status", "Findings"], failing.map((p) => [p.url, p.kind, p.status ?? p.error, errorsOf(p).map((f) => `${f.code}: ${f.detail}`).join("; ")])));
  }
  lines.push("");
  lines.push(`## Titles longer than ${opts.titleMax} characters`);
  lines.push("");
  lines.push(longTitles.length ? md.table(["URL", "Length", "Title"], longTitles.map((p) => [p.url, p.titleLength, p.title])) : "None.");
  lines.push("");
  lines.push("## Broken links and images (4xx/5xx, fetch errors)");
  lines.push("");
  if (!broken.length) lines.push("None.");
  else {
    // group by URL pattern so a systematic defect (one route × locales × slugs) reads as one row
    const patternOf = (href) => new URL(href).pathname.replace(/^\/[a-z]{2}(\/|$)/, "/<locale>$1").replace(/(tracking-knowledge|integrations|features)\/[a-z0-9-]+/, "$1/<slug>").replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, "<uuid>");
    const patterns = new Map();
    for (const b of broken) {
      const k = `${patternOf(b.href)} → ${b.status ?? b.error}`;
      const v = patterns.get(k) ?? { count: 0, targets: 0, example: b.href, pagesSet: new Set() };
      v.count += b.count;
      v.targets++;
      b.pages.forEach((p) => v.pagesSet.add(p));
      patterns.set(k, v);
    }
    lines.push("By pattern:");
    lines.push("");
    lines.push(md.table(["Pattern → status", "Unique targets", "Occurrences", "Example target"], [...patterns.entries()].sort((a, b) => b[1].targets - a[1].targets).map(([k, v]) => [k, v.targets, v.count, v.example])));
    lines.push("");
    lines.push(`Every broken target (${broken.length}):`);
    lines.push("");
    lines.push(md.table(["Target", "Status", "Occurrences", "Example pages"], broken.map((b) => [b.href, b.status ?? b.error, b.count, b.pages.slice(0, 2).join(", ")])));
  }
  lines.push("");
  lines.push("## Redirect chains (≥ 2 hops)");
  lines.push("");
  lines.push(chains.length ? md.table(["Target", "Chain", "Occurrences", "Example pages"], chains.map((c) => [c.href, c.chain.join(" ; "), c.count, c.pages.join(", ")])) : "None: no internal link or image passed through more than one redirect.");
  lines.push("");
  lines.push("## Links answered via exactly one redirect (informational)");
  lines.push("");
  lines.push(redirects.length ? md.table(["Target", "Redirect", "Occurrences", "Example pages"], redirects.slice(0, 40).map((r) => [r.href, r.chain[0], r.count, r.pages.slice(0, 2).join(", ")])) + (redirects.length > 40 ? `\n\n${redirects.length - 40} more in crawl.json.` : "") : "None: every internal link points at its final URL.");
  lines.push("");
  if (forbidden.length) {
    lines.push("## Links answering 401/403");
    lines.push("");
    lines.push(md.table(["Target", "Status", "Occurrences", "Example pages"], forbidden.map((b) => [b.href, b.status, b.count, b.pages.join(", ")])));
    lines.push("");
  }
  lines.push("## Structured data (JSON-LD)");
  lines.push("");
  lines.push(`${ldBlocks} \`application/ld+json\` blocks on ${pagesWithLd} pages were parsed; validated types: ${Object.entries(schemaTypes).map(([k, v]) => `${k} (${v})`).join(", ") || "none"}. Required-field rules: BlogPosting/TechArticle (headline, datePublished, author with @type+name, publisher name+logo, absolute image/url/mainEntityOfPage), BreadcrumbList (ListItem with sequential position, name, absolute item), FAQPage (Question name + Answer text), Organization (name, url, logo), WebSite (name, url), Blog/WebPage (name, url), SoftwareApplication (name, applicationCategory, Offer price + priceCurrency).`);
  lines.push("");
  lines.push("### Schema errors");
  lines.push("");
  lines.push(schemaErrors.size ? md.table(["Error", "Blocks", "Example pages"], [...schemaErrors.entries()].map(([k, v]) => [k, v.count, v.pages.join(", ")])) : "None.");
  lines.push("");
  lines.push("### Schema warnings (recommended fields, origin notes)");
  lines.push("");
  lines.push(schemaWarnings.size ? md.table(["Warning", "Blocks", "Example pages"], [...schemaWarnings.entries()].map(([k, v]) => [k, v.count, v.pages.join(", ")])) : "None.");
  lines.push("");
  lines.push("## Redirect matrix (Blog → Tracking Knowledge)");
  lines.push("");
  lines.push(`Source: \`${rm.file}\` (${rm.rowsTotal} rows: ${rm.indexRows} index/feed, ${rm.articleRows} article). Checked: every index/feed row and a deterministic sample of ${rm.sampled} article rows (every ⌊i·${rm.articleRows}/${rm.sampled}⌋-th row). Expectation per row: exactly one 308 whose Location (path + query) equals the documented target, and the target answers 200 without a further redirect.`);
  lines.push("");
  lines.push(md.table(["Group", "Rows", "Pass", "Fail"], [["index/feed", rm.results.filter((r) => r.group === "index/feed").length, rm.results.filter((r) => r.group === "index/feed" && !r.problems.length).length, rm.results.filter((r) => r.group === "index/feed" && r.problems.length).length], ["article sample", rm.results.filter((r) => r.group === "article-sample").length, rm.results.filter((r) => r.group === "article-sample" && !r.problems.length).length, rm.results.filter((r) => r.group === "article-sample" && r.problems.length).length]]));
  lines.push("");
  lines.push("Failures:");
  lines.push("");
  lines.push(rmFail.length ? md.table(["Old URL", "Documented target", "Status", "Location", "Target status", "Problems"], rmFail.map((r) => [r.from, r.to, r.status, r.locationPath ?? r.location, r.targetStatus, r.problems.join("; ")])) : "None.");
  lines.push("");
  lines.push("Full list of checked rows:");
  lines.push("");
  lines.push(md.table(["Group", "Old URL", "Status", "Location (path)", "Target status", "Result"], rm.results.map((r) => [r.group, r.from, r.status, r.locationPath ?? r.location ?? "", r.targetStatus, r.problems.length ? `FAIL: ${r.problems.join("; ")}` : "ok"])));
  lines.push("");
  lines.push("### Derived checks not covered by the matrix");
  lines.push("");
  lines.push(md.table(["Old URL", "Expected target", "Status", "Location (path)", "Target status", "Result", "Note"], rm.extras.map((r) => [r.from, r.to, r.status, r.locationPath ?? r.location ?? "", r.targetStatus, r.problems.length ? `FAIL: ${r.problems.join("; ")}` : "ok", r.note])));
  lines.push("");
  lines.push("## robots.txt, sitemaps and feeds");
  lines.push("");
  const rb = resources.robots;
  lines.push(`- robots.txt: HTTP ${rb?.status ?? rb?.error}; Sitemap line: ${rb?.sitemapLine ? `\`${rb.sitemapLine}\`` : "missing"}; Disallow /app: ${rb?.disallowApp}; Disallow /api: ${rb?.disallowApi}`);
  lines.push(`- sitemap index: HTTP ${resources.sitemapIndex?.status}; \`<sitemapindex>\`: ${resources.sitemapIndex?.isIndex}; ${resources.sitemapIndex?.sitemaps?.length ?? 0} sitemaps listed`);
  lines.push("");
  lines.push(md.table(["Sitemap", "Status", "URLs", "URLs without 7 xhtml alternates", "hreflang codes", "/blog/ URLs"], resources.sitemaps.map((s) => [path.basename(new URL(s.declared).pathname), s.status ?? s.error, s.urls, s.alternatesMissing.length, s.hreflangs.join(" "), s.blogUrls ? "yes" : "no"])));
  lines.push("");
  lines.push(md.table(["Feed", "Status", "Content-Type", "Items", "/blog/ URLs"], resources.feeds.map((f) => [f.url, f.status ?? f.error, f.contentType, f.items, f.blogUrls ? "yes" : "no"])));
  lines.push("");
  lines.push("## Dashboard pages (stored session)");
  lines.push("");
  lines.push(md.table(["URL", "Status", "h1", "Title (length)", "lang", "robots meta", "Error findings"], dash.map((p) => [p.url, p.status ?? p.error, p.h1Count, p.title ? `${p.title} (${p.titleLength})` : "—", p.lang ?? "—", p.robots ?? "—", errorsOf(p).map((f) => `${f.code}: ${f.detail}`).join("; ") || "none"])));
  lines.push("");
  lines.push("Meta description, canonical and hreflang are recorded for dashboard pages in crawl.json but not required: `/app` is disallowed in robots.txt and never localized by URL.");
  lines.push("");
  lines.push("## Linked localized pages that are not in the sitemaps (informational)");
  lines.push("");
  lines.push(linkedPublicNotInSitemap.size ? md.table(["Path", "Linked from n pages"], [...linkedPublicNotInSitemap.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, v])) : "None.");
  lines.push("");
  lines.push("## All page-level warnings and infos (counts by code)");
  lines.push("");
  const byCode = {};
  for (const p of pages) for (const f of p.findings) byCode[`${f.severity}:${f.code}`] = (byCode[`${f.severity}:${f.code}`] ?? 0) + 1;
  lines.push(md.table(["severity:code", "Findings"], Object.entries(byCode).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, v])));
  lines.push("");
  return lines.join("\n");
}

/* ------------------------------------------------------------------ main */

async function main() {
  const startedAt = new Date();
  const outDir = abs(opts.out);
  mkdirSync(outDir, { recursive: true });
  let buildId = null;
  try {
    buildId = readFileSync(path.join(repoRoot, "apps", "web", ".next", "BUILD_ID"), "utf8").trim();
  } catch {
    // no production build present: the crawl is still valid against a dev server
  }
  stdout(`crawl: base ${BASE.origin}, out ${outDir}`);

  const publicPages = await collectSitemapUrls();
  const locales = [...new Set(publicPages.map((p) => p.locale).filter(Boolean))];
  stdout(`crawl: ${resources.sitemaps.length} sitemaps, ${publicPages.length} public URLs, locales ${locales.join("/")}, declared origin ${declaredOrigin}`);
  await checkRobotsAndFeeds(locales);
  const firstSlugByLocale = new Map();
  for (const p of publicPages) {
    const m = new RegExp(`^/(${locales.join("|")})/tracking-knowledge/([a-z0-9-]+)$`).exec(new URL(p.declared).pathname);
    if (m && !firstSlugByLocale.has(m[1])) firstSlugByLocale.set(m[1], m[2]);
  }

  const selected = opts.limit ? publicPages.slice(0, opts.limit) : publicPages;
  for (const p of selected) enqueue(p);
  if (opts.dashboard) {
    if (!cookieHeader) console.warn("crawl: no session cookies — dashboard pages will redirect to login");
    for (const route of DASHBOARD_ROUTES) enqueue({ declared: `${BASE.origin}${route}`, kind: "dashboard", locale: null, source: "DASHBOARD_ROUTES" });
  }

  const pages = [];
  let done = 0;
  // the queue can grow while crawling (dashboard discovery), so drain it in rounds
  while (done < queue.length) {
    const batch = queue.slice(done);
    const results = await pool(
      batch,
      async (entry) => {
        const page = await crawlPage(entry);
        const errs = page.findings.filter((f) => f.severity === "error").length;
        stdout(`${String(page.status ?? "ERR").padEnd(4)} ${page.ms}ms h1=${page.h1Count} hl=${page.hreflangCount} ld=${page.jsonLd.length} err=${errs} ${page.url}`);
        return page;
      },
      opts.concurrency,
    );
    pages.push(...results);
    done += batch.length;
  }

  const redirectMatrix = await checkRedirectMatrix(locales, firstSlugByLocale);

  const linkChecks = {};
  const counts = { total: 0, ok: 0, redirect: 0, chain: 0, broken: 0, forbidden: 0, method: 0, error: 0, other: 0 };
  for (const [href, promise] of linkResults) {
    const r = await promise;
    linkChecks[href] = { status: r.status, cls: r.cls, hops: r.hops ?? 0, chain: r.chain, final: r.final ?? null, error: r.error ?? r.detail ?? null };
    counts.total++;
    if (r.cls === "ok") counts.ok++;
    else if (r.cls === "redirect") counts.redirect++;
    else if (r.cls === "chain" || r.cls === "loop") counts.chain++;
    else if (r.cls === "forbidden") counts.forbidden++;
    else if (r.cls === "method") counts.method++;
    else if (r.cls === "error") {
      counts.error++;
      counts.broken++;
    }
    else if (r.cls === "broken") counts.broken++;
    else counts.other++;
  }
  const finishedAt = new Date();
  const meta = {
    base: BASE.origin,
    declaredOrigin,
    buildId,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt - startedAt,
    concurrency: opts.concurrency,
    timeout: opts.timeout,
    titleMax: opts.titleMax,
    sample: opts.sample,
    limit: opts.limit || null,
    sitemaps: resources.sitemaps.length,
    locales,
    auth: { file: opts.auth, names: auth.names ?? [], expired: auth.expired ?? [], note: auth.note ?? null },
    linkChecks: counts,
    command: `node apps/web/scripts/qa/crawl.mjs ${process.argv.slice(2).join(" ")}`,
  };
  const data = { meta, resources, pages, linkChecks, redirectMatrix };
  writeFileSync(path.join(outDir, "crawl.json"), JSON.stringify(data, null, 1));
  writeFileSync(path.join(outDir, "summary.md"), buildSummary(data));
  const failing = pages.filter((p) => p.findings.some((f) => f.severity === "error")).length;
  const rmFail = redirectMatrix.results.filter((r) => r.problems.length).length + redirectMatrix.extras.filter((r) => r.problems.length).length;
  stdout(`crawl: ${pages.length} pages, ${failing} with error findings; ${counts.total} unique targets (${counts.broken} broken, ${counts.chain} chains, ${counts.redirect} single redirects); redirect checks failing: ${rmFail}; ${Math.round(meta.durationMs / 1000)} s`);
  process.exitCode = failing || rmFail ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 2;
});
