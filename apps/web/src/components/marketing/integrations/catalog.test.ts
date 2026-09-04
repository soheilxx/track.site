import { describe, expect, it, vi } from "vitest";
import { AFFILIATE_PRESETS, buildIntegrationMatrix } from "@track-site/connectors";
import { DESTINATION_CLICK_IDS, DESTINATION_PURPOSE, type ConnectorType } from "@track-site/policy";
import { ALL_LOCALES } from "@/i18n/routing";
import { INTEGRATIONS, INTEGRATION_CATEGORIES, integrationModes } from "@/lib/integrations-catalog";
import { INTEGRATION_CATALOG_TEXT } from "@/lib/marketing-copy/integration-catalog";
import { INTEGRATIONS_COPY } from "@/lib/marketing-copy/integrations";
import { COPY_LOCALES } from "@/lib/marketing-copy/types";
import { countByCategory, countByMode, filterIntegrations, groupByCategory, integrationQueryToSearch, parseIntegrationQuery, relatedKnowledgeFor, searchScore, toSearchable } from "./catalog";
import { integrationText, publicIdLabel } from "./text";

vi.mock("server-only", () => ({}));

const items = INTEGRATIONS.map((i) => toSearchable(i, i.summary.en));
const bySlug = (slug: string) => items.find((i) => i.slug === slug)!;

describe("integrations catalogue vs connector registry", () => {
  const matrix = buildIntegrationMatrix();
  const destinations = INTEGRATIONS.filter((i) => i.kind === "destination");

  it("lists every registered connector type exactly once and nothing that is not registered", () => {
    expect(destinations.map((d) => d.type).sort()).toEqual(matrix.map((r) => r.type).sort());
    expect(new Set(INTEGRATIONS.map((i) => i.slug)).size).toBe(INTEGRATIONS.length);
  });

  it.each(destinations.map((d) => [d.slug, d] as const))("%s claims only what the connector implements", (_slug, entry) => {
    const row = matrix.find((r) => r.type === entry.type)!;
    expect(row, `connector ${entry.type} missing`).toBeDefined();
    expect({ browser: entry.browser, server: entry.server, offline: entry.offline }).toEqual({ browser: row.browser, server: row.server, offline: row.offline });
    expect(entry.dedupField).toBe(row.dedup === "n/a" ? null : row.dedup);
    expect(entry.clickIds).toEqual(DESTINATION_CLICK_IDS[entry.type as ConnectorType]);
    expect(entry.consentPurpose).toBe(DESTINATION_PURPOSE[entry.type as ConnectorType]);
    expect(entry.publicIds.map((p) => p.key)).toEqual(row.publicIds);
    expect(entry.credentials.map((c) => `${c.oauth ? `${c.kind} (OAuth ${c.oauth})` : c.kind}${c.optional ? " (optional)" : ""}`)).toEqual(row.credentials);
    expect(entry.apiVersion).toBe(row.apiVersion);
    expect(entry.verifiedAt).toBe(row.verifiedAt.slice(0, 10));
    expect(entry.verification).toBe(row.verifiedAt.includes("(") ? "secondary_sources" : "vendor_docs");
    if (row.accessNote) expect(entry.accessNote, `${entry.slug} must surface the vendor prerequisite`).not.toBeNull();
    if (entry.accessNote) expect(entry.access).not.toBe("open");
    if (entry.docsUrl) expect(entry.docsUrl).toBe(row.docsUrl);
    expect(entry.docsUrl === null || !entry.docsUrl.includes("track.site")).toBe(true);
  });

  it("names every affiliate network preset", () => {
    const affiliate = INTEGRATIONS.find((i) => i.type === "affiliate")!;
    expect(affiliate.presets).toEqual(Object.values(AFFILIATE_PRESETS).map((p) => p.name));
  });

  it("models shop platforms as sources with verified webhooks and no vendor click ids", () => {
    for (const s of INTEGRATIONS.filter((i) => i.kind === "source")) {
      expect(s.category).toBe("commerce");
      expect(s.server).toBe(true);
      expect(s.offline).toBe(false);
      expect(s.clickIds).toEqual([]);
      expect(s.credentials.map((c) => c.kind)).toEqual(["webhook_secret"]);
      expect(s.verification).toBe("recorded_payloads");
    }
  });

  it("has copy for every category, mode, status and credential kind in every copy locale", () => {
    for (const locale of COPY_LOCALES) {
      const c = INTEGRATIONS_COPY[locale];
      for (const cat of INTEGRATION_CATEGORIES) expect(c.categories[cat]).toBeTruthy();
      for (const i of INTEGRATIONS) {
        expect(c.verification[i.verification]).toBeTruthy();
        expect(c.access[i.access]).toBeTruthy();
        expect(c.purposes[i.consentPurpose]).toBeTruthy();
        for (const cred of i.credentials) {
          expect(c.credentialKinds[cred.kind]).toBeTruthy();
          if (cred.oauth) expect(c.oauthProviders[cred.oauth]).toBeTruthy();
        }
      }
    }
  });

  it("has a summary, prerequisite note and public-id labels for every entry in all six locales (no English fallback on a localized page)", () => {
    expect([...COPY_LOCALES]).toEqual([...ALL_LOCALES]);
    for (const locale of ALL_LOCALES) {
      const text = INTEGRATION_CATALOG_TEXT[locale];
      expect(Object.keys(text).sort(), `${locale}: exactly the catalogue slugs`).toEqual(INTEGRATIONS.map((i) => i.slug).sort());
      for (const i of INTEGRATIONS) {
        const t = integrationText(i, locale);
        expect(t.summary.trim().length, `${locale}/${i.slug} summary`).toBeGreaterThan(10);
        // the note exists in every language or in none: it is a vendor fact, not optional copy
        expect(t.accessNote === null, `${locale}/${i.slug} accessNote`).toBe(i.accessNote === null);
        if (i.accessNote) expect(t.accessNote!.trim().length).toBeGreaterThan(10);
        expect(Object.keys(t.publicIds).sort(), `${locale}/${i.slug} public ids`).toEqual(i.publicIds.map((p) => p.key).sort());
        for (const id of i.publicIds) expect(publicIdLabel(t, id.key), `${locale}/${i.slug}/${id.key}`).not.toBe(id.key);
      }
    }
    // English and German are the catalogue's own strings, never a diverging copy
    for (const i of INTEGRATIONS) {
      expect(integrationText(i, "en").summary).toBe(i.summary.en);
      expect(integrationText(i, "de").summary).toBe(i.summary.de);
      for (const id of i.publicIds) expect(publicIdLabel(integrationText(i, "de"), id.key)).toBe(id.label.de);
    }
    expect(() => integrationText({ slug: "not-in-catalogue" }, "fr")).toThrow(/not-in-catalogue/);
  });
});

