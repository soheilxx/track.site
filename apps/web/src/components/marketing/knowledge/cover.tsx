import type { ReactNode } from "react";
import type { TopicId } from "@/lib/knowledge";

/**
 * Cover family of Tracking Knowledge (supplement §6 "Visuelle Knowledge-Sprache"): one art-direction
 * key per topic — a restrained palette from the design tokens plus a motif from the data-flow
 * vocabulary (signals, nodes, routing lines, consent gates, destinations, windows, versions) — with a
 * deterministic per-article variation derived from a hash of the `translationGroupId`, so every
 * language version of an article shares its cover while the 30 articles stay visually distinct.
 *
 * SVG only, no text, no hooks, no external dependencies:
 *   - `size: "card" | "hero"` paints with the design tokens (`var(--color-*)`), so the same cover
 *     renders on light, dark and inside a product stage;
 *   - `size: "social"` paints with the light hex palette and explicit pixel dimensions, so the
 *     opengraph-image route can drop it into `next/og`'s ImageResponse (Satori: no CSS variables,
 *     no classes, no hooks, no <text>).
 *
 * Decorative unless `title` is given (then `role="img"` with an accessible name). The information a
 * cover carries — the topic — is always in text next to it.
 */
export type CoverSize = "card" | "hero" | "social";

export interface CoverProps {
  topic: TopicId;
  /** `translationGroupId` — the seed of the per-article variation (identical for every locale). */
  groupId: string;
  /** Accessible name (usually the localized `coverAlt`); omit for decorative use next to the title. */
  title?: string;
  size: CoverSize;
  className?: string;
}

export const COVER_SIZES: Record<CoverSize, { width: number; height: number }> = {
  card: { width: 480, height: 300 },
  hero: { width: 1200, height: 640 },
  social: { width: 600, height: 630 },
};

/* ---------- palette ---------- */

type Token =
  | "ground"
  | "surface"
  | "surface-2"
  | "ink"
  | "ink-2"
  | "ink-3"
  | "line"
  | "line-2"
  | "primary"
  | "primary-strong"
  | "primary-soft"
  | "primary-soft-2"
  | "violet"
  | "violet-soft"
  | "violet-soft-2"
  | "cyan"
  | "cyan-strong"
  | "cyan-soft"
  | "cyan-soft-2"
  | "ok"
  | "ok-soft"
  | "warn"
  | "warn-soft"
  | "bad"
  | "bad-soft";

/** Light-theme values of the tokens (docs/12 §1) for the social size, where CSS variables are unavailable. */
const HEX: Record<Token, string> = {
  ground: "#f7f7f5",
  surface: "#ffffff",
  "surface-2": "#f1f1ef",
  ink: "#0a0a0a",
  "ink-2": "#3f3f46",
  "ink-3": "#62626b",
  line: "#e4e4e7",
  "line-2": "#d4d4d8",
  primary: "#1f4fe0",
  "primary-strong": "#173fbf",
  "primary-soft": "#eaf0ff",
  "primary-soft-2": "#d6e0ff",
  violet: "#6d3df5",
  "violet-soft": "#f3efff",
  "violet-soft-2": "#e6dcff",
  cyan: "#0aa5c2",
  "cyan-strong": "#086f86",
  "cyan-soft": "#e6f7fa",
  "cyan-soft-2": "#cdeff5",
  ok: "#15803d",
  "ok-soft": "#ecfdf3",
  warn: "#b45309",
  "warn-soft": "#fffbeb",
  bad: "#b91c1c",
  "bad-soft": "#fef2f2",
};

type Motif = "first-signal" | "fan-out" | "dual-lane" | "order-pairing" | "gates" | "windows" | "health-arc" | "reroute" | "versions";

export interface CoverArtDirection {
  ground: Token;
  accent: Token;
  accentSoft: Token;
  motif: Motif;
}

