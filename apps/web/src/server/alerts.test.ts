import { describe, expect, it, vi } from "vitest";

// the loaders' runtime dependencies are server-only; the helpers under test are pure
vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn() }));
vi.mock("@/env", () => ({ env: () => ({ HOST_APP: "http://localhost:3000/app" }) }));
vi.mock("@/server/db", () => ({
  logger: { warn: vi.fn() },
  signingKeys: () => null,
  vault: () => null,
}));
vi.mock("@/server/mail", () => ({ sendMail: vi.fn() }));
vi.mock("@/server/session", () => ({ withOrg: vi.fn() }));

import {
  channelNamesFor,
  channelTargetHint,
  deliveryRows,
  historyQueryString,
  parseHistoryFilters,
  validateChannelTarget,
} from "./alerts";

describe("parseHistoryFilters", () => {
  it("reads valid values and falls back to defaults for anything else", () => {
    expect(parseHistoryFilters({})).toEqual({
      severity: "all",
      state: "all",
      kind: "all",
      page: 1,
      eventId: null,
    });
    expect(
      parseHistoryFilters({
        severity: "critical",
        state: "open",
        kind: "queue_lag",
        page: "3",
        event: "11111111-1111-4111-8111-111111111111",
      }),
    ).toEqual({
      severity: "critical",
      state: "open",
      kind: "queue_lag",
      page: 3,
      eventId: "11111111-1111-4111-8111-111111111111",
    });
    expect(
      parseHistoryFilters({
        severity: "loud",
        state: ["resolved"],
        kind: "nope",
        page: "-2",
        event: "x",
      }),
    ).toEqual({ severity: "all", state: "resolved", kind: "all", page: 1, eventId: null });
    expect(parseHistoryFilters({ page: "99999999" }).page).toBe(10_000);
  });
});

describe("historyQueryString", () => {
  it("keeps every filter, drops defaults and the deep-linked event, and replaces the page", () => {
    const filters = parseHistoryFilters({
      severity: "warning",
      state: "open",
      kind: "event_drop",
      page: "2",
      event: "11111111-1111-4111-8111-111111111111",
    });
    expect(historyQueryString(filters)).toBe("?severity=warning&state=open&kind=event_drop&page=2");
    expect(historyQueryString(filters, 1)).toBe("?severity=warning&state=open&kind=event_drop");
    expect(historyQueryString(parseHistoryFilters({}))).toBe("");
  });
});

describe("validateChannelTarget", () => {
  it("accepts e-mail addresses and https URLs on public hosts", () => {
    expect(validateChannelTarget("email", "alerts@example.com")).toBeNull();
    expect(
      validateChannelTarget("webhook", "https://hooks.example.com/track?token=abc"),
    ).toBeNull();
    expect(
      validateChannelTarget("slack", "https://hooks.slack.com/services/T000/B000/XXXX"),
    ).toBeNull();
  });
  it("rejects malformed addresses, plain http, embedded credentials, private hosts and non-Slack hosts for Slack", () => {
    expect(validateChannelTarget("email", "not-an-address")).toBe("invalid_email");
    expect(validateChannelTarget("webhook", "ftp://example.com")).toBe("insecure_url");
    expect(validateChannelTarget("webhook", "http://example.com/hook")).toBe("insecure_url");
    expect(validateChannelTarget("webhook", "https://user:pw@example.com/hook")).toBe(
      "credentials_in_url",
    );
    expect(validateChannelTarget("webhook", "https://localhost/hook")).toBe("private_host");
    expect(validateChannelTarget("webhook", "https://192.168.1.10/hook")).toBe("private_host");
    expect(validateChannelTarget("webhook", "https://10.0.0.5/hook")).toBe("private_host");
    expect(validateChannelTarget("webhook", "not a url")).toBe("invalid_url");
    expect(validateChannelTarget("slack", "https://example.com/services/T000")).toBe("not_slack");
  });
});

describe("channelTargetHint", () => {
  it("shows the host only, never the path or query", () => {
    expect(channelTargetHint("https://hooks.slack.com/services/T000/B000/SECRET")).toBe(
      "hooks.slack.com",
    );
    expect(channelTargetHint("https://API.Example.com/hook?token=SECRET")).toBe("api.example.com");
    expect(channelTargetHint("garbage")).toBeNull();
  });
});

describe("channelNamesFor + deliveryRows", () => {
  it("resolves names in rule order and keeps unknown channels by id", () => {
    const channels = [
      { id: "a", name: "Ops e-mail" },
      { id: "b", name: "Slack" },
    ];
    expect(channelNamesFor(["b", "zzz", "a"], channels)).toEqual(["Slack", "Ops e-mail"]);
    const rows = deliveryRows(
      {
        a: {
          kind: "email",
          status: "sent",
          at: "2026-09-04T12:00:00.000Z",
          transport: "smtp",
          error: null,
          httpStatus: null,
        },
        gone: {
          kind: "webhook",
          status: "failed",
          at: "2026-09-04T12:00:01.000Z",
          transport: "webhook",
          error: "responded 500",
          httpStatus: 500,
        },
      },
      new Map(channels.map((c) => [c.id, c.name])),
    );
    expect(rows).toEqual([
      {
        channelId: "a",
        channelName: "Ops e-mail",
        kind: "email",
        status: "sent",
        transport: "smtp",
        error: null,
        httpStatus: null,
        at: "2026-09-04T12:00:00.000Z",
      },
      {
        channelId: "gone",
        channelName: null,
        kind: "webhook",
        status: "failed",
        transport: "webhook",
        error: "responded 500",
        httpStatus: 500,
        at: "2026-09-04T12:00:01.000Z",
      },
    ]);
    expect(deliveryRows(null, new Map())).toEqual([]);
  });
});