describe("query parsing and serialisation", () => {
  it("round-trips a full query and drops unknown values", () => {
    const q = parseIntegrationQuery({ q: "  meta   pixel ", category: "ads,bogus,analytics", mode: "server,offline,x" });
    expect(q).toEqual({ q: "meta pixel", categories: ["ads", "analytics"], modes: ["server", "offline"] });
    expect(integrationQueryToSearch(q)).toBe("?q=meta+pixel&category=ads%2Canalytics&mode=server%2Coffline");
    expect(parseIntegrationQuery(new URLSearchParams(integrationQueryToSearch(q)))).toEqual(q);
  });

  it("returns an empty string for the empty query and caps the text length", () => {
    expect(integrationQueryToSearch(parseIntegrationQuery({}))).toBe("");
    expect(parseIntegrationQuery({ q: "a".repeat(200) }).q).toHaveLength(80);
    expect(parseIntegrationQuery({ category: ["ads", "commerce"] }).categories).toEqual(["ads"]);
  });
});

describe("search and filters", () => {
  it("finds platforms by product aliases and click ids", () => {
    expect(filterIntegrations(items, { q: "facebook", categories: [], modes: [] })[0]?.slug).toBe("meta");
    expect(filterIntegrations(items, { q: "wordpress", categories: [], modes: [] }).map((i) => i.slug)).toEqual(["woocommerce"]);
    expect(filterIntegrations(items, { q: "gclid", categories: [], modes: [] }).map((i) => i.slug).sort()).toEqual(["google-ads", "google-analytics", "google-marketing-platform"]);
    expect(filterIntegrations(items, { q: "awin", categories: [], modes: [] }).map((i) => i.slug)).toEqual(["affiliate-postbacks"]);
    expect(filterIntegrations(items, { q: "Shópify", categories: [], modes: [] }).map((i) => i.slug)).toEqual(["shopify"]);
  });

  it("ranks exact and prefix name matches above keyword matches", () => {
    expect(searchScore(bySlug("meta"), "meta")).toBeGreaterThan(searchScore(bySlug("meta"), "capi"));
    expect(searchScore(bySlug("google-ads"), "google")).toBeGreaterThan(searchScore(bySlug("google-analytics"), "gclid"));
    expect(searchScore(bySlug("meta"), "nothing here")).toBe(0);
  });

  it("combines categories with OR and modes with AND", () => {
    const ads = filterIntegrations(items, { q: "", categories: ["ads"], modes: [] });
    expect(ads.every((i) => i.category === "ads")).toBe(true);
    const adsOrCommerce = filterIntegrations(items, { q: "", categories: ["ads", "commerce"], modes: [] });
    expect(adsOrCommerce.length).toBe(ads.length + 3);
    const offlineServer = filterIntegrations(items, { q: "", categories: [], modes: ["server", "offline"] });
    expect(offlineServer.every((i) => i.modes.includes("server") && i.modes.includes("offline"))).toBe(true);
    expect(offlineServer.map((i) => i.slug)).not.toContain("webhook");
    expect(filterIntegrations(items, { q: "", categories: ["custom"], modes: ["browser"] })).toEqual([]);
  });

  it("keeps the default order by category, tier and name", () => {
    const all = filterIntegrations(items, { q: "", categories: [], modes: [] });
    expect(all).toHaveLength(items.length);
    expect(all[0]?.category).toBe("ads");
    expect(all.at(-1)?.category).toBe("custom");
    expect(groupByCategory(all).map((g) => g.category)).toEqual(["ads", "analytics", "commerce", "affiliate", "custom"]);
  });

  it("counts chips against the other active filters", () => {
    const counts = countByCategory(items, { q: "", categories: ["ads"], modes: ["offline"] });
    expect(counts.ads).toBe(items.filter((i) => i.category === "ads" && i.modes.includes("offline")).length);
    expect(counts.custom).toBe(0);
    const modeCounts = countByMode(items, { q: "", categories: ["commerce"], modes: [] });
    expect(modeCounts).toEqual({ browser: 3, server: 3, offline: 0 });
    const withServer = countByMode(items, { q: "", categories: [], modes: ["server"] });
    expect(withServer.server).toBe(items.filter((i) => i.modes.includes("server")).length);
    expect(withServer.offline).toBe(items.filter((i) => i.modes.includes("server") && i.modes.includes("offline")).length);
  });

  it("modes come from the boolean flags in catalogue order", () => {
    expect(integrationModes({ browser: true, server: true, offline: false })).toEqual(["browser", "server"]);
    expect(integrationModes({ browser: false, server: true, offline: false })).toEqual(["server"]);
  });
});

