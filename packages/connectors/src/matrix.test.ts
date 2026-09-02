import { describe, expect, it } from "vitest";
import { CONNECTOR_TYPES } from "@track-site/policy";
import { buildIntegrationMatrix, renderIntegrationMatrix } from "./matrix.ts";
import { availableConnectorTypes, getConnector } from "./registry.ts";
import { AFFILIATE_PRESETS } from "./vendors/affiliate-presets.ts";
import { unverifiedPins } from "./versions.ts";

describe("integration matrix", () => {
  it("registers every connector type from the policy matrix", () => {
    expect(availableConnectorTypes().sort()).toEqual([...CONNECTOR_TYPES].sort());
    expect(CONNECTOR_TYPES).toHaveLength(22);
  });

  it("every destination has a server path, documentation, valid id patterns and a verified API pin", () => {
    const rows = buildIntegrationMatrix();
    for (const row of rows) {
      const c = getConnector(row.type)!;
      expect(row.server, row.type).toBe(true);
      if (row.type !== "webhook" && row.type !== "affiliate") expect(row.browser, row.type).toBe(true);
      expect(row.docsUrl, row.type).toMatch(/^https:\/\//);
      expect(row.verifiedAt, row.type).not.toBe("pending");
      for (const p of c.meta.requiredPublicIds) {
        expect(() => new RegExp(p.pattern), `${row.type}.${p.key}`).not.toThrow();
        if (p.example) expect(new RegExp(p.pattern).test(p.example), `${row.type}.${p.key} example`).toBe(true);
      }
      expect(typeof c.mapEvent).toBe("function");
      expect(typeof c.validateCredentials).toBe("function");
      expect(typeof c.getHealth).toBe("function");
    }
  });

  it("documents secondary-source verifications explicitly", () => {
    expect(unverifiedPins().sort()).toEqual(["amazon", "quora", "tradedesk"]);
  });

  it("covers all supplement affiliate networks", () => {
    for (const id of ["awin", "cj", "impact", "tradetracker", "tradedoubler", "partnerize", "rakuten", "webgains", "digistore24", "adcell", "belboon", "tune", "everflow"]) expect(AFFILIATE_PRESETS[id], id).toBeDefined();
  });

  it("renders markdown with one row per destination", () => {
    const md = renderIntegrationMatrix();
    for (const t of CONNECTOR_TYPES) expect(md).toContain(`\`${t}\``);
    expect(md).toContain("## Affiliate presets");
  });
});
