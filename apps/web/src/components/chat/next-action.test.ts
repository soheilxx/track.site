import { describe, expect, it } from "vitest";
import { ACTIVITY_REASONS } from "@track-site/ai";
import { nextActionFor } from "./next-action";

const blocked = (reason: string | undefined, activity = "generic") => ({ phase: "blocked" as const, params: reason ? { reason } : {}, activity });
const none = { credential: false, approval: false };

describe("next action under a blocked/failed activity", () => {
  it("offers nothing for running or completed activities", () => {
    expect(nextActionFor({ phase: "started", params: {}, activity: "site_check" }, none)).toBeNull();
    expect(nextActionFor({ phase: "completed", params: {}, activity: "site_check" }, none)).toBeNull();
  });

  it("maps every contract reason to exactly one honest next step", () => {
    for (const reason of ACTIVITY_REASONS) {
      const action = nextActionFor(blocked(reason), none);
      expect(action, reason).not.toBeNull();
      if (action?.kind === "link") expect(action.href.startsWith("/app/")).toBe(true);
    }
    expect(nextActionFor(blocked(undefined), none)).toEqual({ kind: "ask", label: "askMissing" });
    expect(nextActionFor({ phase: "failed", params: { reason: "PROVIDER_ERROR" }, activity: "generic" }, none)).toEqual({ kind: "retry", label: "retry" });
    expect(nextActionFor(blocked("TIMEOUT"), none)).toEqual({ kind: "retry", label: "retry" });
    expect(nextActionFor(blocked("VALIDATION_ERROR"), none)).toEqual({ kind: "ask", label: "askMissing" });
    expect(nextActionFor(blocked("VERIFICATION_FAILED"), none)).toEqual({ kind: "link", href: "/app/releases", label: "openReleases" });
    expect(nextActionFor(blocked("ENTITLEMENT_EXCEEDED"), none)).toEqual({ kind: "link", href: "/app/billing", label: "openBilling" });
    expect(nextActionFor(blocked("FORBIDDEN"), none)).toEqual({ kind: "link", href: "/app/team", label: "openTeam" });
    expect(nextActionFor(blocked("POLICY_BLOCKED"), none)).toEqual({ kind: "link", href: "/app/consent", label: "openConsent" });
  });

  it("points at a card that is already in the panel when one is pending", () => {
    expect(nextActionFor(blocked("CONFIRMATION_REQUIRED"), { credential: false, approval: true })).toEqual({ kind: "reveal", target: "approval-card", label: "openApproval" });
    expect(nextActionFor(blocked("CONFIRMATION_REQUIRED"), none)).toEqual({ kind: "ask", label: "askMissing" });
    expect(nextActionFor(blocked("NOT_CONNECTED"), { credential: true, approval: false })).toEqual({ kind: "reveal", target: "credential-card", label: "openCredentialCard" });
    expect(nextActionFor(blocked("NOT_CONNECTED"), none)).toEqual({ kind: "link", href: "/app/destinations", label: "openDestinations" });
    // a removed secret is answered by the secure credential card, never by re-typing it in the chat
    expect(nextActionFor(blocked("POLICY_BLOCKED", "secret_intake"), { credential: true, approval: false })).toEqual({ kind: "reveal", target: "credential-card", label: "openCredentialCard" });
    expect(nextActionFor(blocked("POLICY_BLOCKED", "secret_intake"), none)).toEqual({ kind: "link", href: "/app/destinations", label: "openDestinations" });
  });
});
