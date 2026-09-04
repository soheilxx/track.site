import { describe, expect, it } from "vitest";
import { COPY_LOCALES, SECONDARY_COPY } from "@/lib/marketing-copy";
import { anchorId } from "./anchor";

describe("anchorId", () => {
  it("builds a readable ASCII id with the position as a uniqueness prefix", () => {
    expect(anchorId("Controller", 0)).toBe("section-1-controller");
    expect(anchorId("Zwecke und Rechtsgrundlagen", 3)).toBe("section-4-zwecke-und-rechtsgrundlagen");
    expect(anchorId("Übermittlungen außerhalb der EU", 1)).toBe("section-2-uebermittlungen-ausserhalb-der-eu");
  });

  it("never returns an empty slug and never ends with a dash", () => {
    expect(anchorId("§ 5", 6)).toBe("section-7-5");
    expect(anchorId("—", 2)).toBe("section-3");
    expect(anchorId("a".repeat(60) + " b", 0)).toMatch(/^section-1-a{48}$/);
  });
});

describe("secondary copy", () => {
  it("keeps docs guide ids unique and identical across locales", () => {
    const ids = SECONDARY_COPY.en.docs.guides.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const locale of COPY_LOCALES) expect(SECONDARY_COPY[locale].docs.guides.map((g) => g.id)).toEqual(ids);
  });

  it("uses the same code samples in every locale (only the comment is localized)", () => {
    for (const locale of COPY_LOCALES) {
      const guides = SECONDARY_COPY[locale].docs.guides;
      const install = guides.find((g) => g.id === "install")!;
      expect(install.code).toContain('data-site-id="TRACKING_ID"');
      expect(guides.find((g) => g.id === "server")!.code).toContain("POST https://api.track.site/v1/s");
    }
  });

  it("links only to locale-neutral internal paths", () => {
    for (const locale of COPY_LOCALES) {
      const c = SECONDARY_COPY[locale];
      const hrefs = [...c.support.before.items, ...c.contact.other.items].map((i) => i.href);
      for (const href of hrefs) expect(href).toMatch(/^\/[a-z-]+$/);
    }
  });

  it("does not promise a fixed number of wizard steps", () => {
    for (const locale of COPY_LOCALES) {
      const text = JSON.stringify(SECONDARY_COPY[locale].docs);
      expect(text).not.toMatch(/\b19[- ](step|Schritt)/i);
    }
  });
});
