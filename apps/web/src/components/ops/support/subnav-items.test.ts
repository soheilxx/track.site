import { describe, expect, it } from "vitest";
import { hasPlatformPermission } from "@track-site/core";
import { SUPPORT_SECTIONS, SUPPORT_SUBNAV, supportSectionOf, supportSubnavItems } from "./subnav-items";

describe("support sub-navigation", () => {
  it("lists every section once with the permission its page enforces", () => {
    expect(SUPPORT_SUBNAV.map((i) => i.key)).toEqual([...SUPPORT_SECTIONS]);
    expect(SUPPORT_SUBNAV.find((i) => i.key === "settings")).toMatchObject({ href: "/ops/support/settings", permission: "platform.sla.manage" });
    for (const item of SUPPORT_SUBNAV) expect(hasPlatformPermission("PLATFORM_ADMIN", item.permission)).toBe(true);
  });

  it("hides Settings from support agents and everything from a customer account", () => {
    expect(supportSubnavItems("PLATFORM_SUPPORT").map((i) => i.key)).toEqual(["tickets", "views", "macros", "reports"]);
    expect(supportSubnavItems("PLATFORM_ADMIN").map((i) => i.key)).toEqual([...SUPPORT_SECTIONS]);
    expect(supportSubnavItems("NONE")).toEqual([]);
  });

  it("maps a path to its section: sub-pages to their section, the ticket detail to the hub", () => {
    expect(supportSectionOf("/ops/support")).toBe("tickets");
    expect(supportSectionOf("/ops/support/1e0c4a8e-0000-4000-8000-000000000001")).toBe("tickets");
    expect(supportSectionOf("/ops/support/views/new")).toBe("views");
    expect(supportSectionOf("/ops/support/macros")).toBe("macros");
    expect(supportSectionOf("/ops/support/reports/export")).toBe("reports");
    expect(supportSectionOf("/ops/support/settings/sla/new")).toBe("settings");
    expect(supportSectionOf("/ops/supporting")).toBeNull();
    expect(supportSectionOf("/ops")).toBeNull();
  });
});
