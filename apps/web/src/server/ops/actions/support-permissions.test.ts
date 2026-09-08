import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasPlatformPermission, type PlatformPermission, type PlatformRole } from "@track-site/core";

/**
 * Support desk permission matrix (docs/18 §2), walked from both ends:
 *
 * 1. `OPS_NAV` with both platform roles — `PLATFORM_SUPPORT` sees the support desk and the support-level
 *    modules, never Revenue, Controls or Platform users.
 * 2. Every server action of the support desk, called once per role through a fake `requirePlatform` that
 *    applies the real `hasPlatformPermission` matrix: the settings / SLA actions refuse a support agent with
 *    `forbidden`, everything else lets both roles through the gate (the calls then stop at validation or at the
 *    database sentinel — no database is touched).
 * 3. Every page under `src/app/ops/support/**` names its permission in `checkPlatform` / `requirePlatform`, and
 *    the settings pages (desk settings, SLA policies) are pinned to `PLATFORM_ADMIN` + `platform.sla.manage`.
 */

const state: { role: PlatformRole } = { role: "PLATFORM_SUPPORT" };
const RANK: Record<PlatformRole, number> = { NONE: 0, PLATFORM_SUPPORT: 1, PLATFORM_ADMIN: 2 };
/** thrown by the fake `withPlatform`: the action passed its permission gate and reached the database */
class DbSentinel extends Error {
  constructor() {
    super("db reached");
    this.name = "DbSentinel";
  }
}

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock("@/env", () => ({ env: () => ({ HOST_MARKETING: "http://localhost:3000", HOST_APP: "http://localhost:3000/app", APP_ENV: "test", OPS_REQUIRE_2FA: false }) }));
vi.mock("@/server/db", () => ({ db: vi.fn(), logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/server/mail", () => ({ sendMail: vi.fn() }));
vi.mock("@/server/ops/platform", () => {
  class PlatformAccessError extends Error {
    readonly reason: string;
    constructor(reason: string, message: string) {
      super(message);
      this.name = "PlatformAccessError";
      this.reason = reason;
    }
  }
  const ctxFor = (role: PlatformRole) => ({
    user: { id: "11111111-1111-4111-8111-111111111111", email: "agent@test.local", name: "Agent", locale: "en", platformRole: role, twoFactorEnabled: true },
    platformRole: role,
    actor: { kind: "platform", userId: "11111111-1111-4111-8111-111111111111", email: "agent@test.local", platformRole: role },
    requestId: "req",
  });
  return {
    PlatformAccessError,
    requirePlatform: vi.fn(async (minRole: "PLATFORM_SUPPORT" | "PLATFORM_ADMIN" = "PLATFORM_SUPPORT", permission?: PlatformPermission) => {
      const role = state.role;
      if (role === "NONE") throw new PlatformAccessError("no_role", "No platform role");
      if (RANK[role] < RANK[minRole]) throw new PlatformAccessError("insufficient_role", "Insufficient role");
      if (permission && !hasPlatformPermission(role, permission)) throw new PlatformAccessError("insufficient_role", `Missing ${permission}`);
      return ctxFor(role);
    }),
    checkPlatform: vi.fn(),
    withPlatform: vi.fn(async () => {
      throw new DbSentinel();
    }),
    auditPlatform: vi.fn(),
    platformCan: (ctx: { platformRole: PlatformRole }, permission: PlatformPermission) => hasPlatformPermission(ctx.platformRole, permission),
    hasPlatformRole: (role: PlatformRole, minRole: "PLATFORM_SUPPORT" | "PLATFORM_ADMIN") => RANK[role] >= RANK[minRole],
    activeBreakGlass: vi.fn(),
    platformLocale: vi.fn(async () => "en"),
  };
});

import { OPS_NAV, navAllows } from "@/components/ops/shell/nav-items";
import { deleteMacroAction, saveMacroAction } from "./support-macros";
import { markSupportNotificationsReadAction, pollSupportNotificationsAction, updateSupportNotificationPreferencesAction } from "./support-notifications";
import { updateSupportSettingsAction } from "./support-settings";
import { deleteSlaPolicyAction, saveSlaPolicyAction, setDefaultSlaPolicyAction } from "./support-sla";
import {
  assignTicketAction,
  composeTicketMessageAction,
  finalizeTicketMessageAction,
  mergeTicketAction,
  presenceHeartbeatAction,
  presenceLeaveAction,
  reopenTicketAction,
  setTicketCategoryAction,
  setTicketPriorityAction,
  setTicketStatusAction,
  setTicketTagsAction,
} from "./support-ticket";
import {
  bulkAssignTicketsAction,
  bulkMergeTicketsAction,
  bulkPriorityTicketsAction,
  bulkStatusTicketsAction,
  bulkTagTicketsAction,
  deleteSupportViewAction,
  exportTicketsAction,
  saveSupportViewAction,
} from "./support-tickets";

type AnyResult = { ok: boolean; error: string | null } | unknown;

interface ActionCase {
  name: string;
  /** the permission the action guards with (docs/18 §2) */
  permission: PlatformPermission;
  /** admin-only actions refuse a support agent with `forbidden` */
  adminOnly: boolean;
  /** invokes the action with an input that never reaches the database on its own (invalid or empty) */
  invoke: () => Promise<AnyResult>;
}

const empty = () => new FormData();
const cast = <T,>(value: unknown): T => value as T;

const ACTIONS: ActionCase[] = [
  // ticket detail (support-ticket.ts)
  { name: "composeTicketMessageAction", permission: "platform.tickets.write", adminOnly: false, invoke: () => composeTicketMessageAction(cast({})) },
  { name: "finalizeTicketMessageAction", permission: "platform.tickets.write", adminOnly: false, invoke: () => finalizeTicketMessageAction(cast({})) },
  { name: "setTicketStatusAction", permission: "platform.tickets.write", adminOnly: false, invoke: () => setTicketStatusAction(cast({})) },
  { name: "reopenTicketAction", permission: "platform.tickets.write", adminOnly: false, invoke: () => reopenTicketAction(cast({})) },
  { name: "setTicketPriorityAction", permission: "platform.tickets.write", adminOnly: false, invoke: () => setTicketPriorityAction(cast({})) },
  { name: "setTicketTagsAction", permission: "platform.tickets.write", adminOnly: false, invoke: () => setTicketTagsAction(cast({})) },
  { name: "setTicketCategoryAction", permission: "platform.tickets.write", adminOnly: false, invoke: () => setTicketCategoryAction(cast({})) },
  { name: "assignTicketAction", permission: "platform.tickets.assign", adminOnly: false, invoke: () => assignTicketAction(cast({})) },
  { name: "mergeTicketAction", permission: "platform.tickets.write", adminOnly: false, invoke: () => mergeTicketAction(cast({})) },
  { name: "presenceHeartbeatAction", permission: "platform.tickets.read", adminOnly: false, invoke: () => presenceHeartbeatAction(cast({})) },
  { name: "presenceLeaveAction", permission: "platform.tickets.read", adminOnly: false, invoke: () => presenceLeaveAction(cast({})) },
  // queue, bulk actions, views, export (support-tickets.ts)
  { name: "bulkAssignTicketsAction", permission: "platform.tickets.assign", adminOnly: false, invoke: () => bulkAssignTicketsAction(cast({})) },
  { name: "bulkStatusTicketsAction", permission: "platform.tickets.write", adminOnly: false, invoke: () => bulkStatusTicketsAction(cast({})) },
  { name: "bulkPriorityTicketsAction", permission: "platform.tickets.write", adminOnly: false, invoke: () => bulkPriorityTicketsAction(cast({})) },
  { name: "bulkTagTicketsAction", permission: "platform.tickets.write", adminOnly: false, invoke: () => bulkTagTicketsAction(cast({})) },
  { name: "bulkMergeTicketsAction", permission: "platform.tickets.write", adminOnly: false, invoke: () => bulkMergeTicketsAction(cast({})) },
  { name: "exportTicketsAction", permission: "platform.tickets.read", adminOnly: false, invoke: () => exportTicketsAction("?view=open") },
  { name: "saveSupportViewAction", permission: "platform.tickets.read", adminOnly: false, invoke: () => saveSupportViewAction(cast({ ok: false, error: null }), empty()) },
  { name: "deleteSupportViewAction", permission: "platform.tickets.read", adminOnly: false, invoke: () => deleteSupportViewAction(cast({ ok: false, error: null }), empty()) },
  // macros (support-macros.ts)
  { name: "saveMacroAction", permission: "platform.macros.manage", adminOnly: false, invoke: () => saveMacroAction(cast({ ok: false, error: null, notice: null }), empty()) },
  { name: "deleteMacroAction", permission: "platform.macros.manage", adminOnly: false, invoke: () => deleteMacroAction(cast({})) },
  // notifications (support-notifications.ts)
  { name: "pollSupportNotificationsAction", permission: "platform.tickets.read", adminOnly: false, invoke: () => pollSupportNotificationsAction() },
  { name: "markSupportNotificationsReadAction", permission: "platform.tickets.read", adminOnly: false, invoke: () => markSupportNotificationsReadAction(cast({ ids: ["x"] })) },
  { name: "updateSupportNotificationPreferencesAction", permission: "platform.tickets.read", adminOnly: false, invoke: () => updateSupportNotificationPreferencesAction(cast({})) },
  // desk settings and SLA policies (support-settings.ts, support-sla.ts) — admin only
  { name: "updateSupportSettingsAction", permission: "platform.sla.manage", adminOnly: true, invoke: () => updateSupportSettingsAction(cast({ ok: false, error: null, notice: null }), empty()) },
  { name: "saveSlaPolicyAction", permission: "platform.sla.manage", adminOnly: true, invoke: () => saveSlaPolicyAction(cast({ ok: false, error: null, notice: null }), empty()) },
  { name: "setDefaultSlaPolicyAction", permission: "platform.sla.manage", adminOnly: true, invoke: () => setDefaultSlaPolicyAction(cast({})) },
  { name: "deleteSlaPolicyAction", permission: "platform.sla.manage", adminOnly: true, invoke: () => deleteSlaPolicyAction(cast({})) },
];

/** `forbidden` when the gate refused; `passed` when validation or the database sentinel stopped the call afterwards. */
async function outcome(action: ActionCase): Promise<"forbidden" | "passed"> {
  try {
    const result = await action.invoke();
    const error = typeof result === "object" && result !== null && "error" in result ? (result as { error: unknown }).error : null;
    return error === "forbidden" ? "forbidden" : "passed";
  } catch (e) {
    if (e instanceof DbSentinel) return "passed";
    throw e;
  }
}

describe("support desk permission matrix — OPS_NAV", () => {
  const SUPPORT_VISIBLE = ["overview", "support", "organisations", "breakGlass", "health", "inbox", "growth", "audit", "content"];
  const ADMIN_ONLY = ["revenue", "controls", "users"];

  it("shows the support desk to both roles and keeps the admin modules away from support agents", () => {
    const supportKeys = OPS_NAV.filter((item) => navAllows("PLATFORM_SUPPORT", item)).map((item) => item.key);
    const adminKeys = OPS_NAV.filter((item) => navAllows("PLATFORM_ADMIN", item)).map((item) => item.key);
    expect(supportKeys).toEqual(SUPPORT_VISIBLE);
    expect(adminKeys).toEqual(OPS_NAV.map((item) => item.key));
    for (const key of ADMIN_ONLY) expect(supportKeys).not.toContain(key);
    expect(OPS_NAV.filter((item) => navAllows("NONE", item))).toEqual([]);
  });

  it("derives every entry's minimum role from its permission (a support permission never hides behind an admin pin unless pinned on purpose)", () => {
    for (const item of OPS_NAV) {
      const supportHas = hasPlatformPermission("PLATFORM_SUPPORT", item.permission);
      if (!supportHas) expect(item.minRole).toBe("PLATFORM_ADMIN");
      if (item.minRole === "PLATFORM_SUPPORT") expect(supportHas).toBe(true);
    }
    const support = OPS_NAV.find((item) => item.key === "support")!;
    expect(support).toMatchObject({ href: "/ops/support", permission: "platform.tickets.read", minRole: "PLATFORM_SUPPORT" });
    expect(OPS_NAV.find((item) => item.key === "revenue")!.minRole).toBe("PLATFORM_ADMIN");
  });
});

describe("support desk permission matrix — server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists every exported support action exactly once", () => {
    const dir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
    const exported = new Set<string>();
    for (const file of ["support-ticket.ts", "support-tickets.ts", "support-macros.ts", "support-notifications.ts", "support-settings.ts", "support-sla.ts"]) {
      const source = fs.readFileSync(path.join(dir, file), "utf8");
      for (const match of source.matchAll(/export async function (\w+Action)\(/g)) exported.add(match[1]!);
    }
    const covered = ACTIONS.map((a) => a.name);
    expect(new Set(covered).size).toBe(covered.length);
    expect([...exported].sort()).toEqual([...covered].sort());
  });

  it("matches the matrix: admin-only actions carry platform.sla.manage, the rest a support permission", () => {
    for (const action of ACTIONS) {
      expect(hasPlatformPermission("PLATFORM_ADMIN", action.permission)).toBe(true);
      expect(hasPlatformPermission("PLATFORM_SUPPORT", action.permission)).toBe(!action.adminOnly);
      if (action.adminOnly) expect(action.permission).toBe("platform.sla.manage");
    }
  });

  it("PLATFORM_SUPPORT: works tickets, views, macros and notifications; settings and SLA policies answer forbidden", async () => {
    state.role = "PLATFORM_SUPPORT";
    for (const action of ACTIONS) {
      expect({ action: action.name, outcome: await outcome(action) }).toEqual({ action: action.name, outcome: action.adminOnly ? "forbidden" : "passed" });
    }
  });

  it("PLATFORM_ADMIN: passes every gate", async () => {
    state.role = "PLATFORM_ADMIN";
    for (const action of ACTIONS) {
      expect({ action: action.name, outcome: await outcome(action) }).toEqual({ action: action.name, outcome: "passed" });
    }
  });

  it("NONE (a customer account): every action answers forbidden", async () => {
    state.role = "NONE";
    for (const action of ACTIONS) {
      expect({ action: action.name, outcome: await outcome(action) }).toEqual({ action: action.name, outcome: "forbidden" });
    }
  });
});

describe("support desk permission matrix — pages", () => {
  const pagesDir = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "../../../app/ops/support");
  const pages = (): string[] => {
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name === "page.tsx" || entry.name === "route.ts") out.push(full);
      }
    };
    walk(pagesDir);
    return out.sort();
  };

  it("every page and route under /ops/support names its permission; the settings pages are pinned to PLATFORM_ADMIN + platform.sla.manage", () => {
    const files = pages();
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) {
      const source = fs.readFileSync(file, "utf8");
      const rel = path.relative(pagesDir, file).replace(/\\/g, "/");
      const gates = [...source.matchAll(/(?:checkPlatform|requirePlatform)\(\s*"(PLATFORM_SUPPORT|PLATFORM_ADMIN)"\s*,\s*"(platform\.[a-z.]+)"/g)].map((m) => ({ role: m[1]!, permission: m[2]! as PlatformPermission }));
      expect({ file: rel, gated: gates.length > 0 }).toEqual({ file: rel, gated: true });
      for (const gate of gates) {
        // a page must never require a permission its pinned role does not hold, and never pin a support-level permission to a lower role than the matrix
        expect({ file: rel, ...gate, valid: hasPlatformPermission(gate.role as PlatformRole, gate.permission) }).toMatchObject({ valid: true });
        if (gate.permission === "platform.sla.manage") expect({ file: rel, role: gate.role }).toEqual({ file: rel, role: "PLATFORM_ADMIN" });
      }
      if (rel.startsWith("settings/")) expect({ file: rel, gates }).toEqual({ file: rel, gates: gates.map(() => ({ role: "PLATFORM_ADMIN", permission: "platform.sla.manage" })) });
      else expect({ file: rel, adminPinned: gates.some((g) => g.role === "PLATFORM_ADMIN") }).toEqual({ file: rel, adminPinned: false });
    }
  });
});
