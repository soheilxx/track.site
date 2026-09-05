import type { ActivityView } from "./types";

/**
 * The next action offered under a blocked or failed activity sentence (supplement §9: "Die Aktion
 * konnte noch nicht abgeschlossen werden. Das fehlt noch: … " — always with a next step). The
 * mapping is a fixed table over the contract's reason codes, so it never depends on model text:
 *  - `link`   — a dashboard page where the missing piece is managed;
 *  - `reveal` — a card that is already in the panel (secure credential card, approval card);
 *  - `retry`  — send the same message again (transient provider/network reasons);
 *  - `ask`    — ask Track AI what is still missing (a localized in-scope message).
 */
export type NextAction = { kind: "link"; href: string; label: "openDestinations" | "openReleases" | "openBilling" | "openTeam" | "openConsent" } | { kind: "reveal"; target: "credential-card" | "approval-card"; label: "openCredentialCard" | "openApproval" } | { kind: "retry"; label: "retry" } | { kind: "ask"; label: "askMissing" };

const RETRYABLE = new Set(["PROVIDER_ERROR", "PROVIDER_UNAVAILABLE", "TIMEOUT", "INTERNAL_ERROR", "RATE_LIMITED", "CONFLICT"]);

export function nextActionFor(activity: Pick<ActivityView, "phase" | "params" | "activity">, pending: { credential: boolean; approval: boolean }): NextAction | null {
  if (activity.phase !== "blocked" && activity.phase !== "failed") return null;
  switch (activity.params.reason) {
    case "CONFIRMATION_REQUIRED":
      return pending.approval ? { kind: "reveal", target: "approval-card", label: "openApproval" } : { kind: "ask", label: "askMissing" };
    case "NOT_CONNECTED":
      return pending.credential ? { kind: "reveal", target: "credential-card", label: "openCredentialCard" } : { kind: "link", href: "/app/destinations", label: "openDestinations" };
    case "VERIFICATION_FAILED":
    case "APPROVAL_INVALID":
      return { kind: "link", href: "/app/releases", label: "openReleases" };
    case "ENTITLEMENT_EXCEEDED":
      return { kind: "link", href: "/app/billing", label: "openBilling" };
    case "FORBIDDEN":
      return { kind: "link", href: "/app/team", label: "openTeam" };
    case "POLICY_BLOCKED":
      // a removed secret (secret_intake) is answered by the secure credential card, a consent block by the consent module
      return activity.activity === "secret_intake" ? (pending.credential ? { kind: "reveal", target: "credential-card", label: "openCredentialCard" } : { kind: "link", href: "/app/destinations", label: "openDestinations" }) : { kind: "link", href: "/app/consent", label: "openConsent" };
    default:
      if (activity.params.reason && RETRYABLE.has(activity.params.reason)) return { kind: "retry", label: "retry" };
      return { kind: "ask", label: "askMissing" };
  }
}
