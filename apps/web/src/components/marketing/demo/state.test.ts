import { describe, expect, it } from "vitest";
import { DEMO_CONFIG_VERSION, DEMO_INITIAL_REVEAL, DEMO_MAX_ROWS, DEMO_PLATFORMS_FIXTURE, DEMO_SCRIPT, demoTimeLabel } from "./fixtures";
import { DEMO_PLATFORMS, DEMO_VIEWS } from "./model";
import { aiRecommendation, attributionRows, createInitialState, demoMetrics, demoReducer, destinationStatus, healthParts, healthScore, latestEvent, recentEvents, type DemoAction, type DemoState } from "./state";

function run(state: DemoState, ...actions: DemoAction[]): DemoState {
  return actions.reduce(demoReducer, state);
}

function advanceTimes(state: DemoState, n: number): DemoState {
  let s = state;
  for (let i = 0; i < n; i += 1) s = demoReducer(s, { type: "advance" });
  return s;
}

describe("demo fixtures", () => {
  it("cover every platform, every view and every event name of the spec", () => {
    expect(DEMO_PLATFORMS).toEqual(["meta", "google", "tiktok", "linkedin", "reddit"]);
    expect(DEMO_VIEWS).toEqual(["overview", "events", "destinations", "ai", "attribution"]);
    expect(DEMO_PLATFORMS_FIXTURE.map((p) => p.id)).toEqual([...DEMO_PLATFORMS]);
    const names = new Set(DEMO_SCRIPT.map((e) => e.name));
    for (const n of ["PageView", "ViewContent", "AddToCart", "BeginCheckout", "Purchase", "Lead"]) expect(names.has(n as never)).toBe(true);
  });

  it("contain the real gap the AI recommendation is grounded in: a Purchase without currency", () => {
    const missing = DEMO_SCRIPT.filter((e) => e.name === "Purchase" && e.dedup !== "duplicate" && e.currency === null);
    expect(missing.length).toBeGreaterThan(0);
    expect(missing.every((e) => typeof e.value === "number")).toBe(true);
  });

  it("pair every duplicate with a preceding event of the same id from the other origin", () => {
    DEMO_SCRIPT.forEach((e, i) => {
      if (e.dedup !== "duplicate") return;
      const partner = DEMO_SCRIPT.slice(0, i).find((p) => p.eventId === e.eventId && p.dedup === "paired");
      expect(partner, e.key).toBeDefined();
      expect(partner?.origin).not.toBe(e.origin);
    });
  });

  it("use script keys that are unique and routes that only name known platforms", () => {
    expect(new Set(DEMO_SCRIPT.map((e) => e.key)).size).toBe(DEMO_SCRIPT.length);
    for (const e of DEMO_SCRIPT) for (const r of e.routes) expect(DEMO_PLATFORMS).toContain(r);
  });

  it("format deterministic clock-face labels", () => {
    expect(demoTimeLabel(0)).toBe("12:04:05");
    expect(demoTimeLabel(1)).toBe("12:04:07");
    expect(demoTimeLabel(30)).toBe("12:05:05");
  });
});

