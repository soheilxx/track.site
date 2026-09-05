// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { NextIntlClientProvider } from "next-intl";
import { act, useEffect, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AssistantUiResponse, UiEvent } from "@track-site/ai";
import { AssistantProvider, useAssistant, type AssistantApi } from "@/components/chat/assistant-store";
import { DEFAULT_MIN_HOLD_MS, DEFAULT_SUCCESS_HOLD_MS } from "@/components/chat/assistant-ui-state";
import { AssistantPanel } from "./assistant-panel";
import { LivingAICore } from "./living-ai-core";
import { AssistantAmbient } from "./living-ai-core/assistant-ambient";

/*
 * Wiring of the Living AI Core into the Track AI panel: the ambient slot is decorative and outside
 * layout/hit-testing, the default ambient binds to the panel's one motion state source
 * (`useAssistantUiState`), and the header carries the accessible pause / turn-on control that
 * writes the per-user preference optimistically and persists it through the settings action.
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

  it("renders an inactive ambient on the static tier whatever the preference says (one animated core per shell)", async () => {
    // the host hands the panel an inactive core while the first-run stage animates its onboarding core
    document.documentElement.setAttribute("data-ai-motion", "full");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(wrap(<AssistantPanel title="Track AI" ambient={<AssistantAmbient active={false} />}>body</AssistantPanel>));
    });
    const core = container.querySelector('[data-testid="living-ai-core"]')!;
    expect(core.getAttribute("data-tier")).toBe("static");
    expect(core.getAttribute("data-pref")).toBe("off");
    expect(container.querySelector("canvas.lac-gl")).toBeNull();
    // the same element becomes the animated core once the stage docked (prop change, no remount)
    await act(async () => {
      root.render(wrap(<AssistantPanel title="Track AI" ambient={<AssistantAmbient active />}>body</AssistantPanel>));
    });
    expect(container.querySelector('[data-testid="living-ai-core"]')).toBe(core);
    expect(core.getAttribute("data-tier")).toBe("css");
    expect(core.getAttribute("data-pref")).toBe("full");
    await act(async () => {
      root.unmount();
    });
  });
});

/*
 * The default ambient follows the store's real vocabulary through the panel's one motion state
 * source (`useAssistantUiState`, the hook whose value the host also writes to `data-ai-state`):
 * statuses `sending` / `working` / `reconnecting` → working, `streaming` → streaming, contract
 * events for tool runs, approvals, errors and the verified final answer → blocked /
 * approval_required / success. The source holds every state for its minimum hold before the next
 * applies, so the tests run on a fake clock and advance it by that hold (`settle`) before reading
 * the core. The events are applied through the store's public API exactly like the confirmation
 * route's batch.
 */
const site = { id: "s1", name: "Acme", trackingId: "ts_1", primaryDomain: null, status: "active" };
const finalUi: AssistantUiResponse = { message: "Done", intent: "configuration", stage: "destinations", current_step: "destinations", progress_percent: 40, status: "ok", cards: [], input_component: { type: "none" }, quick_actions: [], completed_steps: ["site"], missing_fields: [], warnings: [], requires_confirmation: false, confirmation_summary: null, tool_result_summary: null, next_best_action: null };
const activity = (type: "activity.started" | "activity.completed" | "activity.blocked" | "activity.failed", runId: string, params: { reason?: string } = {}): UiEvent =>
  ({ type, turnId: "t1", runId, activity: "site_check", sentence: type === "activity.started" ? "site_check.started" : type === "activity.completed" ? "site_check.completed" : type === "activity.blocked" ? "generic.blocked" : "generic.failed", params }) as UiEvent;
const approvalEvent: UiEvent = { type: "approval.required", turnId: "t1", approvalId: "a1", action: "publish_config_version", summary: { changes: [], recipients: [] }, expiresAt: "2026-09-04T12:00:00.000Z", sentence: "confirmation.required" };

/** Exposes the store's public API to the test (written in an effect, never during render). */
const probe: { api: AssistantApi | null } = { api: null };
function ApiProbe() {
  const current = useAssistant();
  useEffect(() => {
    probe.api = current;
  });
  return null;
}

