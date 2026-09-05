// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { NextIntlClientProvider } from "next-intl";
import { act, useEffect, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AssistantUiResponse, UiEvent } from "@track-site/ai";
import { fixtureMessages } from "@/app/api/ai/dev-fixture/fixtures";
import { AssistantActivityFeed, AssistantComposer, AssistantMessages } from "./assistant-chat";
import { AssistantProvider, useAssistant, type AssistantApi } from "./assistant-store";
import type { ChatMessage } from "./types";

/*
 * The panel's content pieces driven through the store's public API: the activity feed (sentences
 * bound to run ids, next actions, live region), the windowed message list, the off-topic refusal
 * notice with at most three quick actions, the approval reveal and the polite announcer.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push() {}, refresh() {}, replace() {}, prefetch() {}, back() {}, forward() {} }), usePathname: () => "/app" }));

const messagesDir = path.resolve(import.meta.dirname, "../../../messages/en");
const catalog = Object.assign({}, ...["shell", "chat", "common", "assistant"].map((ns) => JSON.parse(readFileSync(path.join(messagesDir, `${ns}.json`), "utf8")) as Record<string, unknown>)) as Record<string, unknown>;

const site = { id: "s1", name: "Acme", trackingId: "ts_1", primaryDomain: null, status: "active" };
const finalUi: AssistantUiResponse = { message: "Done", intent: "configuration", stage: "destinations", current_step: "destinations", progress_percent: 40, status: "ok", cards: [], input_component: { type: "none" }, quick_actions: [], completed_steps: ["site"], missing_fields: [], warnings: [], requires_confirmation: false, confirmation_summary: null, tool_result_summary: null, next_best_action: null };
const quick = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `q${i}`, label: `Action ${i + 1}`, message: `do ${i}`, kind: i === 0 ? ("primary" as const) : ("secondary" as const) }));
const activity = (type: "activity.started" | "activity.completed" | "activity.blocked" | "activity.failed", runId: string, kind = "site_check", params: { reason?: string; missing?: string[] } = {}): UiEvent =>
  ({ type, turnId: "t1", runId, activity: kind, sentence: type === "activity.started" ? `${kind}.started` : type === "activity.completed" ? `${kind}.completed` : type === "activity.blocked" ? (params.missing?.length ? "generic.blocked_missing" : "generic.blocked") : "generic.failed", params }) as UiEvent;

const probe: { api: AssistantApi | null } = { api: null };
function ApiProbe() {
  const current = useAssistant();
  useEffect(() => {
    probe.api = current;
  });
  return null;
}

let transcript: ChatMessage[] = [];
const flush = () => act(async () => new Promise<void>((r) => setTimeout(r, 0)));

async function mount(node: ReactNode): Promise<{ root: Root; container: HTMLElement; apply: (events: UiEvent[]) => Promise<void> }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <NextIntlClientProvider locale="en" messages={catalog} timeZone="Europe/Berlin">
        <AssistantProvider sites={[site]} activeSiteId="s1" environment={null} aiEnabled locale="en">
          <ApiProbe />
          {node}
        </AssistantProvider>
      </NextIntlClientProvider>,
    );
  });
  await flush();
  const apply = async (events: UiEvent[]) => {
    await act(async () => {
      probe.api!.applyEvents(events);
    });
  };
  return { root, container, apply };
}

beforeEach(() => {
  transcript = [];
  window.matchMedia = ((query: string) => ({ matches: false, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as typeof window.matchMedia;
  globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, messages: transcript }) })) as unknown as typeof fetch;
});

afterEach(() => {
  probe.api = null;
  document.body.innerHTML = "";
});

describe("AssistantActivityFeed", () => {
  it("keeps a polite live region, binds every sentence to its run id and offers the next action for blocked runs", async () => {
    const { root, container, apply } = await mount(<AssistantActivityFeed />);
    const region = container.querySelector('[data-testid="assistant-activity"]')!;
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.getAttribute("role")).toBe("log");
    expect(region.className).toContain("h-0");
    expect(region.querySelector("li")).toBeNull();

    await apply([activity("activity.started", "call_1")]);
    const started = container.querySelector('li[data-run-id="call_1"]')!;
    expect(started.getAttribute("data-phase")).toBe("started");
    expect(started.id).toBe("ai-run-call_1");
    expect(started.textContent).toContain("Checking your website now.");
    expect(started.textContent).not.toMatch(/%/);

    // blocked with a reason and safe missing identifiers: sentence names what is missing, next action links to the page
    await apply([activity("activity.blocked", "call_1", "connection_validation", { reason: "NOT_CONNECTED", missing: ["access_token"] })]);
    const blocked = container.querySelector('li[data-run-id="call_1"]')!;
    expect(blocked.getAttribute("data-phase")).toBe("blocked");
    expect(blocked.textContent).toContain("What is still missing: access_token");
    const link = blocked.querySelector('a[data-next-action="openDestinations"]')!;
    expect(link.getAttribute("href")).toBe("/app/destinations");
    expect(link.textContent).toBe("Open Destinations");

    // once the secure credential card is pending, the next action points at the card instead
    await apply([{ type: "ui.card", turnId: "t1", card: { type: "credential_request", title: "Meta token", integration_id: "i1", connector_type: "meta", credential_kind: "access_token", label: "Meta token", help: "", oauth_provider: null } }]);
    expect(container.querySelector('li[data-run-id="call_1"] button[data-next-action="openCredentialCard"]')).not.toBeNull();

    // a failed provider call offers a retry (disabled while nothing was sent yet); percentages never appear
    await apply([activity("activity.failed", "call_2", "diagnostics", { reason: "PROVIDER_ERROR" })]);
    const failed = container.querySelector('li[data-run-id="call_2"]')!;
    expect(failed.getAttribute("data-phase")).toBe("failed");
    expect(failed.textContent).toContain("The action failed: the external service returned an error");
    expect(failed.querySelector('button[data-next-action="retry"]')).not.toBeNull();
    expect(region.textContent).not.toMatch(/\d+ ?%/);

    // more than four sentences fold the earlier ones into a count; the list never scrolls
    await apply(["a", "b", "c", "d"].map((id) => activity("activity.completed", id, "state_lookup")));
    expect(container.querySelectorAll("li[data-run-id]")).toHaveLength(4);
    expect(container.querySelector('[data-testid="assistant-activity-earlier"]')!.textContent).toBe("2 earlier checks done");
    expect(region.className).not.toContain("overflow-y-auto");
    await act(async () => {
      root.unmount();
    });
  });
});

describe("AssistantMessages", () => {
  it("renders every message below the threshold and windows a 250-message conversation with spacers", async () => {
    transcript = fixtureMessages(250) as unknown as ChatMessage[];
    const { root, container } = await mount(<AssistantMessages />);
    const list = container.querySelector('[data-testid="assistant-messages"]')!;
    expect(list.getAttribute("data-virtualized")).toBe("true");
    expect(list.getAttribute("data-total")).toBe("250");
    const rendered = container.querySelectorAll("[data-message-id]").length;
    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThan(250);
    expect(Number(list.getAttribute("data-rendered"))).toBe(rendered);
    expect(container.querySelector('[data-testid="assistant-spacer-top"], [data-testid="assistant-spacer-bottom"]')).not.toBeNull();
    // the list is the only scroll container of the body
    expect(list.className).toContain("overflow-y-auto");
    await act(async () => {
      root.unmount();
    });

    transcript = fixtureMessages(199) as unknown as ChatMessage[];
    const small = await mount(<AssistantMessages />);
    const plain = small.container.querySelector('[data-testid="assistant-messages"]')!;
    expect(plain.getAttribute("data-virtualized")).toBe("false");
    expect(small.container.querySelectorAll("[data-message-id]")).toHaveLength(199);
    expect(small.container.querySelector('[data-testid="assistant-spacer-top"], [data-testid="assistant-spacer-bottom"]')).toBeNull();
    await act(async () => {
      small.root.unmount();
    });
  });

  it("marks a refusal as in-scope guidance with at most three quick actions and announces new answers politely", async () => {
    transcript = [{ id: "m0", role: "assistant", content: "Hello", ui: null, createdAt: "2026-01-01T00:00:00.000Z" }];
    const { root, container, apply } = await mount(
      <>
        <AssistantMessages />
        <AssistantComposer />
      </>,
    );
    const announcer = container.querySelector('[data-testid="assistant-announcer"]')!;
    expect(announcer.getAttribute("aria-live")).toBe("polite");
    // the transcript that was loaded is not announced
    expect(announcer.textContent).toBe("");
    expect(container.querySelector('[data-testid="assistant-scope-notice"]')).toBeNull();

    // off-topic: the refusal notice, at most three allowed quick actions even if more arrived
    await apply([{ type: "ui.final", turnId: "t1", ui: { ...finalUi, message: "I'm specialised in your Track setup.", intent: "off_topic", quick_actions: quick(4) } }]);
    const notice = container.querySelector('[data-testid="assistant-scope-notice"]')!;
    expect(notice.getAttribute("data-intent")).toBe("off_topic");
    expect(notice.textContent).toContain("Track AI stays within your Track setup");
    expect(notice.textContent).toContain("I'm specialised in your Track setup.");
    expect(container.querySelectorAll('[data-testid="assistant-quick-action"]')).toHaveLength(3);
    expect(announcer.textContent).toBe("Track AI: I'm specialised in your Track setup.");

    // a regular answer: plain text, up to four quick actions
    await apply([{ type: "ui.final", turnId: "t2", ui: { ...finalUi, message: "Draft updated.", quick_actions: quick(4) } }]);
    expect(container.querySelectorAll('[data-testid="assistant-scope-notice"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-testid="assistant-quick-action"]')).toHaveLength(4);
    expect(announcer.textContent).toBe("Track AI: Draft updated.");
    await act(async () => {
      root.unmount();
    });
  });

  it("reveals and focuses the approval card with the exact diff when the approval arrives", async () => {
    const { root, container, apply } = await mount(<AssistantMessages />);
    await apply([{ type: "approval.required", turnId: "t1", approvalId: "a1", action: "publish_config_version", summary: { changes: [{ summary: "enable meta purchase", op: "add" }], recipients: [] }, expiresAt: "2026-09-04T12:00:00.000Z", sentence: "confirmation.required" }]);
    await act(async () => new Promise<void>((r) => requestAnimationFrame(() => r())));
    const card = container.querySelector<HTMLElement>('[data-focus-target="approval-card"]')!;
    expect(card.getAttribute("data-testid")).toBe("approval-card");
    expect(card.getAttribute("data-action")).toBe("publish_config_version");
    expect(card.textContent).toContain("enable meta purchase");
    expect(card.hasAttribute("data-revealed")).toBe(true);
    expect(document.activeElement).toBe(card);
    // the confirm button is action-bound: one button for the publish action, no nested interactive elements
    expect(card.querySelector("button")!.textContent).toBe("Confirm and publish");
    expect(card.querySelector("a button, button a")).toBeNull();
    await act(async () => {
      root.unmount();
    });
  });

  it("records the outcome of a card the user operated as a system note, never as the user's own words", async () => {
    // the transcript loads; a chat turn (POST) answers with an error so the loop ends at once
    globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => (init?.method === "POST" ? { ok: false, json: async () => ({ code: "FAILED" }) } : { ok: true, json: async () => ({ ok: true, messages: transcript }) })) as unknown as typeof fetch;
    const { root, container } = await mount(<AssistantMessages />);
    const post = () => (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === "POST");
    await act(async () => {
      probe.api!.addNote("Credential stored (••••1234). Validation: ok. Status: connected.", "credential");
    });
    const note = container.querySelector('[data-testid="assistant-system-note"]')!;
    expect(note.getAttribute("data-note")).toBe("credential");
    expect(note.textContent).toContain("Credential stored (••••1234).");
    // a system entry of the local transcript: no user bubble, nothing sent to the assistant, announced politely
    expect(probe.api!.chat.messages.at(-1)).toMatchObject({ role: "system", note: "credential" });
    expect(container.querySelector(".bg-primary")).toBeNull();
    expect(post()).toHaveLength(0);
    expect(container.querySelector('[data-testid="assistant-announcer"]')!.textContent).toBe("Credential stored (••••1234). Validation: ok. Status: connected.");
    // the conversation continues only on the user's click, with a visible, localized message in the user's name
    await act(async () => {
      note.querySelector<HTMLButtonElement>('[data-testid="assistant-note-continue"]')!.click();
    });
    expect(probe.api!.chat.messages.at(-1)).toMatchObject({ role: "user", content: "The credential is saved. Please continue with the setup." });
    expect(post()).toHaveLength(1);
    // an approval outcome is a plain note without a continue control
    await act(async () => {
      probe.api!.addNote("Cancelled. Nothing was changed.", "approval");
    });
    const approvalNote = container.querySelector('[data-testid="assistant-system-note"][data-note="approval"]')!;
    expect(approvalNote.textContent).toBe("Cancelled. Nothing was changed.");
    expect(approvalNote.querySelector("button")).toBeNull();
    await act(async () => {
      root.unmount();
    });
  });

  it("shows the secure credential card entry point above the composer while a card is pending", async () => {
    const { root, container, apply } = await mount(
      <>
        <AssistantMessages />
        <AssistantComposer />
      </>,
    );
    expect(container.querySelector('[data-testid="assistant-credential-entry"]')).toBeNull();
    await apply([{ type: "ui.card", turnId: "t1", card: { type: "credential_request", title: "Meta token", integration_id: "i1", connector_type: "meta", credential_kind: "access_token", label: "Meta token", help: "", oauth_provider: null } }]);
    const entry = container.querySelector('[data-testid="assistant-credential-entry"]')!;
    expect(entry.textContent).toContain("A secure credential card is waiting for your input.");
    await act(async () => {
      entry.querySelector("button")!.click();
    });
    const card = container.querySelector<HTMLElement>('[data-focus-target="credential-card"]')!;
    expect(card.hasAttribute("data-revealed")).toBe(true);
    expect(document.activeElement).toBe(card);
    await act(async () => {
      root.unmount();
    });
  });
});