describe("initial state", () => {
  const state = createInitialState();

  it("reveals the first events so the Overview is never empty", () => {
    expect(state.events).toHaveLength(DEMO_INITIAL_REVEAL);
    expect(state.view).toBe("overview");
    expect(state.playing).toBe(true);
    expect(state.configVersion).toBe(DEMO_CONFIG_VERSION);
    expect(state.setup).toEqual({ status: "open", choice: null, released: 0 });
  });

  it("is identical on every call (deterministic fixtures)", () => {
    expect(createInitialState()).toEqual(state);
  });

  it("derives outcomes and reasons from consent, dedup and parameters", () => {
    const byKey = Object.fromEntries(state.events.map((e) => [e.key.replace(/#.*$/, ""), e]));
    expect(byKey["pv-1"]).toMatchObject({ outcome: "delivered", reason: "delivered", destinations: ["google", "meta"], time: "12:04:07" });
    expect(byKey["pv-2"]).toMatchObject({ outcome: "blocked", reason: "consent_denied", destinations: [] });
    expect(byKey["pu-1s"]).toMatchObject({ outcome: "held", reason: "missing_currency", currency: null, value: 129 });
    expect(byKey["pu-1b"]).toMatchObject({ outcome: "duplicate", reason: "duplicate", dedup: "duplicate" });
  });

  it("counts the metrics from the revealed rows", () => {
    expect(demoMetrics(state)).toEqual({ accepted: 6, delivered: 4, duplicates: 1, blocked: 1, held: 1 });
  });

  it("explains the health score through its parts", () => {
    const parts = healthParts(state);
    expect(parts.map((p) => [p.id, p.value])).toEqual([
      ["consent", 100],
      ["dedup", 100],
      ["params", 0],
      ["delivery", 80],
    ]);
    expect(parts.find((p) => p.id === "params")?.vars).toEqual({ complete: 0, purchases: 1, missing: 1 });
    expect(healthScore(parts)).toEqual({ score: 70, tone: "warn" });
  });

  it("grounds the AI recommendation in the held Purchase", () => {
    const rec = aiRecommendation(state);
    expect(rec.count).toBe(1);
    expect(rec.evidence.map((e) => e.name)).toEqual(["Purchase"]);
  });

  it("reports destination health and the last delivery per platform", () => {
    expect(destinationStatus(state, "tiktok")).toMatchObject({ tone: "warn", heldCurrency: 1, delivered: 2 });
    expect(destinationStatus(state, "google")).toMatchObject({ tone: "warn", delivered: 3, heldCurrency: 1, blocked: 1 });
    expect(destinationStatus(state, "google").lastDelivery?.name).toBe("BeginCheckout");
    expect(destinationStatus(state, "linkedin")).toMatchObject({ tone: "ok", delivered: 0, lastDelivery: null });
  });

  it("only reports click ids that were actually observed", () => {
    const rows = Object.fromEntries(attributionRows(state).map((r) => [r.id, r]));
    expect(rows.google).toEqual({ id: "google", captured: true, consent: "granted", forwarded: true });
    expect(rows.linkedin).toEqual({ id: "linkedin", captured: false, consent: null, forwarded: false });
  });
});

describe("stream", () => {
  it("advances deterministically", () => {
    const a = advanceTimes(createInitialState(), 5);
    const b = advanceTimes(createInitialState(), 5);
    expect(a.events).toEqual(b.events);
    expect(latestEvent(a)?.key).toBe("pu-2s#0");
    expect(recentEvents(a, 3).map((e) => e.key)).toEqual(["pu-2s#0", "atc-2#0", "vc-2#0"]);
  });

  it("holds events with a pending consent decision", () => {
    const s = advanceTimes(createInitialState(), 3);
    expect(latestEvent(s)).toMatchObject({ name: "ViewContent", outcome: "held", reason: "consent_pending" });
    expect(healthParts(s).find((p) => p.id === "consent")?.value).toBe(88);
  });

  it("loops the script with a new cycle and keeps counting after rows fall off", () => {
    let s = createInitialState();
    s = advanceTimes(s, DEMO_SCRIPT.length * 2);
    expect(s.cycle).toBe(2);
    expect(s.cursor).toBe(DEMO_INITIAL_REVEAL);
    expect(s.events.length).toBe(DEMO_MAX_ROWS);
    expect(new Set(s.events.map((e) => e.key)).size).toBe(DEMO_MAX_ROWS);
    expect(s.stats.accepted).toBe(demoMetrics(createInitialState()).accepted + 2 * DEMO_SCRIPT.filter((e) => e.dedup !== "duplicate").length);
  });

  it("drops the expanded row when it leaves the window", () => {
    let s = run(createInitialState(), { type: "expand", key: "pv-1#0" });
    expect(s.expanded).toBe("pv-1#0");
    s = advanceTimes(s, DEMO_MAX_ROWS);
    expect(s.expanded).toBeNull();
  });
});

describe("guided setup step", () => {
  it("requires a choice before confirming", () => {
    const s = createInitialState();
    expect(demoReducer(s, { type: "confirm" })).toBe(s);
  });

  it("releases held Purchases, completes the parameters and publishes the next config version", () => {
    const before = createInitialState();
    const s = run(before, { type: "choose", currency: "EUR" }, { type: "confirm" });
    expect(s.setup).toEqual({ status: "confirmed", choice: "EUR", released: 1 });
    expect(s.configVersion).toBe(DEMO_CONFIG_VERSION + 1);
    expect(s.defaultCurrency).toBe("EUR");
    const released = s.events.find((e) => e.key === "pu-1s#0");
    expect(released).toMatchObject({ outcome: "delivered", reason: "released", currency: "EUR", destinations: ["meta", "google", "tiktok"] });
    expect(demoMetrics(s)).toEqual({ accepted: 6, delivered: 5, duplicates: 1, blocked: 1, held: 0 });
    expect(healthParts(s).map((p) => p.value)).toEqual([100, 100, 100, 100]);
    expect(healthScore(healthParts(s))).toEqual({ score: 100, tone: "ok" });
    expect(aiRecommendation(s)).toEqual({ count: 0, evidence: [] });
    expect(destinationStatus(s, "tiktok").tone).toBe("ok");
  });

  it("applies the default currency to later Purchases and ignores further choices once confirmed", () => {
    let s = run(createInitialState(), { type: "choose", currency: "USD" }, { type: "confirm" });
    s = advanceTimes(s, DEMO_SCRIPT.length);
    const nextCycle = s.events.find((e) => e.key === "pu-1s#1");
    expect(nextCycle).toMatchObject({ outcome: "delivered", reason: "delivered", currency: "USD" });
    expect(s.stats.heldCurrency).toBe(0);
    expect(demoReducer(s, { type: "choose", currency: "GBP" })).toBe(s);
  });
});

describe("controls", () => {
  it("switches views and platforms and toggles play", () => {
    let s = run(createInitialState(), { type: "view", view: "destinations" }, { type: "platform", platform: "reddit" }, { type: "play", playing: false });
    expect(s).toMatchObject({ view: "destinations", platform: "reddit", playing: false });
    const same = demoReducer(s, { type: "view", view: "destinations" });
    expect(same).toBe(s);
    s = demoReducer(s, { type: "play", playing: true });
    expect(s.playing).toBe(true);
  });

  it("reset returns to the initial state and counts the reset", () => {
    let s = run(createInitialState(), { type: "view", view: "ai" }, { type: "choose", currency: "EUR" }, { type: "confirm" }, { type: "play", playing: false });
    s = advanceTimes(s, 9);
    const reset = demoReducer(s, { type: "reset" });
    expect(reset).toEqual({ ...createInitialState(), resets: 1 });
    expect(demoReducer(reset, { type: "reset" }).resets).toBe(2);
  });
});