/** One art-direction key per topic: ground tone, accent (cobalt by default; cyan for flow topics; violet only for the AI topic) and motif. */
export const COVER_ART: Record<TopicId, CoverArtDirection> = {
  "getting-started": { ground: "primary-soft", accent: "primary", accentSoft: "primary-soft-2", motif: "first-signal" },
  "pixel-platform-integrations": { ground: "surface-2", accent: "primary", accentSoft: "primary-soft", motif: "fan-out" },
  "server-side-tracking": { ground: "cyan-soft", accent: "cyan", accentSoft: "cyan-soft-2", motif: "dual-lane" },
  "ecommerce-tracking": { ground: "surface", accent: "primary", accentSoft: "primary-soft", motif: "order-pairing" },
  "consent-privacy": { ground: "ground", accent: "ink-2", accentSoft: "surface-2", motif: "gates" },
  "attribution-analytics": { ground: "surface-2", accent: "cyan-strong", accentSoft: "cyan-soft", motif: "windows" },
  "ai-data-quality": { ground: "violet-soft", accent: "violet", accentSoft: "violet-soft-2", motif: "health-arc" },
  troubleshooting: { ground: "surface", accent: "ink-2", accentSoft: "surface-2", motif: "reroute" },
  "product-updates": { ground: "primary-soft-2", accent: "primary-strong", accentSoft: "primary-soft", motif: "versions" },
};

/* ---------- deterministic variation ---------- */

/** FNV-1a 32-bit hash of the group id (stable across locales and builds). */
export function hashGroupId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

interface Rng {
  next(): number;
  int(n: number): number;
  range(min: number, max: number): number;
}

function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (n) => Math.floor(next() * n), range: (min, max) => min + next() * (max - min) };
}

/* ---------- geometry helpers ---------- */

interface Pt {
  x: number;
  y: number;
}

interface Scene {
  w: number;
  h: number;
  /** Uniform scale for strokes and radii (1 at the card size). */
  s: number;
  p: (token: Token) => string;
  art: CoverArtDirection;
  rnd: Rng;
}

function curveH(from: Pt, to: Pt): string {
  const mx = (from.x + to.x) / 2;
  return `M ${r(from.x)} ${r(from.y)} C ${r(mx)} ${r(from.y)}, ${r(mx)} ${r(to.y)}, ${r(to.x)} ${r(to.y)}`;
}