describe("related Tracking Knowledge", () => {
  const article = (over: Partial<{ platforms: string[]; shopSystems: string[]; tags: string[]; publishedAt: string; id: string }>) => ({ platforms: [], shopSystems: [], tags: [], publishedAt: "2026-01-01", id: "x", ...over });

  it("matches by platform slug, shop system or listed tag — direct matches first, newest first", () => {
    const meta = INTEGRATIONS.find((i) => i.slug === "meta")!;
    const articles = [
      article({ id: "tag-old", tags: ["meta"], publishedAt: "2026-01-01" }),
      article({ id: "platform", platforms: ["meta", "tiktok"], publishedAt: "2026-02-01" }),
      article({ id: "unrelated", tags: ["conversions-api"], platforms: ["tiktok"] }),
      article({ id: "tag-new", tags: ["meta"], publishedAt: "2026-03-01" }),
    ];
    expect(relatedKnowledgeFor(meta, articles).map((a) => a.id)).toEqual(["platform", "tag-new", "tag-old"]);
    expect(relatedKnowledgeFor(meta, articles, 1).map((a) => a.id)).toEqual(["platform"]);
    const shopify = INTEGRATIONS.find((i) => i.slug === "shopify")!;
    expect(relatedKnowledgeFor(shopify, [article({ id: "shop", shopSystems: ["shopify"] }), ...articles]).map((a) => a.id)).toEqual(["shop"]);
    expect(relatedKnowledgeFor(INTEGRATIONS.find((i) => i.slug === "webhook")!, articles)).toEqual([]);
  });

  it("every platform and shop system named in published English articles is a catalogue slug", async () => {
    const { listArticles } = await import("@/lib/knowledge");
    const slugs = new Set(INTEGRATIONS.map((i) => i.slug));
    for (const a of await listArticles("en")) {
      for (const p of [...a.platforms, ...a.shopSystems]) expect(slugs.has(p), `${a.slug} names unknown integration "${p}"`).toBe(true);
    }
  });
});
