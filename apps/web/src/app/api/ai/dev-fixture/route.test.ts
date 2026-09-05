import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The fixture route is a development aid only: dead in production, session-bound, tenant-checked,
 * synthetic content. Server modules are mocked exactly like in the other AI route tests.
 */
const session: { ctx: unknown } = { ctx: { organization: { id: "org1" }, user: { id: "user1", locale: "en" }, role: "OWNER" } };
const belongs = vi.fn(async () => true);
vi.mock("server-only", () => ({}));
vi.mock("@/server/session", () => ({ getOrgContext: async () => session.ctx }));
vi.mock("@/server/ai/context", () => ({ siteBelongsToOrg: () => belongs() }));

const { GET } = await import("./route");
const SITE = "8a1d0a3e-7b3c-4a3f-9f7d-1c2b3a4d5e6f";
const url = (params: string) => new NextRequest(`http://localhost/api/ai/dev-fixture?${params}`);

describe("GET /api/ai/dev-fixture", () => {
  const original = { NODE_ENV: process.env.NODE_ENV, APP_ENV: process.env.APP_ENV };
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("APP_ENV", "development");
    belongs.mockClear();
    session.ctx = { organization: { id: "org1" }, user: { id: "user1", locale: "en" }, role: "OWNER" };
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    if (original.NODE_ENV !== undefined) vi.stubEnv("NODE_ENV", original.NODE_ENV);
    if (original.APP_ENV !== undefined) vi.stubEnv("APP_ENV", original.APP_ENV);
  });

  it("answers 404 in production before touching the session", async () => {
    vi.stubEnv("APP_ENV", "production");
    const res = await GET(url(`siteId=${SITE}&fixture=long-conversation`));
    expect(res.status).toBe(404);
    expect(belongs).not.toHaveBeenCalled();
  });

  it("requires a session, validates the query and checks the tenant", async () => {
    session.ctx = null;
    expect((await GET(url(`siteId=${SITE}&fixture=long-conversation`))).status).toBe(401);
    session.ctx = { organization: { id: "org1" }, user: { id: "user1", locale: "en" }, role: "OWNER" };
    expect((await GET(url(`siteId=${SITE}&fixture=unknown`))).status).toBe(400);
    expect((await GET(url(`siteId=nope&fixture=long-conversation`))).status).toBe(400);
    belongs.mockResolvedValueOnce(false);
    expect((await GET(url(`siteId=${SITE}&fixture=long-conversation`))).status).toBe(404);
  });

  it("returns the deterministic 250-message transcript for a site of the organization", async () => {
    const res = await GET(url(`siteId=${SITE}&fixture=long-conversation`));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = (await res.json()) as { ok: boolean; messages: Array<{ id: string; role: string; ui: null }> };
    expect(body.ok).toBe(true);
    expect(body.messages).toHaveLength(250);
    expect(body.messages[0]).toMatchObject({ id: "fixture-0", role: "user", ui: null });
    const small = (await (await GET(url(`siteId=${SITE}&fixture=long-conversation&count=3`))).json()) as { messages: unknown[] };
    expect(small.messages).toHaveLength(3);
  });
});