async function mountWithSite() {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  document.documentElement.setAttribute("data-ai-motion", "off");
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="Europe/Berlin">
        <AssistantProvider sites={[site]} activeSiteId="s1" environment={null} aiEnabled locale="en">
          <ApiProbe />
          <AssistantPanel title="Track AI">body</AssistantPanel>
        </AssistantProvider>
      </NextIntlClientProvider>,
    );
  });
  const coreState = () => container.querySelector('[data-testid="living-ai-core"]')!.getAttribute("data-state");
  const apply = async (events: UiEvent[]) => {
    await act(async () => {
      probe.api!.applyEvents(events);
    });
  };
  /** Advances the fake clock past the source's minimum hold (or a given time) and flushes the resulting renders. */
  const settle = async (ms = DEFAULT_MIN_HOLD_MS) => {
    await act(async () => {
      vi.advanceTimersByTime(ms);
    });
  };
  return { root, coreState, apply, settle };
}

describe("AssistantPanel default ambient bound to the store", () => {
  afterEach(() => {
    probe.api = null;
    vi.useRealTimers();
  });

  it("follows tool runs, approvals and failures of a turn, each after the source's single hold", async () => {
    const { root, coreState, apply, settle } = await mountWithSite();
    expect(coreState()).toBe("idle");
    await apply([activity("activity.started", "r1")]);
    expect(probe.api!.chat.status).toBe("working");
    // one hysteresis only: the source holds the previous state for its minimum hold, the core adds none of its own
    expect(coreState()).toBe("idle");
    await settle(DEFAULT_MIN_HOLD_MS - 1);
    expect(coreState()).toBe("idle");
    await settle(1);
    expect(coreState()).toBe("working");
    // a confirmation-gated tool result (blocked with CONFIRMATION_REQUIRED) plus the approval card → approval, not blocked:
    // the pending approval is the authoritative status, no error and no failed run are recorded, however the reducer books the outcome
    await apply([activity("activity.blocked", "r2", { reason: "CONFIRMATION_REQUIRED" }), approvalEvent]);
    expect(probe.api!.chat.approval?.approvalId).toBe("a1");
    expect(probe.api!.chat.error).toBeNull();
    await settle();
    expect(coreState()).toBe("approval_required");
    await act(async () => {
      probe.api!.dismissApproval();
    });
    await settle();
    expect(coreState()).toBe("working");
    // a real failure of a tool run blocks the turn
    await apply([activity("activity.failed", "r1", { reason: "PROVIDER_ERROR" })]);
    await settle();
    expect(coreState()).toBe("blocked");
    await act(async () => {
      root.unmount();
    });
  });

  it("listens on a started draft or composer focus without a turn", async () => {
    const { root, coreState, settle } = await mountWithSite();
    await act(async () => {
      probe.api!.setDraft("connect meta");
    });
    await settle();
    expect(coreState()).toBe("listening");
    // typing never restarts anything: the target is unchanged, so the state stays
    await act(async () => {
      probe.api!.setDraft("connect meta ads");
    });
    expect(coreState()).toBe("listening");
    await act(async () => {
      probe.api!.setDraft("");
    });
    await settle();
    expect(coreState()).toBe("idle");
    await act(async () => {
      probe.api!.setComposerFocused(true);
    });
    await settle();
    expect(coreState()).toBe("listening");
    await act(async () => {
      root.unmount();
    });
  });

  it("celebrates a verified final answer once, for the hold, then returns to idle", async () => {
    const { root, coreState, apply, settle } = await mountWithSite();
    await apply([{ type: "ui.final", turnId: "t1", ui: finalUi }]);
    expect(probe.api!.chat.outcome?.kind).toBe("success");
    await settle();
    expect(coreState()).toBe("success");
    // the success hold runs from the outcome's timestamp; the switch back waits for the minimum hold at most
    await settle(DEFAULT_SUCCESS_HOLD_MS + DEFAULT_MIN_HOLD_MS);
    expect(coreState()).toBe("idle");
    // a final answer with an error status is a verified blocked outcome, never a wave
    await apply([{ type: "ui.final", turnId: "t2", ui: { ...finalUi, status: "error" } }]);
    await settle();
    expect(coreState()).toBe("blocked");
    await act(async () => {
      root.unmount();
    });
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
