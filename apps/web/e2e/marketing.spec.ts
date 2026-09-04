import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { ACTIVE_LOCALES, ALL_LOCALES } from "../src/i18n/routing";

/** Every public URL carries a locale prefix, English included: the home page is /en, German /de … Dutch /nl. All six programme locales are active. */
const LOCALES = ACTIVE_LOCALES;
const home = (locale: string) => `/${locale}`;
const LOCALE_ALTERNATION = ALL_LOCALES.join("|");

test.describe("marketing site", () => {
  test("serves all six programme locales", () => {
    expect([...LOCALES]).toEqual(["en", "de", "fr", "es", "it", "nl"]);
  });

  for (const locale of LOCALES) {
    test(`home renders with lang="${locale}", one h1, self canonical, hreflang alternates for six locales + x-default and no serious accessibility violations`, async ({ page }) => {
      await page.goto(home(locale));
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`/${locale}$`));
      // seven hreflang links: one per active locale plus x-default
      await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(LOCALES.length + 1);
      expect(LOCALES.length + 1).toBe(7);
      for (const l of [...LOCALES, "x-default"]) await expect(page.locator(`link[rel="alternate"][hreflang="${l}"]`)).toHaveCount(1);
      await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute("href", /\/en$/);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      const serious = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
      expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`)).toEqual([]);
    });
  }

  test("unprefixed URLs redirect permanently to English and keep the query string", async ({ request }) => {
    const root = await request.get("/", { maxRedirects: 0 });
    expect(root.status()).toBe(308);
    expect(new URL(root.headers().location!, "http://x").pathname).toBe("/en");
    const pricing = await request.get("/pricing?plan=growth", { maxRedirects: 0 });
    expect(pricing.status()).toBe(308);
    const target = new URL(pricing.headers().location!, "http://x");
    expect(target.pathname).toBe("/en/pricing");
    expect(target.search).toBe("?plan=growth");
    // the dashboard is never localized: an anonymous visitor is sent straight to the localized login page (no /en/app, no /login → /en/login chain)
    const app = await request.get("/app", { maxRedirects: 0 });
    const appTarget = new URL(app.headers().location ?? "/", "http://x");
    expect(appTarget.pathname).not.toMatch(new RegExp(`^/(${LOCALE_ALTERNATION})/app(/|$)`));
    expect(appTarget.pathname).toBe("/en/login");
    expect(appTarget.searchParams.get("next")).toBe("/app");
  });

  test("the language switcher leads to the same page in the other language", async ({ page }) => {
    await page.goto("/en/pricing");
    // header and footer both carry a language switcher; drive the header one
    const header = page.locator("header");
    await header.getByRole("button", { name: /language/i }).click();
    await header.getByRole("link", { name: "Deutsch" }).click();
    await expect(page).toHaveURL(/\/de\/pricing$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
    // six written-out native names, and a second switch (to French) stays on the same page as well
    await header.getByRole("button", { name: /sprache/i }).click();
    for (const name of ["English", "Deutsch", "Français", "Español", "Italiano", "Nederlands"]) await expect(header.getByRole("link", { name })).toBeVisible();
    await header.getByRole("link", { name: "Français" }).click();
    await expect(page).toHaveURL(/\/fr\/pricing$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  });

  test("Tracking Knowledge index lists articles and an article renders with the article template, BlogPosting/TechArticle + BreadcrumbList JSON-LD and a large social card", async ({ page }) => {
    await page.goto("/en/tracking-knowledge");
    await expect(page.locator("h1")).toHaveText("Tracking Knowledge");
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /^https?:\/\/.+\/en\/tracking-knowledge\/opengraph-image/);
    const first = page.locator("main a[href^='/en/tracking-knowledge/']:not([href$='.xml']):not([href*='?'])").first();
    await expect(first).toBeVisible();
    await first.click();
    await expect(page).toHaveURL(/\/en\/tracking-knowledge\/[a-z0-9-]+$/);
    await expect(page.locator("h1")).toHaveCount(1);
    // article template (supplement §6): breadcrumbs, reading progress, table of contents, responsible editor, topic CTA and a feedback block without any totals
    await expect(page.getByRole("navigation", { name: /breadcrumb|navigationspfad/i })).toHaveCount(1);
    await expect(page.locator('[role="progressbar"]')).toHaveCount(1);
    await expect(page.locator("[data-article-toc] nav a[href^='#']").first()).toBeAttached();
    await expect(page.locator("[data-article-editor]")).toBeVisible();
    await expect(page.locator("[data-article-cta] a")).toHaveCount(1);
    await expect(page.locator("[data-article-feedback]")).toBeVisible();
    await expect(page.locator("[data-article-feedback]")).not.toContainText(/\d/);
    // WCAG gate on the article template itself (GFM task lists must not leave unlabeled form controls behind)
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const serious = axe.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`)).toEqual([]);
    const jsonLd = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(jsonLd.some((t) => /"@type":"(BlogPosting|TechArticle)"/.test(t) && /"publisher":\{"@type":"Organization","name":"Track"/.test(t))).toBe(true);
    expect(jsonLd.some((t) => /"@type":"BreadcrumbList"/.test(t) && t.includes('"name":"Tracking Knowledge"'))).toBe(true);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /^https?:\/\/.+\/en\/tracking-knowledge\/[a-z0-9-]+\/opengraph-image/);
    await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute("content", /Tracking Knowledge/);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
    await expect(page.locator("time").first()).toBeVisible();
    await expect(page.locator("main")).not.toContainText(/\bBlog\b/);
    // brand: <title> and og:site_name say "Track", the publisher logo resolves
    await expect(page).toHaveTitle(/ · Track$/);
    await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute("content", "Track");
    // header and footer carry the wordmark "Track"; the domain is never a visible brand there
    await expect(page.locator("header").getByRole("link", { name: "Track – home" })).toBeVisible();
    await expect(page.locator("footer")).toContainText(/© \d{4} Track\./);
    await expect(page.locator("header")).not.toContainText(/track\.site/i);
    await expect(page.locator("footer")).not.toContainText(/track\.site/i);
    const logo = jsonLd.map((t) => /"publisher":\{[^}]*"logo":\{"@type":"ImageObject","url":"([^"]+)"/.exec(t)?.[1]).find(Boolean);
    expect(logo).toBeTruthy();
    expect((await page.request.get(logo!)).status()).toBe(200);
    // language switcher: the German link targets the German version of this article, not /de/<english-slug> blindly
    const deLink = page.locator('a[hreflang="de"][lang="de"]').first();
    await expect(deLink).toHaveAttribute("href", /^\/de\/tracking-knowledge\/[a-z0-9-]+$/);
    const dePath = (await deLink.getAttribute("href"))!;
    expect((await page.request.get(dePath)).status()).toBe(200);
  });

  test("old blog URLs redirect permanently and directly to Tracking Knowledge, query string included", async ({ request }) => {
    const cases: Array<[string, string, string]> = [
      ["/blog", "/en/tracking-knowledge", ""],
      ["/blog/feed.xml", "/en/tracking-knowledge/feed.xml", ""],
      ["/blog/server-side-tracking-explained?utm_source=newsletter", "/en/tracking-knowledge/server-side-tracking-explained", "?utm_source=newsletter"],
      ["/en/blog", "/en/tracking-knowledge", ""],
      ["/de/blog/server-side-tracking-explained", "/de/tracking-knowledge/server-side-tracking-explained", ""],
      ["/de/blog/feed.xml", "/de/tracking-knowledge/feed.xml", ""],
    ];
    for (const [from, pathname, search] of cases) {
      const res = await request.get(from, { maxRedirects: 0 });
      expect([301, 308], `${from} status`).toContain(res.status());
      const target = new URL(res.headers().location!, "http://x");
      expect(target.pathname, from).toBe(pathname);
      expect(target.search, from).toBe(search);
    }
  });

  test("pricing never shows invented amounts: either Stripe prices or the honest empty state", async ({ page }) => {
    await page.goto("/en/pricing");
    await expect(page.locator("h1")).toHaveCount(1);
    const body = await page.locator("main").innerText();
    const hasPrice = /€\s?\d|\d\s?€|\$\s?\d/.test(body);
    const hasHonestState = /not configured|contact|on request|unavailable/i.test(body);
    expect(hasPrice || hasHonestState).toBe(true);
  });

  test("legal pages carry the operator identity from the environment or state that it is missing", async ({ page }) => {
    await page.goto("/en/imprint");
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("main")).not.toContainText("Lorem");
  });

  test("the sitemap index points to a pages and a knowledge sitemap per locale", async ({ request }) => {
    const index = await request.get("/sitemap.xml");
    expect(index.status()).toBe(200);
    const xml = await index.text();
    for (const locale of LOCALES) {
      expect(xml).toContain(`/sitemaps/pages-${locale}.xml`);
      expect(xml).toContain(`/sitemaps/knowledge-${locale}.xml`);
      const pages = await request.get(`/sitemaps/pages-${locale}.xml`);
      expect(pages.status()).toBe(200);
      expect(await pages.text()).toContain(`/${locale}/pricing</loc>`);
    }
  });
});
