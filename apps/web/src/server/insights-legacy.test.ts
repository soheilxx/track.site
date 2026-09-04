import { describe, expect, it } from "vitest";
import { INSIGHTS_AUDIENCES_PATH, legacyAudiencesTarget } from "./insights-legacy";

const SITE = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("legacyAudiencesTarget", () => {
  it("sends a bare /app/audiences to the moved page", () => {
    expect(legacyAudiencesTarget({})).toBe("/app/insights/audiences");
    expect(INSIGHTS_AUDIENCES_PATH).toBe("/app/insights/audiences");
  });

  it("carries a well-formed site id over", () => {
    expect(legacyAudiencesTarget({ site: SITE })).toBe(`/app/insights/audiences?site=${SITE}`);
    expect(legacyAudiencesTarget({ site: SITE.toUpperCase() })).toBe(
      `/app/insights/audiences?site=${SITE}`,
    );
  });

  it("takes the first value of a repeated parameter", () => {
    expect(legacyAudiencesTarget({ site: [SITE, "other"] })).toBe(
      `/app/insights/audiences?site=${SITE}`,
    );
  });

  it("drops malformed ids and unknown parameters instead of forwarding them", () => {
    expect(legacyAudiencesTarget({ site: "not-a-uuid" })).toBe("/app/insights/audiences");
    expect(legacyAudiencesTarget({ site: "../etc" })).toBe("/app/insights/audiences");
    expect(legacyAudiencesTarget({ site: "" })).toBe("/app/insights/audiences");
    expect(legacyAudiencesTarget({ site: undefined, foo: "bar" })).toBe("/app/insights/audiences");
    expect(legacyAudiencesTarget({ site: [] })).toBe("/app/insights/audiences");
  });
});