function cubicPoint(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

/** Point at `t` on the S-curve produced by `curveH`. */
function pointOnCurveH(from: Pt, to: Pt, t: number): Pt {
  const mx = (from.x + to.x) / 2;
  return cubicPoint(from, { x: mx, y: from.y }, { x: mx, y: to.y }, to, t);
}

function r(n: number): number {
  return Math.round(n * 10) / 10;
}

function node(key: string, x: number, y: number, w: number, h: number, fill: string, stroke: string, sw: number, radius: number): ReactNode {
  return <rect key={key} x={r(x)} y={r(y)} width={r(w)} height={r(h)} rx={r(radius)} fill={fill} stroke={stroke} strokeWidth={r(sw)} />;
}

function dot(key: string, c: Pt, radius: number, fill: string, opacity = 1): ReactNode {
  return <circle key={key} cx={r(c.x)} cy={r(c.y)} r={r(radius)} fill={fill} opacity={opacity} />;
}

function ring(key: string, c: Pt, radius: number, stroke: string, sw: number, opacity = 0.4): ReactNode {
  return <circle key={key} cx={r(c.x)} cy={r(c.y)} r={r(radius)} fill="none" stroke={stroke} strokeWidth={r(sw)} opacity={opacity} />;
}

function line(key: string, a: Pt, b: Pt, stroke: string, sw: number, dashed = false, opacity = 1): ReactNode {
  return <line key={key} x1={r(a.x)} y1={r(a.y)} x2={r(b.x)} y2={r(b.y)} stroke={stroke} strokeWidth={r(sw)} strokeLinecap="round" strokeDasharray={dashed ? `${r(sw * 4)} ${r(sw * 4)}` : undefined} opacity={opacity} />;
}

function path(key: string, d: string, stroke: string, sw: number, dashed = false, opacity = 1): ReactNode {
  return <path key={key} d={d} fill="none" stroke={stroke} strokeWidth={r(sw)} strokeLinecap="round" strokeDasharray={dashed ? `${r(sw * 4)} ${r(sw * 4)}` : undefined} opacity={opacity} />;
}

/** Destination chip: pill with a health dot. */
function chip(key: string, x: number, y: number, w: number, h: number, sc: Scene, health: Token): ReactNode {
  return (
    <g key={key}>
      {node(`${key}-b`, x, y, w, h, sc.p("surface"), sc.p("line-2"), 1.5 * sc.s, h / 2)}
      <rect x={r(x + h * 0.4)} y={r(y + h * 0.36)} width={r(w * 0.42)} height={r(h * 0.28)} rx={r(h * 0.14)} fill={sc.p("line-2")} />
      {dot(`${key}-d`, { x: x + w - h * 0.55, y: y + h / 2 }, h * 0.14, sc.p(health))}
    </g>
  );
}

/** Consent gate: diamond with a glyph for the state (colour AND shape carry the state). */
function gate(key: string, c: Pt, size: number, state: "granted" | "denied" | "pending", sc: Scene): ReactNode {
  const half = size / 2;
  const tone: Token = state === "granted" ? "ok" : state === "denied" ? "bad" : "warn";
  const soft: Token = state === "granted" ? "ok-soft" : state === "denied" ? "bad-soft" : "warn-soft";
  const g = size * 0.22;
  const sw = 2.2 * sc.s;
  return (
    <g key={key}>
      <path d={`M ${r(c.x)} ${r(c.y - half)} L ${r(c.x + half)} ${r(c.y)} L ${r(c.x)} ${r(c.y + half)} L ${r(c.x - half)} ${r(c.y)} Z`} fill={sc.p(soft)} stroke={sc.p(tone)} strokeWidth={r(1.5 * sc.s)} />
      {state === "granted" ? path(`${key}-g`, `M ${r(c.x - g)} ${r(c.y)} L ${r(c.x - g * 0.25)} ${r(c.y + g * 0.7)} L ${r(c.x + g)} ${r(c.y - g * 0.7)}`, sc.p(tone), sw) : null}
      {state === "denied" ? (
        <g>
          {line(`${key}-x1`, { x: c.x - g * 0.8, y: c.y - g * 0.8 }, { x: c.x + g * 0.8, y: c.y + g * 0.8 }, sc.p(tone), sw)}
          {line(`${key}-x2`, { x: c.x + g * 0.8, y: c.y - g * 0.8 }, { x: c.x - g * 0.8, y: c.y + g * 0.8 }, sc.p(tone), sw)}
        </g>
      ) : null}
      {state === "pending" ? dot(`${key}-p`, c, g * 0.45, sc.p(tone)) : null}
    </g>
  );
}

/* ---------- motifs ---------- */

/** Getting started: one website node, the Track core, one destination — the first signal on its way. */
function firstSignal(sc: Scene): ReactNode[] {
  const { w, h, s, p, art, rnd } = sc;
  const nw = 92 * s;
  const nh = 42 * s;
  const offset = rnd.range(-0.12, 0.12) * h;
  const site = { x: 0.1 * w, y: 0.5 * h + offset };
  const core = { x: 0.5 * w, y: 0.5 * h };
  const dest = { x: 0.82 * w, y: 0.5 * h - offset };
  const e1 = { from: { x: site.x + nw, y: site.y }, to: { x: core.x - nw / 2, y: core.y } };
  const e2 = { from: { x: core.x + nw / 2, y: core.y }, to: { x: dest.x, y: dest.y } };
  const signals = 2 + rnd.int(3);
  const out: ReactNode[] = [
    path("e1", curveH(e1.from, e1.to), p(art.accent), 2 * s),
    path("e2", curveH(e2.from, e2.to), p(art.accent), 2 * s, true, 0.6),
    node("site", site.x, site.y - nh / 2, nw, nh, p("surface"), p("line-2"), 1.5 * s, 10 * s),
    node("core", core.x - nw / 2, core.y - nh / 2, nw, nh, p(art.accent), p(art.accent), 1.5 * s, 10 * s),
    chip("dest", dest.x, dest.y - 15 * s, 0.14 * w, 30 * s, sc, "ok"),
  ];
  for (let i = 0; i < signals; i += 1) {
    const c = pointOnCurveH(e1.from, e1.to, 0.15 + (0.7 * (i + 0.5)) / signals);
    out.push(dot(`s${i}`, c, 5 * s, p(art.accent)));
    if (i === signals - 1) out.push(ring(`r${i}`, c, 11 * s, p(art.accent), 1.5 * s));
  }
  out.push(dot("core-dot", core, 6 * s, p("surface")));
  return out;
}

/** Pixel & platform integrations: the Track core fans out to several destinations. */
function fanOut(sc: Scene): ReactNode[] {
  const { w, h, s, p, art, rnd } = sc;
  const nw = 92 * s;
  const nh = 42 * s;
  const core = { x: 0.24 * w, y: 0.5 * h };
  const chips = 3 + rnd.int(3);
  const chipW = 0.2 * w;
  const chipH = 28 * s;
  const spread = chips === 3 ? 0.56 : 0.66;
  const quiet = rnd.int(chips);
  const out: ReactNode[] = [];
  for (let i = 0; i < chips; i += 1) {
    const y = h * (0.5 - spread / 2 + (spread * i) / (chips - 1));
    const from = { x: core.x + nw / 2, y: core.y };
    const to = { x: 0.68 * w, y };
    out.push(path(`e${i}`, curveH(from, to), p(art.accent), 1.8 * s, i === quiet, i === quiet ? 0.45 : 0.85));
    out.push(chip(`c${i}`, to.x, y - chipH / 2, chipW, chipH, sc, i === quiet ? "ink-3" : "ok"));
    if (i !== quiet && rnd.next() > 0.4) out.push(dot(`d${i}`, pointOnCurveH(from, to, rnd.range(0.3, 0.75)), 4.5 * s, p(art.accent)));
  }
  out.push(node("core", core.x - nw / 2, core.y - nh / 2, nw, nh, p(art.accent), p(art.accent), 1.5 * s, 10 * s));
  out.push(dot("core-dot", core, 6 * s, p("surface")));
  return out;
}

/** Server-side tracking: a dashed browser lane loses signals, the solid server lane carries them through. */
function dualLane(sc: Scene): ReactNode[] {
  const { w, h, s, p, art, rnd } = sc;
  const nw = 84 * s;
  const nh = 42 * s;
  const gap = rnd.range(0.22, 0.3) * h;
  const top = 0.5 * h - gap / 2;
  const bottom = 0.5 * h + gap / 2;
  const left = { x: 0.1 * w, y: 0.5 * h };
  const right = { x: 0.9 * w - nw, y: 0.5 * h };
  const x1 = left.x + nw;
  const x2 = right.x;
  const browserDots = 2 + rnd.int(2);
  const serverDots = 3 + rnd.int(2);
  const out: ReactNode[] = [
    path("lane-b", `M ${r(x1)} ${r(left.y)} C ${r(x1 + 40 * s)} ${r(top)}, ${r(x2 - 40 * s)} ${r(top)}, ${r(x2)} ${r(right.y)}`, p("ink-3"), 1.6 * s, true, 0.55),
    path("lane-s", `M ${r(x1)} ${r(left.y)} C ${r(x1 + 40 * s)} ${r(bottom)}, ${r(x2 - 40 * s)} ${r(bottom)}, ${r(x2)} ${r(right.y)}`, p(art.accent), 2.2 * s),
    node("site", left.x, left.y - nh / 2, nw, nh, p("surface"), p("line-2"), 1.5 * s, 10 * s),
    node("core", right.x, right.y - nh / 2, nw, nh, p(art.accent), p(art.accent), 1.5 * s, 10 * s),
    dot("core-dot", { x: right.x + nw / 2, y: right.y }, 6 * s, p("surface")),
  ];
  for (let i = 0; i < browserDots; i += 1) {
    const t = 0.2 + (0.6 * i) / Math.max(1, browserDots - 1);
    const c = cubicPoint({ x: x1, y: left.y }, { x: x1 + 40 * s, y: top }, { x: x2 - 40 * s, y: top }, { x: x2, y: right.y }, t);
    out.push(dot(`b${i}`, c, 4.5 * s, p("ink-3"), i === browserDots - 1 ? 0.3 : 0.7));
  }
  for (let i = 0; i < serverDots; i += 1) {
    const t = 0.15 + (0.7 * i) / Math.max(1, serverDots - 1);
    const c = cubicPoint({ x: x1, y: left.y }, { x: x1 + 40 * s, y: bottom }, { x: x2 - 40 * s, y: bottom }, { x: x2, y: right.y }, t);
    out.push(dot(`s${i}`, c, 5 * s, p(art.accent)));
  }
  return out;
}

/** Ecommerce tracking: a purchase event paired with the verified order (receipt) by its order id. */
function orderPairing(sc: Scene): ReactNode[] {
  const { w, h, s, p, art, rnd } = sc;
  const ev = 64 * s;
  const event = { x: 0.16 * w, y: 0.5 * h - ev / 2 };
  const rw = 0.24 * w;
  const rh = 0.56 * h;
  const receipt = { x: 0.6 * w, y: 0.22 * h };
  const lines = 3 + rnd.int(2);
  const out: ReactNode[] = [
    node("event", event.x, event.y, ev, ev, p(art.accentSoft), p(art.accent), 1.5 * s, 14 * s),
    dot("event-dot", { x: event.x + ev / 2, y: event.y + ev / 2 }, 9 * s, p(art.accent)),
    node("receipt", receipt.x, receipt.y, rw, rh, p("surface"), p("line-2"), 1.5 * s, 8 * s),
  ];
  for (let i = 0; i < lines; i += 1) {
    const y = receipt.y + rh * (0.2 + (0.5 * i) / lines);
    const len = rw * (i === 0 ? 0.55 : rnd.range(0.35, 0.7));
    out.push(line(`l${i}`, { x: receipt.x + rw * 0.14, y }, { x: receipt.x + rw * 0.14 + len, y }, p("line-2"), 3 * s));
  }
  const idY = receipt.y + rh * 0.82;
  out.push(line("id", { x: receipt.x + rw * 0.14, y: idY }, { x: receipt.x + rw * 0.6, y: idY }, p(art.accent), 3 * s));
  const pairY = 0.5 * h;
  const a = { x: event.x + ev + 10 * s, y: pairY };
  const b = { x: receipt.x - 10 * s, y: pairY };
  out.push(line("p1", { x: a.x, y: pairY - 5 * s }, { x: b.x, y: pairY - 5 * s }, p(art.accent), 2 * s, true, 0.7));
  out.push(line("p2", { x: a.x, y: pairY + 5 * s }, { x: b.x, y: pairY + 5 * s }, p(art.accent), 2 * s, true, 0.7));
  const mid = { x: (a.x + b.x) / 2, y: pairY };
  out.push(node("key", mid.x - 22 * s, mid.y - 12 * s, 44 * s, 24 * s, p(art.accent), p(art.accent), 1.5 * s, 12 * s));
  out.push(dot("k1", { x: mid.x - 8 * s, y: mid.y }, 3 * s, p("surface")));
  out.push(dot("k2", { x: mid.x, y: mid.y }, 3 * s, p("surface")));
  out.push(dot("k3", { x: mid.x + 8 * s, y: mid.y }, 3 * s, p("surface")));
  return out;
}

/** Consent & privacy: signals pass a row of consent gates; a denied gate ends the route. */
function gates(sc: Scene): ReactNode[] {
  const { w, h, s, p, rnd } = sc;
  const states: Array<"granted" | "denied" | "pending"> = ["granted", "pending", "denied"];
  for (let i = states.length - 1; i > 0; i -= 1) {
    const j = rnd.int(i + 1);
    const tmp = states[i]!;
    states[i] = states[j]!;
    states[j] = tmp;
  }
  const y = 0.5 * h;
  const xs = [0.28, 0.5, 0.72].map((f) => f * w);
  const denied = states.indexOf("denied");
  const size = 46 * s;
  const out: ReactNode[] = [];
  const stopX = denied >= 0 ? xs[denied]! : 0.92 * w;
  out.push(line("route", { x: 0.08 * w, y }, { x: stopX, y }, p("ink-2"), 1.8 * s));
  if (denied >= 0 && stopX < 0.92 * w) out.push(line("blocked", { x: stopX + size / 2, y }, { x: 0.92 * w, y }, p("ink-3"), 1.6 * s, true, 0.4));
  states.forEach((state, i) => out.push(gate(`g${i}`, { x: xs[i]!, y }, size, state, sc)));
  out.push(dot("s0", { x: 0.16 * w, y }, 5 * s, p("ink-2")));
  if (denied !== 0) out.push(dot("s1", { x: (xs[0]! + xs[1]!) / 2, y }, 5 * s, p("ink-2")));
  out.push(dot("s2", { x: 0.92 * w, y }, 5 * s, p("ink-3"), denied >= 0 ? 0.35 : 1));
  return out;
}

/** Attribution & analytics: click ids on a timeline with attribution windows. */
function windows(sc: Scene): ReactNode[] {
  const { w, h, s, p, art, rnd } = sc;
  const axisY = 0.7 * h;
  const x0 = 0.1 * w;
  const x1 = 0.9 * w;
  const ticks = 8;
  const step = (x1 - x0) / ticks;
  const out: ReactNode[] = [line("axis", { x: x0, y: axisY }, { x: x1, y: axisY }, p("ink-3"), 1.6 * s)];
  for (let i = 0; i <= ticks; i += 1) out.push(line(`t${i}`, { x: x0 + step * i, y: axisY }, { x: x0 + step * i, y: axisY + 7 * s }, p("ink-3"), 1.4 * s, false, 0.7));
  const count = 2 + rnd.int(2);
  const used = new Set<number>();
  for (let i = 0; i < count; i += 1) {
    const start = rnd.int(ticks - 2);
    const len = 2 + rnd.int(3);
    const top = axisY - h * (0.16 + i * 0.13);
    const height = 0.09 * h;
    out.push(node(`w${i}`, x0 + step * start, top, step * Math.min(len, ticks - start), height, p(art.accentSoft), p(art.accent), 1.5 * s, 6 * s));
    used.add(start);
  }
  for (const start of used) out.push(dot(`c${start}`, { x: x0 + step * start, y: axisY }, 5 * s, p(art.accent)));
  const first = Math.min(...used);
  out.push(ring("ring", { x: x0 + step * first, y: axisY }, 11 * s, p(art.accent), 1.5 * s));
  return out;
}

/** AI & data quality: the health arc with its components, around the Track core. */
function healthArc(sc: Scene): ReactNode[] {
  const { w, h, s, p, art, rnd } = sc;
  const c = { x: 0.5 * w, y: 0.58 * h };
  const radius = Math.min(w, h) * 0.34;
  const segments = 6;
  const start = Math.PI * 1.1;
  const sweep = Math.PI * 1.2;
  const gap = 0.05;
  const filled = 3 + rnd.int(3);
  const order = Array.from({ length: segments }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = rnd.int(i + 1);
    const tmp = order[i]!;
    order[i] = order[j]!;
    order[j] = tmp;
  }
  const active = new Set(order.slice(0, filled));
  const out: ReactNode[] = [];
  for (let i = 0; i < segments; i += 1) {
    const a0 = start + (sweep * i) / segments + gap;
    const a1 = start + (sweep * (i + 1)) / segments - gap;
    const p0 = { x: c.x + radius * Math.cos(a0), y: c.y + radius * Math.sin(a0) };
    const p1 = { x: c.x + radius * Math.cos(a1), y: c.y + radius * Math.sin(a1) };
    out.push(path(`a${i}`, `M ${r(p0.x)} ${r(p0.y)} A ${r(radius)} ${r(radius)} 0 0 1 ${r(p1.x)} ${r(p1.y)}`, active.has(i) ? p(art.accent) : p("line-2"), 8 * s));
  }
  const nw = 88 * s;
  const nh = 40 * s;
  out.push(node("core", c.x - nw / 2, c.y - nh / 2, nw, nh, p("surface"), p(art.accent), 1.5 * s, 10 * s));
  out.push(dot("d1", { x: c.x - 14 * s, y: c.y }, 4 * s, p(art.accent)));
  out.push(dot("d2", { x: c.x, y: c.y }, 4 * s, p(art.accent), 0.7));
  out.push(dot("d3", { x: c.x + 14 * s, y: c.y }, 4 * s, p(art.accent), 0.4));
  return out;
}

/** Troubleshooting: a broken direct route and the repaired one arching around it. */
function reroute(sc: Scene): ReactNode[] {
  const { w, h, s, p, art, rnd } = sc;
  const nw = 84 * s;
  const nh = 42 * s;
  const y = 0.58 * h;
  const left = { x: 0.1 * w, y };
  const right = { x: 0.9 * w - nw, y };
  const x1 = left.x + nw;
  const x2 = right.x;
  const breakX = x1 + (x2 - x1) * rnd.range(0.4, 0.6);
  const arch = y - h * rnd.range(0.3, 0.42);
  const out: ReactNode[] = [
    line("direct-a", { x: x1, y }, { x: breakX - 16 * s, y }, p("ink-3"), 1.8 * s, false, 0.7),
    line("direct-b", { x: breakX + 16 * s, y }, { x: x2, y }, p("ink-3"), 1.6 * s, true, 0.35),
    path("arc", `M ${r(x1)} ${r(y)} C ${r(x1 + 30 * s)} ${r(arch)}, ${r(x2 - 30 * s)} ${r(arch)}, ${r(x2)} ${r(y)}`, p(art.accent), 2.2 * s),
    node("site", left.x, left.y - nh / 2, nw, nh, p("surface"), p("line-2"), 1.5 * s, 10 * s),
    node("dest", right.x, right.y - nh / 2, nw, nh, p("surface"), p("line-2"), 1.5 * s, 10 * s),
  ];
  const g = 9 * s;
  out.push(<path key="warn" d={`M ${r(breakX)} ${r(y - g)} L ${r(breakX + g)} ${r(y)} L ${r(breakX)} ${r(y + g)} L ${r(breakX - g)} ${r(y)} Z`} fill={p("warn-soft")} stroke={p("warn")} strokeWidth={r(1.5 * s)} />);
  out.push(dot("warn-dot", { x: breakX, y }, 2.2 * s, p("warn")));
  for (let i = 0; i < 2; i += 1) {
    const c = cubicPoint({ x: x1, y }, { x: x1 + 30 * s, y: arch }, { x: x2 - 30 * s, y: arch }, { x: x2, y }, 0.3 + i * 0.35);
    out.push(dot(`s${i}`, c, 5 * s, p(art.accent)));
  }
  return out;
}

/** Product updates: stacked configuration versions, the current one signed. */
function versions(sc: Scene): ReactNode[] {
  const { w, h, s, p, art, rnd } = sc;
  const cw = 0.4 * w;
  const ch = 0.46 * h;
  const dir = rnd.next() > 0.5 ? 1 : -1;
  const dx = 0.05 * w * dir;
  const dy = 0.07 * h;
  const base = { x: 0.5 * w - cw / 2 - dx, y: 0.5 * h - ch / 2 + dy };
  const lines = 2 + rnd.int(2);
  const out: ReactNode[] = [];
  for (let i = 0; i < 3; i += 1) {
    const x = base.x + dx * i;
    const y = base.y - dy * i;
    const current = i === 2;
    out.push(node(`v${i}`, x, y, cw, ch, current ? p(art.accentSoft) : p("surface"), current ? p(art.accent) : p("line-2"), 1.5 * s, 12 * s));
    if (current) {
      for (let l = 0; l < lines; l += 1) {
        const ly = y + ch * (0.3 + (0.42 * l) / lines);
        out.push(line(`vl${l}`, { x: x + cw * 0.12, y: ly }, { x: x + cw * (0.12 + (l === 0 ? 0.5 : rnd.range(0.3, 0.6))), y: ly }, p(art.accent), 3 * s, false, 0.5));
      }
      const badge = { x: x + cw - 22 * s, y: y + 22 * s };
      out.push(dot("badge", badge, 13 * s, p(art.accent)));
      out.push(path("check", `M ${r(badge.x - 5 * s)} ${r(badge.y)} L ${r(badge.x - 1.5 * s)} ${r(badge.y + 3.5 * s)} L ${r(badge.x + 5.5 * s)} ${r(badge.y - 4 * s)}`, p("surface"), 2.2 * s));
    }
  }
  return out;
}

const MOTIFS: Record<Motif, (sc: Scene) => ReactNode[]> = {
  "first-signal": firstSignal,
  "fan-out": fanOut,
  "dual-lane": dualLane,
  "order-pairing": orderPairing,
  gates,
  windows,
  "health-arc": healthArc,
  reroute,
  versions,
};

/* ---------- component ---------- */

/** Faint guide lines behind the motif (two per cover, position from the seed). */
function guides(sc: Scene): ReactNode[] {
  const { w, h, s, p, rnd } = sc;
  const out: ReactNode[] = [];
  for (let i = 0; i < 2; i += 1) {
    const y = h * rnd.range(0.12, 0.88);
    out.push(line(`guide${i}`, { x: 0, y }, { x: w, y }, p("line-2"), 1 * s, false, 0.5));
  }
  return out;
}

export function Cover({ topic, groupId, title, size, className }: CoverProps) {
  const { width: w, height: h } = COVER_SIZES[size];
  const art = COVER_ART[topic] ?? COVER_ART["getting-started"];
  const social = size === "social";
  const p = (token: Token): string => (social ? HEX[token] : `var(--color-${token})`);
  const scene: Scene = { w, h, s: Math.min(w, h) / 300, p, art, rnd: createRng(hashGroupId(groupId)) };
  const labelled = !!title;
  const content = (
    <>
      {labelled && !social ? <title>{title}</title> : null}
      <rect x={0} y={0} width={w} height={h} fill={p(art.ground)} />
      {guides(scene)}
      {MOTIFS[art.motif](scene)}
    </>
  );
  if (social) {
    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} xmlns="http://www.w3.org/2000/svg">
        {content}
      </svg>
    );
  }
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width="100%"
      height="auto"
      role={labelled ? "img" : undefined}
      aria-label={labelled ? title : undefined}
      aria-hidden={labelled ? undefined : "true"}
      focusable="false"
      preserveAspectRatio="xMidYMid meet"
      className={["block h-auto w-full", className].filter(Boolean).join(" ")}
      style={{ aspectRatio: `${w} / ${h}` }}
      data-cover-topic={topic}
    >
      {content}
    </svg>
  );
}

