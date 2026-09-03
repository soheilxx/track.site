import { it } from "vitest";
import { issueApprovalToken, diffHashOf } from "./approvals.ts";
import { redactToolOutput } from "./dlp.ts";

it("probes approval token redaction", () => {
  const issued = issueApprovalToken("approval-secret-for-probe", { action: "publish_config_version", targetType: "config_draft", targetId: "3f2b0a1c-1111-4222-8333-444455556666", organizationId: "9a8b7c6d-1111-4222-8333-444455556666", userId: "1a2b3c4d-1111-4222-8333-444455556666", diffHash: diffHashOf({ a: 1 }) });
  const out = redactToolOutput({ draft_id: "3f2b0a1c-1111-4222-8333-444455556666", approval: { token: issued.token, expires_at: "2026-09-03T12:00:00.000Z" }, integration_id: "9a8b7c6d-1111-4222-8333-444455556666" });
  console.log("TOKEN_LEN", issued.token.length);
  console.log("REDACTED_OUTPUT", JSON.stringify(out));
});
