import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LivingAICore } from "./living-ai-core";
import { CORE_MOTIONS, CORE_STATES } from "./types";

/*
 * Tier 1 (SSR static gradient): the markup the server sends must be deterministic (no clock, no
 * viewport, no device value leaks into it), contain no canvas or script and carry no inline
 * geometry — every dimension comes from the `.lac-*` rules, which use the theme tokens so light
 * and dark are correct before hydration.
 */
const css = readFileSync(path.resolve(import.meta.dirname, "../../../../app/globals.css"), "utf8");

describe("LivingAICore SSR", () => {
  it("renders the same static markup regardless of the clock, the motion setting or the device", () => {
    const a = renderToString(<LivingAICore state="idle" motion="system" mode="docked" now={() => 0} />);
    const b = renderToString(<LivingAICore state="idle" motion="system" mode="docked" now={() => 987_654} />);
    const c = renderToString(<LivingAICore state="idle" motion="system" mode="docked" />);
    expect(a).toBe(b);
    expect(a).toBe(c);
    expect(renderToString(<LivingAICore state="idle" motion="full" mode="docked" />)).toContain('data-tier="static"');
  });

  it("is decorative and static before hydration for every state and setting", () => {
    for (const state of CORE_STATES) {
      for (const motion of CORE_MOTIONS) {
        const html = renderToString(<LivingAICore state={state} motion={motion} mode="docked" />);
        expect(html).toContain('aria-hidden="true"');
        expect(html).toContain(`data-state="${state}"`);
        expect(html).toContain('data-tier="static"');
        expect(html).toContain(`data-pref="${motion}"`);
        expect(html).not.toContain("<canvas");
        expect(html).not.toContain("<script");
        expect(html).not.toMatch(/ style="/);
        expect(html).not.toMatch(/\d+px/);
        expect(html).not.toMatch(/tabindex|role=|<button|<a /i);
      }
    }
  });

  it("only differs by the mode attribute between docked and onboarding (geometry lives in CSS)", () => {
    const docked = renderToString(<LivingAICore state="working" motion="system" mode="docked" />);
    const onboarding = renderToString(<LivingAICore state="working" motion="system" mode="onboarding" />);
    expect(docked.replace('data-mode="docked"', "")).toBe(onboarding.replace('data-mode="onboarding"', ""));
  });

  it("paints the static gradient from the theme tokens and keeps the layer out of layout and hit-testing", () => {
    const root = css.match(/\.lac \{[^}]+\}/)?.[0] ?? "";
    expect(root).toContain("position: absolute");
    expect(root).toContain("inset: 0");
    expect(root).toContain("pointer-events: none");
    expect(root).toContain("contain: strict");
    expect(root).toContain("isolation: isolate");
    expect(root).toContain("transform: translateZ(0)");
    const base = css.match(/\.lac-base \{[^}]+\}/)?.[0] ?? "";
    expect(base).toContain("var(--color-primary-soft)");
    expect(base).toContain("var(--color-violet-soft)");
    expect(base).toContain("var(--color-cyan-soft)");
    // keyframes run only on the css tier; the static tier and `off` never animate
    expect(css).toMatch(/\.lac\[data-tier="css"\] \.lac-blob-a > i \{\s*animation: lac-drift-a 16s/);
    expect(css).not.toMatch(/\n\s*\.lac-blob-a > i \{\s*animation/);
    expect(css).toMatch(/\.lac\[data-pref="off"\] \* \{\s*transition: none !important;\s*animation: none !important;/);
    // no blur, goo filter or backdrop-filter anywhere in the layer
    const block = css.slice(css.indexOf("Living AI Core"));
    expect(block).not.toMatch(/backdrop-filter|filter: blur|feGaussianBlur/);
  });
});
