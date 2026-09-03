import { beforeEach, describe, expect, it } from "vitest";
import { ClickIdStore } from "./storage.ts";

describe("ClickIdStore", () => {
  beforeEach(() => localStorage.clear());
  it("keeps landing-page click ids for later events until the ttl and lets newer ids win", () => {
    const store = new ClickIdStore();
    const day = 86_400_000;
    expect(store.merge({ gclid: "g1" }, 90 * day, 1_000)).toEqual({ gclid: "g1" });
    expect(store.merge({}, 90 * day, 1_000 + day)).toEqual({ gclid: "g1" });
    expect(new ClickIdStore().merge({ fbclid: "f1" }, 90 * day, 1_000 + 2 * day)).toEqual({ gclid: "g1", fbclid: "f1" });
    expect(store.merge({ gclid: "g2" }, 90 * day, 1_000 + 3 * day)).toEqual({ gclid: "g2", fbclid: "f1" });
    // fbclid (day 2) expires after 90 days, gclid was refreshed on day 3 and lives one day longer
    expect(store.merge({}, 90 * day, 1_000 + 93 * day)).toEqual({ gclid: "g2" });
    expect(store.merge({}, 90 * day, 1_000 + 200 * day)).toEqual({});
    expect(localStorage.getItem("_ts_cid")).toBeNull();
  });
  it("clears everything on withdrawal", () => {
    const store = new ClickIdStore();
    store.merge({ ttclid: "t1" }, 1_000_000, 5);
    expect(localStorage.getItem("_ts_cid")).not.toBeNull();
    store.clear();
    expect(store.merge({}, 1_000_000, 6)).toEqual({});
    expect(localStorage.getItem("_ts_cid")).toBeNull();
  });
});
