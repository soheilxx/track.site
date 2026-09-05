// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { NextIntlClientProvider } from "next-intl";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AssistantUiResponse, UiEvent } from "@track-site/ai";
import { AssistantProvider, useAssistant, type AssistantApi } from "@/components/chat/assistant-store";
import { AssistantPanel } from "./assistant-panel";
import { LivingAICore, SUCCESS_HOLD_MS } from "./living-ai-core";

/*
 * Wiring of the Living AI Core into the Track AI panel: the ambient slot is decorative and outside
 * layout/hit-testing, the default ambient binds to the assistant store, and the header carries the
 * accessible pause / turn-on control that writes the per-user preference optimistically and
 * persists it through the settings action.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push() {}, replace() {}, prefetch() {}, back() {}, forward() {} }) }));
const updateAiMotionAction = vi.fn(async (_prev: unknown, formData: FormData): Promise<{ ok: boolean; error: string | null }> => ({ ok: formData.get("aiMotion") !== "fail", error: null }));
vi.mock("@/server/actions/settings", () => ({ updateAiMotionAction: (prev: unknown, formData: FormData) => updateAiMotionAction(prev, formData) }));

const messagesDir = path.resolve(import.meta.dirname, "../../../../messages/en");
const messages = Object.assign(
  {},
  ...["shell", "chat", "common"].map((ns) => JSON.parse(readFileSync(path.join(messagesDir, `${ns}.json`), "utf8")) as Record<string, unknown>),
) as Record<string, unknown>;

const wrap = (node: ReactNode) => (
  <NextIntlClientProvider locale="en" messages={messages} timeZone="Europe/Berlin">
    <AssistantProvider sites={[]} activeSiteId={null} environment={null} aiEnabled={false} locale="en">
      {node}
    </AssistantProvider>
  </NextIntlClientProvider>
);

beforeEach(() => {
  updateAiMotionAction.mockClear();
  refresh.mockClear();
  document.documentElement.removeAttribute("data-ai-motion");
  window.matchMedia = ((query: string) => ({ matches: false, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as typeof window.matchMedia;
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("AssistantPanel ambient slot", () => {
  it("renders the ambient layer absolutely, aria-hidden and without pointer events, on the server", () => {
    const html = renderToString(<AssistantPanel title="Track AI" ambient={<LivingAICore state="working" motion="system" mode="docked" />} motionControl={null}>body</AssistantPanel>);
    const slot = html.match(/<div aria-hidden="true" class="([^"]+)" data-slot="ambient">/);
    expect(slot).not.toBeNull();
    for (const cls of ["pointer-events-none", "absolute", "inset-0", "-z-10", "overflow-hidden"]) expect(slot![1]).toContain(cls);
    expect(html).toContain('data-testid="living-ai-core"');
    expect(html).toContain('data-tier="static"');
    expect(html).not.toContain("<canvas");
    // the slot precedes the header, so it is painted beneath it inside the isolated panel
    expect(html.indexOf('data-slot="ambient"')).toBeLessThan(html.indexOf('data-slot="header"'));
  });

  it("binds the default ambient to the assistant store (idle without a turn) and can be switched off", () => {
    const withDefault = renderToString(wrap(<AssistantPanel title="Track AI">body</AssistantPanel>));
    expect(withDefault).toContain('data-testid="living-ai-core"');
    expect(withDefault).toContain('data-state="idle"');
    expect(withDefault).toContain('data-pref="system"');
    const without = renderToString(wrap(<AssistantPanel title="Track AI" ambient={false}>body</AssistantPanel>));
    expect(without).not.toContain('data-testid="living-ai-core"');
    expect(without).toContain('data-slot="ambient"');
  });
});

describe("AssistantPanel motion control", () => {
  it("offers an accessible pause control in the header with localized labels", () => {
    const html = renderToString(wrap(<AssistantPanel title="Track AI">body</AssistantPanel>));
    expect(html).toContain('aria-label="Pause AI motion"');
    // the state lives in the accessible name; a changing label must not be combined with aria-pressed
    expect(html).not.toContain("aria-pressed");
    expect(html).toContain('data-testid="assistant-motion-toggle"');
    expect(html).toMatch(/<button[^>]*data-testid="assistant-motion-toggle"/);
    expect(html).not.toMatch(/<a [^>]*>\s*<button|<button[^>]*>\s*<a /);
  });

  it("pauses optimistically, persists `off` through the settings action and announces the result", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(wrap(<AssistantPanel title="Track AI">body</AssistantPanel>));
    });
    const button = container.querySelector<HTMLButtonElement>('[data-testid="assistant-motion-toggle"]')!;
    expect(button.getAttribute("aria-label")).toBe("Pause AI motion");
    expect(container.querySelector('[data-testid="living-ai-core"]')!.getAttribute("data-tier")).toBe("css");

    await act(async () => {
      button.click();
    });
    expect(document.documentElement.getAttribute("data-ai-motion")).toBe("off");
    await act(async () => {
      await Promise.resolve();
    });
    expect(updateAiMotionAction).toHaveBeenCalledTimes(1);
    expect(updateAiMotionAction.mock.calls[0]![1].get("aiMotion")).toBe("off");
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="status"]')!.textContent).toBe("AI motion paused. Your setting is saved.");
    // the core reacts at once: static tier, and the control now offers to turn motion on again
    expect(container.querySelector('[data-testid="living-ai-core"]')!.getAttribute("data-tier")).toBe("static");
    const toggle = container.querySelector<HTMLButtonElement>('[data-testid="assistant-motion-toggle"]')!;
    expect(toggle.getAttribute("aria-label")).toBe("Turn AI motion on");
    expect(toggle.hasAttribute("aria-pressed")).toBe(false);

    await act(async () => {
      toggle.click();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(document.documentElement.getAttribute("data-ai-motion")).toBe("system");
    expect(updateAiMotionAction.mock.calls[1]![1].get("aiMotion")).toBe("system");
    expect(container.querySelector('[role="status"]')!.textContent).toBe("AI motion follows your system setting again.");
    await act(async () => {
      root.unmount();
    });
  });

  it("reverts the optimistic value and announces an error when the save fails", async () => {
    updateAiMotionAction.mockImplementationOnce(async () => ({ ok: false, error: "generic" }));
    document.documentElement.setAttribute("data-ai-motion", "full");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(wrap(<AssistantPanel title="Track AI">body</AssistantPanel>));
    });
    const button = container.querySelector<HTMLButtonElement>('[data-testid="assistant-motion-toggle"]')!;
    await act(async () => {
      button.click();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(document.documentElement.getAttribute("data-ai-motion")).toBe("full");
    expect(container.querySelector('[role="status"]')!.textContent).toBe("The motion setting could not be saved.");
    expect(refresh).not.toHaveBeenCalled();
    await act(async () => {
      root.unmount();
    });
  });
});