/* ---------- topic glyph (topic worlds, filters) ---------- */

const GLYPH_PATHS: Record<Motif, ReactNode> = {
  "first-signal": (
    <>
      <circle cx="11" cy="20" r="3.5" fill="currentColor" />
      <path d="M14.5 20 C 19 20, 19 20, 23 20" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <rect x="23" y="14.5" width="8" height="11" rx="3" fill="currentColor" />
    </>
  ),
  "fan-out": (
    <>
      <rect x="8" y="15.5" width="9" height="9" rx="3" fill="currentColor" />
      <path d="M17 20 C 22 20, 22 12, 27 12 M17 20 H27 M17 20 C 22 20, 22 28, 27 28" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <circle cx="30" cy="12" r="2.2" fill="currentColor" />
      <circle cx="30" cy="20" r="2.2" fill="currentColor" />
      <circle cx="30" cy="28" r="2.2" fill="currentColor" />
    </>
  ),
  "dual-lane": (
    <>
      <path d="M9 15 H31" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="3 3" opacity="0.55" />
      <path d="M9 25 H31" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="16" cy="25" r="2.4" fill="currentColor" />
      <circle cx="25" cy="25" r="2.4" fill="currentColor" />
    </>
  ),
  "order-pairing": (
    <>
      <rect x="8" y="14" width="10" height="12" rx="3" fill="currentColor" />
      <path d="M20 18 H24 M20 22 H24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <rect x="26" y="11" width="7" height="18" rx="2" stroke="currentColor" strokeWidth="1.8" fill="none" />
    </>
  ),
  gates: (
    <>
      <path d="M8 20 H32" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.6" />
      <path d="M20 12 L28 20 L20 28 L12 20 Z" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <path d="M16.5 20 L19 22.5 L24 17.5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
    </>
  ),
  windows: (
    <>
      <path d="M8 27 H32" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <rect x="11" y="13" width="12" height="6" rx="2" stroke="currentColor" strokeWidth="1.6" fill="none" />
      <circle cx="11" cy="27" r="2.4" fill="currentColor" />
      <circle cx="23" cy="27" r="2.4" fill="currentColor" />
    </>
  ),
  "health-arc": (
    <>
      <path d="M11 26 A 10 10 0 0 1 20 10" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M21.5 10.2 A 10 10 0 0 1 29 26" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.35" />
      <circle cx="20" cy="22" r="3" fill="currentColor" />
    </>
  ),
  reroute: (
    <>
      <path d="M8 25 H17 M23 25 H32" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity="0.5" />
      <path d="M20 22 L23 25 L20 28 L17 25 Z" fill="currentColor" />
      <path d="M8 25 C 12 13, 28 13, 32 25" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
    </>
  ),
  versions: (
    <>
      <rect x="9" y="17" width="16" height="12" rx="3" stroke="currentColor" strokeWidth="1.6" fill="none" opacity="0.5" />
      <rect x="15" y="11" width="16" height="12" rx="3" fill="currentColor" />
      <path d="M20.5 17 L22.5 19 L26 15.5" stroke="var(--color-surface)" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </>
  ),
};

/** Small topic mark (40 × 40 user units) in the topic's accent; decorative — the topic label is always text. */
export function TopicGlyph({ topic, size = 40, className }: { topic: TopicId; size?: number; className?: string }) {
  const art = COVER_ART[topic] ?? COVER_ART["getting-started"];
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true" focusable="false" className={["shrink-0", className].filter(Boolean).join(" ")} style={{ width: size, height: size, color: `var(--color-${art.accent})` }}>
      <rect x="0.75" y="0.75" width="38.5" height="38.5" rx="10" fill={`var(--color-${art.ground})`} stroke="var(--color-line)" strokeWidth="1.5" />
      {GLYPH_PATHS[art.motif]}
    </svg>
  );
}
